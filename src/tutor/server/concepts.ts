/**
 * Canonical concepts (usability report, Finding 13).
 *
 * The learner model's concept names are free text written by a model after
 * each session, so two learners who showed the same idea got two rows ("extern
 * for shared variable", "using extern for shared variables") and the
 * instructor's Concepts tab counted one learner in each. Each course now keeps
 * a list of canonical concepts:
 *
 *   - briefs name their key concepts (one per line in the editor); the labels
 *     are shared across the course by normalised wording
 *   - every new learner-model entry is matched onto a canonical concept, by
 *     exact wording first and then by the model with a confidence; below
 *     MATCH_THRESHOLD it stays unmapped, for the instructor to review
 *   - the Concepts tab groups by canonical concept and counts distinct
 *     learners, each learner's latest status counted once; unmapped entries
 *     are listed apart, never as new concept rows
 *
 * The learner's own My learning list keeps the wording written for them.
 * Instructors see counts and wordings, never names.
 */

import { z } from 'zod';
import { query } from '../../core/db.js';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import type { Scope } from '../../core/materials.js';
import type { ConceptStatus } from './learner.js';

export interface CourseConcept {
  id: number;
  label: string;
}

/** Model matches below this confidence stay unmapped. */
export const MATCH_THRESHOLD = 0.7;
/** Key concepts per brief. */
export const MAX_KEY_CONCEPTS = 30;

/** Normalised wording: lower case, no punctuation, simple plurals folded. */
export function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** The editor's "one per line" text as labels: bullets and numbering dropped, duplicates removed. */
export function parseConceptLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const label = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = labelKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= MAX_KEY_CONCEPTS) break;
  }
  return out;
}

export async function listCourseConcepts(ctx: Scope): Promise<CourseConcept[]> {
  return query<CourseConcept>(
    `select id, label from course_concept where lti_iss = $1 and lti_context_id = $2 order by id`,
    [ctx.iss, ctx.contextId]
  );
}

/** Ids for these labels, creating any the course does not have yet; in the given order. */
export async function ensureCourseConcepts(ctx: Scope, labels: string[]): Promise<number[]> {
  if (labels.length === 0) return [];
  const keys = labels.map(labelKey);
  await query(
    `insert into course_concept (lti_iss, lti_context_id, label, label_key)
     select $1, $2, l, k from unnest($3::text[], $4::text[]) as t(l, k)
     on conflict (lti_iss, lti_context_id, label_key) do nothing`,
    [ctx.iss, ctx.contextId, labels, keys]
  );
  const rows = await query<{ id: number; label_key: string }>(
    `select id, label_key from course_concept where lti_iss = $1 and lti_context_id = $2 and label_key = any($3::text[])`,
    [ctx.iss, ctx.contextId, keys]
  );
  const byKey = new Map(rows.map((r) => [r.label_key, Number(r.id)]));
  return keys.map((k) => byKey.get(k)).filter((x): x is number => x !== undefined);
}

/** The labels of a brief's key concepts, one per line, for the editor. */
export async function keyConceptsText(conceptIds: number[], ctx: Scope): Promise<string> {
  if (!conceptIds.length) return '';
  const rows = await query<CourseConcept>(
    `select id, label from course_concept where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3`,
    [conceptIds, ctx.iss, ctx.contextId]
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r.label]));
  return conceptIds.map((id) => byId.get(Number(id))).filter(Boolean).join('\n');
}

// ─── Matching ───────────────────────────────────────────────────────────────

export interface ConceptMatch {
  concept_id: number | null;
  confidence: number;
}

export function exactMatch(text: string, canon: CourseConcept[]): CourseConcept | null {
  const k = labelKey(text);
  return canon.find((c) => labelKey(c.label) === k) ?? null;
}

/** Keep a model's proposed match only if it names a real concept with enough confidence. */
export function acceptMatch(proposed: { concept_id: number | null; confidence: number } | undefined, canon: CourseConcept[]): ConceptMatch {
  if (!proposed || proposed.concept_id === null) return { concept_id: null, confidence: proposed?.confidence ?? 0 };
  const known = canon.some((c) => Number(c.id) === proposed.concept_id);
  if (!known || proposed.confidence < MATCH_THRESHOLD) return { concept_id: null, confidence: proposed.confidence };
  return { concept_id: proposed.concept_id, confidence: proposed.confidence };
}

