/**
 * Paski-style tutorials, adapted to the course's delivery mode.
 *
 * The pattern (Next Gen Learning's "Paski"): the instructor co-designs each
 * one-on-one tutorial to mirror how they'd guide it with their best teaching
 * assistant; the tutorial sits in the core learning sequence (lecture →
 * tutorial → group debrief) rather than on the periphery; the tutor knows the
 * student's goals and context; and every run feeds a debrief back to faculty.
 *
 * That sequence assumes a scheduled course. TRU also runs paced and
 * self-paced online courses (see delivery.ts), so every piece of wording
 * that assumes a lecture, a live follow-up or classmates is switched on the
 * course's delivery booleans: `hasLiveSessions` and `hasCohort`.
 *
 * This module owns:
 *   - course materials (instructor-pasted lecture notes, transcripts, readings)
 *   - tutorial briefs (CRUD, scoped to one course)
 *   - student profiles
 *   - the tutorial conversation: a staged Socratic dialogue (orient → explore →
 *     teach-back → wrap-up), grounded in the attached materials, streamed
 *   - completion: an LLM-written structured summary per run
 *   - the instructor's report and its synthesis: a group-debrief brief
 *     (scheduled), a cohort note (paced) or a course revision brief (self-paced)
 *   - "draft with AI": a first-pass brief the instructor edits
 *   - personalised lecture / study debriefs for students, one per material
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { query } from './db.js';
import { getAnthropic, GEN_MODEL, TUTOR_MODEL } from './anthropic.js';
import { recordApiCall, type Attribution } from './costs.js';
import type { Student } from './students.js';
import { COURSE_LEVEL_LABELS, type CourseCtx } from './courses.js';
import type { Delivery } from './delivery.js';
import { KINDS, TUTORIAL_KINDS, stageFor, type TutorialKind } from './kinds.js';
import { jsonCall, textOf } from './llm.js';
import { listLearnerModel, learnerModelBlock, recallCandidates, recallCandidatesBlock, updateLearnerModelFromSummary } from './learner.js';

export type { CourseCtx } from './courses.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Material {
  id: number;
  lti_iss: string;
  lti_context_id: string;
  title: string;
  body: string;
  /** Where it came from (URL import or upload); empty for pasted text. */
  source_url: string;
  /** e.g. "CC BY 4.0"; empty if unknown. */
  license: string;
  /** Who to credit, e.g. "Concepts of Biology by …, CC BY 4.0". */
  attribution: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export type TutorialStatus = 'draft' | 'published' | 'archived';

export interface Tutorial {
  id: number;
  lti_iss: string;
  lti_context_id: string;
  title: string;
  learning_goal: string;
  opening_question: string;
  ta_brief: string;
  misconceptions: string;
  success_criteria: string;
  /** Reading level and tone, e.g. "ABE reading level, short sentences". Empty = course default. */
  pitch: string;
  /** Which shape of tutorial this is (kinds.ts). */
  kind: TutorialKind;
  /** practice: sample questions or scenarios the tutor may offer, one per line. */
  practice_prompts: string;
  /** recall: earlier tutorials in this course that this one revisits. */
  recall_tutorial_ids: number[];
  material_ids: number[];
  target_minutes: number;
  gradebook: boolean;
  status: TutorialStatus;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  student_id: number;
  program: string;
  goal: string;
  background: string;
  struggles: string;
  interests: string;
  updated_at: string;
}

// Every kind's summary shares these keys, so the report, the debriefs and
// the learner model can treat runs uniformly; the extras per kind match the
// `summaryExtras` text in kinds.ts.
const SummaryBase = {
  mastery: z.enum(['solid', 'developing', 'needs_work']),
  understood: z.array(z.string()).max(6),
  sticking_points: z.array(z.string()).max(6),
  next_step: z.string(),
  student_note: z.string(),
};
export const ConceptSummary = z.object({ kind: z.literal('concept'), ...SummaryBase, teachback: z.string() });
export const ReadinessSummary = z.object({
  kind: z.literal('readiness'), ...SummaryBase,
  prior_knowledge: z.enum(['none', 'some', 'solid']),
  misconceptions_found: z.array(z.string()).max(6),
  watch_for: z.array(z.string()).max(4),
});
export const PreparationCheckSummary = z.object({
  kind: z.literal('preparation_check'), ...SummaryBase,
  preparation_done: z.enum(['yes', 'partly', 'no']),
  ideas_missed: z.array(z.string()).max(6),
});
export const PracticeSummary = z.object({
  kind: z.literal('practice'), ...SummaryBase,
  strengths: z.array(z.string()).max(5),
  improve: z.array(z.string()).max(4),
  revised: z.boolean(),
});
export const ReflectionSummary = z.object({
  kind: z.literal('reflection'), ...SummaryBase,
  strategy_in_own_words: z.string(),
  suggested_action: z.string(),
});
export const RecallSummary = z.object({
  kind: z.literal('recall'), ...SummaryBase,
  retained: z.array(z.string()).max(6),
  faded: z.array(z.string()).max(6),
});
export const TutorialSummary = z.discriminatedUnion('kind', [
  ConceptSummary, ReadinessSummary, PreparationCheckSummary, PracticeSummary, ReflectionSummary, RecallSummary,
]);
/** Runs completed before kinds existed have no `kind`; treat them as concept. */
export type TutorialSummary = z.infer<typeof TutorialSummary> & { turns?: number };

export function summaryKindOf(s: Pick<TutorialSummary, 'kind'> | { kind?: string }): TutorialKind {
  const k = (s as { kind?: string }).kind;
  return (TUTORIAL_KINDS as readonly string[]).includes(k ?? '') ? (k as TutorialKind) : 'concept';
}

