import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { supportsEffort, requestOptions, THINKING_HEADROOM } from './models.js';
import { turnOptionsFor } from '../persona/server/personas.js';
import { draftOutputFor, DraftBrief } from '../tutor/server/tutorials.js';
import { TUTORIAL_KINDS } from '../tutor/server/kinds.js';

test('effort goes only to models that take it', () => {
  for (const m of ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-4-8', 'claude-sonnet-4-6']) assert.equal(supportsEffort(m), true, m);
  for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-sonnet-4-0', 'claude-opus-4-1', 'claude-3-haiku-20240307']) assert.equal(supportsEffort(m), false, m);
});

test('thinking models get headroom and an effort level; Haiku 4.5 gets neither', () => {
  assert.deepEqual(requestOptions('claude-haiku-5-5', { maxTokens: 1024, effort: 'low' }), { max_tokens: 1024 + THINKING_HEADROOM, output_config: { effort: 'low' } });
  assert.deepEqual(requestOptions('claude-haiku-4-5', { maxTokens: 1024, effort: 'low' }), { max_tokens: 1024 });
});

test('Persona Chat no longer sends effort to Haiku 4.5 ("-4-5" also ends in "-5")', () => {
  assert.deepEqual(turnOptionsFor('claude-haiku-4-5'), {});
  assert.deepEqual(turnOptionsFor('claude-haiku-5-5'), { output_config: { effort: 'low' } });
});

test('every summary kind has a structured-output schema without "kind", and the brief draft converts too', () => {
  for (const kind of TUTORIAL_KINDS) {
    const f = zodOutputFormat(draftOutputFor(kind));
    const props = Object.keys((f.schema as { properties?: object }).properties ?? {});
    assert.ok(!props.includes('kind'), kind);
    assert.ok(props.includes('understood') && props.includes('sticking_points') && props.includes('student_note'), kind);
  }
  assert.ok(zodOutputFormat(DraftBrief).schema);
});
