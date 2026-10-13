/**
 * /api/* routes. All hang off lti.app, so ltijs's session validator guards
 * them and res.locals.token carries the validated launch claims.
 *
 * Student
 *   POST /api/fullscreen-init                   -> { url }   (full-screen handoff)
 *   GET  /api/course                            -> { settings (public part), delivery, modes }
 *   GET  /api/profile                           -> { profile }
 *   PUT  /api/profile                           ProfileInput -> { profile }
 *   GET  /api/tutorials                         -> { tutorials: [...with my latest run], has_profile }
 *   POST /api/tutorials/:id/start               { fresh? } -> { tutorial, session, turns }
 *   POST /api/tutorials/session/:sid/turn       { message } | { begin: true } -> SSE
 *   POST /api/tutorials/session/:sid/complete   -> { summary, grade }
 *   POST /api/tutorials/session/:sid/nps        { score, comment? }
 *   GET  /api/tutorials/:id/print               -> standalone HTML paper version (?format=md|json, ?download=1)
 *   GET  /api/materials/:id/debrief.html        -> the learner's own debrief as a standalone file (?download=1)
 *   GET  /api/materials                         -> { materials: [{ id, title, has_debrief }] }
 *   GET  /api/materials/:id/debrief             -> { debrief | null }
 *   POST /api/materials/:id/debrief             -> { debrief }   (generates)
 *
 * Instructor
 *   GET/PUT    /api/teacher/course               course settings (TRUFlex mode, level, pitch, disclosure)
 *   GET/POST   /api/teacher/materials, PUT/DELETE /api/teacher/materials/:id
 *   POST       /api/teacher/materials/import-url { url, whole_book? } -> { materials, truncated, pressbooks, book? }
 *   POST       /api/teacher/materials/upload     multipart 'file' -> { material, truncated, original_chars }
 *   GET/POST   /api/teacher/tutorials, PUT/DELETE /api/teacher/tutorials/:id
 *   POST       /api/teacher/tutorials/draft      { material_ids, topic, pitch? } -> { draft }
 *   GET        /api/teacher/tutorials/:id/report -> TutorialReport
 *   POST       /api/teacher/tutorials/:id/debrief -> { kind, debrief }  (group debrief / cohort note / revision brief)
 *   GET        /api/teacher/course-pack.zip      -> zip of every published paper script + debrief template + index.txt
 *   POST       /api/deeplink                     (form) -> auto-submitting deep-link form
 */

import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { DeepLinkContentItem, IdToken } from 'ltijs';
import { z } from 'zod';
import { lti, mintFullscreenNonce } from './lti.js';
import { env } from './env.js';
import { isTeacher } from './auth.js';
import { tokenOf, studentFromToken, attr, gateTeacher } from './reqctx.js';
import { courseCtxFromToken, CourseSettingsInput, upsertCourseSettings, courseCtxFromSettings, COURSE_LEVEL_LABELS, type CourseCtx } from './courses.js';
import { TRUFLEX_MODES, deliveryLabels } from './delivery.js';
import { isTutorialKind, kindCatalog, titledForKind, KINDS } from './kinds.js';
import { listLearnerModel, deleteLearnerEntry, courseConceptReport, courseConceptsByWeek } from './learner.js';
import { importFromUrl, extractFromFile, fitMaterial, ImportError, MAX_BOOK_CHAPTERS } from './importers.js';
import { ensurePrintScript, printScriptHtml, personalDebriefHtml, buildCoursePack } from './print.js';
import {
  TutorialInput, ProfileInput, MaterialInput, START_MARKER,
  listMaterials, getMaterials, createMaterial, updateMaterial, deleteMaterial,
  listTutorials, getTutorial, createTutorial, updateTutorial, deleteTutorial,
  getProfile, upsertProfile, latestSessionsForStudent, startTutorialSession,
  getTutorialSession, getSessionTurns, streamTutorialReply, completeTutorialSession,
  recordNps, recordGradeResult, getTutorialReport, generateGroupDebrief, debriefKindFor,
  draftTutorialBrief, getDebrief, generateDebrief,
} from './tutorials.js';
import { postCompletionGrade, type GradeResult } from './grades.js';
import { query } from './db.js';

lti.app.use('/api', express.json({ limit: '2mb' }));

async function ctxOf(res: Response): Promise<{ token: IdToken; ctx: CourseCtx }> {
  const token = tokenOf(res);
  return { token, ctx: await courseCtxFromToken(token) };
}

