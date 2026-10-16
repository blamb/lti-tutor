/**
 * Personas: the structured character an instructor designs, the prompt it
 * becomes, the conversations students have with it, and the AI draft that
 * turns an existing prompt (a Custom GPT's instructions and knowledge
 * profile, say) into the structured fields.
 *
 * Prompt order, for caching: template rules (one fixed string) → sources
 * (cached) → persona + student (cached) → nothing volatile. A turn
 * mid-conversation re-reads everything but the transcript tail from cache.
 *
 * Grounding: when the attached materials are short they go into the cached
 * sources block whole. When they are long (a thinker's collected works),
 * only their titles go there, and each turn retrieves the passages that
 * match what the student just said (core/chunks.ts) and places them in
 * that turn's user message, so the cached prefix is untouched. Quotations in
 * the reply are then checked against the full sources (core/quotes.ts).
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { randomBytes, createHmac } from 'node:crypto';
import { query } from '../../core/db.js';
import { getAnthropic } from '../../core/anthropic.js';
import { recordApiCall, MODEL_PRICES, type Attribution } from '../../core/costs.js';
import { GEN_MODEL } from '../../core/anthropic.js';
import { textOf } from '../../core/llm.js';
import type { GradeResult } from '../../core/grades.js';
import { jsonCall } from '../../core/llm.js';
import { standaloneHtml } from '../../core/document.js';
import { getMaterials, type Material, type Scope } from '../../core/materials.js';
import { appendTurn, getSessionTurns, createSession, endSession, type Turn } from '../../core/conversations.js';
import { GROUNDING_MAX_CHARS } from '../../core/limits.js';
import { searchPassages, ensureChunks, type Passage } from '../../core/chunks.js';
import { checkQuotes, type QuoteCheck } from '../../core/quotes.js';
import { env } from './env.js';
import {
  TEMPLATES, PERSONA_TEMPLATES, RESPONSE_LENGTHS, RESPONSE_LENGTH_NOTES, PERSONA_FIELD_KEYS,
  type PersonaTemplate, type ResponseLength,
} from './templates.js';

export type { Scope };

// ─── Types ──────────────────────────────────────────────────────────────────

export type PersonaStatus = 'draft' | 'published' | 'archived';
export type Opening = 'student' | 'persona';
export const VOICE_PREFS = ['auto', 'feminine', 'masculine'] as const;
export const VISIBILITIES = ['lti', 'passcode', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type VoicePref = (typeof VOICE_PREFS)[number];

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
  /** Which installed voice reads the persona aloud. */
  voice_pref: VoicePref;
  /** Whether students may step out and ask the coach mid-conversation. */
  coach: 'on' | 'off';
  /** Post completion (1/1) to the gradebook when a live conversation ends. */
  gradebook: boolean;
  /** Who may reach the persona beyond the course launch. */
  visibility: Visibility;
  public_slug: string;
  /** HMAC of the passcode; '' when none is set. */
  passcode_hash: string;
  public_daily_usd: number;
  public_max_turns: number;
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

/**
 * Output budget for one reply. The 5.x models think before answering and
 * that thinking counts against max_tokens, so the cap is well above the
 * length of any reply; low effort keeps the thinking short for conversation.
 */
export const TURN_MAX_TOKENS = 4096;

export function turnOptionsFor(model: string): { output_config?: { effort: 'low' } } {
  return /-5(-\d+)?$/.test(model) ? { output_config: { effort: 'low' } } : {};
}

const text = (max: number) => z.string().trim().max(max).default('');
const blankToUndefined = (v: unknown) => (v === '' || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v);

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
  voice_pref: z.enum(VOICE_PREFS).default('auto'),
  coach: z.enum(['on', 'off']).default('on'),
  gradebook: z.boolean().default(false),
  visibility: z.enum(VISIBILITIES).default('lti'),
  /** Write-only: a new passcode to set; empty leaves the stored one. */
  passcode: z.string().trim().max(80).default(''),
  // A blank field means "the default", never zero: an empty cap of 0 would silently close a public link.
  public_daily_usd: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1000).default(2)),
  public_max_turns: z.preprocess(blankToUndefined, z.coerce.number().int().min(4).max(200).default(40)),
  model: z.string().trim().max(60).default('').refine((m) => m === '' || isKnownModel(m), 'unknown model'),
  material_ids: z.array(z.number().int().positive()).max(40).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});
