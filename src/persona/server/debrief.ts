/**
 * The debrief after a conversation: written by a separate call, not by the
 * persona, in a coach's voice, judged against the instructor's objectives
 * with the hidden layer and case file in view.
 *
 * Grounding. The transcript goes to the writer with numbered turns, and every
 * claim it makes carries the turns it rests on. A second call then checks
 * each claim against those turns and drops what they do not show, what the
 * student already did, and counterfactuals about facts already stated (run 2
 * of the October report recommended asking "whether it is an
 * anti-inflammatory like ibuprofen", a question the student had asked).
 * Critical issues (unsafe advice, ghostwriting and other integrity requests,
 * breaches of consent) get their own field at the top instead of being
 * softened into a suggestion.
 *
 * State. persona_session.debrief_state is none → generating → ready | failed,
 * kept on the server so a closed tab, an aborted request or a second click
 * never loses the debrief or hides the way to ask for it again. A
 * 'generating' row older than DEBRIEF_STALE_SECONDS is treated as failed (the
 * process died mid-call) and may be claimed again.
 */

import { z } from 'zod';
import { query } from '../../core/db.js';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import { getSessionTurns, type Turn } from '../../core/conversations.js';
import { TEMPLATES } from './templates.js';
import { caseFileBlock, caseRecordOf } from './casefile.js';
import { visibleTurns, type Persona, type PersonaSession } from './personas.js';

// ─── Shape ──────────────────────────────────────────────────────────────────

const Turns = z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.number().int()).max(12));
export const Claim = z.object({ text: z.string().trim().max(900), turns: Turns });
export type Claim = z.infer<typeof Claim>;

export const CRITICAL_KINDS = ['unsafe_advice', 'integrity', 'consent'] as const;
export const CriticalIssue = Claim.extend({ kind: z.enum(CRITICAL_KINDS) });
export type CriticalIssue = z.infer<typeof CriticalIssue>;

export const PersonaDebrief = z.object({
  version: z.literal(2).default(2),
  critical_issues: z.array(CriticalIssue).max(6).default([]),
  /** "How it went": two to four claims. */
  overview: z.array(Claim).max(6).default([]),
  by_objective: z.array(z.object({ objective: z.string().trim().max(300), observation: z.string().trim().max(1200), turns: Turns })).max(12).default([]),
  strengths: z.array(Claim).max(6).default([]),
  explore_further: z.array(Claim).max(6).default([]),
  one_question: z.string().trim().max(600).default(''),
});
export type PersonaDebrief = z.infer<typeof PersonaDebrief>;

/** The shape the model writes: objectives constrained to the configured names, nothing to fill in itself. */
function outputSchemaFor(objectives: string[]) {
  const claim = z.object({ text: z.string(), turns: z.array(z.number().int()) });
  const shape = {
    critical_issues: z.array(claim.extend({ kind: z.enum(CRITICAL_KINDS) })),
    overview: z.array(claim),
    strengths: z.array(claim),
    explore_further: z.array(claim),
    one_question: z.string(),
  };
  if (!objectives.length) return z.object(shape);
  const names = objectives as [string, ...string[]];
  return z.object({ ...shape, by_objective: z.array(z.object({ objective: z.enum(names), observation: z.string(), turns: z.array(z.number().int()) })) });
}

/**
 * Any stored debrief in the current shape. Debriefs written before version 2
 * hold plain strings and no turn references; they are shown as they were.
 */
export function normalizeDebrief(raw: unknown): PersonaDebrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version === 2) { const p = PersonaDebrief.safeParse(r); return p.success ? p.data : null; }
  const claims = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map((x) => (typeof x === 'string' ? { text: x, turns: [] } : x));
  const p = PersonaDebrief.safeParse({
    version: 2, critical_issues: [], overview: claims(r.overview), strengths: claims(r.strengths), explore_further: claims(r.explore_further),
    by_objective: Array.isArray(r.by_objective) ? r.by_objective.map((o) => ({ turns: [], ...(o as object) })) : [], one_question: r.one_question ?? '',
  });
  return p.success ? p.data : null;
}

export function objectivesOf(p: Pick<Persona, 'objectives'>): string[] {
  return [...new Set(p.objectives.split('\n').map((s) => s.trim().replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean))].slice(0, 12);
}

// ─── The prompt ─────────────────────────────────────────────────────────────

/** The transcript as the debrief sees it: numbered turns, the student unnamed. */
export function numberedTranscript(turns: Pick<Turn, 'role' | 'content'>[], personaName: string): string {
  return turns.map((t, i) => `[T${i + 1}] ${t.role === 'user' ? 'Student' : personaName}: ${t.content}`).join('\n\n');
}

