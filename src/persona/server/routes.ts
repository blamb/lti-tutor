/**
 * /api/* routes. All hang off lti.app, so ltijs's session validator guards
 * them and res.locals.token carries the validated launch claims.
 *
 * Student
 *   POST /api/fullscreen-init                    -> { url }
 *   GET  /api/me                                 -> { name, role, course }
 *   GET  /api/personas                           -> { personas: [public fields + my latest conversation] }
 *   POST /api/personas/:id/start                 { fresh?, preview? } -> { persona, session, turns }
 *   POST /api/personas/session/:sid/turn         { message } | { begin: true } -> SSE chunk | notice | quotes | done | error
 *   GET  /api/personas/session/:sid              -> { persona, session, turns, coach_turns }   (reopen, including an ended one)
 *   POST /api/personas/session/:sid/end          -> { session, grade }   (posts completion to the gradebook where set up)
 *   POST /api/personas/session/:sid/debrief      -> { debrief }   (generated once the conversation has ended)
 *   POST /api/personas/session/:sid/coach        { question } -> SSE chunk | done | error   (step out and ask the coach)
 *   POST /api/personas/session/:sid/reflection   { text } -> { ok }
 *   GET  /api/personas/session/:sid/transcript.html | .md   (?download=1)
 *
 * Instructor
 *   GET  /api/teacher/catalog                    -> { templates, models, model_default }
 *   GET/POST /api/teacher/personas, GET/PUT/DELETE /api/teacher/personas/:id
 *   POST /api/teacher/personas/draft             { text, template } -> { draft }
 *   GET  /api/teacher/personas/:id/report        -> { rows, totals, synthesis }   (live conversations, debriefs, reflections)
 *   GET  /api/teacher/personas/:id/report.csv
 *   GET  /api/teacher/personas/:id/conversations/:sid -> { session, display_name, turns, coach_turns }
 *   POST /api/teacher/personas/:id/synthesis     -> { synthesis }   (across the ended conversations' debriefs)
 *   GET/POST /api/teacher/materials, PUT/DELETE /api/teacher/materials/:id
 *   POST /api/teacher/materials/import-url       { url, whole_book? }
 *   POST /api/teacher/materials/upload           multipart 'file'
 *   POST /api/teacher/materials/import-backup    multipart 'file' (.mbz) -> preview { course, units, skipped }
 *   POST /api/teacher/materials/import-backup/commit  { items } -> { created, updated, materials }
 *   POST /api/teacher/materials/sync-preview     -> the live course through Moodle web services, same preview shape
 *   GET  /api/teacher/course                     -> { moodle_ws: status + wwwroot, course_id, functions }
 *   PUT/DELETE /api/teacher/course/moodle-ws     { token } -> verify and store the web-service token / forget it
 *   POST /api/deeplink                           (form) -> auto-submitting deep-link form
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import os from 'node:os';
import fs from 'node:fs';
import type { DeepLinkContentItem, IdToken } from 'ltijs';
import { z } from 'zod';
import { lti, mintFullscreenNonce } from './lti.js';
import { query } from '../../core/db.js';
import { env } from './env.js';
import { tokenOf, studentFromToken, gateTeacher, contextIdOf, attr } from '../../core/reqctx.js';
import { isTeacher } from '../../core/auth.js';
import {
  MaterialInput, MATERIAL_ROLES, listMaterials, createMaterial, updateMaterial, deleteMaterial, upsertMaterialBySourceKey, existingSourceKeys, type Scope,
} from '../../core/materials.js';
import { parseMoodleBackup, BACKUP_MAX_BYTES } from '../../core/moodle-backup.js';
import { buildPreview } from '../../core/course-model.js';
import { wsClient, checkConnection, fetchCourseModel, WS_FUNCTIONS, WsError } from '../../core/moodle-ws.js';
import { getMoodleWsToken, setMoodleWsToken, clearMoodleWsToken, touchMoodleWs } from './course.js';
import { importFromUrl, extractFromFile, fitMaterial, ImportError, MAX_BOOK_CHAPTERS } from '../../core/importers.js';
import { templateCatalog, isPersonaTemplate } from './templates.js';
import {
  PersonaInput, PERSONA_MODELS, publicPersona, listPersonas, getPersona, createPersona, updatePersona, deletePersona, detachMaterial,
  startPersonaSession, getPersonaSession, endPersonaSession, getSessionTurns, visibleTurns, streamPersonaReply, draftPersona,
  latestSessionsForStudent, START_MARKER, DRAFT_MAX_CHARS, PERSONA_MATERIAL_MAX_CHARS, modelFor,
  getOrGenerateDebrief, streamCoachReply, coachTurnsFor, saveReflection, transcriptHtml, transcriptMarkdown,
  recordGradeResult, getPersonaReport, reportCsv, instructorConversation, generatePersonaSynthesis,
} from './personas.js';
import { postCompletion, type GradeResult } from '../../core/grades.js';

// The course-import commit sends every selected material's text back in one
// request, so it gets its own limit; express.json skips a body another parser has already read.
lti.app.use('/api/teacher/materials/import-backup/commit', express.json({ limit: '64mb' }));
lti.app.use('/api', express.json({ limit: '2mb' }));

function scopeOf(token: IdToken): Scope & { title: string } {
  return { iss: token.iss, contextId: contextIdOf(token), title: token.platformContext.context?.title ?? '' };
}

function idParam(req: Request, name: string): number | null {
  const n = parseInt(String(req.params[name] ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fail(res: Response, e: unknown, where: string): void {
  if (e instanceof ImportError) { res.status(e.status).json({ error: e.message }); return; }
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid input: ' + e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    return;
  }
  console.error(`${where} failed:`, e);
  res.status(500).json({ error: (e as Error).message });
}

async function teacher(res: Response): Promise<{ token: IdToken; scope: Scope & { title: string } } | null> {
  const token = gateTeacher(res);
  if (!token) return null;
  return { token, scope: scopeOf(token) };
}

// ─── Launch-level ───────────────────────────────────────────────────────────

lti.app.post('/api/fullscreen-init', (req: Request, res: Response) => {
  const ltik = String(req.query.ltik ?? '');
  const nonce = mintFullscreenNonce(req.headers.cookie ?? '', ltik);
  res.json({ url: `${env.LTI_TOOL_URL}/fullscreen?n=${encodeURIComponent(nonce)}` });
});

lti.app.get('/api/me', async (req: Request, res: Response) => {
  try {
    const token = tokenOf(res);
    const me = await studentFromToken(token);
    res.json({ name: me.display_name, role: isTeacher(token) ? 'teacher' : 'student', course: { id: contextIdOf(token), title: scopeOf(token).title } });
  } catch (e) {
    fail(res, e, 'GET /api/me');
  }
});

// ─── Student ────────────────────────────────────────────────────────────────

lti.app.get('/api/personas', async (req: Request, res: Response) => {
  try {
    const token = tokenOf(res);
    const scope = scopeOf(token);
    const me = await studentFromToken(token);
    const personas = await listPersonas(scope, { publishedOnly: true });
    const latest = await latestSessionsForStudent(me.id);
    res.json({
      personas: personas.map((p) => {
        const s = latest.get(p.id);
        return { ...publicPersona(p), my_session: s ? { id: s.id, status: s.status, started_at: s.started_at, ended_at: s.ended_at } : null };
      }),
    });
  } catch (e) {
    fail(res, e, 'GET /api/personas');
  }
});

lti.app.post('/api/personas/:id/start', async (req: Request, res: Response) => {
  try {
    const token = tokenOf(res);
    const scope = scopeOf(token);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad persona id' });
    const persona = await getPersona(id, scope);
    const preview = !!req.body?.preview && isTeacher(token);
    // Instructors may preview drafts; students only see published ones.
    if (!persona || (persona.status !== 'published' && !isTeacher(token))) return res.status(404).json({ error: 'persona not found' });
    const me = await studentFromToken(token);
    const session = await startPersonaSession(persona, me.id, preview ? 'preview' : 'live', { fresh: !!req.body?.fresh });
    const turns = visibleTurns(await getSessionTurns(session.session_id));
    res.json({ persona: { ...publicPersona(persona), model: isTeacher(token) ? modelFor(persona) : undefined }, session, turns, coach_turns: await coachTurnsFor(session) });
  } catch (e) {
    fail(res, e, 'POST /api/personas/:id/start');
  }
});

async function ownedSession(req: Request, res: Response) {
  const token = tokenOf(res);
  const scope = scopeOf(token);
  const me = await studentFromToken(token);
  const sid = idParam(req, 'sid');
  if (!sid) return null;
  const session = await getPersonaSession(sid);
  if (!session || session.student_id !== me.id) return null;
  const persona = await getPersona(session.persona_id, scope);
  if (!persona) return null;
  return { token, scope, me, session, persona };
}

function sseStart(res: Response): (event: string, data: unknown) => void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  return (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
}

lti.app.get('/api/personas/session/:sid', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'conversation not found' });
    const { token, session, persona } = owned;
    res.json({
      persona: { ...publicPersona(persona), model: isTeacher(token) ? modelFor(persona) : undefined },
      session, turns: visibleTurns(await getSessionTurns(session.session_id)), coach_turns: await coachTurnsFor(session),
    });
  } catch (e) {
    fail(res, e, 'GET /api/personas/session/:sid');
  }
});

lti.app.post('/api/personas/session/:sid/turn', async (req: Request, res: Response) => {
  const send = sseStart(res);
  try {
    const owned = await ownedSession(req, res);
    if (!owned) { send('error', { message: 'conversation not found' }); return res.end(); }
    const { token, scope, me, session, persona } = owned;
    if (session.status === 'ended') { send('error', { message: 'This conversation has ended. Start a new one to continue.' }); return res.end(); }
    const begin = !!req.body?.begin;
    const message = begin
      ? `${START_MARKER}\nThe student has just arrived. Begin.`
      : String(req.body?.message ?? '').trim().slice(0, 8000);
    if (!message) { send('error', { message: 'message is required' }); return res.end(); }
    if (begin && ((await getSessionTurns(session.session_id)).length > 0 || persona.opening !== 'persona')) {
      send('done', { already_started: true });
      return res.end();
    }
    const out = await streamPersonaReply({
      persona, scope, session, studentName: me.display_name, userMessage: message,
      onChunk: (text) => send('chunk', { text }),
      attribution: attr(token, me.id, session.session_id, 'persona.turn'),
    });
    if (out.refused) send('notice', { message: 'The persona declined to continue in that direction. Try a different question, or end the conversation.' });
    if (out.quotes) send('quotes', out.quotes);
    send('done', { passages: out.passages });
    res.end();
  } catch (e) {
    console.error('POST /api/personas/session/:sid/turn failed:', e);
    send('error', { message: (e as Error).message });
    res.end();
  }
});

lti.app.post('/api/personas/session/:sid/end', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'conversation not found' });
    const { token, persona } = owned;
    const wasEnded = owned.session.status === 'ended';
    const session = wasEnded ? owned.session : await endPersonaSession(owned.session);
    let grade: GradeResult | null = null;
    // Completion counts once, for live conversations, where a column exists or is wanted.
    const deepLinked = String(token.platformContext.custom?.persona_id ?? '') === String(persona.id);
    if (!wasEnded && session.mode === 'live' && (persona.gradebook || deepLinked)) {
      grade = await postCompletion(lti, token, {
        customKey: 'persona_id', itemId: persona.id, wantsColumn: persona.gradebook, resourceId: `persona-${persona.id}`,
        label: persona.title, tag: 'persona', comment: `Completed a conversation with ${persona.title} in ${env.TOOL_NAME}.`,
      });
      await recordGradeResult(session.id, grade);
      session.grade_posted_at = grade.posted ? new Date().toISOString() : session.grade_posted_at;
      session.grade_error = grade.posted ? null : (grade.error ?? null);
    }
    res.json({ session, grade });
  } catch (e) {
    fail(res, e, 'POST /api/personas/session/:sid/end');
  }
});

lti.app.post('/api/personas/session/:sid/debrief', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'conversation not found' });
    const { token, me, session, persona } = owned;
    if (session.status !== 'ended') return res.status(400).json({ error: 'End the conversation first; the debrief looks back at the whole of it.' });
    const debrief = await getOrGenerateDebrief({ persona, session, studentName: me.display_name, attribution: attr(token, me.id, session.session_id, 'persona.debrief') });
    res.json({ debrief });
  } catch (e) {
    fail(res, e, 'POST /api/personas/session/:sid/debrief');
  }
});

lti.app.post('/api/personas/session/:sid/coach', async (req: Request, res: Response) => {
  const send = sseStart(res);
  try {
    const owned = await ownedSession(req, res);
    if (!owned) { send('error', { message: 'conversation not found' }); return res.end(); }
    const { token, me, session, persona } = owned;
    if (persona.coach !== 'on') { send('error', { message: 'The coach is switched off for this persona.' }); return res.end(); }
    const question = String(req.body?.question ?? '').trim().slice(0, 4000);
    if (!question) { send('error', { message: 'question is required' }); return res.end(); }
    await streamCoachReply({
      persona, session, studentName: me.display_name, question,
      onChunk: (text) => send('chunk', { text }),
      attribution: attr(token, me.id, session.session_id, 'persona.coach'),
    });
    send('done', {});
    res.end();
  } catch (e) {
    console.error('POST /api/personas/session/:sid/coach failed:', e);
    send('error', { message: (e as Error).message });
    res.end();
  }
});

lti.app.post('/api/personas/session/:sid/reflection', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'conversation not found' });
    await saveReflection(owned.session.id, String(req.body?.text ?? ''));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'POST /api/personas/session/:sid/reflection');
  }
});

lti.app.get('/api/personas/session/:sid/transcript.:format', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'conversation not found' });
    const { me, session, persona } = owned;
    const turns = await getSessionTurns(session.session_id);
    const format = String(req.params.format);
    const stem = `${persona.title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'conversation'}-${session.id}`;
    const download = String(req.query.download ?? '') === '1';
    if (format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (download) res.setHeader('Content-Disposition', `attachment; filename="${stem}.md"`);
      return res.send(transcriptMarkdown(persona, session, turns, me.display_name));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (download) res.setHeader('Content-Disposition', `attachment; filename="${stem}.html"`);
    res.send(transcriptHtml(persona, session, turns, me.display_name, env.TOOL_NAME));
  } catch (e) {
    fail(res, e, 'GET /api/personas/session/:sid/transcript');
  }
});

// ─── Instructor: catalog and personas ───────────────────────────────────────

lti.app.get('/api/teacher/catalog', async (req: Request, res: Response) => {
  const t = await teacher(res);
  if (!t) return;
  res.json({ templates: templateCatalog(), models: PERSONA_MODELS, model_default: env.PERSONA_MODEL });
});

lti.app.get('/api/teacher/personas', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const personas = await listPersonas(t.scope, { publishedOnly: false });
    const counts = await query<{ persona_id: number; live: number; ended: number }>(
      `select persona_id, count(*) filter (where mode = 'live')::int as live, count(*) filter (where mode = 'live' and status = 'ended')::int as ended
       from persona_session where persona_id = any($1::bigint[]) group by persona_id`,
      [personas.map((p) => p.id)]
    );
    const byId = new Map(counts.map((c) => [c.persona_id, c]));
    res.json({ personas: personas.map((p) => ({ ...p, conversations: byId.get(p.id)?.live ?? 0, ended: byId.get(p.id)?.ended ?? 0 })) });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/personas');
  }
});

lti.app.get('/api/teacher/personas/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const id = idParam(req, 'id');
    const persona = id ? await getPersona(id, t.scope) : null;
    if (!persona) return res.status(404).json({ error: 'persona not found' });
    res.json({ persona });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/personas/:id');
  }
});

lti.app.post('/api/teacher/personas', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    res.json({ persona: await createPersona(t.scope, PersonaInput.parse(req.body ?? {}), me.id) });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/personas');
  }
});

lti.app.put('/api/teacher/personas/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const id = idParam(req, 'id');
    const persona = id ? await updatePersona(id, t.scope, PersonaInput.parse(req.body ?? {})) : null;
    if (!persona) return res.status(404).json({ error: 'persona not found' });
    res.json({ persona });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/personas/:id');
  }
});

lti.app.delete('/api/teacher/personas/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id || !(await deletePersona(id, t.scope))) return res.status(404).json({ error: 'persona not found' });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/teacher/personas/:id');
  }
});

lti.app.post('/api/teacher/personas/draft', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 40) return res.status(400).json({ error: 'Paste the existing instructions first (at least a few sentences).' });
    if (text.length > DRAFT_MAX_CHARS) return res.status(400).json({ error: `That is too long to draft from (over ${DRAFT_MAX_CHARS.toLocaleString()} characters). Attach long documents as materials instead.` });
    const template = isPersonaTemplate(req.body?.template) ? req.body.template : 'thinker';
    const me = await studentFromToken(t.token);
    const draft = await draftPersona({ text, template, attribution: attr(t.token, me.id, null, 'persona.draft') });
    res.json({ draft });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/personas/draft');
  }
});

// ─── Instructor: the report ─────────────────────────────────────────────────

async function teacherPersona(req: Request, res: Response) {
  const t = await teacher(res);
  if (!t) return null;
  const id = idParam(req, 'id');
  const persona = id ? await getPersona(id, t.scope) : null;
  if (!persona) { res.status(404).json({ error: 'persona not found' }); return null; }
  return { ...t, persona };
}

lti.app.get('/api/teacher/personas/:id/report', async (req: Request, res: Response) => {
  try {
    const t = await teacherPersona(req, res);
    if (!t) return;
    const report = await getPersonaReport(t.persona);
    res.json({ persona: { id: t.persona.id, title: t.persona.title, subtitle: t.persona.subtitle, objectives: t.persona.objectives, gradebook: t.persona.gradebook, status: t.persona.status }, ...report });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/personas/:id/report');
  }
});

lti.app.get('/api/teacher/personas/:id/report.csv', async (req: Request, res: Response) => {
  try {
    const t = await teacherPersona(req, res);
    if (!t) return;
    const report = await getPersonaReport(t.persona);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="persona-${t.persona.id}-report.csv"`);
    res.send(reportCsv(report));
  } catch (e) {
    fail(res, e, 'GET /api/teacher/personas/:id/report.csv');
  }
});

lti.app.get('/api/teacher/personas/:id/conversations/:sid', async (req: Request, res: Response) => {
  try {
    const t = await teacherPersona(req, res);
    if (!t) return;
    const sid = idParam(req, 'sid');
    const conv = sid ? await instructorConversation(t.persona, sid) : null;
    if (!conv) return res.status(404).json({ error: 'conversation not found' });
    res.json(conv);
  } catch (e) {
    fail(res, e, 'GET /api/teacher/personas/:id/conversations/:sid');
  }
});

lti.app.post('/api/teacher/personas/:id/synthesis', async (req: Request, res: Response) => {
  try {
    const t = await teacherPersona(req, res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    const synthesis = await generatePersonaSynthesis(t.persona, attr(t.token, me.id, null, 'persona.synthesis'));
    res.json({ synthesis });
  } catch (e) {
    if ((e as Error).message?.startsWith('No ended conversations')) return res.status(400).json({ error: (e as Error).message });
    fail(res, e, 'POST /api/teacher/personas/:id/synthesis');
  }
});

// ─── Instructor: materials ──────────────────────────────────────────────────

lti.app.get('/api/teacher/materials', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const materials = await listMaterials(t.scope);
    res.json({ materials: materials.map((m) => ({ ...m, body: undefined, chars: m.body.length })) });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/materials');
  }
});

lti.app.post('/api/teacher/materials', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    const m = await createMaterial(t.scope, MaterialInput.parse(req.body ?? {}), me.id);
    res.json({ material: { ...m, chars: m.body.length } });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials');
  }
});

lti.app.put('/api/teacher/materials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const id = idParam(req, 'id');
    const m = id ? await updateMaterial(id, t.scope, MaterialInput.parse(req.body ?? {})) : null;
    if (!m) return res.status(404).json({ error: 'material not found' });
    res.json({ material: { ...m, chars: m.body.length } });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/materials/:id');
  }
});

lti.app.delete('/api/teacher/materials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id || !(await deleteMaterial(id, t.scope))) return res.status(404).json({ error: 'material not found' });
    await detachMaterial(id, t.scope);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/teacher/materials/:id');
  }
});

lti.app.post('/api/teacher/materials/import-url', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const url = String(req.body?.url ?? '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });
    const me = await studentFromToken(t.token);
    const out = await importFromUrl(url, { wholeBook: !!req.body?.whole_book });
    const materials = [];
    for (const d of out.docs) {
      materials.push(await createMaterial(t.scope, MaterialInput.parse({
        title: d.title, body: d.text, source_url: d.source_url, license: d.license, attribution: d.attribution,
      }), me.id));
    }
    res.json({
      materials: materials.map((m) => ({ ...m, body: undefined, chars: m.body.length })),
      truncated: out.docs.filter((d) => d.truncated).map((d) => ({ title: d.title, original_chars: d.original_chars })),
      pressbooks: out.pressbooks,
      book: out.book,
      capped: out.docs.length >= MAX_BOOK_CHAPTERS,
    });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials/import-url');
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

lti.app.post('/api/teacher/materials/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const file = (req as Request & { file?: { originalname: string; buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file received. Choose a .txt, .md, .html, .docx or .pdf file.' });
    const me = await studentFromToken(t.token);
    const { title, text } = await extractFromFile(file.originalname, file.buffer);
    if (text.trim().length < 20) return res.status(400).json({ error: 'No readable text was found in that file (a scanned PDF needs OCR first).' });
    const fit = fitMaterial(text.trim(), PERSONA_MATERIAL_MAX_CHARS);
    const m = await createMaterial(t.scope, MaterialInput.parse({ title, body: fit.text, attribution: file.originalname.slice(0, 500) }), me.id);
    res.json({ material: { ...m, body: undefined, chars: m.body.length }, truncated: fit.truncated, original_chars: fit.original_chars });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials/upload');
  }
});

// ─── Instructor: the Moodle course ──────────────────────────────────────────

lti.app.get('/api/teacher/course', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const ws = await getMoodleWsToken(t.scope);
    res.json({ moodle_ws: { ...ws.status, wwwroot: t.scope.iss, course_id: t.scope.contextId, functions: WS_FUNCTIONS } });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/course');
  }
});

lti.app.put('/api/teacher/course/moodle-ws', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const token = String(req.body?.token ?? '').trim();
    if (!/^[a-f0-9]{32}$/i.test(token)) return res.status(400).json({ error: 'That does not look like a Moodle web-service token (32 letters and digits). Copy it from Moodle without spaces.' });
    const client = wsClient(t.scope.iss, token);
    const check = await checkConnection(client);
    if (check.missing.length) {
      return res.status(400).json({ error: `The token works (${check.site.fullname}, ${check.site.sitename}) but its service does not allow: ${check.missing.join(', ')}. Ask the Moodle administrator to add those functions to the service, then try again.` });
    }
    try {
      await client.call('core_course_get_contents', { courseid: Number(t.scope.contextId), options: [{ name: 'excludecontents', value: 1 }] });
    } catch (e) {
      if (e instanceof WsError) return res.status(400).json({ error: `The token belongs to ${check.site.fullname}, but that account cannot read this course (${e.code}). Use a token for an account enrolled in the course as a teacher.` });
      throw e;
    }
    await setMoodleWsToken(t.scope, token, check.site.username);
    res.json({ connected: true, user: check.site.username, fullname: check.site.fullname, sitename: check.site.sitename, missing_optional: check.missing_optional });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/course/moodle-ws');
  }
});

lti.app.delete('/api/teacher/course/moodle-ws', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    await clearMoodleWsToken(t.scope);
    res.json({ connected: false });
  } catch (e) {
    fail(res, e, 'DELETE /api/teacher/course/moodle-ws');
  }
});

/** The same preview shape for a backup and a live sync, with "update" flags for items imported before. */
async function previewResponse(scope: Scope, preview: Awaited<ReturnType<typeof buildPreview>>, extra: { source: 'backup' | 'sync'; notes: string[]; same_course: boolean; same_site: boolean }) {
  const have = await existingSourceKeys(scope);
  const units = preview.units.map((u) => ({ ...u, items: u.items.map((i) => ({ ...i, existing: have.has(i.key) })) }));
  const items = units.reduce((n, u) => n + u.items.length, 0);
  return {
    source: extra.source, notes: extra.notes,
    course: { ...preview.course, same_course: extra.same_course, same_site: extra.same_site },
    units, skipped: preview.skipped,
    stats: { items, units: units.length, updates: units.reduce((n, u) => n + u.items.filter((i) => i.existing).length, 0) },
  };
}

