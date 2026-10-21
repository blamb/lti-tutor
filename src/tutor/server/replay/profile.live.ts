/** Live replay for usability Finding 11: a consistent greeting, and the student's Java background used. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '../../../core/anthropic.js';
import { textOf } from '../../../core/llm.js';
import { env } from '../env.js';
import { tutorTurnRequest, briefFor, START_MARKER, type StudentProfile, tutorModelOptions } from '../tutorials.js';
import { ctx, hero, round2, materials, t } from './fixtures.js';
import type { Turn } from '../../../core/conversations.js';

const live = !!process.env.ANTHROPIC_API_KEY;
// Test Student2's profile in the report ("fictional test profile").
const PROFILE: StudentProfile = { student_id: 2, program: 'Computer science, 2nd year', goal: 'systems programming', background: 'Python and Java, some C; Makefiles', struggles: '', interests: 'tinkering with a home server', updated_at: '' };

async function replies(turns: Turn[]): Promise<string[]> {
  const req = tutorTurnRequest({ tutorial: hero, ctx, turns, student: { display_name: 'Test Student2' }, profile: PROFILE, materials: materials(), brief: await briefFor(hero, ctx) });
  return Promise.all([1, 2, 3].map(async () => textOf(await getAnthropic().messages.create({ ...tutorModelOptions(), system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
}

test('Finding 11: the opening greets the student by first name every time', { skip: !live }, async () => {
  const out = await replies([t('user', `${START_MARKER}\nThe student has just opened this tutorial. Begin.`)]);
  for (const r of out) { console.log(`\n${r.split('\n')[0]}`); assert.match(r.split(/(?<=[.!?])\s+/)[0]!, /\bTest\b/); }
});

test('Finding 11: "static works like final in Java" gets a correction in Java terms', { skip: !live }, async () => {
  const turns = [...round2.slice(0, 8), t('assistant', 'Good. Before Scenario C: what does static do to log_count in members.c?'), t('user', 'static works like final in Java, so the value cannot change.')];
  const out = await replies(turns);
  for (const r of out) console.log(`\n${r}`);
  assert.ok(out.filter((r) => /\bJava\b|\bfinal\b/.test(r)).length >= 2, 'mostly connects the correction to Java');
});
