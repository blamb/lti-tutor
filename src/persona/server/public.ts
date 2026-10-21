/**
 * A persona beyond the LMS: the page at /p/<slug> and the API under
 * /api/public/<slug>/…, mounted before ltijs's session validator (the
 * provider's addon hook), so no launch is involved.
 *
 * Visitors are anonymous: a signed cookie names them, and each becomes a
 * student row with lti_iss = 'public' scoped to the persona, so sessions,
 * the coach, the debrief, the transcript export and the instructor's report
 * all work unchanged. A passcode, where set, is checked once per browser
 * and remembered in a second signed cookie. Spend is capped per persona per
 * day, turns per conversation, and new conversations per visitor per day.
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import { createHmac, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { query } from '../../core/db.js';
import type { Student } from '../../core/students.js';
import { launchHtmlLoader, escapeHtml } from '../../core/lti-provider.js';
import type { Attribution } from '../../core/costs.js';
import {
  getPersonaBySlug, publicPersona, passcodeHash, startPersonaSession, getPersonaSession, endPersonaSession, getSessionTurns, visibleTurns,
  streamPersonaReply, streamCoachReply, coachTurnsFor, saveReflection, transcriptHtml, transcriptMarkdown,
  publicSpendToday, studentTurnCount, visitorSessionsToday, PUBLIC_ISS, PUBLIC_SESSIONS_PER_DAY, START_MARKER,
  type Persona, type PersonaSession,
} from './personas.js';
import { requestDebrief, debriefStatus, clientSession } from './debrief.js';
import { hasEndIntent } from './signals.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadLaunchHtml = launchHtmlLoader(join(HERE, '..', 'web', 'launch.html'));

// ─── Cookies ────────────────────────────────────────────────────────────────

const secret = () => env.TOKEN_SECRET || env.LTI_COOKIE_SECRET;
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('base64url').slice(0, 32);

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res: Response, name: string, value: string, maxAgeSeconds: number): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (isProd) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** The visitor's id from the signed cookie, minted on first sight. */
function visitorId(req: Request, res: Response): string {
  const raw = cookies(req).pcv ?? '';
  const [id, sig] = raw.split('.');
  if (id && sig && /^[A-Za-z0-9_-]{10,40}$/.test(id) && sign(`visitor:${id}`) === sig) return id;
  const fresh = randomBytes(12).toString('base64url');
  setCookie(res, 'pcv', `${fresh}.${sign(`visitor:${fresh}`)}`, 365 * 86400);
  return fresh;
}

function unlockedFor(req: Request, p: Persona): boolean {
  if (p.visibility !== 'passcode') return true;
  if (!p.passcode_hash) return false;
  return cookies(req)[`pcu_${p.public_slug}`] === sign(`unlock:${p.public_slug}:${p.passcode_hash}`);
}

// ─── The visitor as a student row ───────────────────────────────────────────

async function visitorStudent(id: string, p: Persona): Promise<Student> {
  const found = await query<Student>(`select * from student where lti_sub = $1 and lti_iss = $2 and lti_context_id = $3`, [id, PUBLIC_ISS, String(p.id)]);
  if (found[0]) return found[0];
  const rows = await query<Student>(
    `insert into student (lti_sub, lti_iss, lti_context_id, display_name) values ($1, $2, $3, 'Visitor')
     on conflict (lti_sub, lti_iss, lti_context_id) do update set display_name = student.display_name returning *`,
    [id, PUBLIC_ISS, String(p.id)]
  );
  return rows[0]!;
}

async function latestSession(personaId: number, studentId: number): Promise<PersonaSession | null> {
  const rows = await query<PersonaSession>(`select * from persona_session where persona_id = $1 and student_id = $2 order by started_at desc limit 1`, [personaId, studentId]);
  return rows[0] ?? null;
}

function attribution(p: Persona, studentId: number, sessionId: number | null, endpoint: string): Attribution {
  return { iss: PUBLIC_ISS, contextId: String(p.id), studentId, sessionId, endpoint };
}

interface Ctx { persona: Persona; student: Student; unlocked: boolean }

