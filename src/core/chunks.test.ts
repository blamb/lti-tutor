import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, CHUNK_MAX_CHARS, CHUNK_TARGET_CHARS } from './chunks.js';

const para = (n: number, len = 300) => `Paragraph ${n}. ` + 'word '.repeat(Math.ceil(len / 5)).trim();

test('chunks keep paragraphs together and stay within the size limits', () => {
  const text = Array.from({ length: 30 }, (_, i) => para(i)).join('\n\n');
  const chunks = chunkText(text);
  assert.ok(chunks.length > 3);
  for (const c of chunks) assert.ok(c.length <= CHUNK_MAX_CHARS, `chunk of ${c.length} chars`);
  for (const c of chunks.slice(0, -1)) assert.ok(c.length >= CHUNK_TARGET_CHARS * 0.5, `short chunk of ${c.length}`);
  // every paragraph is present exactly once, whole
  for (let i = 0; i < 30; i++) assert.equal(chunks.filter((c) => c.includes(`Paragraph ${i}.`)).length, 1);
});

test('a paragraph longer than the limit is cut on sentence ends', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something of moderate length about the topic at hand.`).join(' ');
  const chunks = chunkText(long);
  assert.ok(chunks.length >= 2);
  for (const c of chunks) assert.ok(c.length <= CHUNK_MAX_CHARS);
  assert.ok(chunks.every((c) => /\.$/.test(c)), 'each piece ends on a sentence boundary');
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), long);
});

test('text without any boundary is hard-wrapped; empty text gives no chunks', () => {
  const blob = 'x'.repeat(CHUNK_MAX_CHARS * 2 + 10);
  const chunks = chunkText(blob);
  assert.equal(chunks.join(''), blob);
  assert.ok(chunks.every((c) => c.length <= CHUNK_MAX_CHARS));
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('\n\n  \n'), []);
});
