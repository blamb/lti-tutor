import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasEndIntent, splitNotes, personaWords, wordCount } from './signals.js';
import { ageOn, caseFileBlock, CaseRecord, isEmptyCase } from './casefile.js';
import { QuoteBook, quoteBookBlock, quoteBookSources } from './quotebook.js';
import { checkQuotes } from '../../core/quotes.js';
import {
  PersonaDebrief, normalizeDebrief, withValidTurns, onlyConfiguredObjectives, debriefStatus, numberedTranscript, objectivesOf, DEBRIEF_STALE_SECONDS,
} from './debrief.js';

test('end intent: the report\'s phrases, any case, with or without other text', () => {
  for (const s of ["thanks, that's all. End simulation", 'END SESSION', "I'm finished", 'i am finished', 'I’m finished.', 'ok thats all i need. im finished', 'ok end the conversation please', "That's all my questions", 'end interview']) {
    assert.ok(hasEndIntent(s), s);
  }
  for (const s of ['What do you do at the end of the day?', 'the weekend session was fun', 'How does the simulation end?', 'Are you finished with the tablets?', 'I finished school in 1990']) {
    assert.ok(!hasEndIntent(s), s);
  }
});

test('notes split from the persona\'s words; an unclosed note runs to the end', () => {
  const parts = splitNotes('I should rather not. [[note]]The persona will not write graded work.[[/note]] What do you think yourself?');
  assert.deepEqual(parts.map((p) => p.kind), ['persona', 'note', 'persona']);
  assert.equal(parts[1]!.text, 'The persona will not write graded work.');
  assert.equal(personaWords('[[note]]Yes, this is an AI.[[/note]]Now, where were we?'), 'Now, where were we?');
  assert.deepEqual(splitNotes('Hm. [[note]]cut off').map((p) => p.kind), ['persona', 'note']);
  assert.equal(wordCount('*Smiles.* Hello there, Sam.'), 3, 'stage directions do not count');
});

test('age comes from the date of birth at request time: 78 in October 2026', () => {
  assert.equal(ageOn('1948-03-04', new Date('2026-10-21T12:00:00Z')), 78);
  assert.equal(ageOn('1948-03-04', new Date('2026-03-03T12:00:00Z')), 77, 'the day before the birthday');
  assert.equal(ageOn('1948-03-04', new Date('2026-03-04T12:00:00Z')), 78, 'on the birthday');
  assert.equal(ageOn('1948-02-30'), null);
  assert.equal(ageOn(''), null);
});

