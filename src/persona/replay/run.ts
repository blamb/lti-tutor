/**
 * Persona replay harness: plays the saved student scripts against their
 * personas with the real model, writes the debrief, and checks items 1–7 of
 * the October usability report. Run it after every prompt or model change:
 *
 *   npm run replay:persona                 all scripts and probes
 *   npm run replay:persona -- patient      only scripts and probes whose id contains "patient"
 *   npm run replay:persona -- --no-db      skip the debrief-state check that needs Postgres
 *
 * Output goes to replays/<timestamp>/: per script a .json (transcript,
 * debrief, timings, checks) and a readable .md, plus summary.md. The exit
 * code is 1 when any check fails.
 *
 * The persona turn is built by personaTurnRequest() and the debrief by
 * generateDebrief(), the same functions a live conversation uses, so a
 * replay sends exactly what production sends. Models default to the
 * deployment defaults (Haiku 5.5), whatever the local .env pins; set
 * REPLAY_PERSONA_MODEL / REPLAY_GEN_MODEL to try another.
 *
 * Model replies vary: one replay is evidence, not proof. Checks that sample
 * (consistency, technique) run several fresh sessions.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.APP = 'persona';
process.env.PERSONA_MODEL = process.env.REPLAY_PERSONA_MODEL || 'claude-haiku-5-5';
process.env.GEN_MODEL = process.env.REPLAY_GEN_MODEL || 'claude-haiku-5-5';
process.env.LTI_TOOL_URL ||= 'http://localhost:3001';
process.env.LTI_COOKIE_SECRET ||= 'replay';
process.env.DATABASE_URL = process.env.REPLAY_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/persona_chat_dev';

const { getAnthropic } = await import('../../core/anthropic.js');
const { PersonaInput, personaTurnRequest, coachSystemFor, START_MARKER, createPersona, startPersonaSession, endPersonaSession, deletePersona } = await import('../server/personas.js');
const { generateDebrief, requestDebrief, debriefStatus, debriefMarkdown, objectivesOf } = await import('../server/debrief.js');
const { hasEndIntent, splitNotes, personaWords, wordCount } = await import('../server/signals.js');
const { ageOn, caseRecordOf, caseFileBlock } = await import('../server/casefile.js');
const { factSheetOf, factSheetBlock } = await import('../server/factsheet.js');
const { checkReplyQuotes } = await import('../server/personas.js');
const { query, pool } = await import('../../core/db.js');
const { appendTurn } = await import('../../core/conversations.js');
type Persona = import('../server/personas.js').Persona;
type PersonaDebrief = import('../server/debrief.js').PersonaDebrief;

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const useDb = !args.includes('--no-db');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(HERE, '..', '..', '..', 'replays', stamp);
mkdirSync(OUT, { recursive: true });

// ─── Fixtures ───────────────────────────────────────────────────────────────

interface Script { id: string; run?: number; persona: string; kind?: string; note: string; turns: string[] }
interface Recorded { id: string; persona: string; note: string; turns: { role: 'user' | 'assistant'; content: string }[]; stored_debrief?: string }
type T = { role: 'user' | 'assistant'; content: string };

function loadPersona(name: string, id: number): Persona {
  const parsed = PersonaInput.parse(JSON.parse(readFileSync(join(HERE, 'personas', `${name}.json`), 'utf8')));
  const { passcode: _p, ...rest } = parsed;
  return { id, lti_iss: 'replay', lti_context_id: 'replay', created_by: null, created_at: '', updated_at: '', public_slug: '', passcode_hash: '', ...rest };
}
const PERSONAS: Record<string, Persona> = Object.fromEntries(
  readdirSync(join(HERE, 'personas')).filter((f) => f.endsWith('.json')).sort().map((f, i) => [f.replace(/\.json$/, ''), loadPersona(f.replace(/\.json$/, ''), i + 1)])
);
const scriptFiles = readdirSync(join(HERE, 'scripts')).filter((f) => f.endsWith('.json')).sort();
const all = scriptFiles.map((f) => JSON.parse(readFileSync(join(HERE, 'scripts', f), 'utf8')) as Script & Partial<Recorded>);
const scripts = all.filter((s) => typeof s.turns[0] === 'string' && s.id.includes(filter)) as Script[];
const recorded = all.filter((s) => typeof s.turns[0] === 'object' && s.id.includes(filter)) as unknown as Recorded[];

// ─── Checks ─────────────────────────────────────────────────────────────────

interface Check { item: number; name: string; pass: boolean; detail: string; where: string }
const checks: Check[] = [];
function check(item: number, where: string, name: string, pass: boolean, detail = ''): void {
  checks.push({ item, where, name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} [${item}] ${where}: ${name}${detail ? ` (${detail})` : ''}`);
}
const ATTR = { endpoint: 'persona.replay', iss: 'replay', contextId: 'replay' };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };

// ─── One persona turn, streamed, timed ──────────────────────────────────────

interface Timing { first_text_ms: number; total_ms: number }
async function personaReply(persona: Persona, turns: T[]): Promise<{ text: string; timing: Timing }> {
  const req = personaTurnRequest({ persona, materials: [], turns });
  const t0 = Date.now();
  let first = 0;
  let text = '';
  const stream = getAnthropic().messages.stream(req);
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { if (!first) first = Date.now() - t0; text += ev.delta.text; }
  }
  return { text, timing: { first_text_ms: first, total_ms: Date.now() - t0 } };
}

/** A whole conversation from student lines. Stops at an end request, as the page does, keeping it as the last turn. */
async function converse(persona: Persona, lines: string[]): Promise<{ turns: T[]; timings: Timing[]; endedAt: number | null; flagged: number[] }> {
  const turns: T[] = [];
  const timings: Timing[] = [];
  const flagged: number[] = [];
  let endedAt: number | null = null;
  const api: T[] = [];
  if (persona.opening === 'persona') {
    api.push({ role: 'user', content: `${START_MARKER}\nThe student has just arrived. Begin.` });
    const r = await personaReply(persona, api);
    api.push({ role: 'assistant', content: r.text }); turns.push({ role: 'assistant', content: r.text }); timings.push(r.timing);
  }
  for (const [i, line] of lines.entries()) {
    if (hasEndIntent(line)) {
      flagged.push(i);
      if (endedAt === null) { endedAt = i; turns.push({ role: 'user', content: line }); break; }
    }
    api.push({ role: 'user', content: line }); turns.push({ role: 'user', content: line });
    const r = await personaReply(persona, api);
    api.push({ role: 'assistant', content: r.text }); turns.push({ role: 'assistant', content: r.text }); timings.push(r.timing);
  }
  return { turns, timings, endedAt, flagged };
}