/** The kind-specific line of a summary, for the instructor's synthesis prompts. */
export function summaryHighlight(s: TutorialSummary): string {
  switch (summaryKindOf(s)) {
    case 'readiness': {
      const r = s as z.infer<typeof ReadinessSummary>;
      return `Prior knowledge: ${r.prior_knowledge ?? '—'}; misconceptions voiced: ${(r.misconceptions_found ?? []).join('; ') || '—'}`;
    }
    case 'preparation_check': {
      const r = s as z.infer<typeof PreparationCheckSummary>;
      return `Preparation done: ${r.preparation_done ?? '—'}; ideas missed: ${(r.ideas_missed ?? []).join('; ') || '—'}`;
    }
    case 'practice': {
      const r = s as z.infer<typeof PracticeSummary>;
      return `Strengths: ${(r.strengths ?? []).join('; ') || '—'}; improve: ${(r.improve ?? []).join('; ') || '—'}; revised during session: ${r.revised ? 'yes' : 'no'}`;
    }
    case 'reflection': {
      const r = s as z.infer<typeof ReflectionSummary>;
      return `Strategy in their words: ${r.strategy_in_own_words ?? '—'}; next action: ${r.suggested_action ?? '—'}`;
    }
    case 'recall': {
      const r = s as z.infer<typeof RecallSummary>;
      return `Retained: ${(r.retained ?? []).join('; ') || '—'}; faded: ${(r.faded ?? []).join('; ') || '—'}`;
    }
    default: {
      const r = s as z.infer<typeof ConceptSummary>;
      return `Teach-back: ${r.teachback ?? '—'}`;
    }
  }
}

export interface TutorialSession {
  id: number;
  tutorial_id: number;
  student_id: number;
  session_id: number;
  status: 'in_progress' | 'completed';
  started_at: string;
  completed_at: string | null;
  summary: TutorialSummary | null;
  nps_score: number | null;
  nps_comment: string | null;
  grade_posted_at: string | null;
  grade_error: string | null;
}

interface Turn {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

/** Hidden user turn that opens a tutorial (the API needs a user turn first). */
export const START_MARKER = '[Tutorial start]';

// ─── Validation ─────────────────────────────────────────────────────────────

import { MATERIAL_MAX_CHARS, GROUNDING_MAX_CHARS } from './limits.js';
export { MATERIAL_MAX_CHARS, GROUNDING_MAX_CHARS };

export const MaterialInput = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(MATERIAL_MAX_CHARS),
  source_url: z.string().trim().max(2000).default(''),
  license: z.string().trim().max(200).default(''),
  attribution: z.string().trim().max(500).default(''),
});
export type MaterialInput = z.infer<typeof MaterialInput>;

export const TutorialInput = z.object({
  title: z.string().trim().min(1).max(160),
  learning_goal: z.string().trim().min(1).max(2000),
  opening_question: z.string().trim().min(1).max(2000),
  ta_brief: z.string().trim().max(8000).default(''),
  misconceptions: z.string().trim().max(4000).default(''),
  success_criteria: z.string().trim().max(4000).default(''),
  pitch: z.string().trim().max(500).default(''),
  kind: z.enum(TUTORIAL_KINDS).default('concept'),
  practice_prompts: z.string().trim().max(4000).default(''),
  recall_tutorial_ids: z.array(z.number().int().positive()).max(20).default([]),
  material_ids: z.array(z.number().int().positive()).max(20).default([]),
  target_minutes: z.number().int().min(5).max(60).default(15),
  gradebook: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});
export type TutorialInput = z.infer<typeof TutorialInput>;