export function debriefSystemFor(p: Persona, now: Date = new Date()): string {
  const spec = TEMPLATES[p.template];
  const objectives = objectivesOf(p);
  const caseFile = caseFileBlock(caseRecordOf(p.case_record), now);
  return `You write the debrief after ${spec.debriefFrame}. You are not the persona; you write as a supportive, observant coach, to the student as "you". Use a name only if the student gave one in the conversation. The student's role: ${p.student_role || 'a student'}. Setting: ${p.setting || 'unspecified'}.

The transcript's turns are numbered [T1], [T2] and so on. Every item you write rests on what happened in particular turns and lists those turn numbers in "turns". If you cannot point to a turn for something, leave it out.

${objectives.length
    ? `Objectives. Report on exactly these, one entry each, in this order, with each name exactly as written:\n${objectives.map((o) => `- ${o}`).join('\n')}\nIf the conversation gave nothing on one, say so in one sentence and cite the turns where it could have come up.`
    : 'The instructor set no objectives: write no by_objective entries; judge the quality of the student\'s questions and thinking in the other fields.'}

${p.hidden.trim() ? `What the persona was holding back (the student never saw this; use it to say what they drew out and what a better question could have reached):\n${p.hidden}\n` : ''}${caseFile ? `The persona's case file (fixed facts; the student never saw it):${caseFile}\n` : ''}${p.debrief_guidance.trim() ? `The instructor's guidance for this debrief:\n${p.debrief_guidance}\n` : ''}
Rules:
- Praise only what the cited turns show. Be specific, honest and brief.
- Before suggesting a question or topic, read every student turn. Never suggest something the student already asked, in any wording. If they asked and the answer was thin, a follow-up that goes further is fine, but say what they asked and cite that turn.
- Never suggest asking about something the persona already said, and write no counterfactuals about facts already in the transcript ("if she had said…", "had you asked whether…" when she did say it or the student did ask it).
- Critical issues: an empty list unless the student did one of these. unsafe_advice: clinical, medication or safety advice that could cause harm, such as telling someone to take, stop, double or combine a medicine, or reassuring away a warning sign. integrity: asking the persona to write, complete or ghostwrite graded work (an essay, a response paper, assignment answers) or another academic-integrity breach. consent: going ahead with a sensitive topic or examination after the persona declined, or sharing what was said in confidence. Say plainly what was said and why it matters. A critical issue is not repeated elsewhere as a gentle suggestion.
- Never assign grades, scores, percentages or predictions of marks.

Fields:
- critical_issues: as above; usually empty.
- overview: two to four claims that together say how the conversation went, addressed to the student.
- ${objectives.length ? 'by_objective: one per objective, one to three sentences with an example.' : '(no by_objective)'}
- strengths: up to five specific things the student did well.
- explore_further: up to five cues, topics or moves the student did not pursue, each tied to the turn where the chance came up.
- one_question: one question for the student to carry away.`;
}

// ─── The check pass ─────────────────────────────────────────────────────────

const VERDICTS = ['supported', 'unsupported', 'already_asked', 'counterfactual'] as const;
const CheckOutput = z.object({ verdicts: z.array(z.object({ id: z.string(), verdict: z.enum(VERDICTS), reason: z.string() })) });

const CHECK_SYSTEM = `You check a debrief against the conversation it describes. The transcript's turns are numbered [T1], [T2] and so on. Each claim below names the turns it rests on. For every claim, read those turns (and, for suggestions, every student turn) and give one verdict:
- supported: the cited turns show what the claim says.
- unsupported: the cited turns do not show it: the turn is wrong, the claim overstates or misreads it, or it is not in the transcript at all.
- already_asked: the claim suggests the student ask or do something they already asked or did in some turn, in any wording. (A suggestion to go further than what they asked, which says what they asked, is supported.)
- counterfactual: the claim imagines or suggests asking about something the transcript already states ("if she had said she could not name it…" when she said exactly that).
A critical issue is supported only if the cited turns show the student doing what it says. The closing question (id Q) has no turns; judge it only for already_asked and counterfactual. Give a one-line reason for each verdict.`;

interface Checkable { id: string; section: string; text: string; turns: number[] }

export function inRange(turns: number[], n: number): number[] {
  return [...new Set(turns.filter((t) => Number.isInteger(t) && t >= 1 && t <= n))];
}

/** Drop claims without a valid turn reference; the model check then judges the rest. */
export function withValidTurns(d: PersonaDebrief, n: number): PersonaDebrief {
  const keep = <T extends { turns: number[] }>(xs: T[]) => xs.map((x) => ({ ...x, turns: inRange(x.turns, n) })).filter((x) => x.turns.length > 0);
  return { ...d, critical_issues: keep(d.critical_issues), overview: keep(d.overview), strengths: keep(d.strengths), explore_further: keep(d.explore_further), by_objective: d.by_objective.map((o) => ({ ...o, turns: inRange(o.turns, n) })) };
}

