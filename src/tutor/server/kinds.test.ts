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

// ─── Usability report, Finding 4: teach-back needs the student's own explanation ───

import { stageForRun, isExplanation, keyTermsFor, teachBackAskedAt, TEACH_BACK_MAX_HOLD } from './kinds.js';

// The hero session's goal, close to the COMP 2131 brief.
const HERO = {
  learning_goal: 'Explain why a program can compile cleanly but fail to link: the compiler checks each file against declarations, and the linker resolves symbols across object files.',
  success_criteria: 'Says the compiler works one file at a time and trusts the prototype; the linker matches undefined symbols to definitions in other object files; reads an undefined reference error as a missing definition.',
};
const TERMS = keyTermsFor(HERO);
const REAL = 'Each .c file is compiled on its own into an object file, and the compiler trusts the prototype. The linker then has to find a definition for every undefined symbol across the object files, so a missing definition only shows up as an undefined reference at link time.';
const ROUND_1_REPLY = "Yes, that's right. Thanks, that's a really clear summary";

/** Student turns that reach the teach-back prompt (concept, 15 minutes), then the given replies. */
function run(...replies: string[]): string[] {
  let start = 1;
  while (stageFor('concept', start, 15).stage !== 'TEACH-BACK') start++;
  return [...Array.from({ length: start }, (_, i) => `exploration answer ${i}`), ...replies];
}

test('key terms come from the goal and criteria', () => {
  for (const t of ['compi', 'linke', 'symbo', 'objec', 'defin']) assert.ok(TERMS.includes(t), t);
});

test('agreement and thanks are not explanations; a real one is', () => {
  for (const r of ['yes', 'ok thanks', ROUND_1_REPLY, 'Yes, that is exactly right, I agree with everything you said there, thank you so much']) {
    assert.equal(isExplanation(r, TERMS), false, r);
  }
  assert.equal(isExplanation(REAL, TERMS), true);
});

test('replying "yes" or "ok thanks" to the teach-back holds the stage', () => {
  for (const reply of ['yes', 'ok thanks', ROUND_1_REPLY]) {
    // Enough turns that the schedule alone would be in WRAP-UP.
    const turns = run(reply, reply, reply).slice(0, -1);
    while (stageFor('concept', turns.length, 15).stage !== 'WRAP-UP') turns.push(reply);
    const r = stageForRun('concept', turns, 15, TERMS);
    assert.equal(r.stage, 'TEACH-BACK', reply);
    assert.equal(r.teachBack, 'waiting');
  }
});

test('a real explanation lets the session move on to wrap-up', () => {
  const turns = run(REAL);
  while (stageFor('concept', turns.length, 15).stage !== 'WRAP-UP') turns.push('ok');
  const r = stageForRun('concept', turns, 15, TERMS);
  assert.equal(r.stage, 'WRAP-UP');
  assert.equal(r.teachBack, 'explained');
});

test('the hold is bounded, so a learner who cannot explain is never stuck', () => {
  const turns = run('yes');
  while (stageFor('concept', turns.length, 15).stage !== 'WRAP-UP') turns.push('yes');
  for (let i = 0; i < TEACH_BACK_MAX_HOLD; i++) turns.push('yes');
  const r = stageForRun('concept', turns, 15, TERMS);
  assert.equal(r.stage, 'WRAP-UP');
  assert.equal(r.teachBack, 'skipped');
});

test('before the teach-back prompt, and for kinds without one, nothing changes', () => {
  assert.equal(stageForRun('concept', ['a'], 15, TERMS).teachBack, 'not_reached');
  for (const kind of TUTORIAL_KINDS.filter((k) => k !== 'concept')) {
    for (let n = 0; n <= 30; n++) {
      const texts = Array.from({ length: n }, () => 'yes');
      assert.deepEqual(stageForRun(kind, texts, 15, TERMS), { ...stageFor(kind, n, 15), teachBack: 'none' }, `${kind} at ${n}`);
    }
  }
});

test('the teach-back guide asks first and never plays the idea back', () => {
  const guide = KINDS.concept.stageGuide(deliveryOf(9)).join('\n');
  assert.doesNotMatch(guide, /play back your understanding/i);
  assert.match(guide, /Do not explain, summarise or play back the idea yourself before they have/);
  assert.match(guide, /at most two sentences/);
});

test('a teach-back the tutor asks for early still counts', () => {
  const turns = [
    { role: 'assistant' as const, content: 'Hi! What does the compiler know?' },
    { role: 'user' as const, content: 'only the prototype' },
    { role: 'assistant' as const, content: 'Explain to someone who has never studied this why a program can compile and still fail to link.' },
    { role: 'user' as const, content: REAL },
  ];
  const at = teachBackAskedAt(turns);
  assert.equal(at, 1);
  assert.equal(stageForRun('concept', ['only the prototype', REAL], 15, TERMS, at).teachBack, 'explained');
  // Without the ask, two turns in is still before the teach-back.
  assert.equal(stageForRun('concept', ['only the prototype', REAL], 15, TERMS).teachBack, 'not_reached');
  // Ordinary probes that say "explain" are not the teach-back ask.
  assert.equal(teachBackAskedAt([turns[0]!, turns[1]!, { role: 'assistant', content: 'Can you explain what U means in the nm listing?' }]), null);
});