function idParam(req: Request, name: string): number | null {
  const n = parseInt(String(req.params[name] ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fail(res: Response, e: unknown, where: string): void {
  if (e instanceof ImportError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid input: ' + e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    return;
  }
  console.error(`${where} failed:`, e);
  res.status(500).json({ error: (e as Error).message });
}

/** The parts of the course settings every launcher may see. */
function publicCourse(ctx: CourseCtx) {
  return {
    settings: { truflex: ctx.settings.truflex, course_level: ctx.settings.course_level, ai_disclosure: ctx.settings.ai_disclosure, course_start: ctx.settings.course_start },
    delivery: ctx.delivery,
    labels: deliveryLabels(ctx.delivery),
    debrief_kind: debriefKindFor(ctx.delivery),
    kinds: kindCatalog(),
  };
}

// ─── Full-screen handoff ────────────────────────────────────────────────────

lti.app.post('/api/fullscreen-init', (req: Request, res: Response) => {
  try {
    tokenOf(res);
    const ltik = String(req.query.ltik ?? '');
    const cookieHeader = req.headers.cookie ?? '';
    if (!ltik || !cookieHeader) return res.status(400).json({ error: 'no session context to hand off' });
    res.json({ url: `/fullscreen?n=${encodeURIComponent(mintFullscreenNonce(cookieHeader, ltik))}` });
  } catch (e) {
    fail(res, e, 'POST /api/fullscreen-init');
  }
});

// ─── Course (delivery mode) ─────────────────────────────────────────────────

lti.app.get('/api/course', async (req: Request, res: Response) => {
  try {
    const { ctx } = await ctxOf(res);
    res.json({ ...publicCourse(ctx), modes: TRUFLEX_MODES });
  } catch (e) {
    fail(res, e, 'GET /api/course');
  }
});

// ─── Student profile ────────────────────────────────────────────────────────

lti.app.get('/api/profile', async (req: Request, res: Response) => {
  try {
    const student = await studentFromToken(tokenOf(res));
    res.json({ profile: await getProfile(student.id) });
  } catch (e) {
    fail(res, e, 'GET /api/profile');
  }
});

lti.app.put('/api/profile', async (req: Request, res: Response) => {
  try {
    const student = await studentFromToken(tokenOf(res));
    res.json({ profile: await upsertProfile(student.id, ProfileInput.parse(req.body ?? {})) });
  } catch (e) {
    fail(res, e, 'PUT /api/profile');
  }
});

// ─── Student: tutorials ─────────────────────────────────────────────────────

lti.app.get('/api/tutorials', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const student = await studentFromToken(token);
    const tutorials = await listTutorials(ctx, { publishedOnly: true });
    const latest = await latestSessionsForStudent(student.id);
    res.json({
      tutorials: tutorials.map((t) => {
        const s = latest.get(t.id);
        return {
          id: t.id, kind: t.kind, title: t.title, learning_goal: t.learning_goal, target_minutes: t.target_minutes,
          my_status: s?.status ?? null, my_mastery: s?.summary?.mastery ?? null, my_nps: s?.nps_score ?? null,
        };
      }),
      has_profile: !!(await getProfile(student.id)),
      delivery: ctx.delivery,
    });
  } catch (e) {
    fail(res, e, 'GET /api/tutorials');
  }
});

lti.app.post('/api/tutorials/:id/start', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    const tutorial = await getTutorial(id, ctx);
    // Instructors may preview drafts; students only see published ones.
    if (!tutorial || (tutorial.status !== 'published' && !isTeacher(token))) {
      return res.status(404).json({ error: 'tutorial not found' });
    }
    const student = await studentFromToken(token);
    const session = await startTutorialSession(tutorial, student.id, { fresh: !!req.body?.fresh });
    const turns = await getSessionTurns(session.session_id);
    res.json({
      tutorial: {
        id: tutorial.id, kind: tutorial.kind, title: tutorial.title, learning_goal: tutorial.learning_goal,
        target_minutes: tutorial.target_minutes, status: tutorial.status,
        stages: KINDS[tutorial.kind].stages.map((s) => s.name),
      },
      session,
      turns: turns.filter((t) => !t.content.startsWith(START_MARKER)),
    });
  } catch (e) {
    fail(res, e, 'POST /api/tutorials/:id/start');
  }
});

