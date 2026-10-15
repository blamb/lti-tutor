/**
 * Personas: the structured character an instructor designs, the prompt it
 * becomes, the conversations students have with it, and the AI draft that
 * turns an existing prompt (a Custom GPT's instructions and knowledge
 * profile, say) into the structured fields.
 *
 * Prompt order, for caching: template rules (one fixed string) → sources
 * (cached) → persona + student (cached) → nothing volatile. A turn
 * mid-conversation re-reads everything but the transcript tail from cache.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { query } from '../../core/db.js';
import { getAnthropic } from '../../core/anthropic.js';
import { recordApiCall, MODEL_PRICES, type Attribution } from '../../core/costs.js';
import { jsonCall } from '../../core/llm.js';
import { getMaterials, type Material, type Scope } from '../../core/materials.js';
import { appendTurn, getSessionTurns, createSession, endSession, type Turn } from '../../core/conversations.js';
import { GROUNDING_MAX_CHARS } from '../../core/limits.js';
import { env } from './env.js';
import {
  TEMPLATES, PERSONA_TEMPLATES, RESPONSE_LENGTHS, RESPONSE_LENGTH_NOTES, PERSONA_FIELD_KEYS,
  type PersonaTemplate, type ResponseLength,
} from './templates.js';

export type { Scope };

// ─── Types ──────────────────────────────────────────────────────────────────

export type PersonaStatus = 'draft' | 'published' | 'archived';
export type Opening = 'student' | 'persona';

export interface Persona {
  id: number;
  lti_iss: string;
  lti_context_id: string;
  template: PersonaTemplate;
  title: string;
  subtitle: string;
  summary: string;
  student_role: string;
  setting: string;
  student_brief: string;
  character: string;
  voice: string;
  behaviour: string;
  /** Never sent to a student's browser. */
  hidden: string;
  guardrails: string;
  historical_cutoff: string;
  raw_instructions: string;
  objectives: string;
  debrief_guidance: string;
  opening: Opening;
  opening_line: string;
  response_length: ResponseLength;
  /** '' = the deployment default. */
  model: string;
  material_ids: number[];
  status: PersonaStatus;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** The models an instructor can choose from, with first-party list prices. */
export const PERSONA_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'fast and the lowest cost; a good default' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'stronger reasoning and a steadier voice' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'the most capable, for personas where nuance matters most' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'the previous Haiku' },
].map((m) => ({ ...m, price: MODEL_PRICES[m.id] ?? null }));

export function isKnownModel(id: string): boolean {
  return PERSONA_MODELS.some((m) => m.id === id);
}

export function modelFor(p: Pick<Persona, 'model'>): string {
  return p.model || env.PERSONA_MODEL;
}

const text = (max: number) => z.string().trim().max(max).default('');

export const PersonaInput = z.object({
  template: z.enum(PERSONA_TEMPLATES).default('thinker'),
  title: z.string().trim().min(1).max(160),
  subtitle: text(200),
  summary: text(1000),
  student_role: text(300),
  setting: text(300),
  student_brief: text(4000),
  character: text(12000),
  voice: text(4000),
  behaviour: text(8000),
  hidden: text(12000),
  guardrails: text(4000),
  historical_cutoff: text(60),
  raw_instructions: text(12000),
  objectives: text(2000),
  debrief_guidance: text(2000),
  opening: z.enum(['student', 'persona']).default('student'),
  opening_line: text(2000),
  response_length: z.enum(RESPONSE_LENGTHS).default('medium'),
  model: z.string().trim().max(60).default('').refine((m) => m === '' || isKnownModel(m), 'unknown model'),
  material_ids: z.array(z.number().int().positive()).max(40).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});
export type PersonaInput = z.infer<typeof PersonaInput>;