lti.app.post('/api/teacher/materials/sync-preview', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const ws = await getMoodleWsToken(t.scope);
    if (!ws.token) return res.status(400).json({ error: 'This course is not connected to Moodle yet. Add a web-service token under Moodle connection on the Materials tab.' });
    const client = wsClient(t.scope.iss, ws.token);
    const { model, notes } = await fetchCourseModel(client, t.scope.contextId, { fullname: t.scope.title || '' });
    const preview = await buildPreview(model);
    await touchMoodleWs(t.scope);
    res.json(await previewResponse(t.scope, preview, { source: 'sync', notes, same_course: true, same_site: true }));
  } catch (e) {
    if (e instanceof WsError && e.accessDenied) {
      res.status(400).json({ error: `Moodle refused the request (${e.code}). The token may have been revoked or its service changed; reconnect under Moodle connection.` });
      return;
    }
    fail(res, e, 'POST /api/teacher/materials/sync-preview');
  }
});

// A course backup can be large (it carries the course's files), so it goes
// to disk and is streamed from there, then deleted. Only course structure
// and content are read: never users, grades, submissions or posts.
const uploadBackup = multer({
  storage: multer.diskStorage({ destination: os.tmpdir(), filename: (_req, _file, cb) => cb(null, `mbz-${Date.now()}-${Math.random().toString(36).slice(2)}`) }),
  limits: { fileSize: BACKUP_MAX_BYTES, files: 1 },
});

