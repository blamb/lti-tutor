/**
 * Live replay for usability Finding 9 on the live readiness brief: the
 * wrap-up stays short and previews no later activity. `npm run test:live`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '../../../core/anthropic.js';
import { textOf } from '../../../core/llm.js';
import { env } from '../env.js';
import { tutorTurnRequest, briefFor, tutorModelOptions } from '../tutorials.js';
import { ctx, readiness, readinessRound2, materials, t } from './fixtures.js';

const LATER = /Learning Activity \d|Topic [2-6]|\bStep \d|shop_\w+|dlopen|dlsym|PC-relative|\bldd\b/i;

test('Finding 9: the readiness wrap-up is short, corrects the last false claim and names no later activity', { skip: !process.env.ANTHROPIC_API_KEY }, async () => {
  const req = tutorTurnRequest({ tutorial: readiness, ctx, turns: readinessRound2, student: { display_name: 'Test Student2' }, profile: null, materials: materials(), brief: await briefFor(readiness, ctx) });
  assert.equal(req.stage, 'WRAP-UP');
  // Measured on 2026-10-20: 31-61 words over 8 runs (before: 149-189, two naming Learning Activities 4 and 5).
  // Since readiness checks correct a false fact, the wrap-up starts with one sentence correcting the libc
  // claim: 45-64 words on Haiku 5.5 (one at 98) and 67-115 on Haiku 4.5 over 8 runs each.
  const out = await Promise.all([1, 2, 3].map(async () => textOf(await getAnthropic().messages.create({ ...tutorModelOptions(), system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
  for (const r of out) {
    const words = r.split(/\s+/).filter(Boolean).length;
    console.log(`\n[${words} words] ${r}`);
    assert.ok(words <= 120, `${words} words`);
    assert.doesNotMatch(r, LATER);
  }
  assert.ok(out.filter((r) => /share|shared|one copy|single copy/i.test(r)).length >= 2, 'mostly corrects the libc claim');
});

const PRAISE = /\b(good|great|exactly|spot on|right direction|i like that|nice|well done)\b/i;

test('a false claim mid-check is corrected in a sentence, without praise, and the check moves on', { skip: !process.env.ANTHROPIC_API_KEY }, async () => {
  const turns = [readinessRound2[0]!, t('user', 'I think gcc just turns the C into a program in one step, and printf is already built into the computer somewhere.')];
  const req = tutorTurnRequest({ tutorial: readiness, ctx, turns, student: { display_name: 'Test Student2' }, profile: null, materials: materials(), brief: await briefFor(readiness, ctx) });
  assert.equal(req.stage, 'PROBE');
  // Measured 2026-10-20 (8 runs): the correct fact in the first two sentences 6/8 (Haiku 5.5), 8/8 (Haiku 4.5); no praise; next question 8/8, 7/8.
  const out = await Promise.all(Array.from({ length: 6 }, async () => textOf(await getAnthropic().messages.create({ ...tutorModelOptions(), system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
  const head = (r: string, n = 2) => r.split(/(?<=[.!?])\s+/).slice(0, n).join(' ');
  for (const r of out) {
    console.log(`\n${r}`);
    assert.doesNotMatch(head(r, 1), PRAISE);
  }
  assert.ok(out.filter((r) => /several|separate (tools|steps|stages)|in sequence|stages|linker|C library|libc/i.test(head(r))).length >= 3, 'mostly states the correct fact early');
  assert.ok(out.filter((r) => /\?\s*$/.test(r.trim())).length >= 4, 'mostly moves on with the next question');
});
