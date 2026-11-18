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
import { ImportError, importFromUrl, extractFromFile } from '../../core/importers.js';
import { inspectDraft, buildModule, checkActivity, type Activity, type BuildResult, type ModuleSpec, type Slot } from '../engine/index.js';
import { buildReadings, checkDrafted, type Reading, type ReadingActivity } from '../engine/reading.js';
import { joinPages, buildCourseFile, type ModuleParts } from '../engine/combine.js';
import { buildMbz } from '../engine/mbz.js';
import { readSpec } from './interpret.js';
import { draftActivity, draftContract, ROLES, MODE_ROLES, TRAIL_ROLES, EXTRA_ROLES, type Role, type Mode } from './drafting.js';
import { env } from './env.js';
import { TRAIL_TYPES, isRhizo } from '../engine/rhizo.js';
import { isPageKind, PAGE_KINDS } from '../engine/coursepage.js';
import { draftPage, isPageRole, type PageRole } from './pagedraft.js';

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

/** A reading as stored: what the engine needs, plus where it came from. */
export interface StoredReading extends Reading {
  origin: 'url' | 'file' | 'paste';
}

/** A slot of a readings module: an activity drafted from one reading, not a spec found in a draft. */
export interface ReadingSlot extends Slot {
  reading: number;
  role: Role;
}

