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
import { ctx, readiness, readinessRound2, materials } from './fixtures.js';

const LATER = /Learning Activity \d|Topic [2-6]|\bStep \d|shop_\w+|dlopen|dlsym|PC-relative|\bldd\b/i;

test('Finding 9: the readiness wrap-up is short and names no later activity', { skip: !process.env.ANTHROPIC_API_KEY }, async () => {
  const req = tutorTurnRequest({ tutorial: readiness, ctx, turns: readinessRound2, student: { display_name: 'Test Student2' }, profile: null, materials: materials(), brief: await briefFor(readiness, ctx) });
  assert.equal(req.stage, 'WRAP-UP');
  // Measured on 2026-10-20: 31-61 words over 8 runs (before: 149-189, two naming Learning Activities 4 and 5).
  const out = await Promise.all([1, 2, 3].map(async () => textOf(await getAnthropic().messages.create({ ...tutorModelOptions(), system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
  for (const r of out) {
    const words = r.split(/\s+/).filter(Boolean).length;
    console.log(`\n[${words} words] ${r}`);
    assert.ok(words <= 70, `${words} words`);
    assert.doesNotMatch(r, LATER);
  }
});
