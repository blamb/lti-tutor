/**
 * Builds: an uploaded course draft and the state of its review.
 *
 * Upload runs the page rules once (engine.inspectDraft) to find the module
 * name and the H5P specs, stores the Word file, and starts the AI step in
 * the background: each spec is read into a structured activity
 * (interpret.ts). The designer then approves, corrects or leaves out each
 * one. The pages and the restore file are rebuilt from the stored draft
 * whenever they are asked for, so they always match the latest review.
 */

import { query } from '../../core/db.js';
import type { Scope } from '../../core/materials.js';
import type { Attribution } from '../../core/costs.js';
import { ImportError } from '../../core/importers.js';
import { inspectDraft, buildModule, checkActivity, type Activity, type BuildResult, type ModuleSpec, type Slot } from '../engine/index.js';
import { readSpec } from './interpret.js';

export const DRAFT_MAX_BYTES = 40 * 1024 * 1024;
/** Specs read at once: enough to finish a module in under a minute without tripping rate limits. */
const READ_CONCURRENCY = 4;

export type ActivityStatus = 'pending' | 'draft' | 'approved' | 'skipped' | 'failed';

export interface ReviewedActivity {
  n: number;
  status: ActivityStatus;
  spec: Activity | null;
  /** What checkActivity found; a spec with problems is left out of the file. */
  problems: string[];
  /** Why the AI step failed, when status is 'failed'. */
  error?: string;
  /** True once a person has changed the reading by hand. */
  edited?: boolean;
}