export interface BuildRow {
  id: number;
  /** draft: a Word draft with production notes. readings: built from readings, activities drafted by AI. */
  kind: 'draft' | 'readings';
  /** For a readings module: practice questions with a key, or RhizMode's open prompts with none. */
  mode: Mode;
  readings: StoredReading[];
  /** Where the practice questions and the key terms go: H5P on the pages, a native Moodle activity, or both. */
  questions_as: 'h5p' | 'quiz' | 'both';
  terms_as: 'h5p' | 'glossary' | 'both';
  /** The course outline the designer pasted or uploaded, '' if none. Course pages draw on it. */
  outline: string;
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

const COLUMNS = `id, kind, mode, readings, outline, questions_as, terms_as, lti_iss, lti_context_id, created_by, title, source_name, slots, activities, leave_out,
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

export async function listBuilds(scope: Scope): Promise<Omit<BuildRow, 'slots' | 'activities' | 'readings'>[]> {
  const rows = await query<BuildRow>(
    `select ${COLUMNS} from build where lti_iss = $1 and lti_context_id = $2 order by created_at desc limit 100`,
    [scope.iss, scope.contextId]
  );
  return rows.map((r) => ({ ...summaryOf(r) }));
}

function summaryOf(r: BuildRow) {
  const count = (s: ActivityStatus) => r.activities.filter((a) => a.status === s).length;
  const { slots, activities, readings, ...rest } = r;
  return {
    ...rest,
    reading_count: readings.length,
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
  const rows = await query<{ docx: Buffer | null }>(`select docx from build where id = $1`, [id]);
  if (!rows[0]?.docx) throw new ImportError('That draft no longer exists.', 404);
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
    // A new module is filed in the section after the last one this tool has used in the course, so modules do not pile into section 1.
    `insert into build (lti_iss, lti_context_id, created_by, title, source_name, docx, slots, activities, course_shortname, state, section_number)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (select coalesce(max(section_number), 0) + 1 from build where lti_iss = $1 and lti_context_id = $2)) returning ${COLUMNS}`,
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

/** What a drafted item's passages are checked against: its reading, or for a page drafted from the whole module, all the readings and the outline. */
export function sourceOf(build: Pick<BuildRow, 'readings' | 'outline'>, slot: Slot | undefined): { text: string; outline: string } {
  const rs = slot as ReadingSlot | undefined;
  if (rs && (rs.role === 'overview' || rs.role === 'takeaways' || rs.role === 'discussion' || rs.role === 'assignment')) {
    return { text: build.readings.map((r) => r.text).join('\n\n'), outline: rs.role === 'overview' || rs.role === 'assignment' ? build.outline : '' };
  }
  return { text: build.readings.find((r) => r.id === rs?.reading)?.text ?? '', outline: '' };
}

async function draftPageFor(build: Pick<BuildRow, 'readings' | 'outline' | 'title'>, slot: ReadingSlot, attribution: Attribution, change?: { previous: unknown; note: string }) {
  const reading = build.readings.find((r) => r.id === slot.reading);
  if (slot.role === 'guide' && !reading) throw new ImportError('The reading this guide was drafted from has been removed.', 404);
  if (!build.readings.length) throw new ImportError('Add a reading first: this page is drafted from the module’s readings.', 400);
  return draftPage({ n: slot.n, role: slot.role as PageRole, moduleName: build.title, readings: build.readings, reading, outline: build.outline }, attribution, change);
}

async function readOne(id: number, kind: BuildRow['kind'], slot: Slot, readings: StoredReading[], attribution: Attribution, title = '', outline = ''): Promise<void> {
  try {
    // A slot with a role was drafted from readings, whichever kind of module it is in.
    if ((slot as ReadingSlot).role) {
      const rs = slot as ReadingSlot;
      if (isPageRole(rs.role)) {
        if (rs.role === 'guide' && !readings.some((r) => r.id === rs.reading)) return; // the reading was removed while its guide was queued
        const { spec, problems } = await draftPageFor({ readings, outline, title }, rs, attribution);
        await saveActivity(id, draftedEntry(slot.n, spec, problems));
        return;
      }
      if (rs.role === 'contract') {
        const { spec, problems } = await draftContract(slot.n, title, readings, attribution);
        await saveActivity(id, { n: slot.n, status: 'draft', spec, problems });
        return;
      }
      const reading = readings.find((r) => r.id === rs.reading);
      if (!reading) return; // the reading was removed while its activities were queued
      const { spec, problems } = await draftActivity(slot.n, reading, rs.role, attribution);
      await saveActivity(id, draftedEntry(slot.n, spec, problems));
      return;
    }
    const { spec, problems } = await readSpec(slot, attribution);
    await saveActivity(id, { n: slot.n, status: 'draft', spec, problems });
  } catch (e) {
    console.error(`builder: reading spec ${slot.n} of build ${id} failed:`, e);
    await saveActivity(id, { n: slot.n, status: 'failed', spec: null, problems: [], error: (e as Error).message.slice(0, 400) });
  }
}

/** A reading that defines too few terms gets no flashcards: the empty deck is left out, with the model's note kept. */
function draftedEntry(n: number, spec: Activity, problems: string[]): ReviewedActivity {
  // The same for a RhizMode kind the model declined: the reading gave it nothing honest to work with.
  const none = (v: unknown): boolean => Array.isArray(v) && v.length === 0;
  const empty = (spec.type === 'dialogcards' && none(spec.cards))
    // The same for the practice types added on request: too few terms for a crossword, no dated events for a timeline.
    || (spec.type === 'summary' && none(spec.sets)) || (spec.type === 'crossword' && none(spec.words)) || (spec.type === 'timeline' && none(spec.events))
    || (TRAIL_TYPES.includes(spec.type) && none(spec.trails))
    // A course page the model declined: the material was too thin to draft from.
    || (isPageKind(spec) && none(spec.type === 'overview' ? spec.covers : spec.type === 'discussion' ? spec.passages : spec.type === 'assignment' ? (spec.task ? null : []) : spec.points));
  return empty ? { n, status: 'skipped', spec, problems: [] } : { n, status: 'draft', spec, problems };
}

// One pass at a time per build. A reading added while a pass is running sets
// the flag, and the pass runs again for whatever is pending when it ends.
const running = new Map<number, boolean>();

/** Read every spec still pending, a few at a time, then mark the build ready. */
async function readAll(id: number, attribution: Attribution): Promise<void> {
  if (running.has(id)) { running.set(id, true); return; }
  running.set(id, false);
  try {
    for (;;) {
      running.set(id, false);
      const rows = await query<Pick<BuildRow, 'kind' | 'slots' | 'activities' | 'readings' | 'title' | 'outline'>>(`select kind, title, slots, activities, readings, outline from build where id = $1`, [id]);
      const row = rows[0];
      if (!row) return;
      const pending = new Set(row.activities.filter((a) => a.status === 'pending').map((a) => a.n));
      const queue = row.slots.filter((s) => pending.has(s.n));
      const workers = Array.from({ length: Math.min(READ_CONCURRENCY, queue.length) }, async () => {
        for (let slot = queue.shift(); slot; slot = queue.shift()) await readOne(id, row.kind, slot, row.readings, attribution, row.title, row.outline);
      });
      await Promise.all(workers);
      if (!running.get(id)) break;
    }
  } finally {
    running.delete(id);
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
  let entry: ReviewedActivity;
  if ((slot as ReadingSlot).role) {
    const rs = slot as ReadingSlot;
    if (isPageRole(rs.role)) {
      const { spec, problems } = await draftPageFor(build, rs, attribution, change);
      entry = draftedEntry(n, spec, problems);
      await saveActivity(build.id, entry);
      return entry;
    }
    if (rs.role === 'contract') {
      if (!build.readings.length) throw new ImportError('Add a reading first: the contract is drafted from what the module is about.', 400);
      const { spec, problems } = await draftContract(n, build.title, build.readings, attribution, change);
      entry = { n, status: 'draft', spec, problems };
      await saveActivity(build.id, entry);
      return entry;
    }
    const reading = build.readings.find((r) => r.id === rs.reading);
    if (!reading) throw new ImportError('The reading this activity was drafted from has been removed.', 404);
    const { spec, problems } = await draftActivity(n, reading, rs.role, attribution, change);
    entry = draftedEntry(n, spec, problems);
  } else {
    const { spec, problems } = await readSpec(slot, attribution, change);
    entry = { n, status: 'draft', spec, problems };
  }
  await saveActivity(build.id, entry);
  return entry;
}

/** The designer edits the reading directly, or approves it, or leaves it out. */
export async function reviewActivity(build: BuildRow, n: number, change: { status?: ActivityStatus; spec?: Record<string, unknown> }): Promise<ReviewedActivity> {
  const slot = slotOf(build, n);
  const current = build.activities.find((a) => a.n === n) ?? { n, status: 'pending' as ActivityStatus, spec: null, problems: [] };
  const entry: ReviewedActivity = { ...current };
  if (change.spec) {
    if ((slot as ReadingSlot).role) {
      // An edited question must still rest on a sentence of its reading.
      const rid = (slot as ReadingSlot).reading;
      entry.spec = { ...change.spec, n, reading: rid } as unknown as Activity;
      const src = sourceOf(build, slot);
      entry.problems = checkDrafted(entry.spec, src.text, src.outline);
    } else {
      entry.spec = { ...change.spec, n } as Activity;
      entry.problems = checkActivity(entry.spec);
    }
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
    if (change.status === 'draft' && !entry.spec) throw new ImportError('There is nothing to put back for this activity. Use "Try again".', 400);
    entry.status = change.status;
  } else if (change.spec && entry.status === 'approved') {
    entry.status = 'draft'; // an edit after approval needs a second look
  }
  await saveActivity(build.id, entry);
  return entry;
}

export async function updateSettings(scope: Scope, id: number, s: { course_shortname?: string; section_number?: number; leave_out?: string[]; questions_as?: string; terms_as?: string }): Promise<BuildRow | null> {
  const rows = await query<BuildRow>(
    `update build set
       course_shortname = coalesce($4, course_shortname),
       section_number = coalesce($5, section_number),
       leave_out = coalesce($6::jsonb, leave_out),
       questions_as = coalesce($7, questions_as),
       terms_as = coalesce($8, terms_as),
       updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning ${COLUMNS}`,
    [id, scope.iss, scope.contextId, s.course_shortname ?? null, s.section_number ?? null, s.leave_out ? JSON.stringify(s.leave_out) : null, s.questions_as ?? null, s.terms_as ?? null]
  );
  return rows[0] ?? null;
}

/** Which activities go into the file: everything read without problems that the designer has not left out. */
function specFor(build: BuildRow): ModuleSpec {
  // RhizMode builds only what a person has approved: its pages say the prompts were reviewed.
  // So does a drafted course page, in either mode: its wording is a model's and the page says it was reviewed.
  const statuses: ActivityStatus[] = build.mode === 'rhizmode' ? ['approved'] : ['draft', 'approved'];
  return {
    prefix: prefixFor(build.id),
    overrides: overridesOf(build.leave_out),
    activities: build.activities
      .filter((a) => a.spec && !a.problems.length && (isPageKind(a.spec) || isRhizo(a.spec) ? a.status === 'approved' : statuses.includes(a.status)))
      .map((a) => a.spec!),
  };
}

/** A section appended to the engine's report: who has looked at what. */
function reviewSection(build: BuildRow): string {
  const label: Record<ActivityStatus, string> = {
    approved: 'Approved by the designer',
    draft: build.mode === 'rhizmode' ? 'Not built: waiting for a person to approve it' : 'Built, NOT YET REVIEWED by a person',
    skipped: 'Left out by the designer',
    failed: 'Not built: the AI step failed',
    pending: 'Not built: not read yet',
  };
  const lines = ['', build.mode === 'rhizmode' ? '## Review status of each activity' : '## Review status of each H5P activity', '', build.kind === 'readings' ? 'Each activity was drafted by an AI model from one reading. A person approves each one in the builder.' : 'Each spec was read into an activity by an AI model. A person approves each reading in the builder.', '',
    '| # | Title | Status | Edited by hand |', '|---|---|---|---|'];
  for (const s of build.slots) {
    const a = build.activities.find((x) => x.n === s.n);
    const status = !a ? label.pending : a.spec && a.problems.length && a.status !== 'skipped' ? 'Not built: ' + a.problems.join(' ')
      : a.status === 'draft' && a.spec && (isPageKind(a.spec) || isRhizo(a.spec)) ? 'Not built: waiting for a person to approve it' : label[a.status];
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
  const spec = specFor(build);
  if (build.kind === 'readings') {
    const result = buildReadings({
      name: build.title, prefix: spec.prefix, readings: build.readings, activities: (spec.activities ?? []) as ReadingActivity[],
      mode: build.mode, model: env.BUILDER_MODEL, outline: build.outline,
      questions_as: build.questions_as, terms_as: build.terms_as, approved: build.activities.filter((a) => a.status === 'approved').map((a) => a.n),
    }, {
      sourceName: `${build.readings.length} reading${build.readings.length === 1 ? '' : 's'}`,
      course: build.course_shortname || undefined, section: build.section_number, visible: opts.visible,
    });
    return { ...result, report: result.report + reviewSection(build), included: (spec.activities ?? []).map((a) => a.n) };
  }
  const docx = await getDocx(build.id);
  // In a Word-draft module the specs found in the draft are the Word half; anything drafted from a reading added later is the other.
  const fromReading = new Set(build.slots.filter((s) => (s as ReadingSlot).role).map((s) => s.n));
  const wordSpec = { ...spec, activities: (spec.activities ?? []).filter((a) => !fromReading.has(a.n)) };
  const result = buildModule(docx, wordSpec, {
    sourceName: build.source_name,
    course: build.course_shortname || undefined,
    section: build.section_number,
    visible: opts.visible,
  });
  const included = (spec.activities ?? []).map((a) => a.n);
  if (!build.readings.length) return { ...result, report: result.report + reviewSection(build), included };

  // Readings added to a Word draft: their pages follow the draft's pages in the same Book.
  const extra = buildReadings({
    name: build.title, prefix: spec.prefix, readings: build.readings, activities: (spec.activities ?? []).filter((a) => fromReading.has(a.n)) as ReadingActivity[],
    mode: build.mode, model: env.BUILDER_MODEL, outline: build.outline,
    questions_as: build.questions_as, terms_as: build.terms_as, approved: build.activities.filter((a) => a.status === 'approved').map((a) => a.n),
  }, { sourceName: `${build.readings.length} reading${build.readings.length === 1 ? '' : 's'}`, course: build.course_shortname || undefined, section: build.section_number, visible: opts.visible });
  const parts = joinPages(result.parts!, extra.parts!);
  const stats = buildMbz(result.fileName, { fullname: result.name, shortname: build.course_shortname || result.name.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 40) || 'MODULE' },
    { name: result.name }, [parts.book], {
      hidden: !opts.visible, sectionNumber: build.section_number, forums: parts.forums, quizzes: parts.quizzes, glossaries: parts.glossaries, assignments: parts.assignments,
    });
  const counts: Record<string, number | string> = { ...result.counts };
  for (const [k, v] of Object.entries(extra.counts)) counts[k === 'Book pages' ? 'Book pages made from readings' : k === 'Files in the backup' ? 'H5P files from readings' : k] = v;
  counts['Book chapters'] = parts.book.chapters.length;
  counts['Files in the backup'] = stats.files;
  return {
    ...result, mbz: stats.mbz, parts, counts,
    chapters: parts.book.chapters, h5p: { ...result.h5p, ...extra.h5p },
    forums: parts.forums.map((f) => ({ name: f.name, html: f.intro })),
    todo: [...result.todo, ...extra.todo], judgement: [...result.judgement, ...extra.judgement],
    glossaryXml: extra.glossaryXml, quiz: extra.quiz,
    report: result.report + '\n---\n\n# Pages added from readings\n\n' + extra.report.replace(/^# Build report:.*\n/, '') + reviewSection(build),
    included,
  };
}

/** Several modules of one course as one restore file, each in its own section, in the order given. */
export async function runCourseFile(builds: BuildRow[], opts: { courseTitle: string; firstSection: number }): Promise<{ mbz: Uint8Array; fileName: string; modules: { id: number; title: string; section: number; glossary: boolean }[] }> {
  if (builds.length < 2) throw new ImportError('Choose at least two modules to put in one file.', 400);
  if (builds.length > 30) throw new ImportError('One file holds at most 30 modules.', 400);
  const parts: ModuleParts[] = [];
  const modules: { id: number; title: string; section: number; glossary: boolean }[] = [];
  for (const [k, b] of builds.entries()) {
    const built = await runBuild(b);
    if (!built.parts) throw new ImportError(`“${b.title}” could not be put in a course file.`, 500);
    parts.push(built.parts);
    modules.push({ id: b.id, title: b.title, section: opts.firstSection + k, glossary: Boolean(built.glossaryXml) });
  }
  const base = opts.courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'course';
  const fileName = `${base}-${builds.length}-modules.mbz`;
  const stats = buildCourseFile(parts, { fileName, course: { fullname: opts.courseTitle || 'Modules', shortname: base.toUpperCase() }, firstSection: opts.firstSection });
  return { mbz: stats.mbz, fileName, modules };
}

// ─── Modules built from readings ────────────────────────────────────────────

export const READING_MAX_BYTES = 25 * 1024 * 1024;
const READING_MIN_CHARS = 400;
export const READINGS_MAX = 20;

export async function createReadingsBuild(scope: Scope, createdBy: number, title: string, mode: Mode = 'practice'): Promise<BuildRow> {
  const rows = await query<BuildRow>(
    `insert into build (kind, mode, lti_iss, lti_context_id, created_by, title, source_name, state, section_number)
     values ('readings', $5, $1, $2, $3, $4, 'Readings', 'ready', (select coalesce(max(section_number), 0) + 1 from build where lti_iss = $1 and lti_context_id = $2)) returning ${COLUMNS}`,
    [scope.iss, scope.contextId, createdBy, title, mode]
  );
  return rows[0]!;
}

export type ReadingInput =
  | { url: string }
  | { file: { name: string; bytes: Uint8Array } }
  | { text: string; title: string };

/** Fetch or extract one reading. Throws ImportError with a message a designer can act on. */
async function loadReading(input: ReadingInput): Promise<Omit<StoredReading, 'id'>> {
  if ('url' in input) {
    const { docs } = await importFromUrl(input.url, { wholeBook: false });
    const d = docs[0]!;
    // The importer prefixes a Pressbooks chapter with its book and part; the page wants the chapter's own name.
    const title = d.title.split(' › ').pop()!.trim() || d.title;
    return { title, text: d.text, source_url: d.source_url, license: d.license, attribution: d.attribution, include_text: Boolean(d.license), origin: 'url' };
  }
  if ('file' in input) {
    const { title, text } = await extractFromFile(input.file.name, Buffer.from(input.file.bytes));
    return { title, text: text.slice(0, 200_000), source_url: '', license: '', attribution: '', include_text: false, origin: 'file' };
  }
  return { title: input.title.trim() || 'Pasted reading', text: input.text.slice(0, 200_000), source_url: '', license: '', attribution: '', include_text: false, origin: 'paste' };
}

/** Add a reading to a readings module and start drafting its activities: the ones its mode calls for. */
export async function addReading(build: BuildRow, input: ReadingInput, attribution: Attribution): Promise<BuildRow> {
  if (build.readings.length >= READINGS_MAX) throw new ImportError(`A module holds at most ${READINGS_MAX} readings. Start another module for the rest.`, 400);
  const loaded = await loadReading(input);
  if (loaded.text.trim().length < READING_MIN_CHARS) {
    throw new ImportError('That source has too little readable text to draft activities from. A scanned PDF has no text until it is run through OCR; a web page may need a sign-in.', 400);
  }
  const reading: StoredReading = { id: Math.max(0, ...build.readings.map((r) => r.id)) + 1, ...loaded };
  // RhizMode pages link to the reading by default, even an open one: the passages under discussion are quoted on the page.
  if (build.mode === 'rhizmode') reading.include_text = false;
  const next = Math.max(0, ...build.slots.map((s) => s.n)) + 1;
  // The mode's activities, and a reading guide for the top of the page.
  const slots: ReadingSlot[] = [...(MODE_ROLES[build.mode] ?? MODE_ROLES.practice), 'guide' as Role].map((role, i) => ({
    n: next + i, title: ROLES[role].title, chapter: reading.title, under: 'Drafted by AI from this reading', type: ROLES[role].asks, text: '',
    reading: reading.id, role,
  }));
  const activities: ReviewedActivity[] = slots.map((s) => ({ n: s.n, status: 'pending', spec: null, problems: [] }));
  const rows = await query<BuildRow>(
    `update build set readings = readings || $2::jsonb, slots = slots || $3::jsonb, activities = activities || $4::jsonb,
       state = 'reading', updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [build.id, JSON.stringify([reading]), JSON.stringify(slots), JSON.stringify(activities)]
  );
  void readAll(build.id, attribution);
  return rows[0]!;
}

