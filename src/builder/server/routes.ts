/**
 * /api/* routes. All hang off lti.app, so ltijs's session validator guards
 * them and res.locals.token carries the validated launch claims. Every
 * route is instructor-only: the tool has no student side.
 *
 *   GET    /api/me                                -> { name, course, model }
 *   GET    /api/builds                            -> { builds: [summary] }
 *   POST   /api/builds                            multipart 'file' (.docx) -> { build }   (starts the AI step)
 *   GET    /api/builds/:id                        -> { build }   (slots, activities, settings, state)
 *   PUT    /api/builds/:id                        { course_shortname?, section_number?, leave_out? } -> { build }
 *   DELETE /api/builds/:id
 *   POST   /api/builds/readings                   { title, mode? } -> { build }   (an empty module to add readings to; mode 'practice' | 'rhizmode')
 *   POST   /api/builds/:id/readings               multipart 'file' | { url } | { text, title } -> { build }   (starts drafting its activities)
 *   POST   /api/builds/:id/contract               -> { build }   (RhizMode: draft the module's Community Contract)
 *   PUT    /api/builds/:id/readings/:rid          { title?, include_text?, source_url?, license?, attribution? } -> { build }
 *   DELETE /api/builds/:id/readings/:rid          -> { build }
 *   GET    /api/builds/:id/pages                  -> { chapters, todo, judgement, counts, included, file_name }
 *   GET    /api/builds/:id/file/:name             an image from the draft, for the page preview
 *   PUT    /api/builds/:id/activities/:n          { status?, spec? } -> { activity }
 *   POST   /api/builds/:id/activities/:n/reread   { note? } -> { activity }   (the AI step again, with the designer's note)
 *   GET    /api/builds/:id/download               the restore file (.mbz); ?visible=1 to restore shown to students
 *   GET    /api/builds/:id/report.md              the build report
 *   GET    /api/builds/:id/h5p/:name              one activity as a loose .h5p file
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import type { IdToken } from 'ltijs';
import { z } from 'zod';
import { lti } from './lti.js';
import { env } from './env.js';
import { studentFromToken, gateTeacher, contextIdOf, attr } from '../../core/reqctx.js';
import { ImportError } from '../../core/importers.js';
import type { Scope } from '../../core/materials.js';
import { ACTIVITY_TYPES } from '../engine/index.js';
import { TYPE_LABELS } from './interpret.js';
import {
  DRAFT_MAX_BYTES, listBuilds, getBuild, createBuild, deleteBuild, updateSettings, reviewActivity, rereadActivity, runBuild,
  createReadingsBuild, addReading, addContract, updateReading, removeReading, forClient, READING_MAX_BYTES,
  type BuildRow, type Built, type ReadingInput,
} from './builds.js';
import { checkQuotes } from '../engine/reading.js';
import { RHIZO_KINDS, RHIZO_TYPES, CONTRACT_PARTS, CREDIT_TEXT } from '../engine/rhizo.js';

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

/** The instructor's launch and the build the route names, or a sent error and null. */
async function ctx(req: Request, res: Response): Promise<{ token: IdToken; scope: Scope & { title: string }; build: BuildRow } | null> {
  const token = gateTeacher(res);
  if (!token) return null;
  const id = idParam(req, 'id');
  const scope = scopeOf(token);
  const build = id ? await getBuild(scope, id) : null;
  if (!build) { res.status(404).json({ error: 'That draft was not found in this course.' }); return null; }
  return { token, scope, build };
}

/**
 * A build for the browser. For a readings module each activity also carries
 * the result of the quotation check, item by item, so the review screen can
 * show every question beside the sentence it rests on.
 */
function view(build: BuildRow): unknown {
  const b = forClient(build);
  if (build.kind !== 'readings') return b;
  return {
    ...b,
    activities: build.activities.map((a) => {
      const slot = build.slots.find((s) => s.n === a.n) as { reading?: number } | undefined;
      const text = build.readings.find((r) => r.id === slot?.reading)?.text ?? '';
      return a.spec ? { ...a, quotes: checkQuotes(a.spec, text) } : a;
    }),
  };
}

function withQuotes(build: BuildRow, a: { n: number; spec: Parameters<typeof checkQuotes>[0] | null }): unknown {
  if (build.kind !== 'readings' || !a.spec) return a;
  const slot = build.slots.find((s) => s.n === a.n) as { reading?: number } | undefined;
  return { ...a, quotes: checkQuotes(a.spec, build.readings.find((r) => r.id === slot?.reading)?.text ?? '') };
}

