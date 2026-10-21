/**
 * The learner model: a compact, per-course record of what each learner has
 * shown about each concept, built up across sessions of every kind.
 *
 *   - after each completed session, one small model call maps the summary
 *     onto concept entries (new or updated) — recorded as tutorial.learner_model
 *   - every tutorial's system prompt carries learnerModelBlock(), inside the
 *     cached block after the profile, so the tutor knows what this learner
 *     has already shown
 *   - recall sessions pull candidates whose status is fragile or misconception,
 *     or that have gone longest unseen
 *   - learners see and can delete their own entries ("My learning")
 *   - instructors see counts per concept across the course, never names, and
 *     by week of the course where it has fixed dates; entries are grouped by
 *     canonical concept (concepts.ts)
 *   - an entry may lower a status, and a reflection may judge content at all,
 *     only on the student's own words about that concept (guardEntries)
 */

import { z } from 'zod';
import { query } from '../../core/db.js';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import type { CourseCtx } from './courses.js';
import type { Student } from '../../core/students.js';
import type { Tutorial, TutorialSummary } from './tutorials.js';
import { listCourseConcepts, canonBlock, acceptMatch, exactMatch, matchConcepts, labelKey, type CourseConcept } from './concepts.js';

export type ConceptStatus = 'secure' | 'developing' | 'fragile' | 'misconception';
export const CONCEPT_STATUSES: readonly ConceptStatus[] = ['secure', 'developing', 'fragile', 'misconception'];

export interface LearnerEntry {
  id: number;
  student_id: number;
  concept: string;
  status: ConceptStatus;
  evidence: string;
  source_tutorial_session_id: number | null;
  /** Canonical concept (concepts.ts); null = unmapped. */
  concept_id: number | null;
  first_seen: string;
  last_seen: string;
}

/** How many concepts the prompt carries; most recent first. */
export const LEARNER_MODEL_CAP = 40;

export async function listLearnerModel(studentId: number, ctx: CourseCtx, limit = LEARNER_MODEL_CAP): Promise<LearnerEntry[]> {
  return query<LearnerEntry>(
    `select id, student_id, concept, status, evidence, source_tutorial_session_id, concept_id,
            first_seen::text, last_seen::text
     from learner_model
     where student_id = $1 and lti_iss = $2 and lti_context_id = $3
     order by last_seen desc, id desc limit $4`,
    [studentId, ctx.iss, ctx.contextId, limit]
  );
}

export async function deleteLearnerEntry(studentId: number, ctx: CourseCtx, id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `delete from learner_model where id = $1 and student_id = $2 and lti_iss = $3 and lti_context_id = $4 returning id`,
    [id, studentId, ctx.iss, ctx.contextId]
  );
  return rows.length > 0;
}

/** Wipe a learner's model for the course (used by the learner's own delete-my-data action). */
export async function deleteLearnerModel(studentId: number, ctx: CourseCtx): Promise<number> {
  const rows = await query<{ id: number }>(
    `delete from learner_model where student_id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`,
    [studentId, ctx.iss, ctx.contextId]
  );
  return rows.length;
}

export async function upsertLearnerEntries(
  studentId: number,
  ctx: CourseCtx,
  entries: Array<{ concept: string; status: ConceptStatus; evidence: string; concept_id?: number | null; confidence?: number }>,
  sourceTutorialSessionId: number | null
): Promise<void> {
  for (const e of entries) {
    const concept = e.concept.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!concept) continue;
    const conceptId = e.concept_id ?? null;
    await query(
      `insert into learner_model (student_id, lti_iss, lti_context_id, concept, status, evidence, source_tutorial_session_id, concept_id, match_confidence)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (student_id, lti_iss, lti_context_id, concept) do update set
         status = excluded.status, evidence = excluded.evidence,
         source_tutorial_session_id = excluded.source_tutorial_session_id, last_seen = now(),
         concept_id = coalesce(excluded.concept_id, learner_model.concept_id),
         match_confidence = coalesce(excluded.match_confidence, learner_model.match_confidence)`,
      [studentId, ctx.iss, ctx.contextId, concept, e.status, e.evidence.slice(0, 500), sourceTutorialSessionId, conceptId, conceptId === null ? null : e.confidence ?? null]
    );
  }
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The prompt block. Empty string when the learner has no entries yet, so the
 * cached block is unchanged for new learners.
 */