export type PersonaInput = z.infer<typeof PersonaInput>;

/** What the designer sees: everything but the passcode hash, plus the public link and whether a passcode is set. */
export function designerPersona(p: Persona) {
  const { passcode_hash, ...rest } = p;
  return { ...rest, has_passcode: !!passcode_hash, public_url: publicUrlFor(p) };
}

/** What a student may see of a persona: the card and the pre-brief, never the character or the hidden layer. */
export function publicPersona(p: Persona) {
  return {
    id: p.id, template: p.template, title: p.title, subtitle: p.subtitle, summary: p.summary,
    student_role: p.student_role, setting: p.setting, student_brief: p.student_brief,
    opening: p.opening, status: p.status, objectives: p.objectives, voice_pref: p.voice_pref, coach: p.coach,
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
  'response_length', 'voice_pref', 'coach', 'gradebook', 'visibility', 'public_daily_usd', 'public_max_turns', 'model', 'material_ids', 'status',
] as const;

export async function createPersona(scope: Scope, input: PersonaInput, createdBy: number | null): Promise<Persona> {
  const values = { ...input, material_ids: await validMaterialIds(input.material_ids, scope) };
  const params = COLUMNS.map((c) => values[c]);
  const rows = await query<Persona>(
    `insert into persona (lti_iss, lti_context_id, ${COLUMNS.join(', ')}, created_by)
     values ($1, $2, ${COLUMNS.map((_, i) => `$${i + 3}`).join(', ')}, $${COLUMNS.length + 3}) returning *`,
    [scope.iss, scope.contextId, ...params, createdBy]
  );
  return applyAccess(rows[0]!, input);
}

/** A slug once the persona leaves the LMS, and the passcode's HMAC when one is given. Both survive later edits. */
async function applyAccess(p: Persona, input: PersonaInput): Promise<Persona> {
  const slug = p.public_slug || (p.visibility !== 'lti' ? randomBytes(9).toString('base64url') : '');
  const hash = input.passcode ? passcodeHash(input.passcode) : p.passcode_hash;
  if (slug === p.public_slug && hash === p.passcode_hash) return p;
  const rows = await query<Persona>(`update persona set public_slug = $2, passcode_hash = $3 where id = $1 returning *`, [p.id, slug, hash]);
  return rows[0]!;
}

export function passcodeHash(passcode: string): string {
  return createHmac('sha256', env.TOKEN_SECRET || env.LTI_COOKIE_SECRET).update(`passcode:${passcode.trim()}`).digest('base64url');
}

export function publicUrlFor(p: Pick<Persona, 'public_slug' | 'visibility'>): string {
  return p.visibility !== 'lti' && p.public_slug ? `${env.LTI_TOOL_URL}/p/${p.public_slug}` : '';
}

export async function getPersonaBySlug(slug: string): Promise<Persona | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) return null;
  const rows = await query<Persona>(`select * from persona where public_slug = $1 and visibility <> 'lti' and status = 'published'`, [slug]);
  return rows[0] ?? null;
}