/** Load a tutorial session the current user owns, with its tutorial. */
async function ownedSession(req: Request, res: Response) {
  const { token, ctx } = await ctxOf(res);
  const student = await studentFromToken(token);
  const sid = idParam(req, 'sid');
  if (!sid) return null;
  const ts = await getTutorialSession(sid);
  if (!ts || ts.student_id !== student.id) return null;
  const tutorial = await getTutorial(ts.tutorial_id, ctx);
  if (!tutorial) return null;
  return { token, ctx, student, ts, tutorial };
}

lti.app.post('/api/tutorials/session/:sid/turn', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  try {
    const owned = await ownedSession(req, res);
    if (!owned) { send('error', { message: 'session not found' }); return res.end(); }
    const { token, ctx, student, ts, tutorial } = owned;
    if (ts.status === 'completed') {
      send('error', { message: 'This tutorial run is finished. Start it again to continue.' });
      return res.end();
    }
    const begin = !!req.body?.begin;
    const message = begin
      ? `${START_MARKER}\nThe student has just opened this tutorial. Begin.`
      : String(req.body?.message ?? '').trim().slice(0, 12000); // practice drafts can be long
    if (!message) { send('error', { message: 'message is required' }); return res.end(); }
    if (begin && (await getSessionTurns(ts.session_id)).length > 0) {
      send('done', { already_started: true });
      return res.end();
    }
    const out = await streamTutorialReply({
      tutorial, ctx, tutorialSession: ts, student,
      profile: await getProfile(student.id),
      userMessage: message,
      onChunk: (text) => send('chunk', { text }),
      attribution: attr(token, student.id, ts.session_id, 'tutorial.turn'),
    });
    send('done', { stage: out.stage, student_turns: out.studentTurns });
    res.end();
  } catch (e) {
    console.error('POST /api/tutorials/session/:sid/turn failed:', e);
    send('error', { message: (e as Error).message });
    res.end();
  }
});

lti.app.post('/api/tutorials/session/:sid/complete', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'session not found' });
    const { token, ctx, student, ts, tutorial } = owned;
    const summary = await completeTutorialSession({
      tutorial, ctx, tutorialSession: ts, student,
      attribution: attr(token, student.id, ts.session_id, 'tutorial.summary'),
    });
    let grade: GradeResult = { posted: !!ts.grade_posted_at, error: ts.grade_error ?? undefined };
    if (!ts.grade_posted_at && !isTeacher(token)) {
      grade = await postCompletionGrade(token, tutorial);
      await recordGradeResult(ts.id, grade);
    }
    res.json({ summary, grade });
  } catch (e) {
    fail(res, e, 'POST /api/tutorials/session/:sid/complete');
  }
});

lti.app.post('/api/tutorials/session/:sid/nps', async (req: Request, res: Response) => {
  try {
    const owned = await ownedSession(req, res);
    if (!owned) return res.status(404).json({ error: 'session not found' });
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > 10) return res.status(400).json({ error: 'score must be 0–10' });
    await recordNps(owned.ts.id, score, String(req.body?.comment ?? '').trim().slice(0, 1000));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'POST /api/tutorials/session/:sid/nps');
  }
});

// ─── Student: my learning (the learner model, in their own hands) ───────────

lti.app.get('/api/learning', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const student = await studentFromToken(token);
    res.json({ entries: await listLearnerModel(student.id, ctx, 200) });
  } catch (e) {
    fail(res, e, 'GET /api/learning');
  }
});

lti.app.delete('/api/learning/:id', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const student = await studentFromToken(token);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad entry id' });
    if (!(await deleteLearnerEntry(student.id, ctx, id))) return res.status(404).json({ error: 'entry not found' });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/learning/:id');
  }
});

// ─── Paper versions (offline) ───────────────────────────────────────────────

function fileSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
}

lti.app.get('/api/tutorials/:id/print', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    const tutorial = await getTutorial(id, ctx);
    if (!tutorial || (tutorial.status !== 'published' && !isTeacher(token))) return res.status(404).json({ error: 'tutorial not found' });
    const me = await studentFromToken(token);
    const script = await ensurePrintScript(tutorial, ctx, attr(token, me.id, null, 'tutorial.print_script'), {
      force: isTeacher(token) && req.query.regenerate === '1',
    });
    if (req.query.format === 'json') return res.json({ markdown: script.markdown, generated_at: script.generated_at });
    const name = fileSlug(`${KINDS[tutorial.kind].label}-${tutorial.title}`);
    if (req.query.format === 'md') {
      res.type('text/markdown; charset=utf-8');
      if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${name}.md"`);
      return res.send(script.markdown);
    }
    res.type('html');
    if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${name}.html"`);
    res.send(printScriptHtml(tutorial, script, ctx));
  } catch (e) {
    fail(res, e, 'GET /api/tutorials/:id/print');
  }
});