/** Change how a reading appears on its page. Activities already drafted are kept. */
export async function updateReading(build: BuildRow, rid: number, change: { title?: string; include_text?: boolean; source_url?: string; license?: string; attribution?: string }): Promise<BuildRow> {
  if (!build.readings.some((r) => r.id === rid)) throw new ImportError('That reading is not in this module.', 404);
  const patch = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
  const rows = await query<BuildRow>(
    `update build set updated_at = now(), readings = (
       select coalesce(jsonb_agg(case when (r->>'id')::int = $2 then r || $3::jsonb else r end order by (r->>'id')::int), '[]'::jsonb)
       from jsonb_array_elements(readings) r)
     where id = $1 returning ${COLUMNS}`,
    [build.id, rid, JSON.stringify(patch)]
  );
  return rows[0]!;
}

/** Remove a reading with its page and its activities. */
export async function removeReading(build: BuildRow, rid: number): Promise<BuildRow> {
  const gone = build.slots.filter((s) => (s as ReadingSlot).reading === rid).map((s) => s.n);
  const rows = await query<BuildRow>(
    `update build set updated_at = now(),
       readings = (select coalesce(jsonb_agg(r order by (r->>'id')::int), '[]'::jsonb) from jsonb_array_elements(readings) r where (r->>'id')::int <> $2),
       slots = (select coalesce(jsonb_agg(s order by (s->>'n')::int), '[]'::jsonb) from jsonb_array_elements(slots) s where (s->>'n')::int <> all($3::int[])),
       activities = (select coalesce(jsonb_agg(a order by (a->>'n')::int), '[]'::jsonb) from jsonb_array_elements(activities) a where (a->>'n')::int <> all($3::int[]))
     where id = $1 returning ${COLUMNS}`,
    [build.id, rid, gone]
  );
  return rows[0]!;
}

