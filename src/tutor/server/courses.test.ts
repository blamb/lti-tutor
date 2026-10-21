import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defaultAiDisclosure, instructorVisibility } from './courses.js';
import { deliveryOf } from './delivery.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const launchHtml = readFileSync(join(HERE, '..', 'web', 'launch.html'), 'utf8');

// Usability report, Finding 3: the instructor report shows each run with the
// learner's name, so nothing learner-facing may promise anonymity.
const CONTRADICTIONS = [/anonymous/i, /never who said what/i, /not your list/i];

test('every delivery mode tells learners the report carries their name', () => {
  for (let truflex = 1; truflex <= 10; truflex++) {
    const d = deliveryOf(truflex);
    const v = instructorVisibility(d);
    assert.match(v.full, /with your name/);
    assert.match(v.short, /with your name/);
    assert.match(v.feedback, /with your name/);
    for (const text of Object.values(v)) {
      for (const bad of CONTRADICTIONS) assert.doesNotMatch(text, bad, `truflex ${truflex}: ${text}`);
    }
  }
});

test('the default disclosure uses the shared wording, not its own copy', () => {
  for (let truflex = 1; truflex <= 10; truflex++) {
    const d = deliveryOf(truflex);
    assert.ok(defaultAiDisclosure('LTI Tutor', d).includes(instructorVisibility(d).full), `truflex ${truflex}`);
  }
});

test('the launch page has no visibility statement of its own that contradicts the report', () => {
  for (const bad of CONTRADICTIONS) assert.doesNotMatch(launchHtml, bad);
  assert.match(launchHtml, /data-visibility="\{\{VISIBILITY\}\}"/);
});

test("the page's fallback wording matches the server's", () => {
  const v = instructorVisibility(deliveryOf(9));
  for (const key of ['short', 'feedback', 'learning'] as const) {
    assert.ok(launchHtml.includes(v[key]), `launch.html fallback for ${key} differs from courses.ts`);
  }
});