/** What a student may see of a persona: the card and the pre-brief, never the character or the hidden layer. */
export function publicPersona(p: Persona) {
  return {
    id: p.id, template: p.template, title: p.title, subtitle: p.subtitle, summary: p.summary,
    student_role: p.student_role, setting: p.setting, student_brief: p.student_brief,
    opening: p.opening, status: p.status, objectives: p.objectives,
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function listPersonas(scope: Scope, opts: { publishedOnly: boolean }): Promise<Persona[]> {
  return query<Persona>(
    `select * from persona where lti_iss = $1 and lti_context_id = $2
       ${opts.publishedOnly ? "and status = 'published'" : "and status <> 'archived'"}
     order by created_at`,
    [scope.iss, scope.contextId]
  );
}

export async function getPersona(id: number, scope: Scope): Promise<Persona | null> {
  const rows = await query<Persona>(`select * from persona where id = $1 and lti_iss = $2 and lti_context_id = $3`, [id, scope.iss, scope.contextId]);
  return rows[0] ?? null;
}

async function validMaterialIds(ids: number[], scope: Scope): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await query<{ id: number }>(
    `select id from material where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3`,
    [ids, scope.iss, scope.contextId]
  );
  const ok = new Set(rows.map((r) => r.id));
  return ids.filter((id) => ok.has(id));
}

const COLUMNS = [
  'template', 'title', 'subtitle', 'summary', 'student_role', 'setting', 'student_brief', 'character', 'voice', 'behaviour',
  'hidden', 'guardrails', 'historical_cutoff', 'raw_instructions', 'objectives', 'debrief_guidance', 'opening', 'opening_line',
  'response_length', 'model', 'material_ids', 'status',
] as const;

export async function createPersona(scope: Scope, input: PersonaInput, createdBy: number | null): Promise<Persona> {
  const values = { ...input, material_ids: await validMaterialIds(input.material_ids, scope) };
  const params = COLUMNS.map((c) => values[c]);
  const rows = await query<Persona>(
    `insert into persona (lti_iss, lti_context_id, ${COLUMNS.join(', ')}, created_by)
     values ($1, $2, ${COLUMNS.map((_, i) => `$${i + 3}`).join(', ')}, $${COLUMNS.length + 3}) returning *`,
    [scope.iss, scope.contextId, ...params, createdBy]
  );
  return rows[0]!;
}

export async function updatePersona(id: number, scope: Scope, input: PersonaInput): Promise<Persona | null> {
  const values = { ...input, material_ids: await validMaterialIds(input.material_ids, scope) };
  const params = COLUMNS.map((c) => values[c]);
  const rows = await query<Persona>(
    `update persona set ${COLUMNS.map((c, i) => `${c} = $${i + 4}`).join(', ')}, updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning *`,
    [id, scope.iss, scope.contextId, ...params]
  );
  return rows[0] ?? null;
}

export async function deletePersona(id: number, scope: Scope): Promise<boolean> {
  const rows = await query<{ id: number }>(`delete from persona where id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`, [id, scope.iss, scope.contextId]);
  return rows.length > 0;
}

/** Drop a deleted material from every persona in the course. */
export async function detachMaterial(materialId: number, scope: Scope): Promise<void> {
  await query(
    `update persona set material_ids = array_remove(material_ids, $1::bigint)
     where lti_iss = $2 and lti_context_id = $3 and $1 = any(material_ids)`,
    [materialId, scope.iss, scope.contextId]
  );
}

// ─── The prompt ─────────────────────────────────────────────────────────────

export function sourcesBlock(materials: Material[]): string | null {
  if (materials.length === 0) return null;
  let total = 0;
  const parts = ['# SOURCES (provided by the instructor)', 'Draw on these before anything else. Where they are silent, say so rather than inventing.'];
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

function section(heading: string, body: string, preface = ''): string {
  const b = body.trim();
  if (!b) return '';
  return `\n## ${heading}\n${preface ? preface + '\n' : ''}${b}\n`;
}

/** The persona block: everything specific to this persona and this student. */
export function personaBlock(p: Persona, studentName: string): string {
  const head = `# PERSONA: ${p.title}${p.subtitle ? ` (${p.subtitle})` : ''}\n`;
  const body =
    section('Who you are', p.character) +
    section('How you talk', p.voice) +
    section('How you engage', p.behaviour) +
    section('What you hold back (hidden layer)', p.hidden,
      'The student cannot see this section. Drop its cues naturally when the conversation touches them; disclose each follow-up only when its condition is met; never state a hidden fact unprompted.') +
    section('Boundaries', [p.guardrails, p.historical_cutoff ? `Historical cutoff: you know nothing after ${p.historical_cutoff}.` : ''].filter(Boolean).join('\n')) +
    section('Additional instructions', p.raw_instructions);
  const conv = [
    '\n# THE CONVERSATION',
    p.student_role ? `The student is ${p.student_role}.` : '',
    p.setting ? `Setting: ${p.setting}` : '',
    `The student's name is ${studentName || 'the student'}.`,
    RESPONSE_LENGTH_NOTES[p.response_length] ?? RESPONSE_LENGTH_NOTES.medium,
    p.opening === 'persona'
      ? `You speak first.${p.opening_line ? ` Open with this, or close to it: ${p.opening_line}` : ' Introduce yourself briefly in character, establish the setting, ask what the student would like to talk about, and wait.'}`
      : 'The student speaks first. Respond to what they say.',
  ].filter(Boolean).join('\n');
  return head + body + conv;
}

export function personaSystem(p: Persona, materials: Material[], studentName: string): Anthropic.TextBlockParam[] {
  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: TEMPLATES[p.template].rules }];
  const sources = sourcesBlock(materials);
  if (sources) system.push({ type: 'text', text: sources, cache_control: { type: 'ephemeral' } });
  system.push({ type: 'text', text: personaBlock(p, studentName), cache_control: { type: 'ephemeral' } });
  return system;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export type SessionMode = 'live' | 'preview';

export interface PersonaSession {
  id: number;
  persona_id: number;
  student_id: number;
  session_id: number;
  mode: SessionMode;
  status: 'in_progress' | 'ended';
  started_at: string;
  ended_at: string | null;
  debrief: unknown | null;
}

/** Hidden user turn that opens a conversation the persona starts (the API needs a user turn first). */
export const START_MARKER = '[Conversation start]';

export async function getPersonaSession(id: number): Promise<PersonaSession | null> {
  const rows = await query<PersonaSession>(`select * from persona_session where id = $1`, [id]);
  return rows[0] ?? null;
}

/** The student's most recent live conversation with each persona. */
export async function latestSessionsForStudent(studentId: number): Promise<Map<number, PersonaSession>> {
  const rows = await query<PersonaSession>(
    `select distinct on (persona_id) * from persona_session
     where student_id = $1 and mode = 'live' order by persona_id, started_at desc`,
    [studentId]
  );
  return new Map(rows.map((r) => [r.persona_id, r]));
}

/** Resume the in-progress conversation or start a new one (`fresh` forces new). */
export async function startPersonaSession(persona: Persona, studentId: number, mode: SessionMode, opts: { fresh?: boolean } = {}): Promise<PersonaSession> {
  if (!opts.fresh) {
    const existing = await query<PersonaSession>(
      `select * from persona_session where persona_id = $1 and student_id = $2 and mode = $3 and status = 'in_progress'
       order by started_at desc limit 1`,
      [persona.id, studentId, mode]
    );
    if (existing[0]) return existing[0];
  }
  const sessionId = await createSession(studentId, mode === 'preview' ? 'persona_preview' : 'persona');
  const rows = await query<PersonaSession>(
    `insert into persona_session (persona_id, student_id, session_id, mode) values ($1, $2, $3, $4) returning *`,
    [persona.id, studentId, sessionId, mode]
  );
  return rows[0]!;
}

export async function endPersonaSession(ps: PersonaSession): Promise<PersonaSession> {
  await endSession(ps.session_id);
  const rows = await query<PersonaSession>(
    `update persona_session set status = 'ended', ended_at = coalesce(ended_at, now()) where id = $1 returning *`,
    [ps.id]
  );
  return rows[0]!;
}

export function visibleTurns(turns: Turn[]): Turn[] {
  return turns.filter((t) => !t.content.startsWith(START_MARKER));
}

export { getSessionTurns };

export async function streamPersonaReply(params: {
  persona: Persona;
  scope: Scope;
  session: PersonaSession;
  studentName: string;
  userMessage: string;
  onChunk: (text: string) => void;
  attribution: Attribution;
}): Promise<{ assistantText: string; refused: boolean }> {
  const { persona, scope, session, studentName, userMessage, onChunk, attribution } = params;
  const sessionId = session.session_id;

  await appendTurn(sessionId, 'user', userMessage);
  const turns = await getSessionTurns(sessionId);

  // Merge consecutive same-role turns (the API requires alternation).
  const messages: Anthropic.MessageParam[] = [];
  for (const t of turns) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role && typeof prev.content === 'string') prev.content = `${prev.content}\n\n${t.content}`;
    else messages.push({ role: t.role, content: t.content });
  }
  // Cache the transcript prefix so the next turn re-reads it from cache.
  const last = messages[messages.length - 1];
  if (last && typeof last.content === 'string') {
    last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }];
  }

  const materials = await getMaterials(persona.material_ids, scope);
  const system = personaSystem(persona, materials, studentName);
  const model = modelFor(persona);

  const client = getAnthropic();
  const t0 = Date.now();
  const stream = client.messages.stream({ model, max_tokens: 1024, system, messages });

  let assistantText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      assistantText += event.delta.text;
      onChunk(event.delta.text);
    }
  }
  if (assistantText.trim()) await appendTurn(sessionId, 'assistant', assistantText);

  let refused = false;
  try {
    const final = await stream.finalMessage();
    refused = final.stop_reason === 'refusal';
    void recordApiCall({ ...attribution, endpoint: 'persona.turn', sessionId, model, usage: final.usage, durationMs: Date.now() - t0 });
  } catch {
    // stream errored mid-flight; the partial reply is already persisted
  }
  return { assistantText, refused };
}