export async function updatePersona(id: number, scope: Scope, input: PersonaInput): Promise<Persona | null> {
  const values = { ...input, material_ids: await validMaterialIds(input.material_ids, scope) };
  const params = COLUMNS.map((c) => values[c]);
  const rows = await query<Persona>(
    `update persona set ${COLUMNS.map((c, i) => `${c} = $${i + 4}`).join(', ')}, updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning *`,
    [id, scope.iss, scope.contextId, ...params]
  );
  return rows[0] ? applyAccess(rows[0], input) : null;
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

/** Materials up to this many characters in total go into the prompt whole; beyond it, passages are retrieved per turn. */
export const STUFF_MAX_CHARS = 80_000;
/** The character budget for retrieved passages in one turn. */
export const PASSAGE_BUDGET_CHARS = 14_000;
/** The longest body a persona material may hold (uploads, course imports); retrieval makes long sources usable. */
export const PERSONA_MATERIAL_MAX_CHARS = 1_500_000;

export type GroundingMode = 'none' | 'stuff' | 'retrieve';

export function groundingModeFor(materials: Pick<Material, 'body'>[]): GroundingMode {
  if (materials.length === 0) return 'none';
  const total = materials.reduce((n, m) => n + m.body.length, 0);
  return total <= STUFF_MAX_CHARS ? 'stuff' : 'retrieve';
}

/** When retrieving, the cached sources block lists what exists and says how passages arrive. */
export function sourcesIndexBlock(materials: Material[]): string {
  const list = materials.map((m) => `- ${m.title}${m.license ? ` (licence: ${m.license})` : ''}`).join('\n');
  return `# SOURCES (provided by the instructor)
These sources are attached but too long to include whole:
${list}

The passages from them that best match each turn are supplied with the student's message under "PASSAGES FROM THE SOURCES". They are notes for you alone: the student cannot see them, so never refer to passages, excerpts or notes, or to being given or pointed to anything; speak from them as from your own memory and reading. Draw on those passages first; what is not in them you may know from general knowledge, but say so when it matters. Quote verbatim only from a supplied passage or wording you are certain of; otherwise paraphrase. Never cite a passage the student would not find in these sources.`;
}

export function passagesBlock(passages: Passage[], titles: Map<number, string>): string {
  if (passages.length === 0) return '';
  const parts = ['PASSAGES FROM THE SOURCES (notes for you alone, retrieved for this turn). The student cannot see them and does not know they exist: never mention passages, excerpts, notes, or being pointed to or given anything. Speak from them as from your own memory and reading.'];
  for (const p of passages) parts.push(`\n## ${titles.get(p.material_id) ?? 'Source'}\n${p.body}`);
  return parts.join('\n');
}

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

export function personaSystem(p: Persona, materials: Material[], studentName: string, mode: GroundingMode = groundingModeFor(materials)): Anthropic.TextBlockParam[] {
  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: TEMPLATES[p.template].rules }];
  const sources = mode === 'retrieve' ? sourcesIndexBlock(materials) : mode === 'stuff' ? sourcesBlock(materials) : null;
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
  debrief: PersonaDebrief | null;
  coach_session_id: number | null;
  debrief_generated_at: string | null;
  reflection: string;
  reflection_at: string | null;
  grade_posted_at: string | null;
  grade_error: string | null;
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
}): Promise<{ assistantText: string; refused: boolean; quotes: QuoteCheck | null; passages: number }> {
  const { persona, scope, session, studentName, userMessage, onChunk, attribution } = params;
  const sessionId = session.session_id;

  await appendTurn(sessionId, 'user', userMessage);
  const turns = await getSessionTurns(sessionId);
  const materials = await getMaterials(persona.material_ids, scope);
  const mode = groundingModeFor(materials);

  // Retrieval: the passages that match this turn, on the student's words
  // first and, if that finds little, on the persona's last reply as well.
  let passages: Passage[] = [];
  if (mode === 'retrieve' && !userMessage.startsWith(START_MARKER)) {
    const ids = materials.map((m) => m.id);
    await ensureChunks(ids);
    passages = await searchPassages(ids, userMessage, { budgetChars: PASSAGE_BUDGET_CHARS });
    if (passages.length < 2) {
      const lastReply = [...turns].reverse().find((t) => t.role === 'assistant')?.content ?? '';
      if (lastReply) passages = await searchPassages(ids, `${userMessage}\n${lastReply}`, { budgetChars: PASSAGE_BUDGET_CHARS });
    }
  }

  // Merge consecutive same-role turns (the API requires alternation).
  const messages: Anthropic.MessageParam[] = [];
  for (const t of turns) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role && typeof prev.content === 'string') prev.content = `${prev.content}\n\n${t.content}`;
    else messages.push({ role: t.role, content: t.content });
  }
  // Retrieved passages ride in this turn's user message only, so earlier
  // turns keep their exact text and the cached prefix holds. Then cache the
  // transcript prefix so the next turn re-reads it from cache.
  const last = messages[messages.length - 1];
  if (last && typeof last.content === 'string') {
    const titles = new Map(materials.map((m) => [m.id, m.title]));
    const text = passages.length > 0 ? `${passagesBlock(passages, titles)}\n\n---\nThe student says:\n${last.content}` : last.content;
    last.content = [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
  }

  const system = personaSystem(persona, materials, studentName, mode);
  const model = modelFor(persona);

  const client = getAnthropic();
  const t0 = Date.now();
  const stream = client.messages.stream({ model, max_tokens: TURN_MAX_TOKENS, system, messages, ...turnOptionsFor(model) });

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
  const quotes = materials.length > 0 && assistantText ? checkQuotes(assistantText, materials) : null;
  return { assistantText, refused, quotes, passages: passages.length };
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

// ─── The debrief ────────────────────────────────────────────────────────────
//
// Written by a separate call, not by the persona: a coach's voice, judging
// the conversation against the instructor's objectives, with the hidden
// layer in view so it can say what was elicited and what was left on the
// table. Stored on the session; regenerated only if the instructor clears it.

const lines = (max: number) => z.preprocess(
  (v) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean)).slice(0, max),
  z.array(z.string().max(600))
);