test('the case file block states canonical facts, the computed age, and keeps OTC medicines apart', () => {
  const c = CaseRecord.parse({
    name: 'Margaret Ellis', preferred_name: 'Maggie', date_of_birth: '1948-03-04', referral_source: 'Dr. Mehta, her family doctor.',
    medications: [{ name: 'furosemide 40 mg', how_taken: 'each morning', patient_words: 'the water tablet' }, { name: 'ibuprofen 200 mg (Advil)', otc: true }],
    disclosure_rules: ['Does not mention the Advil unless asked about painkillers or anything bought over the counter.'],
  });
  const block = caseFileBlock(c, new Date('2026-10-21T12:00:00Z'));
  assert.ok(block.includes('## Case file (canonical facts)'));
  assert.ok(block.includes('Today you are 78 years old'));
  assert.ok(block.includes('Margaret Ellis (goes by Maggie)'));
  assert.ok(/### Over the counter[^#]*ibuprofen/.test(block));
  assert.ok(!/### Prescribed medications[^#]*ibuprofen/.test(block));
  assert.ok(block.includes('In your words: "the water tablet"'));
  assert.equal(caseFileBlock(CaseRecord.parse({})), '');
  assert.ok(isEmptyCase(CaseRecord.parse({})));
  assert.throws(() => CaseRecord.parse({ date_of_birth: '4 March 1948' }));
});

test('the quote book prompts vetted quotes, corrects misattributions and limits reading; vetted quotes verify', () => {
  const book = QuoteBook.parse({
    quotes: [{ text: 'The fundamental cause of the trouble is that in the modern world the stupid are cocksure while the intelligent are full of doubt.', source: 'The Triumph of Stupidity', year: '1933' }],
    misattributions: [{ text: 'The whole problem with the world is that fools and fanatics are always so certain of themselves', verdict: 'Not my wording.' }],
    reading: [{ title: 'The Problems of Philosophy', year: '1912' }],
  });
  const block = quoteBookBlock(book);
  assert.ok(block.includes('(The Triumph of Stupidity (1933))'));
  assert.ok(block.includes('## Known misattributions'));
  assert.ok(block.includes('recommend only from this list'));
  const q = checkQuotes('As I wrote, "the stupid are cocksure while the intelligent are full of doubt."', quoteBookSources(book));
  assert.equal(q.verified.length, 1);
  assert.equal(q.verified[0]!.title, 'The Triumph of Stupidity (1933)');
  assert.equal(quoteBookBlock(QuoteBook.parse({})), '');
});

test('debrief claims must cite turns in range; objectives are only the configured ones, by exact name', () => {
  const d = PersonaDebrief.parse({
    overview: [{ text: 'Good opening.', turns: [1] }, { text: 'No reference.', turns: [] }, { text: 'Out of range.', turns: [99] }],
    strengths: [{ text: 'Consent.', turns: [3, 3, 40] }],
    by_objective: [{ objective: 'therapeutic communication', observation: 'Warm.', turns: [1] }, { objective: 'Invented objective', observation: 'x', turns: [2] }],
  });
  const r = onlyConfiguredObjectives(withValidTurns(d, 10), ['Therapeutic communication', 'Health teaching']);
  assert.deepEqual(r.overview.map((c) => c.text), ['Good opening.']);
  assert.deepEqual(r.strengths[0]!.turns, [3]);
  assert.deepEqual(r.by_objective.map((o) => o.objective), ['Therapeutic communication']);
  assert.deepEqual(objectivesOf({ objectives: '- Therapeutic communication\n2. Health teaching\n\nTherapeutic communication' }), ['Therapeutic communication', 'Health teaching']);
  assert.equal(numberedTranscript([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], 'Maggie'), '[T1] Student: Hi\n\n[T2] Maggie: Hello');
});

test('debrief state: a stored debrief is ready; a stale generating row is failed and can be retried', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  const base = { debrief: null, debrief_state: 'none' as const, debrief_started_at: null, debrief_error: null };
  assert.equal(debriefStatus(base, now).state, 'none');
  assert.equal(debriefStatus({ ...base, debrief_state: 'generating', debrief_started_at: new Date(now - 20_000).toISOString() }, now).state, 'generating');
  assert.equal(debriefStatus({ ...base, debrief_state: 'generating', debrief_started_at: new Date(now - (DEBRIEF_STALE_SECONDS + 5) * 1000) as never }, now).state, 'failed');
  assert.equal(debriefStatus({ ...base, debrief_state: 'failed', debrief_error: 'overloaded' }, now).error, 'overloaded');
  const legacy = { overview: 'You listened.', by_objective: [], strengths: ['a'], explore_further: [], one_question: '' };
  assert.equal(debriefStatus({ ...base, debrief: legacy as never, debrief_state: 'none' }, now).state, 'ready');
  assert.equal(normalizeDebrief(legacy)!.overview[0]!.text, 'You listened.');
});

test('the page catches the same end requests as the server (one pattern, two copies)', async () => {
  const { readFileSync } = await import('node:fs');
  const { END_INTENT } = await import('./signals.js');
  const page = readFileSync(new URL('../web/launch.html', import.meta.url), 'utf8');
  const m = /const END_INTENT = (\/.*\/i);/.exec(page);
  assert.ok(m, 'launch.html defines END_INTENT');
  assert.equal(m![1], END_INTENT.toString());
});

test('course launches give the persona no name; the coach copy fits the template', async () => {
  const { personaBlock, coachSystemFor, PersonaInput } = await import('./personas.js');
  const p = (input: Record<string, unknown>) => ({ id: 1, lti_iss: 'x', lti_context_id: 'y', created_by: null, created_at: '', updated_at: '', public_slug: '', passcode_hash: '', ...(({ passcode, ...rest }) => rest)(PersonaInput.parse(input)) });
  const thinker = p({ title: 'Russell', template: 'thinker' });
  const client = p({ title: 'Maggie', template: 'client', case_record: { name: 'Margaret Ellis', date_of_birth: '1948-03-04' } });
  assert.ok(!personaBlock(thinker).includes('Test Student1'));
  assert.ok(personaBlock(client, '', new Date('2026-10-21')).includes('Today you are 78 years old'));
  assert.ok(!/consent|cue/i.test(coachSystemFor(thinker)), 'no patient-interview habits for a thinker');
  assert.ok(/End conversation button/.test(coachSystemFor(client)));
});