// The engine rebuilds a module in well under a second, but a page preview
// asks for every image separately; keep the latest result per build.
const built = new Map<string, Built>();
async function builtFor(build: BuildRow): Promise<Built> {
  const key = `${build.id}:${build.updated_at}`;
  let b = built.get(key);
  if (!b) {
    b = await runBuild(build);
    for (const k of built.keys()) if (k.startsWith(build.id + ':') || built.size >= 4) built.delete(k);
    built.set(key, b);
  }
  return b;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

function sendFile(res: Response, bytes: Uint8Array, type: string, downloadName?: string): void {
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (downloadName) {
    const ascii = downloadName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  }
  res.end(Buffer.from(bytes));
}

// ─── Launch-level ───────────────────────────────────────────────────────────

lti.app.get('/api/me', async (_req: Request, res: Response) => {
  try {
    const token = gateTeacher(res);
    if (!token) return;
    const me = await studentFromToken(token);
    res.json({
      name: me.display_name,
      course: { id: contextIdOf(token), title: scopeOf(token).title },
      model: env.BUILDER_MODEL,
      ai_ready: Boolean(env.ANTHROPIC_API_KEY),
      types: [...ACTIVITY_TYPES.map((t) => ({ id: t, label: TYPE_LABELS[t] ?? t })), ...RHIZO_TYPES.map((t) => ({ id: t, label: RHIZO_KINDS[t]!.title, asks: RHIZO_KINDS[t]!.asks }))],
      contract_parts: CONTRACT_PARTS,
      rhizo_credit: CREDIT_TEXT,
    });
  } catch (e) {
    fail(res, e, 'GET /api/me');
  }
});

// ─── Drafts ─────────────────────────────────────────────────────────────────

lti.app.get('/api/builds', async (_req: Request, res: Response) => {
  try {
    const token = gateTeacher(res);
    if (!token) return;
    res.json({ builds: await listBuilds(scopeOf(token)) });
  } catch (e) {
    fail(res, e, 'GET /api/builds');
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DRAFT_MAX_BYTES, files: 1 } });

lti.app.post('/api/builds', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const token = gateTeacher(res);
    if (!token) return;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: 'Choose a Word draft (.docx) to upload.' }); return; }
    const me = await studentFromToken(token);
    // Multer reads the name as latin1; browsers send UTF-8.
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const build = await createBuild(scopeOf(token), me.id, { name, bytes: new Uint8Array(file.buffer) }, attr(token, me.id, null, 'builder.read'));
    res.json({ build: view(build) });
  } catch (e) {
    fail(res, e, 'POST /api/builds');
  }
});

lti.app.post('/api/builds/readings', async (req: Request, res: Response) => {
  try {
    const token = gateTeacher(res);
    if (!token) return;
    const { title, mode } = z.object({ title: z.string().trim().min(2).max(160), mode: z.enum(['practice', 'rhizmode']).default('practice') }).parse(req.body);
    const me = await studentFromToken(token);
    res.json({ build: view(await createReadingsBuild(scopeOf(token), me.id, title, mode)) });
  } catch (e) {
    fail(res, e, 'POST /api/builds/readings');
  }
});

const uploadReading = multer({ storage: multer.memoryStorage(), limits: { fileSize: READING_MAX_BYTES, files: 1 } });
const NewReading = z.union([
  z.object({ url: z.string().trim().min(8).max(2000) }),
  z.object({ text: z.string().min(1).max(400_000), title: z.string().trim().max(160).default('') }),
]);

lti.app.post('/api/builds/:id/readings', uploadReading.single('file'), async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    const input: ReadingInput = file
      ? { file: { name: Buffer.from(file.originalname, 'latin1').toString('utf8'), bytes: new Uint8Array(file.buffer) } }
      : NewReading.parse(req.body);
    const me = await studentFromToken(c.token);
    res.json({ build: view(await addReading(c.build, input, attr(c.token, me.id, null, 'builder.draft'))) });
  } catch (e) {
    fail(res, e, 'POST /api/builds/:id/readings');
  }
});

lti.app.post('/api/builds/:id/contract', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const me = await studentFromToken(c.token);
    res.json({ build: view(await addContract(c.build, attr(c.token, me.id, null, 'builder.draft'))) });
  } catch (e) {
    fail(res, e, 'POST /api/builds/:id/contract');
  }
});

const ReadingChange = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  include_text: z.boolean().optional(),
  source_url: z.string().trim().max(2000).refine((u) => u === '' || /^https?:\/\//i.test(u), 'must start with http:// or https://').optional(),
  license: z.string().trim().max(120).optional(),
  attribution: z.string().trim().max(500).optional(),
});

lti.app.put('/api/builds/:id/readings/:rid', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const rid = idParam(req, 'rid');
    if (!rid) { res.status(400).json({ error: 'Bad reading number.' }); return; }
    res.json({ build: view(await updateReading(c.build, rid, ReadingChange.parse(req.body))) });
  } catch (e) {
    fail(res, e, 'PUT /api/builds/:id/readings/:rid');
  }
});

lti.app.delete('/api/builds/:id/readings/:rid', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const rid = idParam(req, 'rid');
    if (!rid) { res.status(400).json({ error: 'Bad reading number.' }); return; }
    res.json({ build: view(await removeReading(c.build, rid)) });
  } catch (e) {
    fail(res, e, 'DELETE /api/builds/:id/readings/:rid');
  }
});

lti.app.get('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    res.json({ build: view(c.build) });
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id');
  }
});