async function ctxOf(req: Request, res: Response): Promise<Ctx | null> {
  const persona = await getPersonaBySlug(String(req.params.slug ?? ''));
  if (!persona) { res.status(404).json({ error: 'This link is not active.' }); return null; }
  const student = await visitorStudent(visitorId(req, res), persona);
  return { persona, student, unlocked: unlockedFor(req, persona) };
}

/** As ctxOf, and refuses when a passcode is required and not yet given. */
async function openCtx(req: Request, res: Response): Promise<Ctx | null> {
  const c = await ctxOf(req, res);
  if (!c) return null;
  if (!c.unlocked) { res.status(403).json({ error: 'This persona needs a passcode.', locked: true }); return null; }
  return c;
}

async function ownedSession(req: Request, res: Response) {
  const c = await openCtx(req, res);
  if (!c) return null;
  const sid = parseInt(String(req.params.sid ?? ''), 10);
  const session = Number.isInteger(sid) ? await getPersonaSession(sid) : null;
  if (!session || session.student_id !== c.student.id || session.persona_id !== c.persona.id) { res.status(404).json({ error: 'conversation not found' }); return null; }
  return { ...c, session };
}

function sseStart(res: Response): (event: string, data: unknown) => void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  return (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
}

async function overSpend(p: Persona): Promise<string | null> {
  const usd = await publicSpendToday(p.id);
  return usd >= Number(p.public_daily_usd) ? 'This persona has reached its usage limit for today. Please come back tomorrow.' : null;
}