lti.app.post('/api/teacher/materials/import-backup', uploadBackup.single('file'), async (req: Request, res: Response) => {
  const file = (req as Request & { file?: { originalname: string; path: string; size: number } }).file;
  try {
    const t = await teacher(res);
    if (!t) return;
    if (!file) return res.status(400).json({ error: 'No file received. Choose the .mbz file you downloaded from Moodle\'s Backup page.' });
    const preview = await parseMoodleBackup(file.path);
    res.json(await previewResponse(t.scope, preview, {
      source: 'backup', notes: [],
      same_course: preview.course.course_id === t.scope.contextId,
      same_site: !preview.course.wwwroot || preview.course.wwwroot.replace(/\/+$/, '') === t.scope.iss.replace(/\/+$/, ''),
    }));
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials/import-backup');
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => {});
  }
});

const BackupCommit = z.object({
  items: z.array(z.object({
    key: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(160),
    role: z.enum(MATERIAL_ROLES),
    text: z.string().min(1),
    unit: z.string().trim().max(200).default(''),
    unit_order: z.number().int().min(0).max(10000).default(0),
    source_url: z.string().trim().max(2000).default(''),
  })).min(1).max(300),
});

lti.app.post('/api/teacher/materials/import-backup/commit', async (req: Request, res: Response) => {
  try {
    const t = await teacher(res);
    if (!t) return;
    const { items } = BackupCommit.parse(req.body ?? {});
    const me = await studentFromToken(t.token);
    let created = 0;
    let updated = 0;
    const materials = [];
    for (const it of items) {
      const fit = fitMaterial(it.text.trim(), PERSONA_MATERIAL_MAX_CHARS);
      const r = await upsertMaterialBySourceKey(t.scope, MaterialInput.parse({
        title: it.title, body: fit.text, source_url: it.source_url, role: it.role, unit: it.unit, unit_order: it.unit_order, source_key: it.key,
        attribution: `Imported from the course${it.unit ? `, ${it.unit}` : ''}`,
      }), me.id);
      if (r.updated) updated++; else created++;
      materials.push({ id: r.material.id, title: r.material.title, updated: r.updated });
    }
    res.json({ created, updated, materials });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials/import-backup/commit');
  }
});

