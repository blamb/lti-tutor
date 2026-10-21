import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressNote, groundSummary, DraftSummary } from './tutorials.js';
import { KINDS, READINESS_WRAP_UP_WORDS } from './kinds.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 9: the readiness check ended with a ~170-word
// preview of Topic 6, Learning Activities 4 and 5 and their programs.

test('the readiness wrap-up is two sentences under the word limit, with no previews', () => {
  const guide = KINDS.readiness.stageGuide(deliveryOf(9)).join('\n');
  assert.match(guide, new RegExp(`two sentences, under ${READINESS_WRAP_UP_WORDS} words`));
  assert.match(guide, /never by activity, step, topic number or program name, never previewing what later activities do/);
  const note = progressNote(3, 4, 'WRAP-UP', 'none', 'I think each process gets its own copy of libc.', 'readiness');
  assert.match(note, /Write exactly two sentences and nothing else/);
  assert.doesNotMatch(progressNote(3, 4, 'WRAP-UP', 'none', 'x', 'concept'), /Write exactly two sentences/);
});

test('a readiness check notes a false claim neutrally instead of correcting it, even at the end', () => {
  const note = progressNote(3, 4, 'WRAP-UP', 'none', 'I think each process gets its own copy of libc.', 'readiness');
  assert.match(note, /do not correct it and do not praise or agree with it; acknowledge it neutrally/);
  assert.doesNotMatch(note, /your reply opens by stating the correct fact/);
  assert.match(progressNote(3, 10, 'EXPLORE', 'none', 'x', 'concept'), /your reply opens by stating the correct fact/);
});

test('the readiness summary keeps at most two things to watch for', () => {
  const draft = DraftSummary.parse({
    kind: 'readiness', mastery: 'developing', understood: [], sticking_points: [], next_step: 'x', student_note: 'x',
    prior_knowledge: 'some', misconceptions_found: [], watch_for: ['symbol resolution', 'relocation', 'Topic 6 dlopen', 'Learning Activity 5 sizes'],
  });
  const { summary } = groundSummary(draft, { turns: [], studentName: 'T', teachBack: 'none' });
  assert.deepEqual((summary as unknown as { watch_for: string[] }).watch_for, ['symbol resolution', 'relocation']);
  assert.match(KINDS.readiness.summaryExtras, /up to 2 short pointers/);
});
