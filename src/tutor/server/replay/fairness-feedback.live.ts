/**
 * Live replay for usability Findings 5 and 7, on the live COMP 2131 briefs.
 * Run with `npm run test:live`. Each case is sampled three times.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '../../../core/anthropic.js';
import { textOf } from '../../../core/llm.js';
import { env } from '../env.js';
import { tutorTurnRequest, summarizeRun, briefFor, type Tutorial, tutorModelOptions } from '../tutorials.js';
import { learnerModelBlock } from '../learner.js';
import { ctx, hero, partB, partBRound2, reflection, reflectionTerse, round1ToRecap, round2, materials, t } from './fixtures.js';
import { ROWS, B } from './comp2131-concepts.js';
import type { Turn } from '../../../core/conversations.js';

const live = !!process.env.ANTHROPIC_API_KEY;
const MATERIALS = materials();
const first = (s: string) => s.split(/(?<=[.!?])\s+/)[0] ?? '';
// Student B's learner model before the reflection: three earlier sessions.
const EARLIER = learnerModelBlock(ROWS.filter((r) => r.student === B && r.at < '2026-10-21 02:28').map((r, i) => ({
  id: i, student_id: 2, concept: r.concept, status: r.status, evidence: '', source_tutorial_session_id: null, concept_id: null, first_seen: r.at, last_seen: r.at,
})));
const ATTITUDE = /\b(dis-?engaged|unmotivated|lazy|rushed|careless|apathetic|uninterested|not trying|minimal effort|low effort)\b/i;
const GAP = /\b(does ?n[o']t|did ?n[o']t|cannot|unable to) (recogni[sz]e|understand|know|grasp)|\bno (strategy|understanding)\b|conflat/i;

async function replies(tutorial: Tutorial, turns: Turn[], learnerBlocks: string[] = []): Promise<string[]> {
  const req = tutorTurnRequest({ tutorial, ctx, turns, student: { display_name: 'Test Student' }, profile: null, materials: MATERIALS, brief: await briefFor(tutorial, ctx), learnerBlocks });
  return Promise.all([1, 2, 3].map(async () => textOf(await getAnthropic().messages.create({ ...tutorModelOptions(), system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
}

test('Finding 5: three terse replies get no attitude label, no invented gap, and a pointer to earlier work', { skip: !live }, async () => {
  const { summary } = await summarizeRun({ tutorial: reflection, brief: await briefFor(reflection, ctx), turns: reflectionTerse, studentName: 'Test Student2', attribution: { endpoint: 'replay' }, materials: MATERIALS, earlier: EARLIER });
  console.log('\nreflection summary:', JSON.stringify(summary, null, 1));
  const all = JSON.stringify(summary);
  assert.doesNotMatch(all, ATTITUDE);
  assert.doesNotMatch(all, GAP);
  assert.match(all, /earlier|previous|before|Not enough information/i, 'points to earlier sessions or says the session was thin');
});

test('Finding 5: after "idk" the reflection offers something the student did earlier, without judging', { skip: !live }, async () => {
  const out = await replies(reflection, reflectionTerse.slice(0, 2), [EARLIER]);
  for (const r of out) {
    console.log(`\n${r}`);
    assert.doesNotMatch(r, /you need to engage|try harder|more effort|put in (some|more) effort|you should have|not trying/i);
  }
  assert.ok(out.filter((r) => /nm|ldd|earlier|Learning Activity|extern|static|symbol|shared/i.test(r)).length >= 2, 'mostly connects to earlier work');
});

test('Finding 7: a correct Scenario A answer gets a plain "yes", not "very close"', { skip: !live }, async () => {
  const out = await replies(hero, round1ToRecap.slice(0, 8));
  for (const r of out) {
    console.log(`\n${first(r)}`);
    assert.doesNotMatch(r, /very close|almost/i);
    assert.match(first(r), /\b(yes|right|correct|exactly|that's it|spot on|you've got|you have got)\b/i);
  }
});

test('Finding 7: "Is that what Learning Activity 3 uses?" is answered in the first sentence', { skip: !live }, async () => {
  const out = await replies(hero, round2.slice(0, 8));
  for (const r of out) {
    console.log(`\n${first(r)}`);
    assert.match(first(r), /log_count|initiali[sz]ed|= 0|cannot see|can't see|Learning Activity 3 (does|uses|declares|has|is)/i);
  }
});

test('Finding 7: a wrong ldd prediction gets a verdict, not silence', { skip: !live }, async () => {
  const turns = [...partBRound2, t('assistant', 'Take a first step: predict what ldd will report for shop_a and shop_so.'), t('user', 'ldd on shop_a says not a dynamic executable, and shop_so lists libdeal.so and libc.')];
  const out = await replies(partB, turns);
  for (const r of out) {
    console.log(`\n${first(r)}`);
    assert.match(r, /shop_a/);
    assert.match(r, /libc|dynamic|C library|run ldd|check/i);
  }
});
