import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneTranscripts } from './retention.js';
import { defaultAiDisclosure } from './courses.js';
import { deliveryOf } from './delivery.js';

test('retention of 0 days never deletes and never touches the database', async () => {
  // A connection would fail here (the test env points at an unused database), so
  // a non-null cutoff or a thrown error would mean the guard is broken.
  assert.deepEqual(await pruneTranscripts(0), { deleted_turns: 0, cutoff: null });
  assert.deepEqual(await pruneTranscripts(-5), { deleted_turns: 0, cutoff: null });
});

test('default disclosure covers the AI, storage, voice and typing, and follows the mode', () => {
  for (const flex of [3, 9, 10]) {
    const text = defaultAiDisclosure('LTI Tutor', deliveryOf(flex));
    assert.match(text, /is an AI tutor/);
    assert.match(text, /What it keeps/);
    assert.match(text, /speech service/);
    assert.match(text, /Typing is always available/);
    assert.match(text, /delete all of it/);
  }
  assert.doesNotMatch(defaultAiDisclosure('T', deliveryOf(9)), /\bclass\b/);
  assert.match(defaultAiDisclosure('T', deliveryOf(3)), /class finds hard/);
});