/** A build as the browser gets it: readings without their full text. */
export function forClient(build: BuildRow): Omit<BuildRow, 'readings'> & { readings: (Omit<StoredReading, 'text'> & { chars: number; excerpt: string })[] } {
  return {
    ...build,
    readings: build.readings.map(({ text, ...r }) => ({ ...r, chars: text.length, excerpt: text.replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim().slice(0, 280) })),
  };
}

/** RhizMode: add the module's Community Contract and start drafting it. One per module. */
export async function addContract(build: BuildRow, attribution: Attribution): Promise<BuildRow> {
  if (build.mode !== 'rhizmode') throw new ImportError('A Community Contract belongs to a RhizMode module.', 400);
  if (!build.readings.length) throw new ImportError('Add a reading first: the contract is drafted from what the module is about.', 400);
  if (build.slots.some((s) => (s as ReadingSlot).role === 'contract')) throw new ImportError('This module already has a Community Contract. Ask for a change to it instead.', 400);
  const n = Math.max(0, ...build.slots.map((s) => s.n)) + 1;
  const slot: ReadingSlot = { n, title: ROLES.contract.title, chapter: 'The whole module', under: 'Drafted by AI from the readings', type: ROLES.contract.asks, text: '', reading: 0, role: 'contract' };
  const rows = await query<BuildRow>(
    `update build set slots = slots || $2::jsonb, activities = activities || $3::jsonb, state = 'reading', updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [build.id, JSON.stringify([slot]), JSON.stringify([{ n, status: 'pending', spec: null, problems: [] }])]
  );
  void readAll(build.id, attribution);
  return rows[0]!;
}

// ─── Course pages ───────────────────────────────────────────────────────────

export const OUTLINE_MAX_CHARS = 200_000;

/** Add a course page to a readings module and start drafting it: the overview or takeaways (one each), or the guide for a reading that has none. */
export async function addPage(build: BuildRow, role: PageRole | Role, rid: number | undefined, attribution: Attribution): Promise<BuildRow> {
  if (!build.readings.length) throw new ImportError('Add a reading first: course pages are drafted from the module’s readings.', 400);
  // A RhizMode discussion can be added to one reading of a practice module: the same kinds, drafted and built the same way.
  const trail = TRAIL_ROLES.includes(role as Role);
  // A further practice activity for one reading, in a practice module.
  const extra = EXTRA_ROLES.includes(role as Role);
  if (extra && build.mode === 'rhizmode') throw new ImportError('Practice activities with an answer key belong to a practice module, not a RhizMode one.', 400);
  if (!trail && !extra && !PAGE_KINDS[role]) throw new ImportError('Unknown kind of page.', 400);
  const scope = trail || extra ? 'reading' : PAGE_KINDS[role]!.scope;
  const reading = scope === 'reading' ? build.readings.find((r) => r.id === rid) : undefined;
  if (scope === 'reading' && !reading) throw new ImportError('That reading is not in this module.', 404);
  if (build.slots.some((s) => (s as ReadingSlot).role === role && (scope === 'module' || (s as ReadingSlot).reading === rid))) {
    throw new ImportError(`This ${scope === 'module' ? 'module' : 'reading'} already has a ${ROLES[role as Role].title}. Ask for a change to it instead.`, 400);
  }
  const n = Math.max(0, ...build.slots.map((s) => s.n)) + 1;
  const slot: ReadingSlot = {
    n, title: ROLES[role as Role].title, chapter: reading ? reading.title : 'The whole module', under: reading ? 'Drafted by AI from this reading' : 'Drafted by AI from the readings',
    type: ROLES[role as Role].asks, text: '', reading: reading ? reading.id : 0, role: role as Role,
  };
  const rows = await query<BuildRow>(
    `update build set slots = slots || $2::jsonb, activities = activities || $3::jsonb, state = 'reading', updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [build.id, JSON.stringify([slot]), JSON.stringify([{ n, status: 'pending', spec: null, problems: [] }])]
  );
  void readAll(build.id, attribution);
  return rows[0]!;
}