export const PersonaDebrief = z.object({
  overview: z.string().trim().max(2500),
  by_objective: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({
    objective: z.string().trim().max(300),
    observation: z.string().trim().max(1200),
  })).max(12)),
  strengths: lines(8),
  explore_further: lines(8),
  one_question: z.string().trim().max(600).default(''),
});
export type PersonaDebrief = z.infer<typeof PersonaDebrief>;

function transcriptText(turns: Turn[], studentName: string, personaName: string): string {
  return visibleTurns(turns).map((t) => `${t.role === 'user' ? studentName : personaName}: ${t.content}`).join('\n\n');
}

function debriefSystemFor(p: Persona): string {
  const spec = TEMPLATES[p.template];
  const objectives = p.objectives.split('\n').map((s) => s.trim()).filter(Boolean);
  return `You write the debrief after ${spec.debriefFrame}. You are not the persona; you write as a supportive, observant coach, to the student by first name. The student's role: ${p.student_role || 'a student'}. Setting: ${p.setting || 'unspecified'}.

Judge the conversation that actually happened, with examples from it, against these learning objectives:
${objectives.length ? objectives.map((o, i) => `${i + 1}. ${o}`).join('\n') : '(the instructor set no explicit objectives; judge the quality of the student\'s questions and thinking)'}

${p.hidden.trim() ? `What the persona was holding back (the student never saw this; use it to say what they drew out and what they could have reached with a better question):\n${p.hidden}\n` : ''}
${p.debrief_guidance.trim() ? `The instructor's guidance for this debrief:\n${p.debrief_guidance}\n` : ''}
Never assign grades, scores, percentages or predictions of marks. Be specific and honest; praise only what the transcript supports. Where the student did not reach something, say what question or approach would have reached it, without lecturing.

Return ONLY a JSON object, no code fences, with exactly these keys:
{
  "overview": "3 to 5 sentences on how the conversation went, addressed to the student",
  "by_objective": [{ "objective": "the objective, short", "observation": "1 to 3 sentences with an example from the conversation" }],
  "strengths": ["up to 5 specific things the student did well"],
  "explore_further": ["up to 5 cues, topics or moves the student could have pursued, each tied to the conversation"],
  "one_question": "one question for the student to carry away"
}`;
}

export async function getOrGenerateDebrief(params: { persona: Persona; session: PersonaSession; studentName: string; attribution: Attribution }): Promise<PersonaDebrief> {
  const { persona, session, studentName, attribution } = params;
  if (session.debrief) return session.debrief;
  const turns = await getSessionTurns(session.session_id);
  const transcript = transcriptText(turns, studentName, persona.title);
  const debrief = await jsonCall({
    schema: PersonaDebrief,
    system: debriefSystemFor(persona),
    userPrompt: `Student's first name: ${studentName.split(' ')[0] || 'the student'}\n\nTranscript:\n${transcript || '(the student said nothing)'}\n\nWrite the debrief JSON now.`,
    maxTokens: 3000,
    attribution: { ...attribution, endpoint: 'persona.debrief' },
    endpoint: 'persona.debrief',
  });
  await query(`update persona_session set debrief = $2::jsonb, debrief_generated_at = now() where id = $1`, [session.id, JSON.stringify(debrief)]);
  return debrief;
}

