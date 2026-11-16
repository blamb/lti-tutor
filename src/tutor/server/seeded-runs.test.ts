// Usability report of 2026-11-16 (six seeded test runs on COMP 2131 Module 8).
// The transcripts were not kept, so these fixtures are reconstructions in
// the shape the report describes, not recordings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundSummary, DraftSummary, studentFacing, debriefSystemFor, tutorialRulesFor, type Tutorial, type TutorialSession } from './tutorials.js';
import { KINDS, teachBackAskedAt, isTeachBackAsk } from './kinds.js';
import { deliveryOf } from './delivery.js';
import { buildHomeProgress } from './progress.js';
import { courseCtxFromSettings, defaultCourseSettings } from './courses.js';

// Finding 3: the tutor gave away what a Learning Activity shows (the sizes of
// shop_a and shop_so) to students who had not run it.
test('the tutor is told not to state the result of an activity the student runs', () => {
  const rules = tutorialRulesFor(deliveryOf(9), 'concept');
  assert.match(rules, /never state its result \(the output, the sizes, the values, the error it produces\) before they have told you what they got/);
  assert.doesNotMatch(rules, /Say what the materials say happens/);
});

// Finding 8: the status chip jumped to "Teach it back" on an early probe.
test('"in your own words" in an ordinary probe is not the teach-back ask', () => {
  const probe = 'In your own words, what does the U in that nm listing mean?';
  assert.equal(isTeachBackAsk(probe), false);
  assert.equal(teachBackAskedAt([
    { role: 'assistant', content: 'Hi! What does the compiler know about a function in another file?' },
    { role: 'user', content: 'only the prototype' },
    { role: 'assistant', content: probe },
    { role: 'user', content: 'undefined' },
  ]), null);
  // Asking for the whole idea, or naming the audience, still is.
  assert.equal(isTeachBackAsk('Now put it all together: in your own words, why can a program compile and still fail to link?'), true);
  assert.equal(isTeachBackAsk('Explain the core idea in your own words.'), true);
  assert.equal(isTeachBackAsk('Explain it as if to someone who has never studied this.'), true);
});

test('a reflection that ends with a plan is not rated as too brief', () => {
  assert.match(KINDS.reflection.summaryGuidance, /named a concrete plan in their own words is at least "developing"/);
});

// Finding 9: "the student" and "the brief" in text the student reads.
test('summary lines read naturally to the student', () => {
  assert.equal(studentFacing('The student explained why the linker needs a definition'), 'Explained why the linker needs a definition');
  assert.equal(studentFacing('Student mixed up declaring with defining'), 'Mixed up declaring with defining');
  assert.equal(studentFacing('Review the nm letters the brief lists'), 'Review the nm letters the session plan lists');
  assert.equal(studentFacing("Did not reach the brief's last probe."), "Did not reach the session plan's last probe.");
  // "brief" as an adjective, and a possessive, are left alone.
  assert.equal(studentFacing('Gave the brief answer "idk"'), 'Gave the brief answer "idk"');
  assert.equal(studentFacing("The student's plan is to rerun gcc with -c"), "The student's plan is to rerun gcc with -c");
});

test('grounding applies the student-facing wording to every field', () => {
  const said = 'I would rebuild the library first and then run both of the binaries again';
  const draft = DraftSummary.parse({
    kind: 'assignment_start', mastery: 'developing',
    understood: [{ text: 'The student plans to rebuild the library and compare both binaries', quote: said, source: 'explained' }],
    sticking_points: [],
    task_understanding: 'clear', plan: 'The student will rebuild the library, as the brief describes.', first_step: 'Rebuild the library.', sources_used: [],
    next_step: 'Check the two parts the brief lists.', student_note: 'Test, you made a real plan. One thing from the brief to revisit is the evidence for each part.',
  });
  const { summary } = groundSummary(draft, { turns: [{ role: 'assistant', content: 'What is your first step?' }, { role: 'user', content: said }], studentName: 'Test Student3', teachBack: 'none' });
  assert.deepEqual(summary.understood, ['Plans to rebuild the library and compare both binaries']);
  assert.equal((summary as unknown as { plan: string }).plan, 'Will rebuild the library, as the session plan describes.');
  for (const text of [summary.next_step, summary.student_note]) assert.doesNotMatch(text, /\bthe brief\b/);
});