/** The canonical list as the model sees it. */
export function canonBlock(canon: CourseConcept[]): string {
  return canon.map((c) => `${c.id}: ${c.label}`).join('\n');
}

const MatchResponse = z.object({
  matches: z.array(z.object({
    i: z.number().int(),
    concept_id: z.number().int().nullable(),
    confidence: z.number().min(0).max(1),
  })),
});

const MATCH_SYSTEM = `You map short descriptions of what a learner showed in a course onto the course's canonical concepts. For each numbered description, choose the one canonical concept it is about, or null if none fits. A description fits a concept when it is about the same idea, even if it is narrower, a step of it, or a misconception about it; it does not fit just because it shares a word.

Return ONLY a JSON object, no code fences: {"matches": [{"i": description number, "concept_id": a canonical id or null, "confidence": 0 to 1}]}, one entry per description. Use confidence 0.9 or more only when the idea is clearly the same; below 0.7 means you are unsure.`;

/** Map free-text concept names onto the canonical list: exact wording first, then one model call. */
export async function matchConcepts(texts: string[], canon: CourseConcept[], attribution: Attribution): Promise<ConceptMatch[]> {
  const out: ConceptMatch[] = texts.map((t) => {
    const hit = exactMatch(t, canon);
    return hit ? { concept_id: Number(hit.id), confidence: 1 } : { concept_id: null, confidence: 0 };
  });
  const todo = texts.map((t, i) => ({ t, i })).filter(({ i }) => out[i]!.concept_id === null);
  if (todo.length === 0 || canon.length === 0) return out;
  const res = await jsonCall({
    schema: MatchResponse,
    system: MATCH_SYSTEM,
    userPrompt: `# CANONICAL CONCEPTS (id: label)\n${canonBlock(canon)}\n\n# DESCRIPTIONS\n${todo.map(({ t }, n) => `${n + 1}. ${t}`).join('\n')}\n\nReturn the matches now.`,
    maxTokens: 200 + todo.length * 40,
    attribution: { ...attribution, endpoint: 'tutorial.concept_match' },
    endpoint: 'tutorial.concept_match',
  });
  for (const m of res.matches) {
    const target = todo[m.i - 1];
    if (target) out[target.i] = acceptMatch(m, canon);
  }
  return out;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export interface ConceptRow {
  student_id: number;
  concept: string;
  concept_id: number | null;
  status: ConceptStatus;
  last_seen: string;
}

export interface ConceptAggregate {
  /** null for an unmapped wording. */
  concept_id: number | null;
  concept: string;
  /** Distinct learners. */
  learners: number;
  /** Each learner counted once, at their latest status for this concept. */
  secure: number;
  developing: number;
  fragile: number;
  misconception: number;
  last_seen: string;
  /** The wordings folded into this row (no names). */
  wordings: string[];
}

const CONCERN: Record<ConceptStatus, number> = { misconception: 0, fragile: 1, developing: 2, secure: 3 };

function aggregate(groups: Map<string, { concept_id: number | null; concept: string; rows: ConceptRow[] }>): ConceptAggregate[] {
  const out: ConceptAggregate[] = [];
  for (const g of groups.values()) {
    const latest = new Map<number, ConceptRow>();
    for (const r of g.rows) {
      const prev = latest.get(r.student_id);
      // Latest wins; rows from the same session tie, and then the more concerning status is shown.
      if (!prev || r.last_seen > prev.last_seen || (r.last_seen === prev.last_seen && CONCERN[r.status] < CONCERN[prev.status])) latest.set(r.student_id, r);
    }
    const a: ConceptAggregate = {
      concept_id: g.concept_id, concept: g.concept, learners: latest.size,
      secure: 0, developing: 0, fragile: 0, misconception: 0,
      last_seen: g.rows.reduce((m, r) => (r.last_seen > m ? r.last_seen : m), ''),
      wordings: [...new Set(g.rows.map((r) => r.concept))].sort(),
    };
    for (const r of latest.values()) a[r.status] += 1;
    out.push(a);
  }
  return out.sort((x, y) => (y.fragile + y.misconception) - (x.fragile + x.misconception) || y.learners - x.learners || x.concept.localeCompare(y.concept));
}

/** Group by canonical concept; unmapped entries grouped by normalised wording, apart. */
export function aggregateConcepts(rows: ConceptRow[], canon: CourseConcept[]): { concepts: ConceptAggregate[]; unmapped: ConceptAggregate[] } {
  const labels = new Map(canon.map((c) => [Number(c.id), c.label]));
  const mapped = new Map<string, { concept_id: number | null; concept: string; rows: ConceptRow[] }>();
  const unmapped = new Map<string, { concept_id: number | null; concept: string; rows: ConceptRow[] }>();
  for (const r of rows) {
    const id = r.concept_id === null ? null : Number(r.concept_id);
    const label = id === null ? undefined : labels.get(id);
    const [bucket, key, name] = label !== undefined ? [mapped, `c${id}`, label] : [unmapped, labelKey(r.concept), r.concept];
    let g = bucket.get(key);
    if (!g) { g = { concept_id: label !== undefined ? id : null, concept: name, rows: [] }; bucket.set(key, g); }
    g.rows.push(r);
  }
  return { concepts: aggregate(mapped), unmapped: aggregate(unmapped) };
}

export async function courseConceptReport(ctx: Scope): Promise<{ concepts: ConceptAggregate[]; unmapped: ConceptAggregate[]; canonical: CourseConcept[] }> {
  const canon = await listCourseConcepts(ctx);
  const rows = await query<ConceptRow>(
    `select student_id, concept, concept_id, status, last_seen::text from learner_model where lti_iss = $1 and lti_context_id = $2`,
    [ctx.iss, ctx.contextId]
  );
  return { ...aggregateConcepts(rows.map((r) => ({ ...r, student_id: Number(r.student_id), concept_id: r.concept_id === null ? null : Number(r.concept_id) })), canon), canonical: canon };
}

// ─── Instructor review of unmapped entries ──────────────────────────────────

/** Point every entry with this wording (normalised) at a canonical concept, or back to unmapped. */
export async function setWordingConcept(ctx: Scope, wording: string, conceptId: number | null): Promise<number> {
  if (conceptId !== null) {
    const ok = await query<{ id: number }>(`select id from course_concept where id = $1 and lti_iss = $2 and lti_context_id = $3`, [conceptId, ctx.iss, ctx.contextId]);
    if (!ok[0]) throw Object.assign(new Error('That concept is not in this course.'), { status: 400 });
  }
  const rows = await query<{ id: number; concept: string }>(
    `select id, concept from learner_model where lti_iss = $1 and lti_context_id = $2`, [ctx.iss, ctx.contextId]
  );
  const key = labelKey(wording);
  const ids = rows.filter((r) => labelKey(r.concept) === key).map((r) => r.id);
  if (!ids.length) return 0;
  await query(
    `update learner_model set concept_id = $1, match_confidence = case when $1::bigint is null then null else 1 end where id = any($2::bigint[])`,
    [conceptId, ids]
  );
  return ids.length;
}

/** Match every unmapped wording in the course; used once for entries written before canonical concepts, and on demand. */
export async function remapUnmapped(ctx: Scope, attribution: Attribution): Promise<{ mapped: number; unmapped: number }> {
  const canon = await listCourseConcepts(ctx);
  const rows = await query<{ id: number; concept: string }>(
    `select id, concept from learner_model where lti_iss = $1 and lti_context_id = $2 and concept_id is null`, [ctx.iss, ctx.contextId]
  );
  if (!rows.length || !canon.length) return { mapped: 0, unmapped: rows.length };
  const wordings = [...new Map(rows.map((r) => [labelKey(r.concept), r.concept])).values()];
  const matches = await matchConcepts(wordings, canon, attribution);
  let mapped = 0;
  for (let i = 0; i < wordings.length; i++) {
    const m = matches[i]!;
    if (m.concept_id === null) continue;
    const key = labelKey(wordings[i]!);
    const ids = rows.filter((r) => labelKey(r.concept) === key).map((r) => r.id);
    await query(`update learner_model set concept_id = $1, match_confidence = $2 where id = any($3::bigint[])`, [m.concept_id, m.confidence, ids]);
    mapped += ids.length;
  }
  return { mapped, unmapped: rows.length - mapped };
}