function fail(res: Response, e: unknown, where: string): void {
  console.error(`${where} failed:`, e);
  res.status(500).json({ error: (e as Error).message });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export function registerPublicRoutes(server: Express): void {
  const json = express.json({ limit: '1mb' });

  server.get('/p/:slug', async (req: Request, res: Response) => {
    const persona = await getPersonaBySlug(String(req.params.slug ?? ''));
    if (!persona) {
      return res.status(404).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(env.TOOL_NAME)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:3rem auto;max-width:36rem;padding:0 1rem"><h1>This link is not active</h1><p>The persona it pointed to is not published, or its link has been turned off. Ask whoever shared it with you.</p></body></html>`);
    }
    const student = await visitorStudent(visitorId(req, res), persona);
    const html = loadLaunchHtml()
      .replaceAll('{{PERSONA_ID}}', String(persona.id))
      .replaceAll('{{PUBLIC_SLUG}}', escapeHtml(persona.public_slug))
      .replaceAll('{{TOOL_NAME}}', escapeHtml(env.TOOL_NAME))
      .replaceAll('{{RETURN_URL}}', '')
      .replaceAll('{{DISPLAY_NAME}}', escapeHtml(student.display_name))
      .replaceAll('{{CONTEXT_TITLE}}', escapeHtml(persona.title))
      .replaceAll('{{ROLE}}', 'student');
    res.send(html);
  });

  server.get('/api/public/:slug/info', async (req, res) => {
    try {
      const c = await ctxOf(req, res);
      if (!c) return;
      const mine = await latestSession(c.persona.id, c.student.id);
      res.json({
        locked: !c.unlocked, name: c.student.display_name === 'Visitor' ? '' : c.student.display_name,
        persona: { ...publicPersona(c.persona), my_session: mine ? { id: mine.id, status: mine.status, started_at: mine.started_at, ended_at: mine.ended_at } : null },
        limits: { max_turns: c.persona.public_max_turns },
      });
    } catch (e) { fail(res, e, 'GET /api/public/:slug/info'); }
  });

  server.post('/api/public/:slug/unlock', json, async (req, res) => {
    try {
      const c = await ctxOf(req, res);
      if (!c) return;
      const given = String(req.body?.passcode ?? '');
      if (c.persona.visibility !== 'passcode') return res.json({ unlocked: true });
      if (!given || passcodeHash(given) !== c.persona.passcode_hash) return res.status(403).json({ error: 'That passcode is not right.' });
      setCookie(res, `pcu_${c.persona.public_slug}`, sign(`unlock:${c.persona.public_slug}:${c.persona.passcode_hash}`), 30 * 86400);
      res.json({ unlocked: true });
    } catch (e) { fail(res, e, 'POST /api/public/:slug/unlock'); }
  });

  server.post('/api/public/:slug/name', json, async (req, res) => {
    try {
      const c = await openCtx(req, res);
      if (!c) return;
      const name = String(req.body?.name ?? '').trim().slice(0, 40) || 'Visitor';
      await query(`update student set display_name = $2 where id = $1`, [c.student.id, name]);
      res.json({ name: name === 'Visitor' ? '' : name });
    } catch (e) { fail(res, e, 'POST /api/public/:slug/name'); }
  });

  server.get('/api/public/:slug/personas', async (req, res) => {
    try {
      const c = await openCtx(req, res);
      if (!c) return;
      const mine = await latestSession(c.persona.id, c.student.id);
      res.json({ personas: [{ ...publicPersona(c.persona), my_session: mine ? { id: mine.id, status: mine.status, started_at: mine.started_at, ended_at: mine.ended_at, debrief_state: debriefStatus(mine).state } : null }] });
    } catch (e) { fail(res, e, 'GET /api/public/:slug/personas'); }
  });

  server.post('/api/public/:slug/start', json, async (req, res) => {
    try {
      const c = await openCtx(req, res);
      if (!c) return;
      const fresh = !!req.body?.fresh;
      const current = await latestSession(c.persona.id, c.student.id);
      const startsNew = fresh || !current || current.status !== 'in_progress';
      if (startsNew && (await visitorSessionsToday(c.persona.id, c.student.id)) >= PUBLIC_SESSIONS_PER_DAY) {
        return res.status(429).json({ error: `You have started ${PUBLIC_SESSIONS_PER_DAY} conversations with this persona today, which is the limit. Please come back tomorrow.` });
      }
      if (startsNew) { const over = await overSpend(c.persona); if (over) return res.status(429).json({ error: over }); }
      const session = await startPersonaSession(c.persona, c.student.id, 'live', { fresh });
      res.json({ persona: publicPersona(c.persona), session: clientSession(session), turns: visibleTurns(await getSessionTurns(session.session_id)), coach_turns: await coachTurnsFor(session) });
    } catch (e) { fail(res, e, 'POST /api/public/:slug/start'); }
  });

  server.get('/api/public/:slug/session/:sid', async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      res.json({ persona: publicPersona(o.persona), session: clientSession(o.session), turns: visibleTurns(await getSessionTurns(o.session.session_id)), coach_turns: await coachTurnsFor(o.session) });
    } catch (e) { fail(res, e, 'GET /api/public/:slug/session/:sid'); }
  });

  server.post('/api/public/:slug/session/:sid/turn', json, async (req, res) => {
    const send = sseStart(res);
    try {
      const o = await ownedSession(req, { ...res, status: () => ({ json: (d: unknown) => { send('error', d); res.end(); } }) } as unknown as Response);
      if (!o) return;
      const { persona, student, session } = o;
      if (session.status === 'ended') { send('error', { message: 'This conversation has ended. Start a new one to continue.' }); return res.end(); }
      const begin = !!req.body?.begin;
      const message = begin ? `${START_MARKER}\nThe student has just arrived. Begin.` : String(req.body?.message ?? '').trim().slice(0, 8000);
      if (!message) { send('error', { message: 'message is required' }); return res.end(); }
      if (begin && ((await getSessionTurns(session.session_id)).length > 0 || persona.opening !== 'persona')) { send('done', { already_started: true }); return res.end(); }
      if (!begin && !req.body?.continue && hasEndIntent(message)) { send('end_intent', { message }); return res.end(); }
      if (!begin && (await studentTurnCount(session.session_id)) >= persona.public_max_turns) {
        send('error', { message: `This conversation has reached its limit of ${persona.public_max_turns} messages. End it to get your debrief, then start a new one if you like.` }); return res.end();
      }
      const over = await overSpend(persona);
      if (over) { send('error', { message: over }); return res.end(); }
      const out = await streamPersonaReply({
        persona, scope: { iss: persona.lti_iss, contextId: persona.lti_context_id }, session,
        // The name a visitor typed at the gate is one they chose for this activity; 'Visitor' and the skip value 'there' are not names.
        givenName: ['Visitor', 'there'].includes(student.display_name) ? '' : student.display_name,
        userMessage: message, onChunk: (text) => send('chunk', { text }), attribution: attribution(persona, student.id, session.session_id, 'persona.turn'),
      });
      if (out.refused) send('notice', { message: 'The persona declined to continue in that direction. Try a different question, or end the conversation.' });
      if (out.quotes) send('quotes', out.quotes);
      send('done', { passages: out.passages });
      res.end();
    } catch (e) {
      console.error('POST /api/public/:slug/session/:sid/turn failed:', e);
      send('error', { message: (e as Error).message }); res.end();
    }
  });

  server.post('/api/public/:slug/session/:sid/coach', json, async (req, res) => {
    const send = sseStart(res);
    try {
      const o = await ownedSession(req, { ...res, status: () => ({ json: (d: unknown) => { send('error', d); res.end(); } }) } as unknown as Response);
      if (!o) return;
      const { persona, student, session } = o;
      if (persona.coach !== 'on') { send('error', { message: 'The coach is switched off for this persona.' }); return res.end(); }
      const question = String(req.body?.question ?? '').trim().slice(0, 4000);
      if (!question) { send('error', { message: 'question is required' }); return res.end(); }
      const over = await overSpend(persona);
      if (over) { send('error', { message: over }); return res.end(); }
      await streamCoachReply({ persona, session, studentName: student.display_name, question, onChunk: (text) => send('chunk', { text }), attribution: attribution(persona, student.id, session.session_id, 'persona.coach') });
      send('done', {}); res.end();
    } catch (e) {
      console.error('POST /api/public/:slug/session/:sid/coach failed:', e);
      send('error', { message: (e as Error).message }); res.end();
    }
  });

  server.post('/api/public/:slug/session/:sid/end', json, async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      const session = o.session.status === 'ended' ? o.session : await endPersonaSession(o.session, String(req.body?.final_message ?? ''));
      res.json({ session: clientSession(session), grade: null });
    } catch (e) { fail(res, e, 'POST /api/public/:slug/session/:sid/end'); }
  });

  server.post('/api/public/:slug/session/:sid/debrief', json, async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      if (o.session.status !== 'ended') return res.status(400).json({ error: 'End the conversation first; the debrief looks back at the whole of it.' });
      if (!o.session.debrief) { const over = await overSpend(o.persona); if (over) return res.status(429).json({ error: over }); }
      res.json(await requestDebrief({ persona: o.persona, session: o.session, attribution: attribution(o.persona, o.student.id, o.session.session_id, 'persona.debrief') }));
    } catch (e) { fail(res, e, 'POST /api/public/:slug/session/:sid/debrief'); }
  });

  server.get('/api/public/:slug/session/:sid/debrief', async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      res.json(debriefStatus(o.session));
    } catch (e) { fail(res, e, 'GET /api/public/:slug/session/:sid/debrief'); }
  });

  server.post('/api/public/:slug/session/:sid/reflection', json, async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      await saveReflection(o.session.id, String(req.body?.text ?? ''));
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'POST /api/public/:slug/session/:sid/reflection'); }
  });

  server.get('/api/public/:slug/session/:sid/transcript.:format', async (req, res) => {
    try {
      const o = await ownedSession(req, res);
      if (!o) return;
      const turns = await getSessionTurns(o.session.session_id);
      const download = String(req.query.download ?? '') === '1';
      const stem = `${o.persona.title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'conversation'}-${o.session.id}`;
      if (String(req.params.format) === 'md') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        if (download) res.setHeader('Content-Disposition', `attachment; filename="${stem}.md"`);
        return res.send(transcriptMarkdown(o.persona, o.session, turns, o.student.display_name));
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (download) res.setHeader('Content-Disposition', `attachment; filename="${stem}.html"`);
      res.send(transcriptHtml(o.persona, o.session, turns, o.student.display_name, env.TOOL_NAME));
    } catch (e) { fail(res, e, 'GET /api/public/:slug/session/:sid/transcript'); }
  });
}
