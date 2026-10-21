import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundSummary, DraftSummary, NO_TEACH_BACK, TEACH_BACK_NOT_REACHED } from './tutorials.js';
import { stageForRun, stageFor, keyTermsFor } from './kinds.js';

// Usability report, Finding 2. Fixtures follow the report's evidence: the
// student lines it quotes are verbatim, the rest are reconstructed in the
// same shape. The drafts are what the summary model produced before the fix.

const HERO = {
  learning_goal: 'Explain why a program can compile cleanly but fail to link: the compiler checks each file against declarations, and the linker resolves symbols across object files.',
  success_criteria: 'Says the compiler works one file at a time and trusts the prototype; the linker matches undefined symbols to definitions in other object files; reads an undefined reference error as a missing definition.',
};
const TERMS = keyTermsFor(HERO);
type T = { role: 'user' | 'assistant'; content: string };

/** A transcript: the tutor's turns interleaved before each student turn. */
function transcript(tutor: string[], student: string[]): T[] {
  const out: T[] = [];
  student.forEach((s, i) => { out.push({ role: 'assistant', content: tutor[i] ?? 'What do you notice?' }); out.push({ role: 'user', content: s }); });
  return out;
}
const RECAP = "Here's what I heard: each .c file compiles on its own into an object file, the compiler trusts the prototype, and the linker resolves the symbols across object files, so a missing definition only shows up at link time. Did I get that right?";

/** Pad exploration turns so the last replies land after the teach-back prompt. */
function toTeachBack(exploration: string[], ...replies: string[]): string[] {
  let start = 1;
  while (stageFor('concept', start, 15).stage !== 'TEACH-BACK') start++;
  const pad = [...exploration];
  while (pad.length < start) pad.push('ok');
  return [...pad.slice(0, start), ...replies];
}

// Round 1, "Compiled clean": tentative answers, then a one-line yes to the tutor's recap.
const R1_STUDENT = toTeachBack(
  [
    'um I think it compiles because main.c has the prototype? not sure',
    'it mentions add_member twice maybe because it is called twice',
    'I think B fails at the link step',
    'C maybe also fails? not sure',
  ],
  "Yes, that's right. Thanks, that's a really clear summary",
);
const R1 = transcript([...R1_STUDENT.slice(0, -1).map(() => 'What would the compiler do here?'), RECAP], R1_STUDENT);
const R1_DRAFT = DraftSummary.parse({
  kind: 'concept',
  mastery: 'solid',
  understood: [
    { text: 'Accurately restated the core idea: the compiler checks one file, the linker resolves symbols', quote: "Yes, that's right", source: 'explained' },
    { text: 'Predicted all three scenarios correctly', quote: 'I think B fails at the link step', source: 'explained' },
    { text: 'Self-corrected on the call-site count', quote: 'it mentions add_member twice', source: 'explained' },
  ],
  sticking_points: [
    { text: 'Thought the error count matched call sites (corrected by tutor)', quote: 'it mentions add_member twice maybe because it is called twice' },
  ],
  teachback: 'Test Student1 accurately restated the core idea in their own words.',
  next_step: 'Read nm output for an object file',
  student_note: 'Great work, Test! You accurately restated the core idea in your own words. You even caught yourself on the call-site count and self-corrected. Next, practise reading nm output.',
});

test('round 1: a session ending in "yes" earns no teach-back, no restating credit and no "Solid"', () => {
  const tb = stageForRun('concept', R1_STUDENT, 15, TERMS).teachBack;
  assert.notEqual(tb, 'explained');
  const { summary, dropped } = groundSummary(R1_DRAFT, { turns: R1, studentName: 'Test Student1', teachBack: tb });
  const all = JSON.stringify(summary);
  assert.doesNotMatch(all, /accurately restated/i);
  assert.doesNotMatch(all, /self-corrected|caught yourself/i);
  assert.equal((summary as unknown as { teachback: string }).teachback, NO_TEACH_BACK);
  assert.equal(summary.mastery, 'developing');
  // The tutor's recap is not the student's understanding, and its flattering wording goes entirely.
  assert.ok(!summary.understood.some((u) => /restated/i.test(u)));
  // Not checkable here: whether "all three" predictions were right. The quote
  // is real, so the item stays; the prompt rules and the live replay cover it.
  // The real wrong answer stays a sticking point, with the student's own quote behind it.
  assert.equal(summary.sticking_points.length, 1);
  assert.ok(dropped.length >= 2);
  assert.match(summary.student_note, /nm output/);
});

// Round 2, "Compiled clean": a strong student who really taught it back.
const R2_TEACHBACK = 'So each .c file becomes an object file with promises and offers: the compiler trusts the prototype as a promise, and the linker has to match every undefined symbol to exactly one definition in some object file. If nothing offers add_member you get an undefined reference.';
const R2_STUDENT = toTeachBack(
  [
    'It compiles because the prototype in main.c tells the compiler the signature; the compiler never looks in other files.',
    'The message shows up once per use of the symbol, so twice.',
    'On older GCC with -fcommon the tentative definitions would be merged; GCC 10 defaults to -fno-common so you get multiple definition.',
  ],
  R2_TEACHBACK,
);
// The tutor uses the same vocabulary throughout; a long explanation is still the student's own.
const R2 = transcript(R2_STUDENT.map(() => 'Which step resolves the symbol, the compiler or the linker, and where does the definition live?'), R2_STUDENT);
const R2_DRAFT = DraftSummary.parse({
  kind: 'concept',
  mastery: 'solid',
  understood: [
    { text: 'The compiler trusts the prototype and works one file at a time', quote: 'the prototype in main.c tells the compiler the signature', source: 'explained' },
    { text: 'The linker matches each undefined symbol to one definition', quote: 'the linker has to match every undefined symbol to exactly one definition', source: 'explained' },
  ],
  sticking_points: [],
  teachback: 'Student explained that each .c file becomes an object with promises and offers that the linker matches.',
  next_step: 'Static versus shared libraries',
  student_note: 'Test, you explained the core idea in your own words: promises and offers, matched by the linker. Next, look at static versus shared libraries.',
});