async function checkClaims(d: PersonaDebrief, transcript: string, attribution: Attribution): Promise<PersonaDebrief> {
  const items: Checkable[] = [
    ...d.critical_issues.map((c, i) => ({ id: `C${i + 1}`, section: `critical issue (${c.kind})`, text: c.text, turns: c.turns })),
    ...d.overview.map((c, i) => ({ id: `O${i + 1}`, section: 'how it went', text: c.text, turns: c.turns })),
    ...d.strengths.map((c, i) => ({ id: `S${i + 1}`, section: 'what went well', text: c.text, turns: c.turns })),
    ...d.explore_further.map((c, i) => ({ id: `E${i + 1}`, section: 'worth exploring (a suggestion)', text: c.text, turns: c.turns })),
    ...(d.one_question ? [{ id: 'Q', section: 'closing question', text: d.one_question, turns: [] }] : []),
  ];
  if (!items.length) return d;
  const out = await jsonCall({
    schema: CheckOutput,
    system: CHECK_SYSTEM,
    userPrompt: `Transcript:\n${transcript}\n\nClaims:\n${items.map((c) => `${c.id} [${c.section}]${c.turns.length ? ` (turns ${c.turns.join(', ')})` : ''}: ${c.text}`).join('\n')}\n\nGive a verdict for every claim id.`,
    maxTokens: 2500,
    effort: 'medium',
    attribution: { ...attribution, endpoint: 'persona.debrief.check' },
    endpoint: 'persona.debrief.check',
  });
  const verdict = new Map(out.verdicts.map((v) => [v.id, v.verdict]));
  // A claim the checker skipped stays: the turn references already passed the range check.
  const ok = (id: string) => (verdict.get(id) ?? 'supported') === 'supported';
  return {
    ...d,
    critical_issues: d.critical_issues.filter((_, i) => ok(`C${i + 1}`)),
    overview: d.overview.filter((_, i) => ok(`O${i + 1}`)),
    strengths: d.strengths.filter((_, i) => ok(`S${i + 1}`)),
    explore_further: d.explore_further.filter((_, i) => ok(`E${i + 1}`)),
    one_question: d.one_question && ok('Q') ? d.one_question : '',
  };
}

/** Keep only the configured objectives, under their exact names, in their order. */
export function onlyConfiguredObjectives(d: PersonaDebrief, objectives: string[]): PersonaDebrief {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const byName = new Map(d.by_objective.map((o) => [norm(o.objective), o]));
  return { ...d, by_objective: objectives.flatMap((name) => { const o = byName.get(norm(name)); return o ? [{ ...o, objective: name }] : []; }) };
}

/** Write and check a debrief for these turns. No database: the replay harness calls this directly. */
export async function generateDebrief(params: { persona: Persona; turns: Pick<Turn, 'role' | 'content'>[]; attribution: Attribution; now?: Date }): Promise<PersonaDebrief> {
  const { persona, turns, attribution } = params;
  const objectives = objectivesOf(persona);
  const transcript = numberedTranscript(turns, persona.title);
  const draft = await jsonCall({
    schema: PersonaDebrief,
    output: outputSchemaFor(objectives),
    system: debriefSystemFor(persona, params.now),
    userPrompt: `Transcript:\n${transcript || '(the student said nothing)'}\n\nWrite the debrief JSON now.`,
    maxTokens: 3500,
    attribution: { ...attribution, endpoint: 'persona.debrief' },
    endpoint: 'persona.debrief',
  });
  const ranged = onlyConfiguredObjectives(withValidTurns(draft, turns.length), objectives);
  return checkClaims(ranged, transcript, attribution);
}

// ─── State ──────────────────────────────────────────────────────────────────

export const DEBRIEF_STATES = ['none', 'generating', 'ready', 'failed'] as const;
export type DebriefState = (typeof DEBRIEF_STATES)[number];
export const DEBRIEF_STALE_SECONDS = 180;

export interface DebriefStatus { state: DebriefState; debrief: PersonaDebrief | null; error: string | null }

