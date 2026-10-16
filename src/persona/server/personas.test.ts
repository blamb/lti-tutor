import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PersonaInput, DraftPersona, personaBlock, personaSystem, publicPersona, sourcesBlock, type Persona } from './personas.js';
import { TEMPLATES, templateCatalog, fieldsFor, PERSONA_TEMPLATES } from './templates.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(join(HERE, '..', 'fixtures', `${name}.json`), 'utf8'));

function personaOf(input: unknown, id = 1): Persona {
  const parsed = PersonaInput.parse(input);
  const { passcode, ...rest } = parsed;
  return { id, lti_iss: 'https://moodle.test', lti_context_id: '7', created_by: null, created_at: '', updated_at: '', public_slug: '', passcode_hash: '', ...rest };
}

test('the two reference fixtures validate as persona input', () => {
  const mel = PersonaInput.parse(fixture('melissa-chang'));
  assert.equal(mel.template, 'client');
  assert.equal(mel.opening, 'student');
  assert.ok(mel.hidden.includes('3–4 cups of coffee'));
  const tagore = PersonaInput.parse(fixture('tagore'));
  assert.equal(tagore.template, 'thinker');
  assert.equal(tagore.opening, 'persona');
  assert.equal(tagore.historical_cutoff, '1941');
});

test('every template has rules, a label and a full field list; hints override per template', () => {
  for (const t of PERSONA_TEMPLATES) {
    assert.ok(TEMPLATES[t].rules.includes('Stay in character'), `${t} carries the common rules`);
    assert.ok(TEMPLATES[t].label);
    assert.equal(fieldsFor(t).length, fieldsFor('custom').length);
  }
  const clientHidden = fieldsFor('client').find((f) => f.key === 'hidden')!;
  const customHidden = fieldsFor('custom').find((f) => f.key === 'hidden')!;
  assert.notEqual(clientHidden.hint, customHidden.hint);
  assert.equal(templateCatalog().length, PERSONA_TEMPLATES.length);
});

test('the persona block carries the hidden layer with its preface, the cutoff and the opening', () => {
  const mel = personaOf(fixture('melissa-chang'));
  const block = personaBlock(mel, 'Jordan');
  assert.ok(block.startsWith('# PERSONA: Melissa Chang (40'));
  assert.ok(block.includes('## What you hold back (hidden layer)'));
  assert.ok(block.includes('The student cannot see this section.'));
  assert.ok(block.includes("The student's name is Jordan."));
  assert.ok(block.includes('The student speaks first.'));
  assert.ok(!block.includes('Historical cutoff'));

  const tagore = personaOf(fixture('tagore'), 2);
  const tb = personaBlock(tagore, 'Sam');
  assert.ok(tb.includes('Historical cutoff: you know nothing after 1941.'));
  assert.ok(tb.includes('You speak first. Open with this, or close to it:'));
  assert.ok(!tb.includes('hidden layer'), 'an empty hidden layer is omitted');
});

test('the system prompt is rules → sources (cached) → persona (cached), with a fixed first block per template', () => {
  const tagore = personaOf(fixture('tagore'), 2);
  const materials = [{ id: 1, title: 'Gitanjali', body: 'Where the mind is without fear…', license: 'Public domain', source_url: '', attribution: '', role: 'reading', unit: '', unit_order: 0, source_key: '', lti_iss: '', lti_context_id: '', created_by: null, created_at: '', updated_at: '' } as const];
  const sys = personaSystem(tagore, [...materials], 'Sam');
  assert.equal(sys.length, 3);
  assert.equal(sys[0]!.text, TEMPLATES.thinker.rules);
  assert.equal(sys[0]!.cache_control, undefined);
  assert.ok(sys[1]!.text.startsWith('# SOURCES'));
  assert.ok(sys[1]!.text.includes('## Gitanjali (licence: Public domain)'));
  assert.deepEqual(sys[1]!.cache_control, { type: 'ephemeral' });
  assert.ok(sys[2]!.text.startsWith('# PERSONA: Rabindranath Tagore'));
  assert.equal(personaSystem(tagore, [], 'Sam').length, 2, 'no sources block without materials');
  assert.equal(sourcesBlock([]), null);
});

test('students never receive the hidden layer, the character or the instructions', () => {
  const pub = publicPersona(personaOf(fixture('melissa-chang')));
  const keys = Object.keys(pub);
  for (const secret of ['hidden', 'character', 'voice', 'behaviour', 'guardrails', 'raw_instructions', 'model']) assert.ok(!keys.includes(secret), secret);
  assert.ok(keys.includes('student_brief'));
});

