import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, extractQuotes, checkQuotes } from './quotes.js';

const SOURCE = { id: 1, title: 'Gitanjali', body: 'Where the mind is without fear and the head is held high;\nWhere knowledge is free;\nWhere the world has not been broken up into fragments by narrow domestic walls.' };

test('normalisation folds quote and dash variants, case and spacing', () => {
  assert.equal(normalizeForMatch('“Don’t  stop — now”'), '"don\'t stop - now"');
});

test('only spans of five or more words count as quotations', () => {
  assert.deepEqual(extractQuotes('He called it "freedom" and “a luxury” but also "the freedom to imitate the foreign institutions".'),
    ['the freedom to imitate the foreign institutions']);
});

test('a quotation found in a source is verified with its context; one not found is reported', () => {
  const reply = 'As I wrote, “where the mind is without fear and the head is held high.” And elsewhere: "the heart knows what the mind cannot say."';
  const r = checkQuotes(reply, [SOURCE]);
  assert.equal(r.verified.length, 1);
  assert.equal(r.verified[0]!.material_id, 1);
  assert.ok(r.verified[0]!.context.includes('knowledge is free'));
  assert.deepEqual(r.unverified, ['the heart knows what the mind cannot say.']);
});

test('no sources means nothing can be verified', () => {
  const r = checkQuotes('She said "this is a long enough quoted sentence here".', []);
  assert.equal(r.verified.length, 0);
  assert.equal(r.unverified.length, 1);
});