export const ProfileInput = z.object({
  program: z.string().trim().max(200).default(''),
  goal: z.string().trim().max(500).default(''),
  background: z.string().trim().max(500).default(''),
  struggles: z.string().trim().max(500).default(''),
  interests: z.string().trim().max(300).default(''),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

// ─── Materials ──────────────────────────────────────────────────────────────

export async function listMaterials(ctx: CourseCtx): Promise<Material[]> {
  return query<Material>(
    `select * from material where lti_iss = $1 and lti_context_id = $2 order by created_at`,
    [ctx.iss, ctx.contextId]
  );
}

export async function getMaterials(ids: number[], ctx: CourseCtx): Promise<Material[]> {
  if (ids.length === 0) return [];
  const rows = await query<Material>(
    `select * from material where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3`,
    [ids, ctx.iss, ctx.contextId]
  );
  // Preserve the tutorial's ordering.
  const byId = new Map(rows.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is Material => !!m);
}

export async function createMaterial(ctx: CourseCtx, input: MaterialInput, createdBy: number): Promise<Material> {
  const rows = await query<Material>(
    `insert into material (lti_iss, lti_context_id, title, body, source_url, license, attribution, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [ctx.iss, ctx.contextId, input.title, input.body, input.source_url, input.license, input.attribution, createdBy]
  );
  return rows[0]!;
}

export async function updateMaterial(id: number, ctx: CourseCtx, input: MaterialInput): Promise<Material | null> {
  const rows = await query<Material>(
    `update material set title = $4, body = $5, source_url = $6, license = $7, attribution = $8, updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning *`,
    [id, ctx.iss, ctx.contextId, input.title, input.body, input.source_url, input.license, input.attribution]
  );
  return rows[0] ?? null;
}

export async function deleteMaterial(id: number, ctx: CourseCtx): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `delete from material where id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`,
    [id, ctx.iss, ctx.contextId]
  );
  if (rows.length) {
    await query(
      `update tutorial set material_ids = array_remove(material_ids, $1::bigint)
       where lti_iss = $2 and lti_context_id = $3 and $1 = any(material_ids)`,
      [id, ctx.iss, ctx.contextId]
    );
  }
  return rows.length > 0;
}

function materialsBlock(materials: Material[]): string | null {
  if (materials.length === 0) return null;
  let total = 0;
  const parts = ['# COURSE MATERIALS (provided by the instructor)'];
  for (const m of materials) {
    const body = total + m.body.length > GROUNDING_MAX_CHARS
      ? m.body.slice(0, Math.max(0, GROUNDING_MAX_CHARS - total)) + '\n[…truncated: grounding limit reached]'
      : m.body;
    total += body.length;
    const src = [m.license ? `licence: ${m.license}` : '', m.source_url ? `source: ${m.source_url}` : ''].filter(Boolean).join('; ');
    parts.push(`\n## ${m.title}${src ? ` (${src})` : ''}\n${body}`);
    if (total >= GROUNDING_MAX_CHARS) break;
  }
  return parts.join('\n');
}

// ─── Tutorial CRUD ──────────────────────────────────────────────────────────

export async function listTutorials(ctx: CourseCtx, opts: { publishedOnly: boolean }): Promise<Tutorial[]> {
  return query<Tutorial>(
    `select * from tutorial
     where lti_iss = $1 and lti_context_id = $2
       ${opts.publishedOnly ? "and status = 'published'" : "and status <> 'archived'"}
     order by created_at`,
    [ctx.iss, ctx.contextId]
  );
}

export async function getTutorial(id: number, ctx: CourseCtx): Promise<Tutorial | null> {
  const rows = await query<Tutorial>(
    `select * from tutorial where id = $1 and lti_iss = $2 and lti_context_id = $3`,
    [id, ctx.iss, ctx.contextId]
  );
  return rows[0] ?? null;
}

/** Drop material ids that don't belong to this course. */
async function validMaterialIds(ids: number[], ctx: CourseCtx): Promise<number[]> {
  const found = await getMaterials(ids, ctx);
  return found.map((m) => m.id);
}

/** Drop recall-source ids that aren't other tutorials in this course. */
async function validRecallIds(ids: number[], ctx: CourseCtx, selfId: number | null): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await query<{ id: number }>(
    `select id from tutorial where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3`,
    [ids, ctx.iss, ctx.contextId]
  );
  const ok = new Set(rows.map((r) => r.id));
  return ids.filter((id) => ok.has(id) && id !== selfId);
}

export async function createTutorial(ctx: CourseCtx, input: TutorialInput, createdBy: number): Promise<Tutorial> {
  const materialIds = await validMaterialIds(input.material_ids, ctx);
  const recallIds = await validRecallIds(input.recall_tutorial_ids, ctx, null);
  const rows = await query<Tutorial>(
    `insert into tutorial
       (lti_iss, lti_context_id, title, learning_goal, opening_question, ta_brief, misconceptions,
        success_criteria, pitch, kind, practice_prompts, recall_tutorial_ids, material_ids,
        target_minutes, gradebook, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::bigint[],$13::bigint[],$14,$15,$16,$17) returning *`,
    [
      ctx.iss, ctx.contextId, input.title, input.learning_goal, input.opening_question,
      input.ta_brief, input.misconceptions, input.success_criteria, input.pitch,
      input.kind, input.practice_prompts, recallIds, materialIds,
      input.target_minutes, input.gradebook, input.status, createdBy,
    ]
  );
  return rows[0]!;
}

export async function updateTutorial(id: number, ctx: CourseCtx, input: TutorialInput): Promise<Tutorial | null> {
  const materialIds = await validMaterialIds(input.material_ids, ctx);
  const recallIds = await validRecallIds(input.recall_tutorial_ids, ctx, id);
  const rows = await query<Tutorial>(
    `update tutorial set
       title = $4, learning_goal = $5, opening_question = $6, ta_brief = $7, misconceptions = $8,
       success_criteria = $9, pitch = $10, kind = $11, practice_prompts = $12, recall_tutorial_ids = $13::bigint[],
       material_ids = $14::bigint[], target_minutes = $15, gradebook = $16, status = $17, updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning *`,
    [
      id, ctx.iss, ctx.contextId, input.title, input.learning_goal, input.opening_question,
      input.ta_brief, input.misconceptions, input.success_criteria, input.pitch,
      input.kind, input.practice_prompts, recallIds, materialIds,
      input.target_minutes, input.gradebook, input.status,
    ]
  );
  return rows[0] ?? null;
}

export async function deleteTutorial(id: number, ctx: CourseCtx): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `delete from tutorial where id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`,
    [id, ctx.iss, ctx.contextId]
  );
  return rows.length > 0;
}

// ─── Student profile ────────────────────────────────────────────────────────

export async function getProfile(studentId: number): Promise<StudentProfile | null> {
  const rows = await query<StudentProfile>(`select * from student_profile where student_id = $1`, [studentId]);
  return rows[0] ?? null;
}

export async function upsertProfile(studentId: number, input: ProfileInput): Promise<StudentProfile> {
  const rows = await query<StudentProfile>(
    `insert into student_profile (student_id, program, goal, background, struggles, interests)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (student_id) do update set
       program = excluded.program, goal = excluded.goal, background = excluded.background,
       struggles = excluded.struggles, interests = excluded.interests, updated_at = now()
     returning *`,
    [studentId, input.program, input.goal, input.background, input.struggles, input.interests]
  );
  return rows[0]!;
}

