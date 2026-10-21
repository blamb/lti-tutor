import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KINDS, TUTORIAL_KINDS, stageLabel, studentGoalFor } from './kinds.js';

// Usability report, Finding 12. Checked in a browser at 744 and 1280 px
// against a stubbed API: the message box stays in view, the newest reply
// sits above it, and the chip reads "First step", then "Nearly done" while
// the tutor's last line is a question, then "Wrapping up — click Finish".
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'launch.html'), 'utf8');

test('students never see the instructor-voiced learning goal', () => {
  for (const kind of TUTORIAL_KINDS) {
    const line = studentGoalFor({ kind, student_goal: '' });
    assert.equal(line, KINDS[kind].forStudents);
    assert.doesNotMatch(line, /\bthe student\b/i, kind);
  }
  assert.equal(studentGoalFor({ kind: 'concept', student_goal: '  You will work out why linking can fail.  ' }), 'You will work out why linking can fail.');
  assert.doesNotMatch(html, /'Goal: ' \+/);
  assert.match(html, /t\.goal \|\| t\.learning_goal/);
});

test('every stage has a sentence-case label from one place', () => {
  for (const kind of TUTORIAL_KINDS) {
    for (const s of KINDS[kind].stages) {
      assert.ok(s.label && s.label[0] === s.label[0]!.toUpperCase() && s.label.slice(1) === s.label.slice(1).toLowerCase(), `${kind} ${s.name}: ${s.label}`);
      assert.equal(stageLabel(kind, s.name), s.label);
    }
  }
  assert.equal(stageLabel('assignment_start', 'FIRST-STEP'), 'First step');
  assert.equal(stageLabel('assignment_start', 'UNPACK'), 'Unpacking the task');
});

test('"Wrapping up" waits until the tutor has stopped asking', () => {
  assert.match(html, /const ready = evt\.data\.stage === 'WRAP-UP' && !endsWithQuestion\(bubble\._raw\)/);
  assert.match(html, /'Nearly done'/);
});

test('the message box stays in view, and narrow screens scroll the page, not a box', () => {
  assert.match(html, /#tutorial-compose \{ position: sticky; bottom: 0;/);
  assert.match(html, /@media \(max-width: 900px\) \{\n    #view-tutorial \.turns \{ max-height: none;/);
  assert.match(html, /<details class="tut-goal" id="tutorial-goal-box" open>/);
});

test('the text-size control says what it is, About you fields wrap, and leaving is safe', () => {
  assert.match(html, /<span aria-hidden="true">Aa<\/span> Text size and spacing<\/summary>/);
  for (const n of ['program', 'goal', 'background', 'struggles', 'interests']) assert.match(html, new RegExp(`<textarea name="${n}" maxlength="\\d+" rows="2" class="short">`), n);
  assert.match(html, /You can stop and come back later: this conversation is saved\./);
});

test('a wording filed under the wrong key concept can be moved, or sent back to Unmapped', () => {
  // "Map automatically" filed "Separate libc copies per process" under the static/dynamic trade-off on moodbox.
  assert.match(html, /function wordingsList\(c, canonical\)/);
  assert.match(html, /aria-label="Move “\$\{escapeHtml\(w\)\}” to another key concept"/);
  assert.match(html, /<option value="">Unmapped \(review later\)<\/option>/);
  assert.match(html, /await api\('\/api\/teacher\/concepts\/map', \{ body: \{ wording: w, concept_id: sel\.value \? parseInt\(sel\.value, 10\) : null \} \}\)/);
});
