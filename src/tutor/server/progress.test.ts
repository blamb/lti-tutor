// These tests touch no database: buildHomeProgress only queries when a
// recall session exists, and none of the fixtures has one. (The env the
// imports need comes from the npm test script.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentWeek, buildHomeProgress } from './progress.js';
import { courseCtxFromSettings, defaultCourseSettings } from './courses.js';
import type { Tutorial, TutorialSession } from './tutorials.js';

function tut(p: Partial<Tutorial> & { id: number; title: string }): Tutorial {
  return {
    lti_iss: 'i', lti_context_id: 'c', learning_goal: '', opening_question: '', ta_brief: '', misconceptions: '', success_criteria: '',
    pitch: '', kind: 'concept', practice_prompts: '', recall_tutorial_ids: [], suggested_after_tutorial_id: null, week: null, due_at: null,
    material_ids: [], concept_ids: [], target_minutes: 15, gradebook: false, status: 'published', created_by: null, created_at: '', updated_at: '', ...p,
  };
}
function done(id: number, completedAt: string): [number, TutorialSession] {
  return [id, { id, tutorial_id: id, student_id: 1, session_id: id, status: 'completed', started_at: completedAt, completed_at: completedAt, summary: null, nps_score: null, nps_comment: null, prep_score: null, prep_comment: null, grade_posted_at: null, grade_error: null }];
}
const NOW = new Date('2026-10-13T12:00:00Z');

test('currentWeek counts from the course start', () => {
  assert.equal(currentWeek(null), null);
  assert.equal(currentWeek('2026-09-01', new Date('2026-09-01T10:00:00Z')), 1);
  assert.equal(currentWeek('2026-09-01', new Date('2026-09-08T10:00:00Z')), 2);
  assert.equal(currentWeek('2026-09-01', NOW), 7);
  assert.equal(currentWeek('2027-01-01', NOW), 1, 'before the start counts as week 1');
});

test('self-paced: one group, no dates, readiness and reflection nudges, suggested next', async () => {
  const ctx = courseCtxFromSettings('i', 'c', 'T', defaultCourseSettings('i', 'c', 9));
  const tutorials = [
    tut({ id: 1, title: 'Readiness: cells', kind: 'readiness' }),
    tut({ id: 2, title: 'Cells', suggested_after_tutorial_id: 1 }),
    tut({ id: 3, title: 'Membranes', suggested_after_tutorial_id: 2, week: 3, due_at: '2026-10-15T00:00:00Z' }),
    tut({ id: 4, title: 'Reflect on unit 1', kind: 'reflection' }),
  ];
  const latest = new Map<number, TutorialSession>([done(1, '2026-10-01T00:00:00Z'), done(2, '2026-10-02T00:00:00Z')]);
  const p = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest, now: NOW });
  assert.equal(p.groups.length, 1, 'no weekly grouping without fixed dates');
  assert.equal(p.current_week, null);
  assert.deepEqual(p.suggested_next, [3]);
  assert.deepEqual(p.nudges.map((n) => n.kind), ['reflection']);
  assert.doesNotMatch(p.nudges.map((n) => n.text).join(' '), /week|due|cohort|class/i);
});

test('assignment start is nudged like a readiness check, without dates, and says it writes nothing', async () => {
  const ctx = courseCtxFromSettings('i', 'c', 'T', defaultCourseSettings('i', 'c', 9));
  const tutorials = [tut({ id: 1, title: 'Unit 1 tutorial' }), tut({ id: 2, title: 'Start Assignment 1', kind: 'assignment_start', suggested_after_tutorial_id: 1 })];
  const before = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map(), now: NOW });
  assert.equal(before.nudges.length, 0, 'waits for the session it follows');
  const after = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map([done(1, '2026-10-10T00:00:00Z')]), now: NOW });
  assert.deepEqual(after.nudges.map((n) => n.kind), ['assignment']);
  assert.match(after.nudges[0]!.text, /writes nothing for you/);
  assert.doesNotMatch(after.nudges[0]!.text, /week|due|cohort|class/i);
  const doneToo = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map([done(1, '2026-10-10T00:00:00Z'), done(2, '2026-10-11T00:00:00Z')]), now: NOW });
  assert.equal(doneToo.nudges.length, 0);
});

test('readiness nudge waits for the session it follows', async () => {
  const ctx = courseCtxFromSettings('i', 'c', 'T', defaultCourseSettings('i', 'c', 9));
  const tutorials = [tut({ id: 1, title: 'Cells' }), tut({ id: 2, title: 'Readiness: membranes', kind: 'readiness', suggested_after_tutorial_id: 1 })];
  const none = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map(), now: NOW });
  assert.equal(none.nudges.length, 0);
  const after = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map([done(1, '2026-10-10T00:00:00Z')]), now: NOW });
  assert.deepEqual(after.nudges.map((n) => n.kind), ['readiness']);
});

test('paced: weeks grouped with this week first, due and moved-on nudges', async () => {
  const settings = { ...defaultCourseSettings('i', 'c', 10), course_start: '2026-09-01' };
  const ctx = courseCtxFromSettings('i', 'c', 'T', settings);
  const tutorials = [
    tut({ id: 1, title: 'Week 5 tutorial', week: 5 }),
    tut({ id: 2, title: 'Week 7 tutorial', week: 7, due_at: '2026-10-16T00:00:00Z' }),
    tut({ id: 3, title: 'Week 8 tutorial', week: 8 }),
    tut({ id: 4, title: 'Any time', week: null }),
  ];
  const p = await buildHomeProgress({ ctx, studentId: 1, tutorials, latest: new Map(), now: NOW });
  assert.equal(p.current_week, 7);
  assert.deepEqual(p.groups.map((g) => g.label), ['This week (week 7)', 'Week 8', 'Week 5 (earlier)', 'Any time']);
  assert.deepEqual(p.nudges.map((n) => [n.kind, n.tutorial_id]), [['due', 2], ['moved_on', 1]]);
  assert.match(p.nudges[0]!.text, /due/);
  assert.match(p.nudges[1]!.text, /cohort has moved on/);
});

test('scheduled courses get weekly grouping too; no cohort means no moved-on nudge', async () => {
  const scheduled = courseCtxFromSettings('i', 'c', 'T', { ...defaultCourseSettings('i', 'c', 3), course_start: '2026-09-01' });
  const tutorials = [tut({ id: 1, title: 'Old', week: 2 })];
  const p = await buildHomeProgress({ ctx: scheduled, studentId: 1, tutorials, latest: new Map(), now: NOW });
  assert.deepEqual(p.nudges.map((n) => n.kind), ['moved_on']);
  const selfPaced = courseCtxFromSettings('i', 'c', 'T', defaultCourseSettings('i', 'c', 9));
  const q = await buildHomeProgress({ ctx: selfPaced, studentId: 1, tutorials, latest: new Map(), now: NOW });
  assert.equal(q.nudges.length, 0);
});
