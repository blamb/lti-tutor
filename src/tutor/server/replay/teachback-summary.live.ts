/**
 * Live replay for usability Finding 4: calls the real model with the
 * exact prompts learners get. Run with `npm run test:live` (needs
 * ANTHROPIC_API_KEY; costs a few cents). Checks behaviour, not wording.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '../../../core/anthropic.js';
import { textOf } from '../../../core/llm.js';
import { env } from '../env.js';
import { tutorTurnRequest, briefFor, studentTexts } from '../tutorials.js';
import { stageForRun, keyTermsFor } from '../kinds.js';
import { ctx, hero, materials, round1ToRecap, round2, ROUND_1_YES, t } from './fixtures.js';
import type { Turn } from '../../../core/conversations.js';

const live = !!process.env.ANTHROPIC_API_KEY;
const student = { display_name: 'Test Student1' };
const MATERIALS = materials();

async function tutorReply(turns: Turn[]): Promise<{ reply: string; stage: string }> {
  const req = tutorTurnRequest({ tutorial: hero, ctx, turns, student, profile: null, materials: MATERIALS, brief: await briefFor(hero, ctx) });
  const res = await getAnthropic().messages.create({ model: env.TUTOR_MODEL, max_tokens: 1024, system: req.system, messages: req.messages as Anthropic.MessageParam[] });
  const reply = textOf(res);
  console.log(`\n[${req.stage}] tutor: ${reply}`);
  return { reply, stage: req.stage };
}

const PLAYBACK = /here'?s what i heard|let me play back|did i get that right|have i got (that|it) right/i;

test('Finding 4: with Scenario C still open, the tutor probes it rather than playing the idea back', { skip: !live }, async () => {
  // Round 1 up to Scenario C ("C maybe also fails? not sure"), without the tutor's recap.
  const turns = round1ToRecap.slice(0, -1);
  const { reply, stage } = await tutorReply(turns);
  assert.equal(stage, 'TEACH-BACK');
  assert.doesNotMatch(reply, PLAYBACK);
  assert.match(reply, /\?/);
  // It must not restate the whole idea: the recap's key sentence is absent.
  assert.doesNotMatch(reply, /match every undefined symbol to exactly one definition/i);
});

test('Finding 4: once the probes are answered, the tutor asks for the explanation instead of giving it', { skip: !live }, async () => {
  const turns = [...round1ToRecap.slice(0, -2), t('user', 'C links, because the members.c log_count is still static, so it is local and the linker never sees two globals')];
  const { reply, stage } = await tutorReply(turns);
  assert.equal(stage, 'TEACH-BACK');
  assert.doesNotMatch(reply, PLAYBACK);
  assert.match(reply, /own words|explain|someone who|as if/i, 'it asks for the explanation');
  assert.doesNotMatch(reply, /match every undefined symbol to exactly one definition/i);
});

test('Finding 4: "yes" to a recap does not complete the teach-back', { skip: !live }, async () => {
  const turns = [...round1ToRecap, t('user', ROUND_1_YES)];
  const texts = studentTexts(turns);
  assert.notEqual(stageForRun('concept', texts, 15, keyTermsFor(hero)).teachBack, 'explained');
  const { reply, stage } = await tutorReply(turns);
  assert.equal(stage, 'TEACH-BACK');
  assert.match(reply, /own words|your words|explain|in your/i);
  assert.doesNotMatch(reply, /finish/i);
});
