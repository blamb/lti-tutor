import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundSummary, DraftSummary, THIN } from './tutorials.js';
import { KINDS, TUTORIAL_KINDS } from './kinds.js';
import { tutorialRulesFor } from './tutorials.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 5: three terse replies became "Appears disengaged
// or rushed" and "Does not recognize undefined reference as a symbol
// resolution problem", sent to the instructor with the student's name.

type T = { role: 'user' | 'assistant'; content: string };
const said = ['idk', 'not really. i just want to finish this', 'look for a typo in my code probably'];
const turns: T[] = said.flatMap((s) => [{ role: 'assistant' as const, content: 'What helped?' }, { role: 'user' as const, content: s }]);

const reportDraft = DraftSummary.parse({
  kind: 'reflection', mastery: 'needs_work',
  understood: [],
  sticking_points: [
    { text: 'Does not recognize undefined reference as a symbol resolution problem', quote: 'look for a typo in my code probably' },
    { text: 'Appears disengaged or rushed through the module', quote: 'i just want to finish this' },
    { text: 'No strategy for using linker tools to diagnose build errors', quote: 'look for a typo in my code probably' },
  ],
  strategy_in_own_words: 'Disengaged; offered no strategy beyond looking for typos.',
  suggested_action: 'Run nm before editing code.',
  next_step: 'Symbol resolution with nm',
  student_note: 'Test, you seemed rushed today. Next time, try running nm before you hunt for typos.',
});

test('the report\'s Reflection summary loses its attitude labels and unsupported gap claims', () => {
  const { summary, dropped } = groundSummary(reportDraft, { turns, studentName: 'Test Student2', teachBack: 'none' });
  const all = JSON.stringify(summary);
  assert.doesNotMatch(all, /disengaged|rushed/i);
  assert.doesNotMatch(all, /does not recognize|no strategy/i);
  assert.deepEqual(summary.sticking_points, []);
  // The strategy field's only sentence was a label, so it says the session was too thin to tell.
  assert.equal((summary as unknown as { strategy_in_own_words: string }).strategy_in_own_words, THIN);
  assert.equal(summary.student_note, 'Next time, try running nm before you hunt for typos.');
  assert.equal(dropped.length, 5);
});

test('what a student says is still hard, in their own words, stays', () => {
  const t2: T[] = [{ role: 'assistant', content: 'What was hard?' }, { role: 'user', content: 'relocation still confuses me, I never saw why the bytes change' }];
  const d = DraftSummary.parse({ ...reportDraft, sticking_points: [{ text: 'Relocation still feels unclear', quote: 'relocation still confuses me' }], strategy_in_own_words: 'Rereads the notes.', student_note: 'Good.' });
  assert.deepEqual(groundSummary(d, { turns: t2, studentName: 'T', teachBack: 'none' }).summary.sticking_points, ['Relocation still feels unclear']);
});

test('in other kinds, a gap claim stands when the student\'s words are about that topic', () => {
  const t3: T[] = [{ role: 'assistant', content: 'Read the listing.' }, { role: 'user', content: "I don't get what the U means in the nm output" }];
  const base = { mastery: 'developing', understood: [], teachback: 'x', next_step: 'nm', student_note: 'Keep going.' };
  const kept = DraftSummary.parse({ ...base, kind: 'concept', sticking_points: [{ text: 'Does not understand what U means in nm output', quote: "I don't get what the U means in the nm output" }] });
  assert.equal(groundSummary(kept, { turns: t3, studentName: 'T', teachBack: 'not_reached' }).summary.sticking_points.length, 1);
  const unrelated = DraftSummary.parse({ ...base, kind: 'concept', sticking_points: [{ text: 'Does not understand relocation entries', quote: "I don't get what the U means" }] });
  assert.equal(groundSummary(unrelated, { turns: t3, studentName: 'T', teachBack: 'not_reached' }).summary.sticking_points.length, 0);
});

test('every summary is told to describe behaviour, not attitude, and to say when evidence is thin', () => {
  assert.doesNotMatch(KINDS.reflection.summaryGuidance, /disengaged/);
  assert.match(KINDS.reflection.summaryGuidance, /Not enough information in this session/);
  assert.match(KINDS.reflection.summaryGuidance, /never conclude from it what content they do not know/);
});

test('a reflection that gets little offers something the learner did earlier', () => {
  assert.match(tutorialRulesFor(deliveryOf(9), 'reflection'), /offer one concrete thing they did in an earlier session/);
  for (const k of TUTORIAL_KINDS.filter((x) => x !== 'reflection')) assert.doesNotMatch(tutorialRulesFor(deliveryOf(9), k), /offer one concrete thing they did in an earlier session/);
});