// ─── Deep linking response ──────────────────────────────────────────────────

lti.app.post('/api/deeplink', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  const t = await teacher(res);
  if (!t) return;
  try {
    const items: DeepLinkContentItem[] = [];
    if (req.body?.home) {
      items.push({ type: 'ltiResourceLink', title: env.TOOL_NAME, text: 'Every persona in this course.', url: env.LTI_TOOL_URL });
    }
    const raw = req.body?.persona;
    const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v: unknown) => parseInt(String(v), 10)).filter((n: number) => Number.isInteger(n) && n > 0);
    for (const id of ids) {
      const persona = await getPersona(id, t.scope);
      if (!persona) continue;
      const item: DeepLinkContentItem = {
        type: 'ltiResourceLink', title: persona.title, text: persona.summary || persona.subtitle, url: env.LTI_TOOL_URL,
        custom: { persona_id: String(persona.id) },
      };
      if (persona.gradebook) item.lineItem = { scoreMaximum: 1, label: persona.title, resourceId: `persona-${persona.id}`, tag: 'persona' };
      items.push(item);
    }
    if (items.length === 0) {
      res.status(400).type('html').send('<p>Nothing selected. Go back and tick at least one item.</p>');
      return;
    }
    const form = await lti.DeepLinking.createDeepLinkingForm(t.token, items, {
      message: `Added ${items.length} item${items.length === 1 ? '' : 's'} from ${env.TOOL_NAME}.`,
    });
    res.type('html').send(form);
  } catch (e) {
    fail(res, e, 'POST /api/deeplink');
  }
});

// ─── Upload errors as JSON ──────────────────────────────────────────────────
// Multer rejects an oversized file before the route runs; without this the
// client gets an HTML stack trace instead of a message it can show.
lti.app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const limitMb = req.path.includes('import-backup') ? Math.round(BACKUP_MAX_BYTES / 1048576) : 25;
    res.status(413).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? `That file is too large: the limit is ${limitMb} MB. For a course backup, make one without the course's video and audio files, or import the units you need by URL instead.`
        : `Upload failed: ${err.message}`,
    });
    return;
  }
  next(err);
});