function profileBlock(student: Student, profile: StudentProfile | null): string {
  const lines = [`Student's name: ${student.display_name}`];
  if (profile) {
    if (profile.program) lines.push(`Program / year: ${profile.program}`);
    if (profile.goal) lines.push(`Why they're taking this course / goal: ${profile.goal}`);
    if (profile.background) lines.push(`Prior background in the subject: ${profile.background}`);
    if (profile.struggles) lines.push(`What they find hardest so far: ${profile.struggles}`);
    if (profile.interests) lines.push(`Interests, work, hobbies (useful for analogies): ${profile.interests}`);
  } else {
    lines.push('(No profile on file — personalise lightly from what they tell you.)');
  }
  return lines.join('\n');
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function getTutorialSession(id: number): Promise<TutorialSession | null> {
  const rows = await query<TutorialSession>(`select * from tutorial_session where id = $1`, [id]);
  return rows[0] ?? null;
}

/** The student's most recent run of each tutorial. */
export async function latestSessionsForStudent(studentId: number): Promise<Map<number, TutorialSession>> {
  const rows = await query<TutorialSession>(
    `select distinct on (tutorial_id) * from tutorial_session
     where student_id = $1 order by tutorial_id, started_at desc`,
    [studentId]
  );
  return new Map(rows.map((r) => [r.tutorial_id, r]));
}

/** Resume the in-progress run or start a new one (`fresh` forces new). */
export async function startTutorialSession(
  tutorial: Tutorial,
  studentId: number,
  opts: { fresh?: boolean } = {}
): Promise<TutorialSession> {
  if (!opts.fresh) {
    const existing = await query<TutorialSession>(
      `select * from tutorial_session
       where tutorial_id = $1 and student_id = $2 and status = 'in_progress'
       order by started_at desc limit 1`,
      [tutorial.id, studentId]
    );
    if (existing[0]) return existing[0];
  }
  const sess = await query<{ id: number }>(
    `insert into session (student_id, kind) values ($1, 'tutorial') returning id`,
    [studentId]
  );
  const rows = await query<TutorialSession>(
    `insert into tutorial_session (tutorial_id, student_id, session_id) values ($1, $2, $3) returning *`,
    [tutorial.id, studentId, sess[0]!.id]
  );
  return rows[0]!;
}

export async function getSessionTurns(sessionId: number): Promise<Turn[]> {
  return query<Turn>(
    `select id, role, content, ts from tutor_turn where session_id = $1 order by ts asc, id asc`,
    [sessionId]
  );
}

async function appendTurn(sessionId: number, role: 'user' | 'assistant', content: string) {
  await query(`insert into tutor_turn (session_id, role, content) values ($1,$2,$3)`, [sessionId, role, content]);
}

// ─── The tutorial conversation ──────────────────────────────────────────────
//
// The rules block is the first (uncached) system block, and prompt caching
// works on exact prefixes, so it must be one fixed string per delivery
// variant — never assembled per learner. buildTutorialRules() runs once per
// (hasLiveSessions, hasCohort) pair and the result is memoised.

function buildTutorialRules(d: Delivery, kind: TutorialKind): string {
  const spec = KINDS[kind];
  const shared = [
    'One question per turn. Never stack questions.',
    'Don\'t hand over answers the student could be guided to. When they\'re wrong, ask the question that exposes the contradiction rather than saying "no".',
    "Use the student's own words back to them when probing.",
    'Vary technique: definition-probing, counter-example, cause-effect chain, zooming in and out between detail and big picture, analogy stress-test.',
    "If the student raises something correct that's adjacent to the goal, credit it briefly before steering back.",
    'Stay grounded in the course materials provided. If none are attached, draw on general knowledge of the subject described in the brief, and say so if asked where something comes from. If the student asks something outside the materials, say what you can and point them to the instructor.',
    'When you draw on a course material, name it — its title and, if you can tell, the chapter or section — so the student can find the passage themselves in the open textbook or notes. Briefly, in passing; never as a citation list.',
    "Personalise lightly: about one example or analogy in ten should draw on the student's own context and interests. Never make the tutorial about them instead of the subject.",
  ];
  // Delivery-mode rules (hasLiveSessions / hasCohort), never the TRUFlex number.
  if (!d.hasLiveSessions) {
    shared.push('The student has not sat through a lecture on this. Treat the session as discovery: let them uncover the idea from the materials and their own reasoning rather than checking whether they absorbed a presentation. Never refer to a lecture, a class, a live session or a follow-up meeting.');
  }
  if (!d.hasCohort) {
    shared.push('The student is learning alone, on their own schedule, with no classmates. Never refer to other students, peers, the class, a cohort or group work, and never suggest discussing anything with classmates.');
  }
  const rules = [...shared, ...spec.rules(d)].map((r, i) => `${i + 1}. ${r}`).join('\n');
  const purpose = spec.purpose(d);

  return `You are running a one-on-one ${spec.label.toLowerCase()} for a student in the course named below. The instructor designed it and wrote you a brief describing how they would run it with their best teaching assistant. Follow that brief: it sets the goal, the opening question, the probes, and what "got it" looks like.
${purpose ? '\n' + purpose + '\n' : ''}
You are a Socratic tutor, not a lecturer. Hard rules:
${rules}

The session runs in stages. A progress note at the end of this system prompt tells you which stage you're in; move earlier if the student clearly reaches the goal, never later.
${spec.stageGuide(d).join('\n')}

Style: warm, concrete, pitched at the level the brief implies (the brief may name a reading level and tone — follow it exactly). Many students talk to you by voice and hear your replies read aloud, so keep each reply short — usually under ${spec.replyWords} words — in plain spoken sentences. No headings, bullet lists, tables or markdown formatting. No "great question!" filler.

A message beginning "${START_MARKER}" is not from the student; it is the system telling you the student has just opened the session. Reply to it with the ${spec.stages[0]!.name} stage.`;
}

const rulesCache = new Map<string, string>();

/** One fixed rules string per (kind, delivery variant), so the block stays cacheable. */
export function tutorialRulesFor(d: Delivery, kind: TutorialKind): string {
  const key = `${kind}|${d.hasLiveSessions}|${d.hasCohort}`;
  let rules = rulesCache.get(key);
  if (!rules) {
    rules = buildTutorialRules(d, kind);
    rulesCache.set(key, rules);
  }
  return rules;
}

/** The tutorial's pitch, falling back to the course default. */
export function effectivePitch(t: Pick<Tutorial, 'pitch'>, ctx: CourseCtx): string {
  return t.pitch || ctx.settings.pitch_default || '';
}

function tutorialBrief(t: Tutorial, ctx: CourseCtx, recallSources: Tutorial[] = []): string {
  const spec = KINDS[t.kind];
  const parts = [
    `# ${spec.label.toUpperCase()} BRIEF (written by the instructor)`,
    `Course: ${ctx.title || '(untitled course)'}`,
  ];
  if (ctx.settings.course_level) parts.push(`Course level: ${COURSE_LEVEL_LABELS[ctx.settings.course_level]}`);
  parts.push(
    `Kind of session: ${spec.label} — ${spec.blurb}`,
    `Title: ${t.title}`,
    `Learning goal: ${t.learning_goal}`,
    `Opening question (ask this, verbatim or lightly adapted, in the ${spec.stages[0]!.name} stage): ${t.opening_question}`,
  );
  const pitch = effectivePitch(t, ctx);
  if (pitch) parts.push(`Pitch — reading level and tone to use throughout: ${pitch}`);
  if (t.ta_brief) parts.push(`\n## How to run it — the instructor's notes to their TA\n${t.ta_brief}`);
  if (t.misconceptions) parts.push(`\n## Misconceptions to listen for\n${t.misconceptions}`);
  if (t.success_criteria) parts.push(`\n## What "got it" sounds like\n${t.success_criteria}`);
  if (t.kind === 'practice' && t.practice_prompts) parts.push(`\n## Practice prompts the tutor may offer\n${t.practice_prompts}`);
  if (t.kind === 'recall' && recallSources.length) {
    parts.push('\n## Earlier learning this session revisits');
    for (const r of recallSources) {
      parts.push(`- ${r.title}: ${r.learning_goal}${r.success_criteria ? ` (what "got it" sounded like then: ${r.success_criteria.replace(/\s+/g, ' ').slice(0, 300)})` : ''}`);
    }
  }
  parts.push(`\nTarget length: about ${t.target_minutes} minutes.`);
  return parts.join('\n');
}

/** The brief with anything it needs loaded (recall sources). */
export async function briefFor(t: Tutorial, ctx: CourseCtx): Promise<string> {
  const sources = t.kind === 'recall' && t.recall_tutorial_ids.length
    ? await query<Tutorial>(
        `select * from tutorial where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3 order by created_at`,
        [t.recall_tutorial_ids, ctx.iss, ctx.contextId]
      )
    : [];
  return tutorialBrief(t, ctx, sources);
}

/**
 * Stream one tutor turn. Persists the user turn before streaming and the
 * assistant turn after. A `userMessage` starting with START_MARKER produces
 * the opening.
 */
export async function streamTutorialReply(params: {
  tutorial: Tutorial;
  ctx: CourseCtx;
  tutorialSession: TutorialSession;
  student: Student;
  profile: StudentProfile | null;
  userMessage: string;
  onChunk: (text: string) => void;
  attribution?: Attribution;
}): Promise<{ assistantText: string; stage: string; studentTurns: number }> {
  const { tutorial, ctx, tutorialSession, student, profile, userMessage, onChunk, attribution } = params;
  const sessionId = tutorialSession.session_id;

  await appendTurn(sessionId, 'user', userMessage);
  const turns = await getSessionTurns(sessionId);
  const studentTurns = turns.filter((t) => t.role === 'user' && !t.content.startsWith(START_MARKER)).length;
  const { stage, target } = stageFor(tutorial.kind, studentTurns, tutorial.target_minutes);

  // Merge consecutive same-role turns (the API requires alternation).
  const messages: Anthropic.MessageParam[] = [];
  for (const t of turns) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role && typeof prev.content === 'string') {
      prev.content = `${prev.content}\n\n${t.content}`;
    } else {
      messages.push({ role: t.role, content: t.content });
    }
  }
  // Cache the transcript prefix: the progress note changes only at stage
  // transitions, so most turns re-read the prior transcript from cache.
  const last = messages[messages.length - 1];
  if (last && typeof last.content === 'string') {
    last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }];
  }

  const materials = await getMaterials(tutorial.material_ids, ctx);
  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: tutorialRulesFor(ctx.delivery, tutorial.kind) }];
  const grounding = materialsBlock(materials);
  if (grounding) system.push({ type: 'text', text: grounding, cache_control: { type: 'ephemeral' } });
  // Learner model after the profile, inside the cached block: it changes
  // only when a session completes, so mid-tutorial turns still hit cache.
  const extras = [learnerModelBlock(await listLearnerModel(student.id, ctx))];
  if (tutorial.kind === 'recall') extras.push(recallCandidatesBlock(await recallCandidates(student.id, ctx)));
  const extraText = extras.filter(Boolean).map((b) => `\n\n${b}`).join('');
  system.push({
    type: 'text',
    text: `${await briefFor(tutorial, ctx)}\n\n# STUDENT PROFILE\n${profileBlock(student, profile)}${extraText}`,
    cache_control: { type: 'ephemeral' },
  });
  system.push({
    type: 'text',
    text: `# PROGRESS NOTE\nStudent turns so far: ${studentTurns} of about ${target}. Current stage: ${stage}.`,
  });

  const client = getAnthropic();
  const t0 = Date.now();
  const stream = client.messages.stream({ model: TUTOR_MODEL, max_tokens: 1024, system, messages });

  let assistantText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      assistantText += event.delta.text;
      onChunk(event.delta.text);
    }
  }
  await appendTurn(sessionId, 'assistant', assistantText);

  try {
    const final = await stream.finalMessage();
    void recordApiCall({
      ...(attribution ?? { endpoint: 'tutorial.turn' }),
      endpoint: 'tutorial.turn',
      sessionId,
      model: TUTOR_MODEL,
      usage: final.usage,
      durationMs: Date.now() - t0,
    });
  } catch {
    // stream errored mid-flight; the partial reply is already persisted
  }
  return { assistantText, stage, studentTurns };
}