export function learnerModelBlock(entries: LearnerEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.slice(0, LEARNER_MODEL_CAP).map(
    (e) => `- ${e.concept} — ${e.status} (${shortDate(e.last_seen)})${e.evidence ? `: ${e.evidence}` : ''}`
  );
  return [
    '# WHAT THIS LEARNER HAS ALREADY SHOWN (earlier sessions in this course, most recent first)',
    'secure = explained unaided; developing = partly, with prompting; fragile = recalled only with heavy cues or has faded; misconception = holds the wrong idea noted.',
    'Use this to pitch your questions and to connect new ideas to what they already have. Do not recite it to them.',
    ...lines,
  ].join('\n');
}

/** Concepts a recall session should prioritise: fragile or misconceived first, then longest unseen. */
export async function recallCandidates(studentId: number, ctx: CourseCtx, limit = 8): Promise<LearnerEntry[]> {
  return query<LearnerEntry>(
    `select id, student_id, concept, status, evidence, source_tutorial_session_id, concept_id,
            first_seen::text, last_seen::text
     from learner_model
     where student_id = $1 and lti_iss = $2 and lti_context_id = $3
     order by (status in ('fragile', 'misconception')) desc, last_seen asc, id asc limit $4`,
    [studentId, ctx.iss, ctx.contextId, limit]
  );
}

export function recallCandidatesBlock(entries: LearnerEntry[]): string {
  if (entries.length === 0) return '';
  return [
    '# CONCEPTS TO PRIORITISE FOR RETRIEVAL (from this learner\'s record; fragile and misconceived first, then longest unseen)',
    ...entries.map((e) => `- ${e.concept} — ${e.status}, last seen ${shortDate(e.last_seen)}${e.evidence ? `: ${e.evidence}` : ''}`),
    'Open with the retrieval prompt in the brief, then bring in one or two of these if they fit the learning goal.',
  ].join('\n');
}

// ─── After a session: map the summary onto concept entries ──────────────────

const LearnerUpdate = z.object({
  entries: z.array(z.object({
    concept: z.string().trim().min(1).max(120),
    status: z.enum(['secure', 'developing', 'fragile', 'misconception']),
    evidence: z.string().max(500),
    quote: z.string().max(600).default(''),
    concept_id: z.number().int().nullable().default(null),
    confidence: z.number().min(0).max(1).default(0),
  })).max(8),
});
export type ProposedEntry = z.infer<typeof LearnerUpdate>['entries'][number];

const LEARNER_MODEL_SYSTEM = `You maintain a compact record of what one learner has shown they understand in a course: a list of concepts, each with a status and one sentence of evidence. You are given the session's learning goal, the course's canonical concepts, the misconceptions the instructor listed for this session, the structured summary of the session that just finished, the student's own words behind each summary item, and the learner's existing entries.

Return ONLY a JSON object, no code fences:
{
  "entries": [
    { "concept": short noun phrase naming the idea (2–6 words; reuse an existing entry's exact wording when it is the same idea),
      "status": "secure" | "developing" | "fragile" | "misconception",
      "evidence": one sentence: what they said or did in this session that shows it,
      "quote": the student's own words behind it, copied exactly from THE STUDENT'S OWN WORDS below, or "" if there are none,
      "concept_id": the id of the one canonical concept this entry is about, or null if none fits,
      "confidence": 0 to 1, how sure you are of that concept_id (0.9 or more only when it is clearly the same idea) }
  ]
}

Statuses: "secure" = explained unaided or survived a counter-example; "developing" = partly there, with prompting; "fragile" = recalled only with heavy cues, or had faded; "misconception" = holds a specific wrong idea (name the wrong idea in evidence).

Rules:
- Only ideas in "understood" were put in the student's own words; ideas in "told" were stated by the tutor and only agreed with or heard, so they are at most "developing" and never "secure", and their evidence must say the tutor explained them.
- Write "misconception" when the student's own words state a wrong idea: one of the instructor's listed misconceptions, or a claim the tutor had to correct.
- Never infer a gap from a short, vague or reluctant answer ("idk", "not really", "I just want to finish"). "fragile" and "misconception" need the student's own words about that concept.
- In a reflection the subject is how the student learns, not the content: write content entries only where the student's own words are about that content.

Include only concepts with evidence in this session, at most 8. An existing entry you do not mention is left as it was. If the summary shows nothing about any concept, return {"entries": []}.`;

