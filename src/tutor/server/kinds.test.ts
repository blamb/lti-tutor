import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, TUTORIAL_KINDS, stageFor, targetExchanges, isTutorialKind, titledForKind } from './kinds.js';
import { deliveryOf } from './delivery.js';

/** Walk a tutorial from turn 0 to well past its target and return the distinct stage sequence. */
function sequence(kind: (typeof TUTORIAL_KINDS)[number], minutes: number): string[] {
  const out: string[] = [];
  for (let t = 0; t <= 40; t++) {
    const { stage } = stageFor(kind, t, minutes);
    if (out[out.length - 1] !== stage) out.push(stage);
  }
  return out;
}

test('concept keeps the original four stages and target range', () => {
  assert.deepEqual(sequence('concept', 15), ['ORIENT', 'EXPLORE', 'TEACH-BACK', 'WRAP-UP']);
  assert.equal(targetExchanges('concept', 5), 6);
  assert.equal(targetExchanges('concept', 60), 24);
  assert.equal(targetExchanges('concept', 15), 10);
});

test('short kinds target 4–8 exchanges and have no teach-back', () => {
  for (const kind of ['readiness', 'preparation_check', 'reflection'] as const) {
    assert.equal(KINDS[kind].short, true);
    assert.equal(targetExchanges(kind, 5), 4);
    assert.equal(targetExchanges(kind, 60), 8);
    assert.ok(!sequence(kind, 15).includes('TEACH-BACK'), `${kind} must not have a teach-back`);
  }
});

test('each kind walks its stages in order and ends in WRAP-UP', () => {
  assert.deepEqual(sequence('readiness', 10), ['ORIENT', 'PROBE', 'WRAP-UP']);
  assert.deepEqual(sequence('preparation_check', 10), ['ORIENT', 'RECALL', 'CONNECT', 'WRAP-UP']);
  assert.deepEqual(sequence('practice', 20), ['SHARE', 'FEEDBACK', 'REVISE', 'MORE-PRACTICE', 'WRAP-UP']);
  assert.deepEqual(sequence('reflection', 10), ['OPEN', 'PROBE', 'PLAN', 'WRAP-UP']);
  assert.deepEqual(sequence('recall', 15), ['RETRIEVE', 'CONNECT', 'WRAP-UP']);
  for (const kind of TUTORIAL_KINDS) {
    const stages = KINDS[kind].stages;
    assert.equal(stages[stages.length - 1]!.name, 'WRAP-UP');
    assert.equal(stageFor(kind, 0, 15).stage, stages[0]!.name);
    assert.equal(stageFor(kind, 99, 15).stage, 'WRAP-UP');
  }
});

test('even the shortest practice session visits every stage', () => {
  assert.deepEqual(sequence('practice', 5), ['SHARE', 'FEEDBACK', 'REVISE', 'MORE-PRACTICE', 'WRAP-UP']);
});

test('assignment start walks unpack → connect → plan → first step → wrap-up at every length, and never writes for the learner', () => {
  for (const minutes of [5, 15, 60]) {
    assert.deepEqual(sequence('assignment_start', minutes), ['UNPACK', 'CONNECT', 'PLAN', 'FIRST-STEP', 'WRAP-UP'], `${minutes} minutes`);
  }
  assert.equal(KINDS.assignment_start.short, false);
  assert.ok(KINDS.assignment_start.prompts, 'uses the prompts field for first-step prompts');
  const text = [KINDS.assignment_start.purpose(deliveryOf(9)), ...KINDS.assignment_start.rules(deliveryOf(9))].join('\n');
  assert.match(text, /submittable/i);
  assert.match(text, /activity|activities|study question/i, 'reaches for the course\'s own activities');
  assert.match(text, /never .*grade/i);
  assert.equal(titledForKind('assignment_start', 'Assignment 1'), 'Assignment start: Assignment 1');
});

test('mode wording never mentions classes or weeks where the course has none', () => {
  const selfPaced = deliveryOf(9);
  const paced = deliveryOf(10);
  const scheduled = deliveryOf(3);
  for (const kind of TUTORIAL_KINDS) {
    const text = [KINDS[kind].purpose(selfPaced), ...KINDS[kind].rules(selfPaced), ...KINDS[kind].stageGuide(selfPaced)].join('\n');
    assert.doesNotMatch(text, /\b(class|classes|classmate|lecture|this week|week's)\b/i, `${kind} self-paced wording: ${text}`);
  }
  // Paced courses have weeks but no classes.
  const pacedReadiness = KINDS.readiness.stageGuide(paced).join('\n');
  assert.match(pacedReadiness, /this week/);
  assert.doesNotMatch(pacedReadiness, /\bclass\b/);
  // Scheduled courses may say "class".
  assert.match(KINDS.readiness.purpose(scheduled), /class/);
});

test('kind helpers', () => {
  assert.equal(isTutorialKind('practice'), true);
  assert.equal(isTutorialKind('quiz'), false);
  assert.equal(titledForKind('concept', 'Osmosis'), 'Tutorial: Osmosis');
  assert.equal(titledForKind('readiness', 'Osmosis'), 'Readiness check: Osmosis');
  const served = new Set(TUTORIAL_KINDS.flatMap((k) => KINDS[k].engagement));
  assert.deepEqual([...served].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