// ─── Completion summary ─────────────────────────────────────────────────────

function summarySystemFor(kind: TutorialKind): string {
  const spec = KINDS[kind];
  return `You read the transcript of a one-on-one ${spec.label.toLowerCase()} (${spec.blurb}) and write a short structured summary for two readers: the student (student_note) and the instructor (everything else). Judge against the brief's learning goal and success criteria.

Return ONLY a JSON object, no code fences, with exactly these keys:
{
  "mastery": "solid" | "developing" | "needs_work",
  "understood": [up to 6 short phrases naming what the student demonstrably understood or did well],
  "sticking_points": [up to 6 short phrases naming where they were confused, guessed, needed heavy prompting, or fell short; empty array if none],
${spec.summaryExtras}
  "next_step": one concrete thing to review or practise, framed as a concept,
  "student_note": 2–4 warm, specific sentences addressed to the student by first name — what they figured out or did well, and the one thing to revisit
}

Be honest. ${spec.summaryGuidance}`;
}

function transcriptText(turns: Turn[], studentName: string): string {
  return turns
    .filter((t) => !t.content.startsWith(START_MARKER))
    .map((t) => `${t.role === 'user' ? studentName : 'Tutor'}: ${t.content}`)
    .join('\n\n');
}


export async function completeTutorialSession(params: {
  tutorial: Tutorial;
  ctx: CourseCtx;
  tutorialSession: TutorialSession;
  student: Student;
  attribution: Attribution;
}): Promise<TutorialSummary> {
  const { tutorial, ctx, tutorialSession, student, attribution } = params;
  if (tutorialSession.status === 'completed' && tutorialSession.summary) return tutorialSession.summary;

  const turns = await getSessionTurns(tutorialSession.session_id);
  const studentTurns = turns.filter((t) => t.role === 'user' && !t.content.startsWith(START_MARKER)).length;
  const parsed = await jsonCall({
    schema: TutorialSummary,
    system: summarySystemFor(tutorial.kind),
    userPrompt:
      `${await briefFor(tutorial, ctx)}\n\n# TRANSCRIPT\n${transcriptText(turns, student.display_name) || '(the student did not say anything)'}\n\nWrite the JSON summary now.`,
    maxTokens: 1024,
    attribution,
    endpoint: 'tutorial.summary',
    // The model never sees `kind`; it is the tutorial's, not its guess.
    preprocess: (raw) => (raw && typeof raw === 'object' ? { ...(raw as object), kind: tutorial.kind } : raw),
  });
  const summary: TutorialSummary = { ...parsed, turns: studentTurns };

  await query(
    `update tutorial_session set status = 'completed', completed_at = now(), summary = $2 where id = $1`,
    [tutorialSession.id, JSON.stringify(summary)]
  );
  await query(`update session set ended_at = now(), summary = $2 where id = $1`, [
    tutorialSession.session_id,
    JSON.stringify({ tutorial_id: tutorial.id, mastery: summary.mastery }),
  ]);
  // One more small call: fold the summary into the learner model. Best-effort.
  try {
    await updateLearnerModelFromSummary({ student, ctx, tutorial, summary, tutorialSessionId: tutorialSession.id, attribution });
  } catch (e) {
    console.warn(`learner model: update failed for tutorial_session ${tutorialSession.id}:`, (e as Error).message);
  }
  return summary;
}