/**
 * Store the course outline. Pages already drafted are kept as they are; an
 * overview's outcomes are checked against the new outline at once, so one
 * that is no longer in it stops the page being built until it is redrafted.
 */
export async function setOutline(build: BuildRow, input: { text: string } | { file: { name: string; bytes: Uint8Array } }): Promise<BuildRow> {
  const text = ('file' in input ? (await extractFromFile(input.file.name, Buffer.from(input.file.bytes))).text : input.text).trim().slice(0, OUTLINE_MAX_CHARS);
  if ('file' in input && text.length < 40) throw new ImportError('No text could be read from that file. A scanned PDF has no text until it has been through OCR; paste the outline instead.', 400);
  const next = { ...build, outline: text };
  const activities = build.activities.map((a) => {
    const slot = build.slots.find((s) => s.n === a.n);
    if (!a.spec || (a.spec.type !== 'overview' && a.spec.type !== 'assignment')) return a;
    const src = sourceOf(next, slot);
    const problems = checkDrafted(a.spec, src.text, src.outline);
    return { ...a, problems, status: problems.length && a.status === 'approved' ? 'draft' as ActivityStatus : a.status };
  });
  const rows = await query<BuildRow>(
    `update build set outline = $2, activities = $3::jsonb, updated_at = now() where id = $1 returning ${COLUMNS}`,
    [build.id, text, JSON.stringify(activities)]
  );
  return rows[0]!;
}