export async function saveReflection(sessionId: number, text: string): Promise<void> {
  await query(`update persona_session set reflection = $2, reflection_at = now() where id = $1`, [sessionId, text.trim().slice(0, 2000)]);
}

// ─── The coach: stepping out of the conversation ────────────────────────────
//
// A separate voice the student can turn to mid-conversation: "what should I
// ask next?", "is this going anywhere?". It sees the pre-brief, the
// objectives and the transcript so far, never the hidden layer, and it
// answers with questions and options rather than scripts. Its own exchanges
// live in a second session so they never enter the persona's transcript.

function coachSystemFor(p: Persona): string {
  const spec = TEMPLATES[p.template];
  const objectives = p.objectives.split('\n').map((s) => s.trim()).filter(Boolean);
  return `You are a coach sitting beside a student during ${spec.debriefFrame}. The student has stepped out of the conversation for a moment to think with you; the persona cannot hear this.

The student's role: ${p.student_role || 'a student'}. Setting: ${p.setting || 'unspecified'}.
${objectives.length ? `What the activity is for:\n${objectives.map((o) => `- ${o}`).join('\n')}\n` : ''}${p.student_brief.trim() ? `The instructor's guidance to the student:\n${p.student_brief}\n` : ''}
You see the transcript so far. Help the student think about what to ask or try next: name what they have covered and what they have not, suggest two or three directions as questions they could put in their own words, and point out habits worth changing (closed questions, leading questions, skipping consent, agreeing too quickly, not following up a cue). Do not play the persona, do not invent facts about the persona, and do not reveal or guess what the persona may be holding back: say that finding it out is the student's job and suggest how. Two to five sentences, plain and warm, no headings or bullet lists unless listing options. If the student asks you to do the activity for them, decline briefly and hand it back.`;
}

export async function ensureCoachSession(ps: PersonaSession): Promise<number> {
  if (ps.coach_session_id) return ps.coach_session_id;
  const id = await createSession(ps.student_id, 'persona_coach');
  await query(`update persona_session set coach_session_id = $2 where id = $1 and coach_session_id is null`, [ps.id, id]);
  const rows = await query<{ coach_session_id: number }>(`select coach_session_id from persona_session where id = $1`, [ps.id]);
  return rows[0]!.coach_session_id;
}

