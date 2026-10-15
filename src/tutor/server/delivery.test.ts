import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryOf, parseTruFlex, TRUFLEX_MODES, truflexMode, deliveryLabels, DEFAULT_TRUFLEX } from './delivery.js';

// One row per TRUFlex mode, straight from the table in REALIGNMENT-PROMPT.md.
const EXPECTED: Record<number, Omit<ReturnType<typeof deliveryOf>, 'truflex'>> = {
  1: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  2: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  3: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  4: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  5: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  6: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  7: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: true },
  8: { pacing: 'scheduled', hasCohort: true, hasFixedDates: true, hasLiveSessions: true, inPerson: false },
  9: { pacing: 'self_paced', hasCohort: false, hasFixedDates: false, hasLiveSessions: false, inPerson: false },
  10: { pacing: 'paced', hasCohort: true, hasFixedDates: true, hasLiveSessions: false, inPerson: false },
};

for (const [n, expected] of Object.entries(EXPECTED)) {
  const truflex = Number(n);
  test(`deliveryOf(${truflex})`, () => {
    assert.deepEqual(deliveryOf(truflex), { truflex, ...expected });
  });
}

test('self_paced never requires a cohort, a date or a live session', () => {
  const d = deliveryOf(9);
  assert.equal(d.hasCohort || d.hasFixedDates || d.hasLiveSessions || d.inPerson, false);
});

test('deliveryOf rejects values outside 1–10', () => {
  for (const bad of [0, 11, -1, 2.5, NaN, Infinity]) assert.throws(() => deliveryOf(bad), RangeError);
});

test('parseTruFlex accepts strings from LTI custom parameters', () => {
  assert.equal(parseTruFlex('9'), 9);
  assert.equal(parseTruFlex(' 10 '), 10);
  assert.equal(parseTruFlex(3), 3);
  assert.equal(parseTruFlex('0'), null);
  assert.equal(parseTruFlex('11'), null);
  assert.equal(parseTruFlex('abc'), null);
  assert.equal(parseTruFlex(undefined), null);
});

test('every mode 1–10 has a name and description', () => {
  assert.equal(TRUFLEX_MODES.length, 10);
  for (let i = 1; i <= 10; i++) {
    const m = truflexMode(i);
    assert.equal(m.truflex, i);
    assert.ok(m.name.length > 0 && m.description.length > 20);
  }
  assert.equal(truflexMode(DEFAULT_TRUFLEX).truflex, 3);
});

test('labels follow hasLiveSessions', () => {
  assert.equal(deliveryLabels(deliveryOf(3)).debrief, 'lecture debrief');
  assert.equal(deliveryLabels(deliveryOf(8)).debrief, 'lecture debrief');
  assert.equal(deliveryLabels(deliveryOf(10)).debrief, 'study debrief');
  assert.equal(deliveryLabels(deliveryOf(9)).debrief, 'study debrief');
});