// ─── Debrief checks shared by replays ───────────────────────────────────────

function checkDebriefShape(where: string, persona: Persona, d: PersonaDebrief, n: number): void {
  const claims = [...d.overview, ...d.strengths, ...d.explore_further, ...d.critical_issues];
  check(3, where, 'every claim carries a turn reference in range', claims.every((c) => c.turns.length > 0 && c.turns.every((t) => t >= 1 && t <= n)), `${claims.length} claims, ${n} turns`);
  const objectives = objectivesOf(persona);
  check(3, where, 'objectives graded are the configured ones, by exact name', d.by_objective.every((o) => objectives.includes(o.objective)), d.by_objective.map((o) => o.objective).join('; '));
}

// The run-2 failure: suggesting the student ask whether the painkiller is an anti-inflammatory such as ibuprofen, which they had asked.
// A follow-up that goes further and names what they asked ("since you asked about ibuprofen at T11") is allowed and does not match.
const ASKED_AGAIN_RE = /\b(whether|if)\s+(it|they|the\s+\w+(\s+\w+)?)\s+(is|was|are|were|contains?)\s+[^.]{0,30}?(anti-?inflammator\w*|ibuprofen|naproxen|nsaid)/gi;
/** True when the text suggests the question; wording that reports it ("you asked whether it was ibuprofen") does not count. */
const ASKED_AGAIN = { test: (text: string) => [...text.matchAll(ASKED_AGAIN_RE)].some((m) => !/\byou\s+(had\s+|already\s+|also\s+)?(asked|checked|wanted to know)\s*$/i.test(text.slice(Math.max(0, m.index! - 40), m.index))) };
const COUNTERFACTUAL = /\bif (she|he|maggie|the patient)( had)? (said|told you|mentioned)\b[^.?]*\b(could ?n[o']t|did ?n[o']t|was unable to) (name|remember|recall)/i;