export async function streamCoachReply(params: {
  persona: Persona;
  session: PersonaSession;
  studentName: string;
  question: string;
  onChunk: (text: string) => void;
  attribution: Attribution;
}): Promise<{ assistantText: string }> {
  const { persona, session, studentName, question, onChunk, attribution } = params;
  const coachId = await ensureCoachSession(session);
  await appendTurn(coachId, 'user', question);
  const coachTurns = await getSessionTurns(coachId);
  const transcript = transcriptText(await getSessionTurns(session.session_id), studentName, persona.title);

  const messages: Anthropic.MessageParam[] = [];
  for (const t of coachTurns) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role && typeof prev.content === 'string') prev.content = `${prev.content}\n\n${t.content}`;
    else messages.push({ role: t.role, content: t.content });
  }
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: coachSystemFor(persona), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `The conversation so far (the student is ${studentName}):\n\n${transcript || '(nothing yet)'}` },
  ];
  const model = modelFor(persona);
  const client = getAnthropic();
  const t0 = Date.now();
  const stream = client.messages.stream({ model, max_tokens: TURN_MAX_TOKENS, system, messages, ...turnOptionsFor(model) });
  let assistantText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') { assistantText += event.delta.text; onChunk(event.delta.text); }
  }
  if (assistantText.trim()) await appendTurn(coachId, 'assistant', assistantText);
  try {
    const final = await stream.finalMessage();
    void recordApiCall({ ...attribution, endpoint: 'persona.coach', sessionId: session.session_id, model, usage: final.usage, durationMs: Date.now() - t0 });
  } catch { /* partial reply already persisted */ }
  return { assistantText };
}

export async function coachTurnsFor(ps: PersonaSession): Promise<Turn[]> {
  return ps.coach_session_id ? getSessionTurns(ps.coach_session_id) : [];
}

// ─── Transcript export ──────────────────────────────────────────────────────

export function debriefMarkdown(d: PersonaDebrief): string {
  const parts = ['## Debrief', d.overview];
  if (d.by_objective.length) { parts.push('\n### By objective'); for (const o of d.by_objective) parts.push(`- **${o.objective}** ${o.observation}`); }
  if (d.strengths.length) { parts.push('\n### What went well'); for (const x of d.strengths) parts.push(`- ${x}`); }
  if (d.explore_further.length) { parts.push('\n### Worth exploring further'); for (const x of d.explore_further) parts.push(`- ${x}`); }
  if (d.one_question) parts.push(`\n### One question to carry away\n${d.one_question}`);
  return parts.join('\n');
}

export function transcriptMarkdown(p: Persona, ps: PersonaSession, turns: Turn[], studentName: string): string {
  const when = new Date(ps.started_at).toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' });
  const parts = [`# ${p.title}`, p.subtitle ? `*${p.subtitle}*` : '', `${studentName} · ${when}${ps.mode === 'preview' ? ' · preview' : ''}`, ''];
  if (p.student_role || p.setting) parts.push(`**You were:** ${p.student_role || '—'}  \n**Setting:** ${p.setting || '—'}`, '');
  parts.push('## Conversation');
  for (const t of visibleTurns(turns)) parts.push(`**${t.role === 'user' ? studentName : p.title}:** ${t.content}`, '');
  if (ps.debrief) parts.push(debriefMarkdown(ps.debrief), '');
  if (ps.reflection) parts.push('## Your reflection', ps.reflection, '');
  return parts.join('\n');
}

export function transcriptHtml(p: Persona, ps: PersonaSession, turns: Turn[], studentName: string, toolName: string): string {
  return standaloneHtml({
    title: `${p.title} · ${studentName}`,
    markdown: transcriptMarkdown(p, ps, turns, studentName),
    footer: `Exported from ${toolName}. The persona is an AI playing a part for a learning activity; check anything you rely on against the course's sources.`,
  });
}

// ─── Completion and the instructor's report ─────────────────────────────────

export async function recordGradeResult(sessionId: number, result: GradeResult): Promise<void> {
  await query(`update persona_session set grade_posted_at = case when $2 then now() else grade_posted_at end, grade_error = $3 where id = $1`,
    [sessionId, result.posted, result.posted ? null : (result.error ?? null)]);
}

export interface ReportRow {
  session_id: number;
  student_id: number;
  display_name: string;
  status: 'in_progress' | 'ended';
  started_at: string;
  ended_at: string | null;
  turns: number;
  coach_turns: number;
  debrief: PersonaDebrief | null;
  reflection: string;
  grade_posted_at: string | null;
  grade_error: string | null;
  /** 'lti' for course launches, 'web' for visitors through the link. */
  via: 'lti' | 'web';
}