export interface BuildRow {
  id: number;
  lti_iss: string;
  lti_context_id: string;
  created_by: number | null;
  title: string;
  source_name: string;
  slots: Slot[];
  activities: ReviewedActivity[];
  leave_out: string[];
  course_shortname: string;
  section_number: number;
  state: 'reading' | 'ready';
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, lti_iss, lti_context_id, created_by, title, source_name, slots, activities, leave_out,
  course_shortname, section_number, state, created_at, updated_at`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The engine's overrides for a build: each "leave out" phrase drops the paragraphs that start with it. */
export function overridesOf(leaveOut: string[]): Record<string, unknown> {
  const phrases = leaveOut.map((s) => s.trim()).filter(Boolean);
  return phrases.length ? { drop_text_matching: phrases.map((p) => '^' + escapeRegExp(p)) } : {};
}

/** A short file-name prefix for the module's images and H5P packages, so two modules restored into one course never collide. */
function prefixFor(id: number): string {
  return 'mb' + id;
}

export async function listBuilds(scope: Scope): Promise<Omit<BuildRow, 'slots' | 'activities'>[]> {
  const rows = await query<BuildRow>(
    `select ${COLUMNS} from build where lti_iss = $1 and lti_context_id = $2 order by created_at desc limit 100`,
    [scope.iss, scope.contextId]
  );
  return rows.map((r) => ({ ...summaryOf(r) }));
}

function summaryOf(r: BuildRow) {
  const count = (s: ActivityStatus) => r.activities.filter((a) => a.status === s).length;
  const { slots, activities, ...rest } = r;
  return {
    ...rest,
    spec_count: slots.length,
    approved: count('approved'), to_review: count('draft'), skipped: count('skipped'), failed: count('failed'), pending: count('pending'),
  };
}

export async function getBuild(scope: Scope, id: number): Promise<BuildRow | null> {
  const rows = await query<BuildRow>(
    `select ${COLUMNS} from build where id = $1 and lti_iss = $2 and lti_context_id = $3`,
    [id, scope.iss, scope.contextId]
  );
  return rows[0] ?? null;
}

async function getDocx(id: number): Promise<Uint8Array> {
  const rows = await query<{ docx: Buffer }>(`select docx from build where id = $1`, [id]);
  if (!rows[0]) throw new ImportError('That draft no longer exists.', 404);
  return new Uint8Array(rows[0].docx);
}

export async function deleteBuild(scope: Scope, id: number): Promise<boolean> {
  const rows = await query(`delete from build where id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`, [id, scope.iss, scope.contextId]);
  return rows.length > 0;
}

/** Store a new draft and start reading its specs. Throws ImportError when the file is not a readable Word draft. */
export async function createBuild(scope: Scope & { title: string }, createdBy: number, file: { name: string; bytes: Uint8Array }, attribution: Attribution): Promise<BuildRow> {
  if (!/\.docx$/i.test(file.name)) {
    throw new ImportError('Upload a Word document (.docx). Older .doc files and PDFs lose the styles and colours the production notes depend on; save the draft as .docx first.', 400);
  }
  let found: ReturnType<typeof inspectDraft>;
  try {
    found = inspectDraft(file.bytes);
  } catch (e) {
    console.error('builder: could not read draft', file.name, e);
    throw new ImportError(`That file could not be read as a Word draft (${(e as Error).message}).`, 400);
  }
  if (!found.chapters.length) {
    throw new ImportError('No pages were found. The builder starts a new page at every "Heading 2" in the draft; this file has none.', 400);
  }
  const activities: ReviewedActivity[] = found.slots.map((s) => ({ n: s.n, status: 'pending', spec: null, problems: [] }));
  const rows = await query<BuildRow>(
    `insert into build (lti_iss, lti_context_id, created_by, title, source_name, docx, slots, activities, course_shortname, state)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${COLUMNS}`,
    [scope.iss, scope.contextId, createdBy, found.name, file.name, Buffer.from(file.bytes), JSON.stringify(found.slots),
      JSON.stringify(activities), '', found.slots.length ? 'reading' : 'ready']
  );
  const row = rows[0]!;
  if (found.slots.length) void readAll(row.id, attribution);
  return row;
}

/** Write one activity's review entry without disturbing the others (they are read concurrently). */
async function saveActivity(id: number, entry: ReviewedActivity): Promise<void> {
  await query(
    `update build set updated_at = now(), activities = (
       select coalesce(jsonb_agg(case when (a->>'n')::int = $2 then $3::jsonb else a end order by (a->>'n')::int), '[]'::jsonb)
       from jsonb_array_elements(activities) a)
     where id = $1`,
    [id, entry.n, JSON.stringify(entry)]
  );
}

async function readOne(id: number, slot: Slot, attribution: Attribution): Promise<void> {
  try {
    const { spec, problems } = await readSpec(slot, attribution);
    await saveActivity(id, { n: slot.n, status: 'draft', spec, problems });
  } catch (e) {
    console.error(`builder: reading spec ${slot.n} of build ${id} failed:`, e);
    await saveActivity(id, { n: slot.n, status: 'failed', spec: null, problems: [], error: (e as Error).message.slice(0, 400) });
  }
}

/** Read every spec still pending, a few at a time, then mark the build ready. */
async function readAll(id: number, attribution: Attribution): Promise<void> {
  try {
    const rows = await query<Pick<BuildRow, 'slots' | 'activities'>>(`select slots, activities from build where id = $1`, [id]);
    if (!rows[0]) return;
    const pending = new Set(rows[0].activities.filter((a) => a.status === 'pending').map((a) => a.n));
    const queue = rows[0].slots.filter((s) => pending.has(s.n));
    const workers = Array.from({ length: Math.min(READ_CONCURRENCY, queue.length) }, async () => {
      for (let slot = queue.shift(); slot; slot = queue.shift()) await readOne(id, slot, attribution);
    });
    await Promise.all(workers);
  } finally {
    await query(`update build set state = 'ready', updated_at = now() where id = $1`, [id]).catch((e) => console.error('builder: could not mark build ready', e));
  }
}

/** After a restart: pick up drafts whose AI step was cut off. */
export async function resumeUnfinished(): Promise<void> {
  try {
    const rows = await query<{ id: number; lti_iss: string; lti_context_id: string }>(`select id, lti_iss, lti_context_id from build where state = 'reading'`);
    for (const r of rows) {
      void readAll(r.id, { iss: r.lti_iss, contextId: r.lti_context_id, endpoint: 'builder.read' });
    }
  } catch (e) {
    console.error('builder: could not resume unfinished drafts:', e);
  }
}

function slotOf(build: BuildRow, n: number): Slot {
  const slot = build.slots.find((s) => s.n === n);
  if (!slot) throw new ImportError('That activity is not in this draft.', 404);
  return slot;
}

/** The designer asks for a change in words; the AI step rereads the spec with that note. */
export async function rereadActivity(build: BuildRow, n: number, note: string, attribution: Attribution): Promise<ReviewedActivity> {
  const slot = slotOf(build, n);
  const current = build.activities.find((a) => a.n === n);
  const change = note.trim() && current?.spec ? { previous: current.spec, note: note.trim() } : undefined;
  const { spec, problems } = await readSpec(slot, attribution, change);
  const entry: ReviewedActivity = { n, status: 'draft', spec, problems };
  await saveActivity(build.id, entry);
  return entry;
}

/** The designer edits the reading directly, or approves it, or leaves it out. */
export async function reviewActivity(build: BuildRow, n: number, change: { status?: ActivityStatus; spec?: Record<string, unknown> }): Promise<ReviewedActivity> {
  slotOf(build, n);
  const current = build.activities.find((a) => a.n === n) ?? { n, status: 'pending' as ActivityStatus, spec: null, problems: [] };
  const entry: ReviewedActivity = { ...current };
  if (change.spec) {
    entry.spec = { ...change.spec, n } as Activity;
    entry.problems = checkActivity(entry.spec);
    entry.edited = true;
    entry.error = undefined;
    if (entry.status === 'failed' || entry.status === 'pending') entry.status = 'draft';
  }
  if (change.status) {
    if (change.status === 'approved') {
      if (!entry.spec) throw new ImportError('There is nothing to approve yet for this activity.', 400);
      if (entry.problems.length) throw new ImportError('This activity cannot be built yet: ' + entry.problems.join(' '), 400);
    }
    if (!['draft', 'approved', 'skipped'].includes(change.status)) throw new ImportError('Unknown status.', 400);
    entry.status = change.status;
  } else if (change.spec && entry.status === 'approved') {
    entry.status = 'draft'; // an edit after approval needs a second look
  }
  await saveActivity(build.id, entry);
  return entry;
}

export async function updateSettings(scope: Scope, id: number, s: { course_shortname?: string; section_number?: number; leave_out?: string[] }): Promise<BuildRow | null> {
  const rows = await query<BuildRow>(
    `update build set
       course_shortname = coalesce($4, course_shortname),
       section_number = coalesce($5, section_number),
       leave_out = coalesce($6::jsonb, leave_out),
       updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning ${COLUMNS}`,
    [id, scope.iss, scope.contextId, s.course_shortname ?? null, s.section_number ?? null, s.leave_out ? JSON.stringify(s.leave_out) : null]
  );
  return rows[0] ?? null;
}

/** Which activities go into the file: everything read without problems that the designer has not left out. */
function specFor(build: BuildRow): ModuleSpec {
  return {
    prefix: prefixFor(build.id),
    overrides: overridesOf(build.leave_out),
    activities: build.activities
      .filter((a) => a.spec && !a.problems.length && (a.status === 'draft' || a.status === 'approved'))
      .map((a) => a.spec!),
  };
}

/** A section appended to the engine's report: who has looked at what. */
function reviewSection(build: BuildRow): string {
  const label: Record<ActivityStatus, string> = {
    approved: 'Approved by the designer',
    draft: 'Built, NOT YET REVIEWED by a person',
    skipped: 'Left out by the designer',
    failed: 'Not built: the AI step failed',
    pending: 'Not built: not read yet',
  };
  const lines = ['', '## Review status of each H5P activity', '', 'Each spec was read into an activity by an AI model. A person approves each reading in the builder.', '',
    '| # | Title | Status | Edited by hand |', '|---|---|---|---|'];
  for (const s of build.slots) {
    const a = build.activities.find((x) => x.n === s.n);
    const status = !a ? label.pending : a.spec && a.problems.length && a.status !== 'skipped' ? 'Not built: ' + a.problems.join(' ') : label[a.status];
    lines.push(`| ${s.n} | ${(a?.spec?.title || s.title || '(no title)').replace(/\|/g, '/')} | ${status.replace(/\|/g, '/')} | ${a?.edited ? 'yes' : ''} |`);
  }
  return lines.join('\n') + '\n';
}

export interface Built extends BuildResult {
  /** Per slot: is it in the file? */
  included: number[];
}

/** Run the engine on the stored draft with the current review. */
export async function runBuild(build: BuildRow, opts: { visible?: boolean } = {}): Promise<Built> {
  const docx = await getDocx(build.id);
  const spec = specFor(build);
  const result = buildModule(docx, spec, {
    sourceName: build.source_name,
    course: build.course_shortname || undefined,
    section: build.section_number,
    visible: opts.visible,
  });
  return { ...result, report: result.report + reviewSection(build), included: (spec.activities ?? []).map((a) => a.n) };
}
