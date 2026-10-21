import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionsIn, progressNote, tutorialRulesFor } from './tutorials.js';
import { KINDS, TUTORIAL_KINDS } from './kinds.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 7: muddled verdicts ("Very close … you're right"),
// a direct question about Learning Activity 3 skipped, and a readiness check
// that said "no wrong answers" and then corrected answers.

test('questions in a student message are found; statements and the opening marker are not', () => {
  assert.deepEqual(questionsIn('Multiple definition of log_count. Is that what Learning Activity 3 uses, initialised or not? On older GCC with -fcommon they would be merged.'),
    ['Is that what Learning Activity 3 uses, initialised or not?']);
  assert.deepEqual(questionsIn('It links, because the copy is local.'), []);
  assert.deepEqual(questionsIn('why?'), [], 'too short to be a question about the course');
  // A hedged answer is not a question to answer (it would give Scenario C away).
  assert.deepEqual(questionsIn('C maybe also fails? not sure'), []);
  assert.deepEqual(questionsIn('So which program reports it, the compiler?'), ['So which program reports it, the compiler?']);
  assert.deepEqual(questionsIn('[Tutorial start]\nThe student has just opened this tutorial. Begin?'), []);
});

test('the progress note quotes the question and says to answer it first', () => {
  const note = progressNote(4, 10, 'EXPLORE', 'not_reached', 'Is that what Learning Activity 3 uses, initialised or not?');
  assert.match(note, /The student asked you: "Is that what Learning Activity 3 uses, initialised or not\?"\. Answer that first/);
  assert.doesNotMatch(progressNote(4, 10, 'EXPLORE', 'not_reached', 'It links.'), /The student asked you/);
});

test('every kind says plainly what is right and what is not, and answers direct questions', () => {
  for (const kind of TUTORIAL_KINDS) {
    const rules = tutorialRulesFor(deliveryOf(9), kind);
    assert.match(rules, /When everything in their answer is right, say so plainly first/, kind);
    assert.match(rules, /never say "very close" or "almost" and then agree with them/, kind);
    assert.match(rules, /credit a different part of the turn that is right, by name/, kind);
    assert.match(rules, /answer it in your first sentence, or say plainly that you cannot see that in the materials/, kind);
  }
});

test('the readiness check says it is not graded, not that there are no wrong answers', () => {
  for (const t of [1, 9, 10]) {
    const guide = KINDS.readiness.stageGuide(deliveryOf(t)).join('\n');
    assert.doesNotMatch(guide, /no wrong answers/);
    assert.match(guide, /it is not graded/);
  }
});