export interface PersonaReport {
  rows: ReportRow[];
  totals: { started: number; ended: number; with_debrief: number; with_reflection: number; avg_turns: number | null; grade_posted: number; students: number };
  synthesis: { markdown: string; runs: number; generated_at: string } | null;
}

/** Every live conversation with this persona (previews never count), newest first. */
export async function getPersonaReport(persona: Persona): Promise<PersonaReport> {
  const rows = await query<ReportRow>(
    `select ps.id as session_id, ps.student_id, st.display_name, ps.status, ps.started_at::text, ps.ended_at::text,
            ps.debrief, ps.reflection, ps.grade_posted_at::text, ps.grade_error, case when st.lti_iss = 'public' then 'web' else 'lti' end as via,
            (select count(*)::int from tutor_turn t where t.session_id = ps.session_id and t.role = 'user' and t.content not like $2) as turns,
            (select count(*)::int from tutor_turn t where ps.coach_session_id is not null and t.session_id = ps.coach_session_id and t.role = 'user') as coach_turns
     from persona_session ps join student st on st.id = ps.student_id
     where ps.persona_id = $1 and ps.mode = 'live'
     order by ps.started_at desc`,
    [persona.id, START_MARKER + '%']
  );
  const ended = rows.filter((r) => r.status === 'ended');
  const synth = await query<{ markdown: string; runs: number; generated_at: string }>(`select markdown, runs, generated_at::text from persona_report where persona_id = $1`, [persona.id]);
  return {
    rows,
    totals: {
      started: rows.length,
      ended: ended.length,
      with_debrief: rows.filter((r) => r.debrief).length,
      with_reflection: rows.filter((r) => r.reflection).length,
      avg_turns: rows.length ? Math.round((rows.reduce((n, r) => n + r.turns, 0) / rows.length) * 10) / 10 : null,
      grade_posted: rows.filter((r) => r.grade_posted_at).length,
      students: new Set(rows.map((r) => r.student_id)).size,
    },
    synthesis: synth[0] ?? null,
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per conversation. */
export function reportCsv(report: PersonaReport): string {
  const head = ['session', 'student', 'via', 'status', 'started', 'ended', 'turns', 'coach_questions', 'debrief_overview', 'strengths', 'explore_further', 'reflection', 'grade'];
  const lines = [head.join(',')];
  for (const r of report.rows) {
    lines.push([
      r.session_id, r.display_name, r.via, r.status, r.started_at, r.ended_at ?? '', r.turns, r.coach_turns,
      r.debrief?.overview ?? '', (r.debrief?.strengths ?? []).join(' | '), (r.debrief?.explore_further ?? []).join(' | '),
      r.reflection, r.grade_posted_at ? 'posted' : (r.grade_error ?? ''),
    ].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

export async function instructorConversation(persona: Persona, sessionId: number): Promise<{ session: PersonaSession; display_name: string; turns: Turn[]; coach_turns: Turn[] } | null> {
  const rows = await query<PersonaSession & { display_name: string }>(
    `select ps.*, st.display_name from persona_session ps join student st on st.id = ps.student_id where ps.id = $1 and ps.persona_id = $2`,
    [sessionId, persona.id]
  );
  const ps = rows[0];
  if (!ps) return null;
  return { session: ps, display_name: ps.display_name, turns: visibleTurns(await getSessionTurns(ps.session_id)), coach_turns: await coachTurnsFor(ps) };
}

/** A synthesis across the ended conversations' debriefs and reflections, written for the instructor. */
export async function generatePersonaSynthesis(persona: Persona, attribution: Attribution): Promise<{ markdown: string; runs: number; generated_at: string }> {
  const report = await getPersonaReport(persona);
  const runs = report.rows.filter((r) => r.status === 'ended' && r.debrief);
  if (runs.length === 0) throw new Error('No ended conversations with a debrief yet. The synthesis reads the debriefs.');
  const spec = TEMPLATES[persona.template];
  const objectives = persona.objectives.split('\n').map((s) => s.trim()).filter(Boolean);
  const evidence = runs.map((r, i) => {
    const d = r.debrief!;
    return `### Conversation ${i + 1} (${r.turns} student turns)\nOverview: ${d.overview}\n${d.by_objective.map((o) => `- ${o.objective}: ${o.observation}`).join('\n')}\nStrengths: ${d.strengths.join('; ')}\nExplore further: ${d.explore_further.join('; ')}${r.reflection ? `\nStudent's reflection: ${r.reflection}` : ''}`;
  }).join('\n\n');
  const system = `You read the debriefs of ${runs.length} conversation${runs.length === 1 ? '' : 's'} students had with the persona "${persona.title}" in ${spec.debriefFrame}, and write a synthesis for the instructor who designed it. Never name students. Count in words ("most", "about half", "two of the seven"). Be concrete: quote the kind of move or question, not generalities. Each conversation's student-turn count is given: where conversations were very short (a few turns), say so plainly and draw only the conclusions that short exchanges can support, rather than reading more into the debriefs than the transcripts could hold. Do not add a title; start with the first heading.

Learning objectives:
${objectives.length ? objectives.map((o) => `- ${o}`).join('\n') : '(none set)'}

Write markdown of at most 500 words with exactly these headings:
## What students did well
## Where most left gaps
(by objective, with what they tended to miss)
## Three moves worth teaching before the next run
(concrete techniques, each tied to what the debriefs show)
## Adjustments to the persona or the brief
(wording in the pre-brief, the hidden layer, the objectives, the opening: what would make the activity work better, and what to leave alone)
## In students' own words
(themes from their reflections; if there are none, say so in one line)`;
  const client = getAnthropic();
  const t0 = Date.now();
  const res = await client.messages.create({ model: GEN_MODEL, max_tokens: 2500, system, messages: [{ role: 'user', content: `${evidence}\n\nWrite the synthesis now.` }] });
  void recordApiCall({ ...attribution, endpoint: 'persona.synthesis', model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0 });
  const markdown = textOf(res);
  const rows = await query<{ markdown: string; runs: number; generated_at: string }>(
    `insert into persona_report (persona_id, markdown, runs) values ($1, $2, $3)
     on conflict (persona_id) do update set markdown = excluded.markdown, runs = excluded.runs, generated_at = now()
     returning markdown, runs, generated_at::text`,
    [persona.id, markdown, runs.length]
  );
  return rows[0]!;
}

// ─── Web visitors: spend and turn limits ────────────────────────────────────

export const PUBLIC_ISS = 'public';
export const PUBLIC_SESSIONS_PER_DAY = 5;

/** USD spent in the last 24 hours on this persona's web conversations. */
export async function publicSpendToday(personaId: number): Promise<number> {
  const rows = await query<{ usd: string }>(
    `select coalesce(sum(a.cost_usd), 0)::text as usd from api_call a
     where a.ts > now() - interval '24 hours' and a.lti_iss = $2
       and a.session_id in (select ps.session_id from persona_session ps where ps.persona_id = $1
                            union select ps.coach_session_id from persona_session ps where ps.persona_id = $1 and ps.coach_session_id is not null)`,
    [personaId, PUBLIC_ISS]
  );
  return parseFloat(rows[0]?.usd ?? '0');
}

export async function studentTurnCount(sessionId: number): Promise<number> {
  const rows = await query<{ n: number }>(`select count(*)::int as n from tutor_turn where session_id = $1 and role = 'user' and content not like $2`, [sessionId, START_MARKER + '%']);
  return rows[0]?.n ?? 0;
}

export async function visitorSessionsToday(personaId: number, studentId: number): Promise<number> {
  const rows = await query<{ n: number }>(`select count(*)::int as n from persona_session where persona_id = $1 and student_id = $2 and started_at > now() - interval '24 hours'`, [personaId, studentId]);
  return rows[0]?.n ?? 0;
}