// ─── Draft from existing instructions ───────────────────────────────────────

/** Accept a string or a list of strings (the model sometimes returns lines as an array). */
const textOrLines = (max: number) => z.preprocess(
  (v) => (Array.isArray(v) ? v.map((x) => String(x ?? '')).join('\n') : String(v ?? '')).trim().slice(0, max),
  z.string()
);

export const DraftPersona = z.object({
  title: textOrLines(160),
  subtitle: textOrLines(200),
  summary: textOrLines(1000),
  student_role: textOrLines(300),
  setting: textOrLines(300),
  student_brief: textOrLines(4000),
  character: textOrLines(12000),
  voice: textOrLines(4000),
  behaviour: textOrLines(8000),
  hidden: textOrLines(12000),
  guardrails: textOrLines(4000),
  historical_cutoff: textOrLines(60),
  objectives: textOrLines(2000),
  debrief_guidance: textOrLines(2000),
  opening: z.preprocess((v) => (String(v ?? '').toLowerCase().startsWith('persona') ? 'persona' : 'student'), z.enum(['student', 'persona'])),
  opening_line: textOrLines(2000),
});
export type DraftPersona = z.infer<typeof DraftPersona>;

export const DRAFT_MAX_CHARS = 120_000;

function draftSystemFor(template: PersonaTemplate): string {
  const spec = TEMPLATES[template];
  const fieldList = PERSONA_FIELD_KEYS.filter((k) => k !== 'raw_instructions').map((k) => `  "${k}": string`).join(',\n');
  return `You turn an instructor's existing persona instructions (for example a Custom GPT's instructions plus a profile or case file from its knowledge) into the structured fields of a persona authoring tool. The persona's template is "${spec.label}": ${spec.blurb}

Preserve the instructor's own wording, detail and intent wherever you can; do not embellish, summarise away specifics, or invent facts that are not in the text. Sort each piece of the input into the field it belongs to:
- title, subtitle, summary: what students see on the card. subtitle is one line (dates and place, or age and situation). summary is two or three sentences.
- student_role: who the student is in the activity. setting: where and how it happens.
- student_brief: guidance to the student on how to use the activity, in markdown, written to the student.
- character: identity, background, circumstances, worldview, ideas, history. Everything the persona plays openly.
- voice: tone, pace, vocabulary, typical phrases, non-verbal and environmental cues.
- behaviour: how the persona engages: what it leads with, how it responds to different conduct, information control, calibration of challenge and warmth.
- hidden: everything the student must not be told unprompted: cues and the follow-up layers behind them with their reveal conditions, hidden facts, and anything marked as to be uncovered. Keep the conditions. If the input has nothing of this kind, leave it empty.
- guardrails: rules and limits specific to this persona (never give medical advice, no grading, do not invent conditions, and so on).
- historical_cutoff: a year or date after which the persona knows nothing, if the input implies one; else empty.
- objectives: the learning objectives, one per line, if the input gives any.
- debrief_guidance: what the input says about the debrief or feedback after the conversation.
- opening: "persona" if the persona should speak first, else "student".
- opening_line: what the persona says to open, if the input specifies it.

The template already enforces its standing rules (staying in character, protecting the hidden layer, honesty about being an AI if asked, no fabricated quotations for thinkers, information control for simulated clients), so you may leave such boilerplate out of behaviour and guardrails and keep what is specific. Where the input names knowledge files or sources, mention them in character as sources the persona draws on; the instructor attaches the files separately.

Return ONLY a JSON object, no code fences, with exactly these keys (strings; empty string where the input gives nothing):
{
${fieldList}
}`;
}

export async function draftPersona(params: { text: string; template: PersonaTemplate; attribution: Attribution }): Promise<DraftPersona> {
  const source = params.text.trim().slice(0, DRAFT_MAX_CHARS);
  return jsonCall({
    schema: DraftPersona,
    system: draftSystemFor(params.template),
    userPrompt: `The instructor's existing instructions and materials follow. Sort them into the fields now.\n\n<instructions>\n${source}\n</instructions>`,
    maxTokens: 8000,
    attribution: params.attribution,
    endpoint: 'persona.draft',
  });
}