export async function recordNps(tutorialSessionId: number, score: number, comment: string): Promise<void> {
  await query(`update tutorial_session set nps_score = $2, nps_comment = $3 where id = $1`, [
    tutorialSessionId, score, comment || null,
  ]);
}

export async function recordGradeResult(tutorialSessionId: number, result: { posted: boolean; error?: string }): Promise<void> {
  await query(
    `update tutorial_session
       set grade_posted_at = case when $2 then now() else grade_posted_at end, grade_error = $3
     where id = $1`,
    [tutorialSessionId, result.posted, result.error ?? null]
  );
}

// ─── Instructor: report + its synthesis ─────────────────────────────────────

export interface TutorialReportRow {
  session_id: number;
  student_id: number;
  display_name: string;
  status: 'in_progress' | 'completed';
  started_at: string;
  completed_at: string | null;
  turns: number;
  summary: TutorialSummary | null;
  nps_score: number | null;
  nps_comment: string | null;
  grade_posted_at: string | null;
  grade_error: string | null;
}

export interface TutorialReport {
  tutorial: Tutorial;
  rows: TutorialReportRow[];
  totals: {
    started: number;
    completed: number;
    avg_turns: number | null;
    mastery: { solid: number; developing: number; needs_work: number };
    nps: { responses: number; score: number | null };
  };
}

/** Latest run per student for one tutorial, with turn counts. */
export async function getTutorialReport(tutorial: Tutorial): Promise<TutorialReport> {
  const rows = await query<TutorialReportRow>(
    `select ts.id as session_id, ts.student_id, st.display_name, ts.status,
            ts.started_at::text, ts.completed_at::text, ts.summary,
            ts.nps_score, ts.nps_comment, ts.grade_posted_at::text, ts.grade_error,
            (select count(*)::int from tutor_turn tt
              where tt.session_id = ts.session_id and tt.role = 'user' and tt.content not like $2) as turns
     from (
       select distinct on (student_id) * from tutorial_session
       where tutorial_id = $1 order by student_id, started_at desc
     ) ts
     join student st on st.id = ts.student_id
     order by ts.started_at desc`,
    [tutorial.id, START_MARKER + '%']
  );
  const completed = rows.filter((r) => r.status === 'completed');
  const mastery = { solid: 0, developing: 0, needs_work: 0 };
  for (const r of completed) if (r.summary) mastery[r.summary.mastery] += 1;
  const npsRows = rows.filter((r) => r.nps_score !== null);
  const promoters = npsRows.filter((r) => (r.nps_score ?? 0) >= 9).length;
  const detractors = npsRows.filter((r) => (r.nps_score ?? 0) <= 6).length;
  const nps = npsRows.length ? Math.round(((promoters - detractors) / npsRows.length) * 100) : null;
  const avgTurns = rows.length ? Math.round((rows.reduce((s, r) => s + r.turns, 0) / rows.length) * 10) / 10 : null;
  return {
    tutorial,
    rows,
    totals: {
      started: rows.length,
      completed: completed.length,
      avg_turns: avgTurns,
      mastery,
      nps: { responses: npsRows.length, score: nps },
    },
  };
}

/**
 * What the report's synthesis is for, by delivery mode:
 *   group_debrief   a cohort and a live follow-up: brief the instructor for the room
 *   cohort_note     a cohort but no live session: a note to post to the cohort
 *   revision_brief  no cohort: learners work alone, so the only lever is revising the course
 */
export type DebriefKind = 'group_debrief' | 'cohort_note' | 'revision_brief';

export function debriefKindFor(d: Delivery): DebriefKind {
  if (!d.hasCohort) return 'revision_brief';
  return d.hasLiveSessions ? 'group_debrief' : 'cohort_note';
}