test('input validation: model must be known, blank means the deployment default', () => {
  assert.equal(PersonaInput.parse({ title: 'X' }).model, '');
  assert.equal(PersonaInput.parse({ title: 'X', model: 'claude-sonnet-5-5' }).model, 'claude-sonnet-5-5');
  assert.throws(() => PersonaInput.parse({ title: 'X', model: 'gpt-4' }));
  assert.throws(() => PersonaInput.parse({ title: '' }));
});

test('the draft schema accepts lines as arrays and normalises the opening', () => {
  const d = DraftPersona.parse({ title: 'T', objectives: ['a', 'b'], opening: 'Persona speaks first', hidden: null });
  assert.equal(d.objectives, 'a\nb');
  assert.equal(d.opening, 'persona');
  assert.equal(d.hidden, '');
  assert.equal(DraftPersona.parse({ opening: 'student' }).opening, 'student');
});

test('the transcript export carries the conversation, the debrief and the reflection as markdown', async () => {
  const { transcriptMarkdown, debriefMarkdown, PersonaDebrief } = await import('./personas.js');
  const debrief = PersonaDebrief.parse({ overview: 'You listened well.', by_objective: [{ objective: 'Therapeutic communication', observation: 'You asked consent before sleep.' }], strengths: 'Open questions\nWarm tone', explore_further: ['Caffeine'], one_question: 'What would you ask first next time?' });
  assert.equal(debrief.strengths.length, 2, 'lines become a list');
  const p = personaOf(fixture('melissa-chang'));
  const session = { id: 9, persona_id: 1, student_id: 1, session_id: 1, mode: 'live' as const, status: 'ended' as const, started_at: '2026-10-15T20:00:00Z', ended_at: null, debrief, coach_session_id: null, debrief_generated_at: null, reflection: 'Ask more open questions.', reflection_at: null, grade_posted_at: null, grade_error: null };
  const turns = [
    { id: 1, role: 'user' as const, content: 'Hi Melissa', ts: '' },
    { id: 2, role: 'assistant' as const, content: 'Hi Jordan.', ts: '' },
  ];
  const md = transcriptMarkdown(p, session, turns, 'Jordan Lee');
  assert.ok(md.startsWith('# Melissa Chang'));
  assert.ok(md.includes('**Jordan Lee:** Hi Melissa'));
  assert.ok(md.includes('**Melissa Chang:** Hi Jordan.'));
  assert.ok(md.includes('## Debrief'));
  assert.ok(md.includes('- **Therapeutic communication** You asked consent before sleep.'));
  assert.ok(md.includes('## Your reflection\nAsk more open questions.'));
  assert.ok(debriefMarkdown(debrief).includes('### One question to carry away'));
});

test('the student view carries the voice leaning and coach switch but still nothing hidden', () => {
  const pub = publicPersona(personaOf({ ...fixture('tagore'), voice_pref: 'masculine', coach: 'off' }));
  assert.equal(pub.voice_pref, 'masculine');
  assert.equal(pub.coach, 'off');
  assert.ok(!('hidden' in pub));
});

test('the report CSV has one row per conversation and quotes commas and quotes', async () => {
  const { reportCsv } = await import('./personas.js');
  const csv = reportCsv({
    rows: [{ session_id: 3, student_id: 1, display_name: 'Lee, Jordan', status: 'ended', started_at: '2026-10-15', ended_at: '2026-10-15', turns: 4, coach_turns: 1,
      debrief: { overview: 'Said "fine".', by_objective: [], strengths: ['a', 'b'], explore_further: [], one_question: '' }, reflection: '', grade_posted_at: null, grade_error: 'no column', via: 'web' }],
    totals: { started: 1, ended: 1, with_debrief: 1, with_reflection: 0, avg_turns: 4, grade_posted: 0, students: 1 },
    synthesis: null,
  });
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0]!.startsWith('session,student,via,status'));
  assert.ok(lines[1]!.includes(',web,'));
  assert.ok(lines[1]!.includes('"Lee, Jordan"'));
  assert.ok(lines[1]!.includes('"Said ""fine""."'));
  assert.ok(lines[1]!.includes('a | b'));
  assert.ok(lines[1]!.endsWith('no column'));
});

test('blank cap fields from the editor fall back to the defaults instead of zero', () => {
  const p = PersonaInput.parse({ title: 'X', public_daily_usd: '', public_max_turns: '' });
  assert.equal(p.public_daily_usd, 2);
  assert.equal(p.public_max_turns, 40);
  const q = PersonaInput.parse({ title: 'X', public_daily_usd: '0', public_max_turns: '12' });
  assert.equal(q.public_daily_usd, 0, 'an explicit zero is still allowed');
  assert.equal(q.public_max_turns, 12);
  assert.throws(() => PersonaInput.parse({ title: 'X', public_max_turns: '2' }));
});