const Settings = z.object({
  course_shortname: z.string().trim().max(100).optional(),
  section_number: z.number().int().min(0).max(200).optional(),
  leave_out: z.array(z.string().trim().min(3).max(300)).max(50).optional(),
});

lti.app.put('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const build = await updateSettings(c.scope, c.build.id, Settings.parse(req.body));
    res.json({ build: build ? view(build) : null });
  } catch (e) {
    fail(res, e, 'PUT /api/builds/:id');
  }
});

lti.app.delete('/api/builds/:id', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    await deleteBuild(c.scope, c.build.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'DELETE /api/builds/:id');
  }
});

// ─── Pages and files ────────────────────────────────────────────────────────

lti.app.get('/api/builds/:id/pages', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const b = await builtFor(c.build);
    res.json({
      chapters: b.chapters, forums: b.forums ?? [], todo: b.todo, judgement: b.judgement, counts: b.counts, included: b.included, file_name: b.fileName,
      h5p: Object.keys(b.h5p), size: b.mbz.byteLength,
    });
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id/pages');
  }
});

lti.app.get('/api/builds/:id/file/:name', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const b = await builtFor(c.build);
    const name = String(req.params.name);
    const bytes = Object.prototype.hasOwnProperty.call(b.images, name) ? b.images[name] : undefined;
    const type = MIME[name.split('.').pop()?.toLowerCase() ?? ''];
    if (!bytes || !type) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'private, max-age=300');
    // An SVG from a Word file could carry script; it is only ever shown through <img>, and this stops it running if opened directly.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    sendFile(res, bytes, type);
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id/file/:name');
  }
});

lti.app.get('/api/builds/:id/h5p/:name', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const b = await builtFor(c.build);
    const name = String(req.params.name);
    if (!Object.prototype.hasOwnProperty.call(b.h5p, name)) { res.status(404).end(); return; }
    sendFile(res, b.h5p[name]!, 'application/zip', name);
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id/h5p/:name');
  }
});

lti.app.get('/api/builds/:id/download', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const visible = req.query.visible === '1';
    const b = visible ? await runBuild(c.build, { visible: true }) : await builtFor(c.build);
    sendFile(res, b.mbz, 'application/vnd.moodle.backup', b.fileName);
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id/download');
  }
});

lti.app.get('/api/builds/:id/report.md', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const b = await builtFor(c.build);
    const name = b.fileName.replace(/\.mbz$/, '') + '-build-report.md';
    sendFile(res, new TextEncoder().encode(b.report), 'text/markdown; charset=utf-8', req.query.download === '1' ? name : undefined);
  } catch (e) {
    fail(res, e, 'GET /api/builds/:id/report.md');
  }
});

// ─── Reviewing the activities ───────────────────────────────────────────────

const Review = z.object({
  status: z.enum(['draft', 'approved', 'skipped']).optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

lti.app.put('/api/builds/:id/activities/:n', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const n = idParam(req, 'n');
    if (!n) { res.status(400).json({ error: 'Bad activity number.' }); return; }
    const change = Review.parse(req.body);
    if (change.spec) {
      // A module's activities stay of its own kind: open prompts in RhizMode, H5P types everywhere else.
      const allowed = c.build.mode === 'rhizmode' ? RHIZO_TYPES : ACTIVITY_TYPES;
      if (!allowed.includes(String(change.spec.type))) {
        res.status(400).json({ error: `"type" must be one of: ${allowed.join(', ')}.` });
        return;
      }
      // An edit keeps the kind it was drafted as: a Trust Audit does not become a contract.
      const was = c.build.activities.find((a) => a.n === n)?.spec?.type;
      if (c.build.mode === 'rhizmode' && was && was !== change.spec.type) {
        res.status(400).json({ error: 'An activity keeps the kind it was drafted as.' });
        return;
      }
    }
    res.json({ activity: withQuotes(c.build, await reviewActivity(c.build, n, change)) });
  } catch (e) {
    fail(res, e, 'PUT /api/builds/:id/activities/:n');
  }
});

lti.app.post('/api/builds/:id/activities/:n/reread', async (req: Request, res: Response) => {
  try {
    const c = await ctx(req, res);
    if (!c) return;
    const n = idParam(req, 'n');
    if (!n) { res.status(400).json({ error: 'Bad activity number.' }); return; }
    const note = z.object({ note: z.string().max(2000).optional() }).parse(req.body ?? {}).note ?? '';
    const me = await studentFromToken(c.token);
    res.json({ activity: withQuotes(c.build, await rereadActivity(c.build, n, note, attr(c.token, me.id, null, 'builder.reread'))) });
  } catch (e) {
    fail(res, e, 'POST /api/builds/:id/activities/:n/reread');
  }
});

// ─── Upload errors as JSON ──────────────────────────────────────────────────
lti.app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(413).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? `That file is too large: the limit is ${Math.round((_req.path.endsWith('/readings') ? READING_MAX_BYTES : DRAFT_MAX_BYTES) / 1048576)} MB.`
        : `Upload failed: ${err.message}`,
    });
    return;
  }
  next(err);
});