const GROUP_DEBRIEF_SYSTEM = `You prepare an instructor for the live group debrief that follows a one-on-one AI tutorial. You are given the tutorial brief and the per-student summaries (anonymised) from every completed run, plus any student feedback comments.

Write a debrief brief in markdown, at most 400 words, with exactly these sections:
## What landed
## Where they stuck
## Misconceptions to address
## Discussion prompts for the debrief
(3–5 prompts the instructor can put to the room, each building on something students actually said)
## One-minute re-teach
(the single explanation most worth giving live, in the instructor's voice)

Be specific and concrete — name the ideas, quote the shape of the confusions. Count how many students hit each issue when that helps ("4 of 11…"). Don't name students. Don't pad with generic teaching advice.`;

const COHORT_NOTE_SYSTEM = `You help an instructor of a paced online course. Learners work independently on a shared semester schedule; there is no live session, so the instructor's debrief of this one-on-one AI tutorial reaches the cohort as a written note. You are given the tutorial brief and the per-learner summaries (anonymised) from every completed run, plus any learner feedback comments.

Write markdown, at most 450 words, with exactly these sections:
## Cohort note
(Written in the instructor's voice, addressed to the whole cohort, ready to post as-is. It must read on its own — nobody will hear it explained live.)
### What the group found hard
### One explanation worth reading
(the single explanation most worth giving, written out in full)
### One thing to review
## Instructor-only observations
(what landed, counts of who hit which issue, misconceptions heard, anything to change in the brief — not for learners)

Be specific and concrete — name the ideas, quote the shape of the confusions. Count how many learners hit each issue when that helps ("4 of 11…"). Don't name learners. Never refer to a lecture, a class or a live session.`;

const REVISION_BRIEF_SYSTEM = `You help an instructor of a self-paced online course revise it. Learners enrol continuously and work alone; there is no cohort and no live session, so nothing from this one-on-one AI tutorial can be "debriefed" to a group. The only lever is revising the materials and the tutorial brief. You are given the brief, the titles of the materials it is grounded in, the per-learner summaries (anonymised) from every completed run, and a pre-counted list of sticking points.

Write markdown, at most 400 words, with exactly these sections:
## Sticking points, ranked
(most frequent first, with counts, merging near-duplicates)
## Misconceptions heard
## What to revise
(for each of the top two or three problems: which material or which part of the brief — opening question, probes, misconceptions list, success criteria — and a concrete suggested change)
## What is working
(what most learners got, so it isn't broken by the revision)

Be specific and concrete. Don't name learners. Never suggest group activities, peer discussion, live sessions or anything with a date.`;

/** Count near-identical sticking points across runs (case- and punctuation-insensitive). */
function rankedStickingPoints(rows: TutorialReportRow[]): Array<{ text: string; count: number }> {
  const counts = new Map<string, { text: string; count: number }>();
  for (const r of rows) {
    for (const sp of r.summary?.sticking_points ?? []) {
      const key = sp.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!key) continue;
      const entry = counts.get(key) ?? { text: sp, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export async function generateGroupDebrief(
  report: TutorialReport,
  ctx: CourseCtx,
  attribution: Attribution
): Promise<{ kind: DebriefKind; markdown: string }> {
  const kind = debriefKindFor(ctx.delivery);
  const completed = report.rows.filter((r) => r.summary);
  if (completed.length === 0) {
    const what = kind === 'group_debrief' ? 'debrief brief' : kind === 'cohort_note' ? 'cohort note' : 'revision brief';
    return { kind, markdown: `No completed runs yet — the ${what} is generated from learners' tutorial summaries once they finish.` };
  }
  const who = ctx.delivery.hasLiveSessions ? 'Student' : 'Learner';
  const summaries = completed
    .map((r, i) => {
      const s = r.summary!;
      return (
        `${who} ${i + 1} (${s.mastery}, ${r.turns} turns)\n` +
        `  Understood: ${s.understood.join('; ') || '—'}\n` +
        `  Stuck on: ${s.sticking_points.join('; ') || '—'}\n` +
        `  ${summaryHighlight(s)}`
      );
    })
    .join('\n\n');
  const comments = report.rows
    .filter((r) => r.nps_comment)
    .map((r) => `- (${r.nps_score}/10) ${r.nps_comment}`)
    .join('\n');

  let content = `${await briefFor(report.tutorial, ctx)}\n\n# RUNS (${completed.length} completed of ${report.rows.length} started)\n${summaries}`;
  if (comments) content += `\n\n# ${who.toUpperCase()} FEEDBACK COMMENTS\n${comments}`;
  let system = GROUP_DEBRIEF_SYSTEM;
  let ask = 'Write the debrief brief now.';
  if (kind === 'cohort_note') {
    system = COHORT_NOTE_SYSTEM;
    ask = 'Write the cohort note and the instructor-only observations now.';
  } else if (kind === 'revision_brief') {
    system = REVISION_BRIEF_SYSTEM;
    const materials = await getMaterials(report.tutorial.material_ids, ctx);
    const ranked = rankedStickingPoints(completed);
    content +=
      `\n\n# MATERIALS THE TUTORIAL IS GROUNDED IN\n${materials.map((m) => `- ${m.title}`).join('\n') || '(none attached)'}` +
      `\n\n# STICKING POINTS, PRE-COUNTED\n${ranked.map((r) => `- ${r.count}× ${r.text}`).join('\n') || '(none recorded)'}`;
    ask = 'Write the course revision brief now.';
  }

  const client = getAnthropic();
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: `${content}\n\n${ask}` }],
  });
  void recordApiCall({ ...attribution, endpoint: `tutorial.${kind}`, model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0 });
  return { kind, markdown: textOf(res) };
}

// ─── Instructor: draft a brief with AI ──────────────────────────────────────

export const DraftBrief = z.object({
  title: z.string().min(1).max(160),
  learning_goal: z.string().min(1),
  opening_question: z.string().min(1),
  ta_brief: z.string().min(1),
  misconceptions: z.string(),
  success_criteria: z.string(),
  practice_prompts: z.string().default(''),
});
export type DraftBrief = z.infer<typeof DraftBrief>;