lti.app.get('/api/materials/:id/debrief.html', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad material id' });
    const [material] = await getMaterials([id], ctx);
    if (!material) return res.status(404).json({ error: 'material not found' });
    const student = await studentFromToken(token);
    const debrief = await getDebrief(student.id, id);
    if (!debrief) return res.status(404).json({ error: 'No debrief written yet. Open the material and click "Write my debrief" first.' });
    res.type('html');
    if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${fileSlug('debrief-' + material.title)}.html"`);
    res.send(personalDebriefHtml(material, debrief.markdown, ctx, debrief.generated_at));
  } catch (e) {
    fail(res, e, 'GET /api/materials/:id/debrief.html');
  }
});

// ─── Student: lecture / study debriefs ──────────────────────────────────────

lti.app.get('/api/materials', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const student = await studentFromToken(token);
    const materials = await listMaterials(ctx);
    const done = await query<{ material_id: number }>(`select material_id from debrief where student_id = $1`, [student.id]);
    const doneSet = new Set(done.map((d) => d.material_id));
    res.json({ materials: materials.map((m) => ({ id: m.id, title: m.title, has_debrief: doneSet.has(m.id) })) });
  } catch (e) {
    fail(res, e, 'GET /api/materials');
  }
});

lti.app.get('/api/materials/:id/debrief', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad material id' });
    const [material] = await getMaterials([id], ctx);
    if (!material) return res.status(404).json({ error: 'material not found' });
    const student = await studentFromToken(token);
    res.json({ material: { id: material.id, title: material.title }, debrief: await getDebrief(student.id, id) });
  } catch (e) {
    fail(res, e, 'GET /api/materials/:id/debrief');
  }
});

lti.app.post('/api/materials/:id/debrief', async (req: Request, res: Response) => {
  try {
    const { token, ctx } = await ctxOf(res);
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad material id' });
    const [material] = await getMaterials([id], ctx);
    if (!material) return res.status(404).json({ error: 'material not found' });
    const student = await studentFromToken(token);
    const debrief = await generateDebrief({
      student, material, ctx,
      profile: await getProfile(student.id),
      attribution: attr(token, student.id, null, 'tutorial.debrief'),
    });
    res.json({ material: { id: material.id, title: material.title }, debrief });
  } catch (e) {
    fail(res, e, 'POST /api/materials/:id/debrief');
  }
});

// ─── Instructor: course settings ────────────────────────────────────────────

async function teacherCtx(res: Response): Promise<{ token: IdToken; ctx: CourseCtx } | null> {
  const token = gateTeacher(res);
  if (!token) return null;
  return { token, ctx: await courseCtxFromToken(token) };
}

lti.app.get('/api/teacher/course', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    res.json({ ...publicCourse(t.ctx), settings: t.ctx.settings, modes: TRUFLEX_MODES, levels: COURSE_LEVEL_LABELS });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/course');
  }
});

lti.app.put('/api/teacher/course', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const settings = await upsertCourseSettings(t.ctx.iss, t.ctx.contextId, CourseSettingsInput.parse(req.body ?? {}));
    const ctx = courseCtxFromSettings(t.ctx.iss, t.ctx.contextId, t.ctx.title ?? '', settings);
    res.json({ ...publicCourse(ctx), settings, modes: TRUFLEX_MODES, levels: COURSE_LEVEL_LABELS });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/course');
  }
});

// ─── Instructor: course pack (offline) ──────────────────────────────────────

lti.app.get('/api/teacher/course-pack.zip', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    const pack = await buildCoursePack(t.ctx, attr(t.token, me.id, null, 'tutorial.course_pack'));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileSlug((t.ctx.title || 'course') + '-offline-pack')}.zip"`);
    res.setHeader('X-Pack-Tutorials', String(pack.tutorials));
    res.setHeader('X-Pack-Materials', String(pack.materials));
    res.send(Buffer.from(pack.zip));
  } catch (e) {
    fail(res, e, 'GET /api/teacher/course-pack.zip');
  }
});

// ─── Instructor: concepts across the course (no names) ──────────────────────

