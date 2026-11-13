import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { textToHtml, normForQuote, checkQuotes, checkDrafted, buildReadings, type Reading, type ReadingActivity } from './reading.js';

const TEXT = `# Water

Water is a polar molecule. Its hydrogen atoms carry a slight positive charge, and its oxygen atom a slight negative one.

## Cohesion

- Cohesion is the attraction between water molecules.
- Adhesion is the attraction between water and other molecules.

Ice floats because it is less dense than liquid water <script>alert(1)</script>. See https://example.org/water.`;

const reading = (over: Partial<Reading> = {}): Reading => ({
  id: 1, title: 'Water', text: TEXT, source_url: 'https://example.org/water', license: 'CC BY 4.0', attribution: 'An Open Text', include_text: true, ...over,
});

const questions = (quote: string): ReadingActivity => ({
  n: 1, reading: 1, type: 'questionset', title: 'Practice Questions: Water',
  questions: [{
    type: 'multichoice', question: 'Why does ice float?', source_quote: quote,
    answers: [
      { text: 'It is less dense than liquid water', correct: true, feedback: 'Right.' },
      { text: 'It is more dense than liquid water', correct: false, feedback: 'No.' },
    ],
  }],
});

test('textToHtml: headings step down, lists and paragraphs form, everything is escaped', () => {
  const html = textToHtml(TEXT, 'Water');
  assert.ok(!html.includes('<h4>Water</h4>'), 'a first heading that repeats the page title is dropped');
  assert.ok(html.includes('<h4>Cohesion</h4>'));
  assert.ok(html.includes('<li>Cohesion is the attraction between water molecules.</li>'));
  assert.ok(!html.includes('<script>'), 'markup in the source text is escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<a href="https://example.org/water"'), 'bare addresses become links, without the closing full stop');
});

test('quotation check: exact sentences pass whatever the quotes, dashes and spacing; paraphrases fail', () => {
  assert.equal(normForQuote('  “Ice’s  density” — low '), `"ice's density" - low`);
  assert.equal(checkQuotes(questions('Ice floats because it is less dense than liquid water'), TEXT)[0]!.found, true);
  assert.equal(checkQuotes(questions('Ice floats since it is lighter than liquid water'), TEXT)[0]!.found, false);
  assert.equal(checkQuotes(questions('water'), TEXT)[0]!.found, false, 'a fragment too short to support anything does not count');
  assert.deepEqual(checkDrafted(questions('Water is a polar molecule.'), TEXT), []);
  assert.match(checkDrafted(questions('Water is a dipolar molecule.'), TEXT).join(' '), /Question 1: the supporting sentence is not in the reading/);
});

test('buildReadings: a page per reading, activities embedded, text only where allowed, problems listed', () => {
  const r = buildReadings({
    name: 'Unit 1: Water',
    readings: [reading(), reading({ id: 2, title: 'A library article', include_text: false, license: '', attribution: '', source_url: '' })],
    activities: [questions('Water is a polar molecule.')],
  }, { sourceName: '2 readings' });
  assert.equal(r.chapters.length, 2);
  assert.ok(r.chapters[0]!.html.includes('Water is a polar molecule.'));
  assert.ok(r.chapters[0]!.html.includes('@@PLUGINFILE@@/r-h5p-01-practice-questions-water.h5p'));
  assert.ok(r.chapters[0]!.html.includes('<h5>Practice Questions</h5>'));
  assert.ok(r.chapters[0]!.html.includes('Source: An Open Text. CC BY 4.0.'));
  assert.ok(!r.chapters[1]!.html.includes('polar molecule'), 'a link-only page does not carry the text');
  assert.ok(r.chapters[1]!.html.includes('To do before publishing'));
  assert.equal(r.todo.length, 2);
  assert.equal(Object.keys(r.h5p).length, 1);
  assert.match(r.report, /\| Water \| Practice Questions: Water \| Why does ice float\? \| It is less dense than liquid water \| Water is a polar molecule\. \| yes \|/);
  assert.ok(gunzipSync(r.mbz).length > 1000, 'the backup is a gzip archive');
  assert.equal(r.fileName, 'unit-1-water.mbz');
});

test('buildReadings: full text with no licence is flagged, and a broken activity is reported instead of thrown', () => {
  const bad = { n: 2, reading: 1, type: 'questionset', title: 'Broken' } as ReadingActivity;
  const r = buildReadings({ name: 'M', readings: [reading({ license: '' })], activities: [bad] }, { sourceName: 'x' });
  assert.match(r.todo.join('\n'), /no open licence was found/);
  assert.match(r.todo.join('\n'), /H5P activity #2 \(Broken\) could not be built/);
  assert.equal(Object.keys(r.h5p).length, 0);
});
