import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { firstNameOf, progressNote, profileBlock, tutorialRulesFor, backgroundNamed } from './tutorials.js';
import { TUTORIAL_KINDS } from './kinds.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 11.
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'launch.html'), 'utf8');
const empty = { student_id: 1, program: '', goal: '', background: '', struggles: '', interests: '', updated_at: '', skipped_at: '2026-10-20' };

test('"Skip for now" is remembered on the server, and the form says it is optional', () => {
  assert.match(html, /await api\('\/api\/profile\/skip', \{ method: 'POST' \}\)/);
  assert.match(html, /Optional\. Skip it if you like/);
  assert.doesNotMatch(html, /Takes 30 seconds/);
});

test('saving shows a visible confirmation', () => {
  assert.match(html, /✓ Saved\. Opening your session…/);
  assert.match(html, /✓ Saved\. The tutor will use this from your next session\./);
  assert.match(html, /#profile-status\.saved \{/);
});

test('a skipped, empty profile is no profile to the tutor', () => {
  assert.match(profileBlock({ display_name: 'Test Student1' }, empty), /No profile on file/);
  assert.match(profileBlock({ display_name: 'Test Student2' }, { ...empty, background: 'Python and Java, some C' }), /Prior background in the subject: Python and Java, some C/);
});

test('the opening greets by first name, never the LMS placeholder', () => {
  assert.equal(firstNameOf('Test Student2'), 'Test');
  assert.equal(firstNameOf('Student'), '');
  assert.match(progressNote(0, 10, 'ORIENT', 'none', '', 'concept', 'Test'), /Greet the student by their first name, Test/);
  assert.doesNotMatch(progressNote(2, 10, 'EXPLORE', 'none', 'x', 'concept', 'Test'), /Greet the student/);
});

test('every kind connects at least one explanation to a background the student names', () => {
  for (const k of TUTORIAL_KINDS) assert.match(tutorialRulesFor(deliveryOf(9), k), /connect at least one explanation or correction in the session to it/, k);
});

test('a language the student names is picked up for the next reply', () => {
  assert.equal(backgroundNamed('static works like final in Java, so the value cannot change.'), 'Java');
  assert.equal(backgroundNamed('In C++ you would use a namespace'), 'C++');
  assert.equal(backgroundNamed('JavaScript has closures'), 'JavaScript');
  assert.equal(backgroundNamed('it links fine'), null);
  assert.match(progressNote(5, 10, 'EXPLORE', 'none', 'static works like final in Java', 'concept'), /The student just drew on Java\. Connect your explanation or correction to Java/);
});