lti.app.get('/api/teacher/concepts', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const concepts = await courseConceptReport(t.ctx);
    const byWeek = t.ctx.delivery.hasFixedDates && t.ctx.settings.course_start
      ? await courseConceptsByWeek(t.ctx, t.ctx.settings.course_start)
      : null;
    res.json({ concepts, by_week: byWeek, course_start: t.ctx.settings.course_start, has_fixed_dates: t.ctx.delivery.hasFixedDates });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/concepts');
  }
});

// ─── Instructor: materials ──────────────────────────────────────────────────

lti.app.get('/api/teacher/materials', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const materials = await listMaterials(t.ctx);
    res.json({ materials: materials.map((m) => ({ ...m, chars: m.body.length })) });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/materials');
  }
});

lti.app.post('/api/teacher/materials', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    res.json({ material: await createMaterial(t.ctx, MaterialInput.parse(req.body ?? {}), me.id) });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials');
  }
});

lti.app.post('/api/teacher/materials/import-url', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const url = String(req.body?.url ?? '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });
    const me = await studentFromToken(t.token);
    const out = await importFromUrl(url, { wholeBook: !!req.body?.whole_book });
    const materials = [];
    for (const d of out.docs) {
      materials.push(await createMaterial(t.ctx, MaterialInput.parse({
        title: d.title, body: d.text, source_url: d.source_url, license: d.license, attribution: d.attribution,
      }), me.id));
    }
    res.json({
      materials: materials.map((m) => ({ ...m, chars: m.body.length })),
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
    const t = await teacherCtx(res);
    if (!t) return;
    const file = (req as Request & { file?: { originalname: string; buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file received. Choose a .txt, .md, .html, .docx or .pdf file.' });
    const me = await studentFromToken(t.token);
    const { title, text } = await extractFromFile(file.originalname, file.buffer);
    if (text.trim().length < 20) return res.status(400).json({ error: 'No readable text was found in that file (a scanned PDF needs OCR first).' });
    const fit = fitMaterial(text.trim());
    const material = await createMaterial(t.ctx, MaterialInput.parse({ title, body: fit.text, attribution: file.originalname.slice(0, 500) }), me.id);
    res.json({ material: { ...material, chars: material.body.length }, truncated: fit.truncated, original_chars: fit.original_chars });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/materials/upload');
  }
});

lti.app.put('/api/teacher/materials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad material id' });
    const material = await updateMaterial(id, t.ctx, MaterialInput.parse(req.body ?? {}));
    if (!material) return res.status(404).json({ error: 'material not found' });
    res.json({ material });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/materials/:id');
  }
});

lti.app.delete('/api/teacher/materials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad material id' });
    if (!(await deleteMaterial(id, t.ctx))) return res.status(404).json({ error: 'material not found' });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/teacher/materials/:id');
  }
});

// ─── Instructor: tutorials ──────────────────────────────────────────────────

lti.app.get('/api/teacher/tutorials', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const tutorials = await listTutorials(t.ctx, { publishedOnly: false });
    const counts = await query<{ tutorial_id: number; started: number; completed: number }>(
      `select tutorial_id,
              count(distinct student_id)::int as started,
              count(distinct student_id) filter (where status = 'completed')::int as completed
       from tutorial_session where tutorial_id = any($1::bigint[]) group by tutorial_id`,
      [tutorials.map((x) => x.id)]
    );
    const byId = new Map(counts.map((c) => [c.tutorial_id, c]));
    res.json({
      tutorials: tutorials.map((x) => ({ ...x, started: byId.get(x.id)?.started ?? 0, completed: byId.get(x.id)?.completed ?? 0 })),
      ags_available: !!t.token.platformContext.endpoint,
    });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/tutorials');
  }
});

lti.app.post('/api/teacher/tutorials', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const me = await studentFromToken(t.token);
    res.json({ tutorial: await createTutorial(t.ctx, TutorialInput.parse(req.body ?? {}), me.id) });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/tutorials');
  }
});

lti.app.put('/api/teacher/tutorials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    const tutorial = await updateTutorial(id, t.ctx, TutorialInput.parse(req.body ?? {}));
    if (!tutorial) return res.status(404).json({ error: 'tutorial not found' });
    res.json({ tutorial });
  } catch (e) {
    fail(res, e, 'PUT /api/teacher/tutorials/:id');
  }
});

