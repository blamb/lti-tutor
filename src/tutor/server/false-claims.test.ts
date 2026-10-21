import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tutorialRulesFor, progressNote } from './tutorials.js';
import { KINDS, TUTORIAL_KINDS } from './kinds.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 1: "static binaries are smaller" was praised,
// built on four times and written into the summary as the first step.

test('every kind, in every delivery mode, forbids praising or building on a false claim', () => {
  for (const kind of TUTORIAL_KINDS) {
    for (const truflex of [1, 9, 10]) {
      const rules = tutorialRulesFor(deliveryOf(truflex), kind);
      assert.match(rules, /check every factual claim/, `${kind} ${truflex}`);
      assert.match(rules, /do not praise or agree with that turn/, kind);
      assert.match(rules, /never build on the claim/, kind);
      assert.match(rules, /Pushing back with only a question is not enough for a false fact/, kind);
      assert.match(rules, /never call a false prediction good/, kind);
    }
  }
});

test('the readiness check still notes misconceptions without correcting them, but never agrees with them', () => {
  const rules = KINDS.readiness.rules(deliveryOf(9)).join('\n');
  assert.match(rules, /do not correct it now, and do not praise or agree with it either/);
  // The shared correction rule defers to it.
  assert.match(tutorialRulesFor(deliveryOf(9), 'readiness'), /Unless the kind-specific rules below say to note misconceptions without correcting them/);
});

test('each reply after a student turn is reminded to check that turn, predictions excepted', () => {
  assert.doesNotMatch(progressNote(0, 10, 'UNPACK', 'none'), /check each statement of fact/);
  const note = progressNote(2, 10, 'UNPACK', 'none');
  assert.match(note, /check each statement of fact in the student's last message/);
  assert.match(note, /A prediction they are about to test is not a statement of fact: follow the brief, never call it good/);
});

test('the assignment-start summary never makes a false claim the first step', () => {
  assert.match(KINDS.assignment_start.summaryExtras, /if the step rests on a false claim .* say so in the sentence/);
});
