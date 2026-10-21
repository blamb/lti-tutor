/**
 * Finding 6 against the real module: every reference the usability report
 * could not verify is in the materials the tutor is given, and only the claim
 * about the student's VM is flagged. Reads the module text from COMP2131_DIR;
 * skipped where it is not on this machine. No model call.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReferences } from '../references.js';
import { materials } from './fixtures.js';

const MATERIALS = materials();

test('Finding 6: the report\'s "unverifiable" references are all in the module text', { skip: MATERIALS.length < 2 }, () => {
  // Quoted or closely paraphrased from the tutor turns in the report.
  const replies = [
    'notice what Learning Activity 5 Step 7 asked: for a medical device that never updates, which would you choose?',
    'Topic 3 has a section called "Symbol Resolution".',
    'Topic 3, Symbols and Symbol Tables, covers what nm lists.',
    'Look at Learning Activity 5, Step 4 and Step 5 for the sizes and the library update.',
    'Topic 3, Problem 1 and Problem 2.',
  ];
  for (const r of replies) assert.deepEqual(checkReferences(r, MATERIALS), [], r);
});

test('Finding 6: the one real problem, a claim about the student\'s VM, is flagged', { skip: MATERIALS.length < 2 }, () => {
  const r = "the module does note that GCC 10+ defaults to -fno-common, so on your VM you'll get the multiple definition error.";
  assert.deepEqual(checkReferences(r, MATERIALS).map((i) => i.kind), ['vm_claim']);
});

import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '../../../core/anthropic.js';
import { textOf } from '../../../core/llm.js';
import { env } from '../env.js';
import { tutorTurnRequest, briefFor } from '../tutorials.js';
import { ctx, hero, round2 } from './fixtures.js';

test('Finding 6: asked about GCC and the activity, the tutor cites only real passages and does not predict the VM', { skip: MATERIALS.length < 2 || !process.env.ANTHROPIC_API_KEY }, async () => {
  // Round 2 up to the student's -fcommon remark and direct question.
  const turns = round2.slice(0, 8);
  const req = tutorTurnRequest({ tutorial: hero, ctx, turns, student: { display_name: 'Test Student2' }, profile: null, materials: MATERIALS, brief: await briefFor(hero, ctx) });
  const out = await Promise.all([1, 2, 3].map(async () => textOf(await getAnthropic().messages.create({ model: env.TUTOR_MODEL, max_tokens: 600, system: req.system, messages: req.messages as Anthropic.MessageParam[] }))));
  for (const r of out) {
    console.log(`\n${r}\n  issues: ${JSON.stringify(checkReferences(r, MATERIALS))}`);
    assert.deepEqual(checkReferences(r, MATERIALS).filter((i) => i.kind !== 'code'), [], r);
  }
});