/** What the page shows. A stored debrief is always 'ready'; a 'generating' row that outlived the stale limit is 'failed'. */
export function debriefStatus(s: Pick<PersonaSession, 'debrief' | 'debrief_state' | 'debrief_started_at' | 'debrief_error'>, now: number = Date.now()): DebriefStatus {
  const debrief = normalizeDebrief(s.debrief);
  if (debrief) return { state: 'ready', debrief, error: null };
  if (s.debrief_state === 'generating') {
    // pg returns timestamptz as a Date unless the query casts it to text.
    const started = s.debrief_started_at ? new Date(s.debrief_started_at as unknown as string | Date).getTime() : 0;
    if (now - started > DEBRIEF_STALE_SECONDS * 1000) return { state: 'failed', debrief: null, error: 'Writing the debrief was interrupted.' };
    return { state: 'generating', debrief: null, error: null };
  }
  if (s.debrief_state === 'failed') return { state: 'failed', debrief: null, error: s.debrief_error || 'The debrief could not be written.' };
  return { state: 'none', debrief: null, error: null };
}

/**
 * Ask for the debrief. Exactly one request claims the work; it waits for the
 * result. A request that finds the work already running returns
 * 'generating' at once, and the page polls. The generation runs to the end
 * even if the student's request is aborted, so a reopened page finds it.
 */
export async function requestDebrief(params: { persona: Persona; session: PersonaSession; attribution: Attribution }): Promise<DebriefStatus> {
  const { persona, session, attribution } = params;
  const current = debriefStatus(session);
  if (current.state === 'ready') return current;
  const claimed = await query<{ id: number }>(
    `update persona_session set debrief_state = 'generating', debrief_started_at = now(), debrief_error = null
     where id = $1 and debrief is null
       and (debrief_state <> 'generating' or debrief_started_at is null or debrief_started_at < now() - make_interval(secs => $2))
     returning id`,
    [session.id, DEBRIEF_STALE_SECONDS]
  );
  if (!claimed.length) return debriefStatusById(session.id);
  try {
    const turns = visibleTurns(await getSessionTurns(session.session_id));
    const debrief = await generateDebrief({ persona, turns, attribution });
    await query(
      `update persona_session set debrief = $2::jsonb, debrief_state = 'ready', debrief_generated_at = now(), debrief_error = null where id = $1`,
      [session.id, JSON.stringify(debrief)]
    );
    return { state: 'ready', debrief, error: null };
  } catch (e) {
    const message = (e as Error).message || 'The debrief could not be written.';
    console.error(`debrief for persona_session ${session.id} failed:`, message);
    await query(`update persona_session set debrief_state = 'failed', debrief_error = $2 where id = $1 and debrief is null`, [session.id, message.slice(0, 500)]);
    return { state: 'failed', debrief: null, error: message };
  }
}

export async function debriefStatusById(id: number): Promise<DebriefStatus> {
  const rows = await query<PersonaSession>(`select debrief, debrief_state, debrief_started_at::text, debrief_error from persona_session where id = $1`, [id]);
  return rows[0] ? debriefStatus(rows[0]) : { state: 'none', debrief: null, error: null };
}

/** A session as the page receives it: the debrief normalised, the state resolved, the raw error kept off the wire. */
export function clientSession(s: PersonaSession) {
  const st = debriefStatus(s);
  const { debrief_error: _e, debrief_started_at: _t, ...rest } = s;
  return { ...rest, debrief: st.debrief, debrief_state: st.state };
}

// ─── Export ─────────────────────────────────────────────────────────────────

const refs = (turns: number[]) => (turns.length ? ` _(turn${turns.length === 1 ? '' : 's'} ${turns.join(', ')})_` : '');
const KIND_LABEL: Record<CriticalIssue['kind'], string> = { unsafe_advice: 'Unsafe advice', integrity: 'Academic integrity', consent: 'Consent' };

export function debriefMarkdown(raw: unknown): string {
  const d = normalizeDebrief(raw);
  if (!d) return '';
  const parts = ['## Debrief'];
  if (d.critical_issues.length) { parts.push('\n### Critical issues'); for (const c of d.critical_issues) parts.push(`- **${KIND_LABEL[c.kind]}.** ${c.text}${refs(c.turns)}`); }
  if (d.overview.length) { parts.push('\n### How it went'); parts.push(d.overview.map((c) => `${c.text}${refs(c.turns)}`).join(' ')); }
  if (d.by_objective.length) { parts.push('\n### By objective'); for (const o of d.by_objective) parts.push(`- **${o.objective}** ${o.observation}${refs(o.turns)}`); }
  if (d.strengths.length) { parts.push('\n### What went well'); for (const x of d.strengths) parts.push(`- ${x.text}${refs(x.turns)}`); }
  if (d.explore_further.length) { parts.push('\n### Worth exploring further'); for (const x of d.explore_further) parts.push(`- ${x.text}${refs(x.turns)}`); }
  if (d.one_question) parts.push(`\n### One question to carry away\n${d.one_question}`);
  return parts.join('\n');
}

/** Plain text of a section, for the CSV and the instructor's synthesis. */
export const claimTexts = (xs: Claim[]) => xs.map((x) => x.text);
