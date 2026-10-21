import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The launch page is plain inline JS with no browser harness, so these are
// source-level guards. The behaviour was checked in a browser against a
// stubbed API: a deep-linked first launch shows the disclosure, makes no
// session call until "Got it", then opens About you and the session.
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'launch.html'), 'utf8');
const launchBlock = html.slice(html.indexOf('// ─── Launch ───'));

test('usability Finding 8: a deep-linked launch waits for the disclosure before opening the session', () => {
  assert.match(launchBlock, /if \(disclosurePending\(\)\) holdForDisclosure\(\(\) => openTutorial\(launchTutorialId\)\);/);
  // The only direct open is the branch where nothing is pending.
  assert.equal(launchBlock.match(/openTutorial\(launchTutorialId\)/g)?.length, 2);
});

test('"Got it" runs the held step after marking the notice seen', () => {
  const ok = html.slice(html.indexOf("$('#disclosure-ok').addEventListener"));
  const body = ok.slice(0, ok.indexOf('});'));
  assert.ok(body.indexOf('markDisclosureSeen()') < body.indexOf('if (next) next()'));
});

test('instructors are never held by the learner disclosure', () => {
  assert.match(html, /function disclosurePending\(\) \{ return !!disclosureText && !disclosureSeen\(\) && !isTeacherRole; \}/);
});