export const STATUS_RANK: Record<ConceptStatus, number> = { misconception: 0, fragile: 1, developing: 2, secure: 3 };
/** Words a quote needs before it can lower a status or carry a reflection's judgement. */
export const GUARD_QUOTE_MIN_WORDS = 5;

function normWords(s: string): string {
  return s.toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
}
function stemsOf(s: string): Set<string> {
  return new Set((normWords(s).match(/[a-z][a-z0-9]*/g) ?? []).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
}
/** The quote is really in a student turn. */
export function quoteInTurns(quote: string, studentTexts: string[]): boolean {
  const q = normWords(quote);
  return q.length > 0 && studentTexts.some((t) => normWords(t).includes(q));
}
/** The quote is about this concept: it shares a content word with the entry's or the canonical concept's name. */
export function quoteMentions(quote: string, ...names: Array<string | undefined>): boolean {
  const have = stemsOf(quote);
  return names.some((n) => n && [...stemsOf(n)].some((w) => have.has(w)));
}

/** A claim the instructor listed as a misconception, from lines like: "If it compiled, my files are correct." Question: … */
export function listedClaims(misconceptions: string): string[] {
  const out: string[] = [];
  for (const line of misconceptions.split(/\r?\n/)) {
    const m = line.match(/["“]([^"”]{8,200})["”]/);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

const CORRECTED = /\b(corrected|believed|thought|assumed|claimed|insisted|false belief|contradicts?|incorrect|mix(ed)?[- ]?up|misconception|confus(ed|es|ing)\b.*\bwith)\b/i;

export interface GuardContext {
  kind: Tutorial['kind'];
  studentTexts: string[];
  canon: CourseConcept[];
  /** The learner's entries before this session. */
  existing: Array<Pick<LearnerEntry, 'concept' | 'status' | 'concept_id'>>;
  /** Grounded sticking points with the student's quotes (tutorials.ts groundSummary). */
  sticking: Array<{ text: string; quote: string }>;
  /** The brief's misconceptions field. */
  misconceptions: string;
}

/**
 * Keep what the student's own words support (Finding 13, items 4 and 5):
 *   - lowering an existing status needs a quote that is in a student turn, is
 *     long enough and is about that concept; otherwise the entry is dropped
 *     and the earlier status stands
 *   - in a reflection, every entry needs a real quote, and fragile or
 *     misconception needs one about that concept
 *   - a grounded sticking point that says a claim was corrected or believed,
 *     and a student turn that states a misconception the brief lists, each
 *     become a misconception entry if the model did not write one
 * Pure, so the tests replay the report's sessions through it.
 */
export function guardEntries(entries: ProposedEntry[], g: GuardContext): { kept: ProposedEntry[]; added: ProposedEntry[]; dropped: string[] } {
  const label = (id: number | null) => (id === null ? undefined : g.canon.find((c) => Number(c.id) === id)?.label);
  const prior = (e: ProposedEntry) => g.existing.find((x) =>
    (e.concept_id !== null && x.concept_id !== null && Number(x.concept_id) === e.concept_id) || labelKey(x.concept) === labelKey(e.concept));
  const strong = (e: ProposedEntry) =>
    quoteInTurns(e.quote, g.studentTexts) && normWords(e.quote).split(' ').length >= GUARD_QUOTE_MIN_WORDS && quoteMentions(e.quote, e.concept, label(e.concept_id));
  const kept: ProposedEntry[] = [];
  const dropped: string[] = [];
  for (const e of entries) {
    const before = prior(e);
    if (before && STATUS_RANK[e.status] < STATUS_RANK[before.status] && !strong(e)) {
      dropped.push(`${e.concept}: ${before.status} → ${e.status} without the student's own words about it`);
      continue;
    }
    if (g.kind === 'reflection') {
      if (!quoteInTurns(e.quote, g.studentTexts)) { dropped.push(`${e.concept}: reflection entry without a student quote`); continue; }
      if ((e.status === 'fragile' || e.status === 'misconception') && !strong(e)) { dropped.push(`${e.concept}: reflection ${e.status} on thin evidence`); continue; }
    }
    kept.push(e);
  }

  const added: ProposedEntry[] = [];
  const covered = (quote: string) => [...kept, ...added].some((e) => e.status === 'misconception' && e.quote && (normWords(e.quote).includes(normWords(quote)) || normWords(quote).includes(normWords(e.quote))));
  for (const s of g.sticking) {
    if (!CORRECTED.test(s.text) || !quoteInTurns(s.quote, g.studentTexts) || covered(s.quote)) continue;
    added.push({ concept: s.text.slice(0, 120), status: 'misconception', evidence: s.text.slice(0, 500), quote: s.quote, concept_id: null, confidence: 0 });
  }
  for (const claim of listedClaims(g.misconceptions)) {
    const want = [...stemsOf(claim)];
    if (want.length < 3) continue;
    const turn = g.studentTexts.find((t) => { const have = stemsOf(t); return want.filter((w) => have.has(w)).length / want.length >= 0.75; });
    if (!turn || covered(turn)) continue;
    added.push({ concept: claim.slice(0, 120), status: 'misconception', evidence: `Said something close to the listed misconception "${claim}".`.slice(0, 500), quote: turn.slice(0, 600), concept_id: null, confidence: 0 });
  }
  return { kept, added, dropped };
}

/**
 * One small call after completion. Best-effort: a failure is logged and
 * never blocks the learner's summary.
 */
export async function updateLearnerModelFromSummary(params: {
  student: Student;
  ctx: CourseCtx;
  tutorial: Tutorial;
  summary: TutorialSummary;
  tutorialSessionId: number;
  attribution: Attribution;
  /** The learner's own turns, and the grounded items with their quotes (never stored). */
  studentTexts?: string[];
  evidence?: { understood: Array<{ text: string; quote: string }>; sticking: Array<{ text: string; quote: string }> };
}): Promise<LearnerEntry[]> {
  const { student, ctx, tutorial, summary, tutorialSessionId, attribution } = params;
  const existing = await listLearnerModel(student.id, ctx);
  const canon = await listCourseConcepts(ctx);
  const { entries, dropped } = await proposeLearnerEntries({
    tutorial, summary, existing, canon, attribution,
    studentTexts: params.studentTexts ?? [], evidence: params.evidence ?? { understood: [], sticking: [] },
  });
  if (dropped.length) console.info(`learner model, tutorial_session ${tutorialSessionId}: kept back ${dropped.length} entr${dropped.length === 1 ? 'y' : 'ies'} (${dropped.join('; ')})`);
  await upsertLearnerEntries(student.id, ctx, entries, tutorialSessionId);
  return listLearnerModel(student.id, ctx);
}

/** The model call, the guard and the concept matching, without the database: the live replay calls it directly. */
export async function proposeLearnerEntries(p: {
  tutorial: Tutorial;
  summary: TutorialSummary;
  existing: Array<Pick<LearnerEntry, 'concept' | 'status' | 'concept_id'>>;
  canon: CourseConcept[];
  attribution: Attribution;
  studentTexts: string[];
  evidence: { understood: Array<{ text: string; quote: string }>; sticking: Array<{ text: string; quote: string }> };
}): Promise<{ entries: ProposedEntry[]; dropped: string[] }> {
  const existingText = p.existing.length ? p.existing.map((e) => `- ${e.concept} — ${e.status}`).join('\n') : '(none yet)';
  const { turns: _turns, student_note: _note, ...forModel } = p.summary as TutorialSummary & { turns?: number };
  const words = [
    ...p.evidence.understood.map((i) => `- understood "${i.text}": "${i.quote}"`),
    ...p.evidence.sticking.map((i) => `- sticking "${i.text}": "${i.quote}"`),
  ].join('\n') || '(none)';
  const update = await jsonCall({
    schema: LearnerUpdate,
    system: LEARNER_MODEL_SYSTEM,
    userPrompt:
      `# SESSION\nKind: ${p.tutorial.kind}\nTitle: ${p.tutorial.title}\nLearning goal: ${p.tutorial.learning_goal}\n\n` +
      `# CANONICAL CONCEPTS (id: label)\n${canonBlock(p.canon) || '(none set yet: use null)'}\n\n` +
      `# MISCONCEPTIONS THE INSTRUCTOR LISTED\n${p.tutorial.misconceptions || '(none)'}\n\n` +
      `# SUMMARY OF THE SESSION\n${JSON.stringify(forModel, null, 1)}\n\n` +
      `# THE STUDENT'S OWN WORDS\n${words}\n\n` +
      `# EXISTING ENTRIES\n${existingText}\n\nReturn the entries to add or update now.`,
    maxTokens: 1200,
    attribution: { ...p.attribution, endpoint: 'tutorial.learner_model' },
    endpoint: 'tutorial.learner_model',
  });
  // The model's concept match counts only when it names a real concept confidently; exact wording always wins.
  const proposed = update.entries.map((e) => {
    const exact = exactMatch(e.concept, p.canon);
    const m = exact ? { concept_id: Number(exact.id), confidence: 1 } : acceptMatch(e, p.canon);
    return { ...e, concept_id: m.concept_id, confidence: m.confidence };
  });
  const { kept, added, dropped } = guardEntries(proposed, {
    kind: p.tutorial.kind, studentTexts: p.studentTexts, canon: p.canon, existing: p.existing,
    sticking: p.evidence.sticking, misconceptions: p.tutorial.misconceptions,
  });
  if (added.length && p.canon.length) {
    const matches = await matchConcepts(added.map((a) => a.concept), p.canon, p.attribution);
    added.forEach((a, i) => { a.concept_id = matches[i]!.concept_id; a.confidence = matches[i]!.confidence; });
  }
  return { entries: [...kept, ...added].slice(0, 10), dropped };
}

// ─── Instructor: course-wide view, no names ─────────────────────────────────

export interface WeekAggregate {
  week: number;
  entries: number;
  secure: number;
  developing: number;
  fragile: number;
  misconception: number;
  /** The concepts most often fragile or misconceived that week. */
  carried_forward: string[];
}

/**
 * Week-of-course breakdown, where the course has fixed dates and a known
 * start. Week 1 begins on course_start; an entry's week is that of the
 * session that produced it (its last update).
 */
export async function courseConceptsByWeek(ctx: CourseCtx, courseStart: string): Promise<WeekAggregate[]> {
  const rows = await query<{ week: number; status: ConceptStatus; concept: string; n: number }>(
    `select (floor(extract(epoch from (coalesce(ts.started_at, lm.last_seen) - $3::date)) / 604800)::int + 1) as week,
            lm.status, coalesce(cc.label, lm.concept) as concept, count(*)::int as n
     from learner_model lm
     left join tutorial_session ts on ts.id = lm.source_tutorial_session_id
     left join course_concept cc on cc.id = lm.concept_id
     where lm.lti_iss = $1 and lm.lti_context_id = $2
     group by 1, 2, 3
     order by 1`,
    [ctx.iss, ctx.contextId, courseStart]
  );
  const byWeek = new Map<number, WeekAggregate & { _carry: Map<string, number> }>();
  for (const r of rows) {
    const week = Math.max(1, r.week);
    let w = byWeek.get(week);
    if (!w) {
      w = { week, entries: 0, secure: 0, developing: 0, fragile: 0, misconception: 0, carried_forward: [], _carry: new Map() };
      byWeek.set(week, w);
    }
    w.entries += r.n;
    w[r.status] += r.n;
    if (r.status === 'fragile' || r.status === 'misconception') w._carry.set(r.concept, (w._carry.get(r.concept) ?? 0) + r.n);
  }
  return [...byWeek.values()]
    .sort((a, b) => a.week - b.week)
    .map(({ _carry, ...w }) => ({ ...w, carried_forward: [..._carry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c) }));
}