// Finding 8: "Partly ready" beside "solid prior knowledge".
function readiness(mastery: string, prior: string, misconceptions: string[] = []) {
  const draft = DraftSummary.parse({
    kind: 'readiness', mastery, understood: [], sticking_points: [], next_step: 'x', student_note: 'x',
    prior_knowledge: prior, misconceptions_found: misconceptions, watch_for: [],
  });
  return groundSummary(draft, { turns: [], studentName: 'T', teachBack: 'none' }).summary as unknown as { mastery: string; prior_knowledge: string };
}
test('a readiness summary never shows two verdicts that disagree', () => {
  // Nothing the student can see explains the gap: the unevidenced "solid" gives way.
  assert.deepEqual(readiness('developing', 'solid'), { ...readiness('developing', 'solid'), mastery: 'developing', prior_knowledge: 'some' });
  // A misconception explains it: both stand.
  assert.equal(readiness('developing', 'solid', ['the compiler links the headers']).prior_knowledge, 'solid');
  // No prior knowledge is never "Ready".
  assert.equal(readiness('solid', 'none').mastery, 'developing');
});

// Finding 2: the debrief of Assignment 3 Part B asked the assignment's own questions.
test('the debrief of an assignment description asks about getting ready, not the subject', () => {
  for (const live of [true, false]) {
    const reading = debriefSystemFor(live, 'reading', 'Ada');
    assert.match(reading, /## Three questions to test yourself/);
    assert.doesNotMatch(reading, /assignment description/);
    const assignment = debriefSystemFor(live, 'assignment', 'Ada');
    assert.match(assignment, /## Three questions to ask yourself before you start/);
    assert.match(assignment, /Never a question the assignment itself asks/);
    assert.match(assignment, /Never answer, outline, draft or hint at/);
    assert.match(assignment, /Consider this in your context, Ada/);
  }
});

// Finding 11: the reflection nudge counted only Tutorials.
test('the reflection nudge counts every kind of session finished since the last reflection', async () => {
  const tut = (p: Partial<Tutorial> & { id: number; title: string }): Tutorial => ({
    lti_iss: 'i', lti_context_id: 'c', learning_goal: '', opening_question: '', ta_brief: '', misconceptions: '', success_criteria: '',
    pitch: '', kind: 'concept', practice_prompts: '', recall_tutorial_ids: [], suggested_after_tutorial_id: null, week: null, due_at: null,
    material_ids: [], concept_ids: [], student_goal: '', target_minutes: 15, gradebook: false, status: 'published', created_by: null, created_at: '', updated_at: '', ...p,
  });
  const done = (id: number, at: string): [number, TutorialSession] =>
    [id, { id, tutorial_id: id, student_id: 1, session_id: id, status: 'completed', started_at: at, completed_at: at, summary: null, nps_score: null, nps_comment: null, prep_score: null, prep_comment: null, grade_posted_at: null, grade_error: null }];
  const ctx = courseCtxFromSettings('i', 'c', 'T', defaultCourseSettings('i', 'c', 9));
  const tutorials = [
    tut({ id: 1, title: 'Readiness: linking', kind: 'readiness' }),
    tut({ id: 2, title: 'Start Assignment 3', kind: 'assignment_start' }),
    tut({ id: 3, title: 'Reflect on Module 8', kind: 'reflection' }),
  ];
  const now = new Date('2026-11-16T12:00:00Z');
  const p = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map([done(1, '2026-11-10T00:00:00Z'), done(2, '2026-11-11T00:00:00Z')]), now });
  const nudge = p.nudges.find((n) => n.kind === 'reflection');
  assert.ok(nudge, 'a readiness check and an assignment start count');
  assert.match(nudge.text, /finished 2 sessions since you last reflected/);
  const after = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map([done(1, '2026-11-10T00:00:00Z'), done(2, '2026-11-11T00:00:00Z'), done(3, '2026-11-12T00:00:00Z')]), now });
  assert.equal(after.nudges.filter((n) => n.kind === 'reflection').length, 0);
});