test('round 2: a real teach-back keeps its credit, its line and its rating', () => {
  const tb = stageForRun('concept', R2_STUDENT, 15, TERMS).teachBack;
  assert.equal(tb, 'explained');
  const { summary, dropped } = groundSummary(R2_DRAFT, { turns: R2, studentName: 'Test Student2', teachBack: tb });
  assert.deepEqual(dropped, []);
  assert.equal(summary.mastery, 'solid');
  assert.equal(summary.understood.length, 2);
  assert.match((summary as unknown as { teachback: string }).teachback, /promises and offers/);
  assert.match(summary.student_note, /in your own words/);
});

test('every kept item traces to a quoted student turn', () => {
  for (const [draft, texts, turns] of [[R1_DRAFT, R1_STUDENT, R1], [R2_DRAFT, R2_STUDENT, R2]] as const) {
    const { summary } = groundSummary(draft, { turns, studentName: 'Test', teachBack: stageForRun('concept', [...texts], 15, TERMS).teachBack });
    for (const text of [...summary.understood, ...summary.sticking_points]) {
      const item = [...draft.understood, ...draft.sticking_points].find((i) => i.text === text)!;
      assert.ok(texts.some((t) => t.toLowerCase().includes(item.quote.toLowerCase())), text);
    }
  }
});

// Round 2, Part B start and My learning: agreement credited as explanation, a
// topic only the tutor raised filed as a gap, and an experiment "in your mind".
test('round 2: tutor-supplied ideas move to "told", tutor-only topics and mental experiments are dropped', () => {
  const student = [
    'Every process gets its own copy of libc in RAM, I think.',
    'Oh, so the read-only pages are shared. That makes sense.',
    'For the second part I would rebuild the library and run both binaries.',
  ];
  const draft = DraftSummary.parse({
    kind: 'assignment_start',
    mastery: 'solid',
    understood: [
      { text: 'Shared read-only code pages are safely shared across processes in RAM', quote: 'the read-only pages are shared', source: 'explained' },
      { text: 'Plans to rebuild the library and compare both binaries', quote: 'I would rebuild the library and run both binaries', source: 'explained' },
    ],
    sticking_points: [
      { text: 'Needs concrete practice with dlopen and dlsym', quote: 'dlopen' },
      { text: 'Believed each process gets its own copy of libc', quote: 'Every process gets its own copy of libc in RAM' },
    ],
    task_understanding: 'clear', plan: 'Rebuild the library and compare.', first_step: 'Rebuild the library.', sources_used: [],
    next_step: 'Dynamic loading', student_note: 'When you ran the library rebuild experiment in your mind, you saw exactly which binary changes and why. Next, try it on your VM.',
  });
  const turns = transcript([
    'Before we plan: what happens to libc when two processes use it?',
    'Not quite. Each process maps the same shared read-only code pages of libc, so RAM holds one copy. What does that mean for your second claim?',
    'Good. What is your first step?',
  ], student);
  const { summary } = groundSummary(draft, { turns, studentName: 'Test Student2', teachBack: 'none' });
  assert.deepEqual(summary.understood, ['Plans to rebuild the library and compare both binaries']);
  assert.deepEqual(summary.told, ['Shared read-only code pages are safely shared across processes in RAM']);
  assert.deepEqual(summary.sticking_points, ['Believed each process gets its own copy of libc']);
  assert.doesNotMatch(summary.student_note, /in your mind/);
  assert.match(summary.student_note, /VM/);
});

test('a tutorial that ends before the teach-back says so, and the rating is capped', () => {
  const { summary } = groundSummary(R2_DRAFT, { turns: R2.slice(0, 4), studentName: 'Test', teachBack: 'not_reached' });
  assert.equal((summary as unknown as { teachback: string }).teachback, TEACH_BACK_NOT_REACHED);
  assert.equal(summary.mastery, 'developing');
});

test('a note left empty by grounding falls back to a plain line', () => {
  const draft = DraftSummary.parse({ ...R1_DRAFT, student_note: 'You accurately restated it. You self-corrected.' });
  const { summary } = groundSummary(draft, { turns: R1, studentName: 'Test Student1', teachBack: 'waiting' });
  assert.equal(summary.student_note, 'Thanks for working through this session, Test. Next: Read nm output for an object file');
});

test('items given as plain strings by the model still parse, as unsupported', () => {
  const draft = DraftSummary.parse({ ...R2_DRAFT, understood: ['Knows the linker resolves symbols'], sticking_points: ['Something'] });
  const { summary } = groundSummary(draft, { turns: R2, studentName: 'Test', teachBack: 'explained' });
  assert.deepEqual(summary.understood, []);
  assert.deepEqual(summary.told, ['Knows the linker resolves symbols']);
  assert.deepEqual(summary.sticking_points, []);
});
