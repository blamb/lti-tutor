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
 *     by week of the course where it has fixed dates
 */

import { z } from 'zod';
import { query } from '../../core/db.js';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import type { CourseCtx } from './courses.js';
import type { Student } from '../../core/students.js';
import type { Tutorial, TutorialSummary } from './tutorials.js';

export type ConceptStatus = 'secure' | 'developing' | 'fragile' | 'misconception';
export const CONCEPT_STATUSES: readonly ConceptStatus[] = ['secure', 'developing', 'fragile', 'misconception'];

export interface LearnerEntry {
  id: number;
  student_id: number;
  concept: string;
  status: ConceptStatus;
  evidence: string;
  source_tutorial_session_id: number | null;
  first_seen: string;
  last_seen: string;
}

/** How many concepts the prompt carries; most recent first. */
export const LEARNER_MODEL_CAP = 40;

export async function listLearnerModel(studentId: number, ctx: CourseCtx, limit = LEARNER_MODEL_CAP): Promise<LearnerEntry[]> {
  return query<LearnerEntry>(
    `select id, student_id, concept, status, evidence, source_tutorial_session_id,
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
  entries: Array<{ concept: string; status: ConceptStatus; evidence: string }>,
  sourceTutorialSessionId: number | null
): Promise<void> {
  for (const e of entries) {
    const concept = e.concept.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!concept) continue;
    await query(
      `insert into learner_model (student_id, lti_iss, lti_context_id, concept, status, evidence, source_tutorial_session_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (student_id, lti_iss, lti_context_id, concept) do update set
         status = excluded.status, evidence = excluded.evidence,
         source_tutorial_session_id = excluded.source_tutorial_session_id, last_seen = now()`,
      [studentId, ctx.iss, ctx.contextId, concept, e.status, e.evidence.slice(0, 500), sourceTutorialSessionId]
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
    `select id, student_id, concept, status, evidence, source_tutorial_session_id,
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
  })).max(8),
});

const LEARNER_MODEL_SYSTEM = `You maintain a compact record of what one learner has shown they understand in a course: a list of concepts, each with a status and one sentence of evidence. You are given the session's learning goal, the structured summary of the session that just finished, and the learner's existing entries.

Return ONLY a JSON object, no code fences:
{
  "entries": [
    { "concept": short noun phrase naming the idea (2–6 words; reuse an existing entry's exact wording when it is the same idea),
      "status": "secure" | "developing" | "fragile" | "misconception",
      "evidence": one sentence: what they said or did in this session that shows it }
  ]
}

Statuses: "secure" = explained unaided or survived a counter-example; "developing" = partly there, with prompting; "fragile" = recalled only with heavy cues, or had faded; "misconception" = holds a specific wrong idea (name the wrong idea in evidence). Include only concepts with evidence in this session, at most 8. An existing entry you do not mention is left as it was. If the summary shows nothing about any concept, return {"entries": []}.`;

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
}): Promise<LearnerEntry[]> {
  const { student, ctx, tutorial, summary, tutorialSessionId, attribution } = params;
  const existing = await listLearnerModel(student.id, ctx);
  const existingText = existing.length
    ? existing.map((e) => `- ${e.concept} — ${e.status}`).join('\n')
    : '(none yet)';
  const { turns: _turns, student_note: _note, ...forModel } = summary as TutorialSummary & { turns?: number };
  const update = await jsonCall({
    schema: LearnerUpdate,
    system: LEARNER_MODEL_SYSTEM,
    userPrompt:
      `# SESSION\nKind: ${tutorial.kind}\nTitle: ${tutorial.title}\nLearning goal: ${tutorial.learning_goal}\n\n` +
      `# SUMMARY OF THE SESSION\n${JSON.stringify(forModel, null, 1)}\n\n` +
      `# EXISTING ENTRIES\n${existingText}\n\nReturn the entries to add or update now.`,
    maxTokens: 800,
    attribution: { ...attribution, endpoint: 'tutorial.learner_model' },
    endpoint: 'tutorial.learner_model',
  });
  await upsertLearnerEntries(student.id, ctx, update.entries, tutorialSessionId);
  return listLearnerModel(student.id, ctx);
}

// ─── Instructor: course-wide view, no names ─────────────────────────────────

export interface ConceptAggregate {
  concept: string;
  learners: number;
  secure: number;
  developing: number;
  fragile: number;
  misconception: number;
  last_seen: string;
}

export async function courseConceptReport(ctx: CourseCtx): Promise<ConceptAggregate[]> {
  return query<ConceptAggregate>(
    `select concept,
            count(distinct student_id)::int as learners,
            count(*) filter (where status = 'secure')::int as secure,
            count(*) filter (where status = 'developing')::int as developing,
            count(*) filter (where status = 'fragile')::int as fragile,
            count(*) filter (where status = 'misconception')::int as misconception,
            max(last_seen)::text as last_seen
     from learner_model
     where lti_iss = $1 and lti_context_id = $2
     group by concept
     order by (count(*) filter (where status in ('fragile', 'misconception'))) desc, count(distinct student_id) desc, concept`,
    [ctx.iss, ctx.contextId]
  );
}

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
            lm.status, lm.concept, count(*)::int as n
     from learner_model lm
     left join tutorial_session ts on ts.id = lm.source_tutorial_session_id
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