lti.app.delete('/api/teacher/tutorials/:id', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    if (!(await deleteTutorial(id, t.ctx))) return res.status(404).json({ error: 'tutorial not found' });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/teacher/tutorials/:id');
  }
});

lti.app.post('/api/teacher/tutorials/draft', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const topic = String(req.body?.topic ?? '').trim().slice(0, 2000);
    if (!topic) return res.status(400).json({ error: 'topic is required' });
    const materialIds = z.array(z.number().int().positive()).max(20).parse(req.body?.material_ids ?? []);
    const pitch = String(req.body?.pitch ?? '').trim().slice(0, 500);
    const kind = isTutorialKind(req.body?.kind) ? req.body.kind : 'concept';
    const me = await studentFromToken(t.token);
    const draft = await draftTutorialBrief({
      ctx: t.ctx, materialIds, topic, pitch, kind,
      attribution: attr(t.token, me.id, null, 'tutorial.draft'),
    });
    res.json({ draft });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/tutorials/draft');
  }
});

lti.app.get('/api/teacher/tutorials/:id/report', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    const tutorial = await getTutorial(id, t.ctx);
    if (!tutorial) return res.status(404).json({ error: 'tutorial not found' });
    res.json({ ...(await getTutorialReport(tutorial)), debrief_kind: debriefKindFor(t.ctx.delivery) });
  } catch (e) {
    fail(res, e, 'GET /api/teacher/tutorials/:id/report');
  }
});

lti.app.post('/api/teacher/tutorials/:id/debrief', async (req: Request, res: Response) => {
  try {
    const t = await teacherCtx(res);
    if (!t) return;
    const id = idParam(req, 'id');
    if (!id) return res.status(400).json({ error: 'bad tutorial id' });
    const tutorial = await getTutorial(id, t.ctx);
    if (!tutorial) return res.status(404).json({ error: 'tutorial not found' });
    const me = await studentFromToken(t.token);
    const report = await getTutorialReport(tutorial);
    const out = await generateGroupDebrief(report, t.ctx, attr(t.token, me.id, null, 'tutorial.debrief'));
    res.json({ kind: out.kind, debrief: out.markdown, completed: report.totals.completed, started: report.totals.started });
  } catch (e) {
    fail(res, e, 'POST /api/teacher/tutorials/:id/debrief');
  }
});

// ─── Deep linking response ──────────────────────────────────────────────────
// The picker page (lti.ts) posts here; ltijs signs the response JWT and we
// return its auto-submitting form, which hands the items back to Moodle.

lti.app.post('/api/deeplink', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  try {
    const token = tokenOf(res);
    if (!isTeacher(token)) return res.status(403).type('text').send('Instructors only.');
    if (!token.platformContext.deepLinkingSettings) return res.status(400).type('text').send('Not a deep-linking launch.');
    const ctx = await courseCtxFromToken(token);
    const labels = deliveryLabels(ctx.delivery);
    const raw = req.body?.tutorial;
    const ids = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map((v: unknown) => parseInt(String(v), 10))
      .filter((n: number) => Number.isInteger(n) && n > 0);

    const items: DeepLinkContentItem[] = [];
    if (req.body?.home === '1') {
      items.push({ type: 'ltiResourceLink', title: env.TOOL_NAME, text: `Tutorials, ${labels.debriefPlural} and your profile.`, url: env.LTI_TOOL_URL });
    }
    for (const id of ids) {
      const t = await getTutorial(id, ctx);
      if (!t || t.status === 'archived') continue;
      const titled = titledForKind(t.kind, t.title);
      const item: DeepLinkContentItem = {
        type: 'ltiResourceLink',
        title: titled,
        text: t.learning_goal,
        url: env.LTI_TOOL_URL,
        custom: { tutorial_id: String(t.id) },
      };
      if (t.gradebook) {
        item.lineItem = { scoreMaximum: 1, label: titled, resourceId: `tutorial-${t.id}`, tag: 'tutorial' };
      }
      items.push(item);
    }
    if (items.length === 0) return res.status(400).type('text').send('Pick at least one item.');
    const form = await lti.DeepLinking.createDeepLinkingForm(token, items, {
      message: `Added ${items.length} item${items.length === 1 ? '' : 's'} from ${env.TOOL_NAME}.`,
    });
    res.type('html').send(form);
  } catch (e) {
    console.error('POST /api/deeplink failed:', e);
    res.status(500).type('text').send('Deep linking failed: ' + (e as Error).message);
  }
});