function draftSystemFor(kind: TutorialKind): string {
  const spec = KINDS[kind];
  const practiceKey = kind === 'practice'
    ? `,\n  "practice_prompts": three to five practice questions or scenarios the tutor may offer, one per line`
    : '';
  return `You help an instructor draft a one-on-one AI ${spec.label.toLowerCase()} session for their course. The instructor gives you a topic (and sometimes rough notes); if course materials are provided, ground everything in them. Draft the brief the way the instructor would write notes for their best teaching assistant — first person, practical, specific.

${spec.draftGuide}

If a pitch (reading level and tone) is given, honour it exactly: the opening question, the probes, the misconception questions and the success criteria must all be phrased at that level. "Adult Basic Education" means high-school completion: short sentences, everyday examples, no unexplained jargon.

Return ONLY a JSON object, no code fences, with exactly these keys:
{
  "title": short title (under 60 characters),
  "learning_goal": one or two sentences,
  "opening_question": the first thing the tutor asks — open, concrete, not yes/no,
  "ta_brief": 150–300 words in the instructor's voice,
  "misconceptions": 3–5 lines, each a misconception (or common error) and the question that exposes it,
  "success_criteria": 2–4 lines${practiceKey}
}`;
}

export async function draftTutorialBrief(params: {
  ctx: CourseCtx;
  materialIds: number[];
  topic: string;
  kind: TutorialKind;
  /** Reading level and tone; defaults to the course's pitch_default. */
  pitch?: string;
  attribution: Attribution;
}): Promise<DraftBrief> {
  const materials = await getMaterials(params.materialIds, params.ctx);
  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: draftSystemFor(params.kind) }];
  const grounding = materialsBlock(materials);
  if (grounding) system.push({ type: 'text', text: grounding, cache_control: { type: 'ephemeral' } });
  const pitch = (params.pitch ?? '').trim() || params.ctx.settings.pitch_default;
  const level = params.ctx.settings.course_level ? `\nCourse level: ${COURSE_LEVEL_LABELS[params.ctx.settings.course_level]}` : '';
  return jsonCall({
    schema: DraftBrief,
    system,
    userPrompt:
      `Course: ${params.ctx.title || '(untitled)'}${level}` +
      (pitch ? `\nPitch (reading level and tone): ${pitch}` : '') +
      `\n\nTopic / rough notes from the instructor:\n${params.topic}\n\nDraft the ${KINDS[params.kind].label.toLowerCase()} brief JSON now.`,
    maxTokens: 2048,
    attribution: params.attribution,
    endpoint: 'tutorial.draft',
  });
}

// ─── Student: personalised lecture / study debrief ──────────────────────────
//
// Paski's "personalised lecture debrief": keep the core shared, personalise
// the 5–10% that connects it to the student's own goals and context. Here: a
// short written debrief of one course material, with one personal section.
// Where the course has no live sessions it is a "study debrief": same shape,
// but nothing presumes a lecture happened.

const LECTURE_DEBRIEF_SYSTEM = `You write a short post-lecture debrief of one piece of course material (lecture notes, a transcript, or a reading) for one student. Most of it is the same for every student: the core ideas, in plain English, as a knowledgeable friend would recap them the morning after. One section is personal: it connects the material to this student's stated program, goals and interests.

Format (markdown, at most 450 words total):
## The big ideas
3–5 short paragraphs or a tight list: the ideas that matter, stated so they could be explained to a classmate.
## Where students usually slip
2–3 sentences on the common confusions.
## Consider this in your context, {FIRST_NAME}
2–3 sentences tying one or two of the ideas to the student's program, goal or interests. Specific, not flattering. If their profile is empty, tie it to everyday life instead.
## Three questions to test yourself
Three questions, no answers.

Ground everything in the provided material.`;

const STUDY_DEBRIEF_SYSTEM = `You write a short study debrief of one piece of course material (a reading, a chapter of an open textbook, notes or a transcript) for one learner who is working through the course independently, with no lectures. Most of it is the same for every learner: the core ideas, in plain English, as a knowledgeable friend would recap them after you had both read it. One section is personal: it connects the material to this learner's stated program, goals and interests.

Format (markdown, at most 450 words total):
## The big ideas
3–5 short paragraphs or a tight list: the ideas that matter, stated so they could be explained to someone who has never studied this.
## Where people usually slip
2–3 sentences on the common confusions.
## Consider this in your context, {FIRST_NAME}
2–3 sentences tying one or two of the ideas to the learner's program, goal or interests. Specific, not flattering. If their profile is empty, tie it to everyday life instead.
## Three questions to test yourself
Three questions, no answers.

Ground everything in the provided material. Never refer to a lecture, a class, classmates or a schedule.`;

export async function getDebrief(studentId: number, materialId: number): Promise<{ markdown: string; generated_at: string } | null> {
  const rows = await query<{ markdown: string; generated_at: string }>(
    `select markdown, generated_at::text from debrief where student_id = $1 and material_id = $2`,
    [studentId, materialId]
  );
  return rows[0] ?? null;
}

export async function generateDebrief(params: {
  student: Student;
  profile: StudentProfile | null;
  material: Material;
  ctx: CourseCtx;
  attribution: Attribution;
}): Promise<{ markdown: string; generated_at: string }> {
  const { student, profile, material, ctx } = params;
  const firstName = student.display_name.split(/\s+/)[0] || 'there';
  const live = ctx.delivery.hasLiveSessions;
  const client = getAnthropic();
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1500,
    system: [
      { type: 'text', text: (live ? LECTURE_DEBRIEF_SYSTEM : STUDY_DEBRIEF_SYSTEM).replace('{FIRST_NAME}', firstName) },
      { type: 'text', text: materialsBlock([material])!, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `# STUDENT PROFILE\n${profileBlock(student, profile)}\n\nWrite the debrief for "${material.title}" now.`,
      },
    ],
  });
  void recordApiCall({
    ...params.attribution,
    endpoint: live ? 'tutorial.lecture_debrief' : 'tutorial.study_debrief',
    model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0,
  });
  const markdown = textOf(res);
  const rows = await query<{ markdown: string; generated_at: string }>(
    `insert into debrief (student_id, material_id, markdown) values ($1, $2, $3)
     on conflict (student_id, material_id) do update set markdown = excluded.markdown, generated_at = now()
     returning markdown, generated_at::text`,
    [student.id, material.id, markdown]
  );
  return rows[0]!;
}
