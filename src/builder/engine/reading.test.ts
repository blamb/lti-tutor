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

// ─── RhizMode ───────────────────────────────────────────────────────────────

const breadcrumb = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 3, reading: 1, type: 'breadcrumb', title: 'Breadcrumb Trail: Water', place: 'discussion',
  trails: [{ passage: 'Water is a polar molecule.', notice: 'The reading states this and gives no source.', questions: ['Where would you look to check this?', 'Who taught you this first?'] }],
  your_turn: 'Post one thing you believe about water & where you got it.',
  ...over,
});

test('RhizMode anchor check: a passage must be in the reading as quoted, short, and have something asked of it', () => {
  assert.deepEqual(checkDrafted(breadcrumb(), TEXT), []);
  assert.equal(checkQuotes(breadcrumb(), TEXT)[0]!.label, 'Passage 1');
  const moved = breadcrumb({ trails: [{ passage: 'Water is a dipolar molecule.', notice: 'x', questions: ['y?'] }] });
  assert.match(checkDrafted(moved, TEXT).join(' '), /Passage 1: it is not in the reading as quoted/);
  const bare = breadcrumb({ trails: [{ passage: 'Water is a polar molecule.', notice: '', questions: [] }], your_turn: ' ' });
  assert.match(checkDrafted(bare, TEXT).join(' '), /nothing is said about it.*no question.*Your turn/);
  assert.match(checkDrafted(breadcrumb({ trails: [] }), TEXT).join(' '), /no passages/);
});

test('RhizMode build: the prompt is on the page and in a forum, they link to each other, and nothing is H5P', () => {
  const r = buildReadings({
    name: 'Unit 1: Water', mode: 'rhizmode', model: 'test-model',
    readings: [reading()], activities: [breadcrumb()],
  }, { sourceName: '1 reading' });
  const page = r.chapters[0]!.html;
  assert.ok(page.includes('<h4>Breadcrumb Trail</h4>'));
  assert.ok(page.includes('“Water is a polar molecule.”'));
  assert.ok(page.includes('drafted with AI (test-model)'));
  assert.ok(page.includes('no answer key and nothing is graded'));
  assert.ok(page.includes('writings of <a href="https://davecormier.com/edblog/"'));
  assert.ok(page.includes('href="$@FORUMVIEWBYID*9351@$"'), 'the page links to its forum in the form Moodle rewrites on restore');
  assert.ok(page.includes('water &amp; where'), 'prompt text is escaped');
  assert.equal(r.forums!.length, 1);
  assert.equal(r.forums![0]!.name, 'Breadcrumb Trail: Water');
  assert.ok(r.forums![0]!.html.includes('href="$@BOOKVIEWBYIDCH*9301*9602@$"'), 'the forum links back to the page');
  assert.equal(Object.keys(r.h5p).length, 0);
  assert.equal(r.counts['Discussion forums'], 1);
  assert.match(r.report, /Every AI-drafted prompt, for the reviewer/);
  assert.match(r.report, /\| Water \| Breadcrumb Trail: Water \| in a discussion forum \| Water is a polar molecule\. \| yes \|/);
  assert.ok(!r.report.includes('H5P versions'));
  const tar = gunzipSync(r.mbz).toString('latin1');
  assert.ok(tar.includes('activities/forum_9351/forum.xml'));
  assert.ok(tar.includes('<type>single</type>'));
});

test('RhizMode build: "on their own" makes no forum, and a prompt whose passage is gone is reported, not built', () => {
  const alone = buildReadings({ name: 'M', mode: 'rhizmode', readings: [reading()], activities: [breadcrumb({ place: 'page' })] }, { sourceName: 'x' });
  assert.equal(alone.forums!.length, 0);
  assert.ok(alone.chapters[0]!.html.includes('it is not handed in'));
  assert.ok(!alone.chapters[0]!.html.includes('FORUMVIEWBYID'));
  const gone = buildReadings({ name: 'M', mode: 'rhizmode', readings: [reading()],
    activities: [breadcrumb({ trails: [{ passage: 'Water is wet and wonderful.', notice: 'n', questions: ['q?'] }] })] }, { sourceName: 'x' });
  assert.match(gone.todo.join('\n'), /Breadcrumb Trail: Water could not be built: Passage 1: it is not in the reading as quoted/);
  assert.ok(!gone.chapters[0]!.html.includes('Breadcrumb Trail'));
  assert.match(gone.judgement.join('\n'), /no prompts are on this page/);
});

test('RhizMode: every reading kind shares the anchor check, and a Community Contract leads the Book', () => {
  for (const type of ['trust', 'unsettled', 'missing']) {
    assert.deepEqual(checkDrafted(breadcrumb({ type }), TEXT), [], type);
    assert.match(checkDrafted(breadcrumb({ type, trails: [{ passage: 'Not in the reading at all.', notice: 'n', questions: ['q?'] }] }), TEXT).join(' '), /not in the reading as quoted/, type);
  }
  const contract = {
    n: 9, reading: 0, type: 'contract', title: 'Community Contract: Unit 1', place: 'discussion', topic: 'This module is about water.',
    parts: [{ prompt: 'What do you know about water?' }, { prompt: 'What do you need?' }, { prompt: 'What would you let us question?' }, { prompt: 'What is not up for debate for you?' }],
  } as ReadingActivity;
  assert.deepEqual(checkDrafted(contract, ''), []);
  assert.match(checkDrafted({ ...contract, parts: (contract.parts as unknown[]).slice(0, 3) } as ReadingActivity, '').join(' '), /“Where I draw a line” has no question/);

  const r = buildReadings({
    name: 'Unit 1', mode: 'rhizmode', readings: [reading({ include_text: false })],
    activities: [breadcrumb({ type: 'trust', title: 'Trust Audit: Water' }), contract],
  }, { sourceName: '1 reading' });
  assert.deepEqual(r.chapters.map((c) => c.title), ['Community Contract', 'Water']);
  assert.ok(r.chapters[0]!.html.includes('<strong>Where I draw a line.</strong> What is not up for debate for you?'));
  assert.ok(r.chapters[0]!.html.includes('from the text of this module’s readings'));
  assert.deepEqual(r.forums!.map((f) => f.name), ['Community Contract: Unit 1', 'Trust Audit: Water']);
  assert.ok(r.chapters[0]!.html.includes('$@FORUMVIEWBYID*9351@$'), 'the contract page links to the first forum');
  assert.ok(r.chapters[1]!.html.includes('$@FORUMVIEWBYID*9352@$'), 'the reading page links to the second');
  assert.ok(r.forums![1]!.html.includes('$@BOOKVIEWBYIDCH*9301*9603@$'), 'its forum links back to page 2, after the contract page');
  assert.ok(r.chapters[1]!.html.includes('<h4>Trust Audit</h4>'));
  assert.ok(r.chapters[1]!.html.includes('return to this page for the prompts below'), 'a link-only page says where the prompts are');
  assert.ok(!r.chapters[1]!.html.includes('Cohesion'), 'and does not carry the reading');
  assert.match(r.report, /Community Contract \| Community Contract: Unit 1 \| in a discussion forum \| \(none: drafted from the whole module\)/);
});