// ─── Script replays ─────────────────────────────────────────────────────────

interface Result { id: string; turns: T[]; timings: Timing[]; debrief: PersonaDebrief | null; debrief_ms: number }
const results: Result[] = [];

async function replayScript(s: Script): Promise<void> {
  const persona = PERSONAS[s.persona]!;
  const where = `${s.id}${s.run ? ` (run ${s.run})` : ''}`;
  const conv = await converse(persona, s.turns);
  const t0 = Date.now();
  const debrief = await generateDebrief({ persona, turns: conv.turns, attribution: ATTR });
  const debrief_ms = Date.now() - t0;
  results.push({ id: s.id, turns: conv.turns, timings: conv.timings, debrief, debrief_ms });
  console.log(`\n${where}: ${conv.turns.length} turns, debrief ${(debrief_ms / 1000).toFixed(1)} s`);

  // 1. End intent: the scripted end request is caught before the persona call, and nothing earlier is.
  const last = s.turns.length - 1;
  check(1, where, 'the end request is caught before the persona call', conv.endedAt === last, `line ${conv.endedAt === null ? 'none' : conv.endedAt + 1} of ${s.turns.length}`);
  check(1, where, 'no earlier line is taken for an end request', conv.flagged.every((i) => i === last), conv.flagged.map((i) => i + 1).join(', '));

  // Speed: keep replies in about 1-4 s.
  const totals = conv.timings.map((t) => t.total_ms);
  check(0, where, 'replies stay in about 1-4 s (median full reply ≤ 4 s)', median(totals) <= 4000, `median ${(median(totals) / 1000).toFixed(1)} s, max ${(Math.max(...totals) / 1000).toFixed(1)} s, median first text ${(median(conv.timings.map((t) => t.first_text_ms)) / 1000).toFixed(1)} s`);

  // 3. Grounded debrief.
  checkDebriefShape(where, persona, debrief, conv.turns.length);
  const replies = conv.turns.filter((t) => t.role === 'assistant').map((t) => t.content);
  const replyAfter = (line: number) => { const idx = conv.turns.findIndex((t) => t.role === 'user' && t.content === s.turns[line]); return conv.turns[idx + 1]?.content ?? ''; };

  if (s.id === 'patient-moderate') {
    const bad = [...debrief.explore_further.map((c) => c.text), debrief.one_question].filter((x) => ASKED_AGAIN.test(x));
    check(3, where, 'does not recommend asking whether the painkiller is an anti-inflammatory like ibuprofen', bad.length === 0, bad.join(' / ').slice(0, 200));
    check(3, where, 'no critical issues for a careful student', debrief.critical_issues.length === 0, debrief.critical_issues.map((c) => c.text).join(' / ').slice(0, 200));
  }
  if (s.id === 'patient-careless') {
    const med = debrief.critical_issues.filter((c) => c.kind === 'unsafe_advice' && /advil|ibuprofen|water (pill|tablet)|furosemide|medic|dose/i.test(c.text));
    check(3, where, 'the medication advice is under Critical issues', med.length > 0, debrief.critical_issues.map((c) => `${c.kind}: ${c.text}`).join(' / ').slice(0, 300));
  }
  if (s.id === 'russell-expert') {
    const ghost = debrief.critical_issues.filter((c) => c.kind === 'integrity' && /writ|paper|essay|ghost|hand (it )?in/i.test(c.text));
    check(3, where, 'the ghostwriting request is named under Critical issues', ghost.length > 0, debrief.critical_issues.map((c) => `${c.kind}: ${c.text}`).join(' / ').slice(0, 300));
    const refusal = replyAfter(4);
    check(7, where, 'the ghostwriting refusal is a system note, not Russell\'s voice', splitNotes(refusal).some((p) => p.kind === 'note'), refusal.slice(0, 160));
    check(7, where, 'no paper was written', wordCount(refusal) < 260, `${wordCount(refusal)} words`);
  }
  if (s.id === 'russell-moderate') {
    check(3, where, 'no critical issues for an ordinary conversation', debrief.critical_issues.length === 0, debrief.critical_issues.map((c) => c.text).join(' / ').slice(0, 200));
    const mis = replyAfter(3);
    check(7, where, 'the misattributed quotation is corrected with the vetted wording or source', /cocksure|triumph of stupidity|not (quite )?my (own )?(words|wording)|never (wrote|said)|paraphrase/i.test(personaWords(mis)), mis.slice(0, 200));
    const ai = replyAfter(4);
    check(7, where, 'the AI question is answered in a system note', splitNotes(ai).some((p) => p.kind === 'note' && /\bAI\b|artificial|simulat|language model/i.test(p.text)), ai.slice(0, 160));
    check(7, where, 'Russell does not restate the note in his own voice', !/\bAI\b|artificial intelligence|simulat|language model|chatbot|automated/i.test(personaWords(ai)), personaWords(ai).slice(0, 160));
    const reading = personaWords(replyAfter(5));
    const titles = PERSONAS.russell!.quote_book.reading.map((r) => r.title.replace(/["“”]/g, ''));
    check(7, where, 'reading recommended comes from the vetted list', titles.some((t) => reading.includes(t)), reading.slice(0, 200));
    const q = checkReplyQuotes(persona, [], mis);
    check(7, where, 'any quotation in the correction verifies against the quote book', !q || q.unverified.length === 0 || q.verified.length > 0, q ? `${q.verified.length} verified, ${q.unverified.length} not found` : 'no quotation');
  }

  // 5. A patient never compliments technique.
  if (s.persona === 'patient') {
    const praise = replies.filter((r) => COMPLIMENT.test(personaWords(r)));
    check(5, where, 'the patient does not compliment the student\'s technique', praise.length === 0, praise.map((r) => r.match(COMPLIMENT)?.[0]).join(' / '));
  }
  if (s.id === 'patient-careless') {
    const sob = replyAfter(2);
    check(5, where, 'a jargon question gets no expansion of the abbreviation', !/short(ness)? of breath/i.test(sob), sob.slice(0, 160));
  }

  // 6. No LMS name: the scripts never give "Test Student1", so it must never appear.
  check(6, where, 'the persona never uses the LMS display name', replies.every((r) => !/\bTest\b|Student1/.test(r)));

  // 7. First person only, and the soft word cap.
  if (s.persona === 'russell') {
    const third = replies.filter((r) => /\b(Russell|Bertrand)\s+(argued|believed|wrote|thought|held|says|said|claims?|would)\b|\bLord Russell\b/.test(personaWords(r)));
    check(7, where, 'Russell speaks only in the first person', third.length === 0, third.map((r) => r.slice(0, 100)).join(' / '));
    const words = replies.map((r) => wordCount(personaWords(r)));
    check(7, where, 'replies stay near the 180-word soft cap (none over 230)', words.every((w) => w <= 230), `median ${median(words)}, max ${Math.max(...words)}`);
  }

  writeResult(s.id, { script: s, persona: s.persona, turns: conv.turns, timings: conv.timings, debrief, debrief_ms });
}

const COMPLIMENT = /\b(thank you|thanks) for (asking|saying|explaining|checking|being so|taking the time to ask|putting)|nobody('s| has) (ever )?asked|good question|you'?re (very |so )?(thorough|good at this|gentle)|well asked/i;

// ─── The recorded run: the debrief on fixed input ───────────────────────────

async function replayRecorded(r: Recorded): Promise<void> {
  const persona = PERSONAS[r.persona]!;
  const where = `${r.id} (debrief only)`;
  const t0 = Date.now();
  const debrief = await generateDebrief({ persona, turns: r.turns, attribution: ATTR });
  console.log(`\n${where}: debrief ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  checkDebriefShape(where, persona, debrief, r.turns.length);
  if (r.stored_debrief) check(3, where, 'the check below catches the stored debrief\'s failure (so a pass means something)', ASKED_AGAIN.test(r.stored_debrief) && COUNTERFACTUAL.test(r.stored_debrief));
  const bad = [...debrief.explore_further.map((c) => c.text), debrief.one_question].filter((x) => ASKED_AGAIN.test(x));
  check(3, where, 'does not recommend asking whether the painkiller is an anti-inflammatory like ibuprofen', bad.length === 0, bad.join(' / ').slice(0, 200));
  check(3, where, 'no counterfactual about a fact already stated', ![debrief.one_question, ...debrief.explore_further.map((c) => c.text)].some((x) => COUNTERFACTUAL.test(x)), debrief.one_question.slice(0, 200));
  check(3, where, 'no critical issues for a careful student', debrief.critical_issues.length === 0, debrief.critical_issues.map((c) => c.text).join(' / ').slice(0, 200));
  writeResult(r.id, { recorded: r.note, persona: r.persona, turns: r.turns, debrief, debrief_ms: Date.now() - t0 });
}

// ─── Probes: consistency (item 4) and technique (item 5) ────────────────────

/** Which fixed-facts model a persona uses, how big its block is, and its date of birth. */
function factsModel(p: Persona): { model: string; chars: number; dob: string } {
  const cf = caseFileBlock(caseRecordOf(p.case_record));
  const fs = factSheetBlock(factSheetOf(p.fact_sheet));
  return { model: [cf ? 'case file' : '', fs ? 'fact sheet' : ''].filter(Boolean).join(' + ') || 'none', chars: cf.length + fs.length, dob: caseRecordOf(p.case_record).date_of_birth || factSheetOf(p.fact_sheet).date_of_birth };
}

interface Comparison { persona: string; model: string; chars: number; consistent: number; asked: number; technique: string; median_reply_ms: number }
const comparisons: Comparison[] = [];
/** Technique results by persona, joined to the consistency rows when the summary is written (the probes finish in any order). */
const techniqueNotes = new Map<string, string>();

/**
 * Item 4: the same questions in five fresh sessions must get the fixed facts every time.
 * Each expectation is a pattern every answer to that line must match, and optionally one none may match (an invented fact).
 */
async function probeFacts(key: string, lines: string[], expects: { label: string; must: RegExp; never?: RegExp }[]): Promise<Comparison> {
  const persona = PERSONAS[key]!;
  const fm = factsModel(persona);
  const where = `${key}: ${fm.model} (5 fresh sessions)`;
  const runs = await Promise.all(Array.from({ length: 5 }, () => converse(persona, lines)));
  const answers = runs.map((r) => r.turns.filter((t) => t.role === 'assistant').map((t) => personaWords(t.content)));
  let consistent = 0;
  expects.forEach((e, i) => {
    const n = answers.filter((a) => e.must.test(a[i] ?? '') && !(e.never && e.never.test(a[i] ?? ''))).length;
    if (n === 5) consistent++;
    check(4, where, `${e.label} every time`, n === 5, `${n}/5`);
  });
  writeResult(`probe-facts-${key}`, { lines, answers, timings: runs.map((r) => r.timings) });
  const c = { persona: key, model: fm.model, chars: fm.chars, consistent, asked: expects.length, technique: '–', median_reply_ms: median(runs.flatMap((r) => r.timings.map((t) => t.total_ms))) };
  comparisons.push(c);
  return c;
}

const ageRe = (dob: string) => { const a = ageOn(dob); return new RegExp(`\\b${a}\\b${a === 78 ? '|seventy-eight' : a === 34 ? '|thirty-four' : ''}`, 'i'); };
const INVENTED_MEDS = /\b(metformin|insulin|warfarin|aspirin|lisinopril|amlodipine|metoprolol|digoxin|tylenol|acetaminophen|paracetamol|naproxen|aleve|levothyroxine|omeprazole)\b/i;

function patientProbe(key: string): Promise<Comparison> {
  return probeFacts(key, [
    "Hello, I'm Alex, a second-year nursing student. Thank you for coming in. Who sent you in today?",
    'Thank you. At home, who does the cooking these days?',
    'What medications are you on?',
    'And how old are you, if you don\'t mind me asking?',
  ], [
    { label: '"who sent you in?" gives the referral', must: /Mehta|family doctor|my doctor|GP/i },
    { label: '"who does the cooking?" gives the fixed answer', must: /Claire|daughter|freezer|Ray/i },
    { label: '"what medications are you on?" names only listed medicines', must: /water tablet|blood pressure|heart|cholesterol|ramipril|bisoprolol|furosemide|atorvastatin/i, never: INVENTED_MEDS },
    { label: `age is ${ageOn(factsModel(PERSONAS[key]!).dob)} (from the date of birth)`, must: ageRe(factsModel(PERSONAS[key]!).dob) },
  ]);
}

async function probeTechnique(key: string): Promise<void> {
  const persona = PERSONAS[key]!;
  const where = `${key}: technique (3 + 3 fresh sessions)`;
  const curt = ['hi. what meds are you on'];
  const open = ["Hello, I'm Alex, one of the student nurses. I'd like to understand how you manage your medicines, so we can make sure they're helping you. Could you tell me about the medicines you take, including anything you buy yourself from the chemist?",
    // She does not think of the Advil as medicine (a disclosure rule), so it takes a follow-up on her own hint to reach it.
    'Thank you, that helps. You mentioned the odd thing from the chemist. What sort of things do you buy there, even if they don\'t feel like medicine?'];
  const [c, o] = await Promise.all([
    Promise.all(Array.from({ length: 3 }, () => converse(persona, curt))),
    Promise.all(Array.from({ length: 3 }, () => converse(persona, open))),
  ]);
  const words = (runs: typeof c) => runs.map((r) => wordCount(personaWords(r.turns.find((t) => t.role === 'assistant')?.content ?? '')));
  const cw = words(c), ow = words(o);
  check(5, where, '"what meds are you on" yields less than an open, empathetic medication question', median(cw) < median(ow) && Math.max(...cw) < Math.min(...ow) * 1.2, `curt ${cw.join('/')} words, open ${ow.join('/')} words`);
  const otc = o.filter((r) => r.turns.some((t) => t.role === 'assistant' && /advil|ibuprofen/i.test(t.content))).length;
  check(5, where, 'an open question and a follow-up on her hint reach the over-the-counter Advil', otc >= 2, `${otc}/3`);
  const praise = [...c, ...o].map((r) => personaWords(r.turns.find((t) => t.role === 'assistant')?.content ?? '')).filter((x) => COMPLIMENT.test(x));
  check(5, where, 'no compliments on technique', praise.length === 0, praise.map((x) => x.match(COMPLIMENT)?.[0]).join(' / '));
  techniqueNotes.set(key, `curt ${median(cw)} vs open ${median(ow)} words; OTC reached ${otc}/3`);
  writeResult(`probe-technique-${key}`, { curt: c.map((r) => r.turns), open: o.map((r) => r.turns) });
}

/** The fact sheet beyond health care: a tenant at a legal clinic (client template) and a negotiation counterpart (partner template). */
function nonClinicalProbes(): Promise<Comparison>[] {
  return [
    probeFacts('tenant', [
      "Hi Jordan, I'm Sam, a law student working at the clinic today. Everything you tell me stays confidential. When did you get the notice?",
      'Thanks. And how much is your rent each month?',
      'Who lives with you in the apartment?',
      'Can I ask how old you are?',
    ], [
      { label: '"when did you get the notice?" gives 3 October', must: /\b3(rd)? (of )?October|October (3(rd)?|third)\b|third of October/i },
      { label: '"how much is your rent?" gives $1,450', must: /1,?450|fourteen fifty|fourteen hundred and fifty/i },
      { label: '"who lives with you?" names Mia', must: /\bMia\b/ },
      { label: `age is ${ageOn('1992-06-18')} (from the date of birth)`, must: ageRe('1992-06-18') },
    ]),
    probeFacts('partner', [
      "Thanks for meeting me, Dana. I'm Chris from Interior Logistics. Before I say anything about us, what's not working with your current supplier?",
      'That sounds costly. What are you paying FastLane at the moment?',
      'Who else is involved in making this decision?',
      'And when do you need to have a decision made?',
    ], [
      { label: '"what\'s not working?" gives the late deliveries', must: /late|Friday|festival|missed/i },
      // Holding the number back until the student has earned it is in character; giving a different one is not.
      { label: '"what are you paying?" gives $52,000 or declines, never another figure', must: /[\s\S]/, never: /\$?\b(?!52,?000|48,?000)\d{2,3},\d{3}\b/ },
      { label: '"who else decides?" names the CFO, Priya Nand', must: /Priya|Nand|CFO/i },
      { label: '"when do you need a decision?" gives 15 November', must: /15(th)? (of )?November|November 15|mid-November|fifteenth/i },
    ]),
  ];
}

// ─── Static checks: identity and coach copy (item 6) ────────────────────────

function staticChecks(): void {
  const where = 'prompts';
  for (const [name, p] of Object.entries(PERSONAS)) {
    const req = personaTurnRequest({ persona: p, materials: [], turns: [{ role: 'user', content: 'Hello' }] });
    const sys = JSON.stringify(req.system);
    check(6, where, `${name}: a course launch sends no student name, only the rule to use a name the student gives`, sys.includes('You do not know the student\'s name') && !/The student's name is/.test(sys));
  }
  const thinkerCoach = coachSystemFor(PERSONAS.russell!);
  check(6, where, 'the thinker coach carries no patient-interview habits', !/consent|cue|jargon/i.test(thinkerCoach));
  check(6, where, 'the patient coach points to the End conversation button', /End conversation button/.test(coachSystemFor(PERSONAS.patient!)));
}

// ─── Debrief state against Postgres (item 2) ────────────────────────────────

async function stateCheck(): Promise<void> {
  const where = 'debrief state (Postgres)';
  try { await query('select 1'); } catch (e) { check(2, where, 'database reachable', false, `${(e as Error).message}; run with --no-db to skip`); return; }
  const scope = { iss: 'replay', contextId: `replay-${stamp}` };
  const p = await createPersona(scope, PersonaInput.parse(JSON.parse(readFileSync(join(HERE, 'personas', 'patient.json'), 'utf8'))), null);
  try {
    const st = await query<{ id: number }>(`insert into student (lti_sub, lti_iss, lti_context_id, display_name) values ($1, 'replay', $2, 'Test Student1') returning id`, [`replay-${stamp}`, scope.contextId]);
    let ps = await startPersonaSession(p, st[0]!.id, 'live');
    for (const t of [{ role: 'user' as const, content: 'Hello, I\'m Sam, a nursing student. What brings you in today?' }, { role: 'assistant' as const, content: 'My ankles have been swelling, and I get breathless on the stairs.' }]) await appendTurn(ps.session_id, t.role, t.content);
    ps = await endPersonaSession(ps, "Thanks, that's all. End simulation");
    check(2, where, 'a new ended conversation starts at none', debriefStatus(ps).state === 'none');
    const [a, b] = await Promise.all([requestDebrief({ persona: p, session: ps, attribution: ATTR }), new Promise((r) => setTimeout(r, 400)).then(() => requestDebrief({ persona: p, session: ps, attribution: ATTR }))]);
    check(2, where, 'a second request while one is generating gets "generating", not a second debrief', a.state === 'ready' && b.state === 'generating', `${a.state} / ${b.state}`);
    // A request that died mid-generation (closed tab, crashed process) leaves a stale 'generating' row: it reads as failed, and Retry claims it again.
    await query(`update persona_session set debrief = null, debrief_state = 'generating', debrief_started_at = now() - interval '10 minutes' where id = $1`, [ps.id]);
    const stale = (await query<typeof ps>(`select * from persona_session where id = $1`, [ps.id]))[0]!;
    check(2, where, 'an interrupted generation reads as failed (the page shows Retry)', debriefStatus(stale).state === 'failed');
    const retried = await requestDebrief({ persona: p, session: stale, attribution: ATTR });
    check(2, where, 'Retry after an interruption writes the debrief', retried.state === 'ready' && !!retried.debrief);
    const turns = await query<{ content: string }>(`select content from tutor_turn where session_id = $1 order by id`, [ps.session_id]);
    check(1, where, 'the end request is kept as the student\'s last turn, with no persona reply', turns.at(-1)?.content === "Thanks, that's all. End simulation");
  } finally {
    await deletePersona(p.id, scope).catch(() => {});
    await query(`delete from student where lti_iss = 'replay' and lti_context_id = $1`, [scope.contextId]).catch(() => {});
  }
}

// ─── Output ─────────────────────────────────────────────────────────────────

function writeResult(id: string, data: Record<string, unknown>): void {
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(data, null, 2));
  const turns = (data.turns as T[] | undefined) ?? [];
  const timings = (data.timings as Timing[] | undefined) ?? [];
  if (!turns.length) return;
  let ti = 0;
  const md = [`# ${id}`, '', ...turns.map((t, i) => {
    const time = t.role === 'assistant' && timings[ti] ? ` _(${(timings[ti++]!.total_ms / 1000).toFixed(1)} s)_` : '';
    return `**[${i + 1}] ${t.role === 'user' ? 'Student' : 'Persona'}:**${time} ${t.content}\n`;
  }), data.debrief ? debriefMarkdown(data.debrief) : ''].join('\n');
  writeFileSync(join(OUT, `${id}.md`), md);
}

console.log(`Persona replay → ${OUT}\nmodels: persona ${process.env.PERSONA_MODEL}, debrief ${process.env.GEN_MODEL}\n`);
staticChecks();
const jobs: Promise<void>[] = [...scripts.map(replayScript), ...recorded.map(replayRecorded)];
const probes = !filter || filter.includes('probe') || filter.includes('compare');
if (probes || 'patient'.includes(filter)) jobs.push(patientProbe('patient').then(() => {}), probeTechnique('patient'));
if (probes) jobs.push(patientProbe('patient-factsheet').then(() => {}), probeTechnique('patient-factsheet'), ...nonClinicalProbes().map((p) => p.then(() => {})));
const settled = await Promise.allSettled(jobs);
for (const s of settled) if (s.status === 'rejected') check(0, 'harness', 'a replay ran to the end', false, String((s.reason as Error)?.message ?? s.reason));
if (useDb) await stateCheck().catch((e) => check(2, 'debrief state (Postgres)', 'ran to the end', false, (e as Error).message));
await pool.end().catch(() => {});

const failed = checks.filter((c) => !c.pass);
const summary = [`# Persona replay ${stamp}`, '', `Models: persona ${process.env.PERSONA_MODEL}, debrief ${process.env.GEN_MODEL}. ${checks.length - failed.length} of ${checks.length} checks passed.`, '',
  '| Item | Where | Check | Result | Detail |', '|---|---|---|---|---|',
  ...checks.sort((a, b) => a.item - b.item).map((c) => `| ${c.item || '–'} | ${c.where} | ${c.name} | ${c.pass ? 'pass' : '**FAIL**'} | ${c.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
  '', 'Item 0 is speed and harness health; 1–7 are the report\'s items.',
  ...(comparisons.length ? ['', '## Fixed facts: case file and fact sheet', '', '| Persona | Model | Prompt block (chars) | Consistent across 5 sessions | Technique | Median reply |', '|---|---|---|---|---|---|',
    ...comparisons.map((c) => ({ ...c, technique: techniqueNotes.get(c.persona) ?? c.technique })).sort((a, b) => a.persona.localeCompare(b.persona)).map((c) => `| ${c.persona} | ${c.model} | ${c.chars.toLocaleString()} | ${c.asked ? `${c.consistent}/${c.asked}` : '–'} | ${c.technique} | ${c.median_reply_ms ? (c.median_reply_ms / 1000).toFixed(1) + ' s' : '–'} |`)] : [])].join('\n');
writeFileSync(join(OUT, 'summary.md'), summary);
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ stamp, checks, comparisons, results: results.map((r) => ({ id: r.id, turns: r.turns.length, median_reply_ms: median(r.timings.map((t) => t.total_ms)), debrief_ms: r.debrief_ms })) }, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. ${OUT}/summary.md`);
process.exit(failed.length ? 1 : 0);
