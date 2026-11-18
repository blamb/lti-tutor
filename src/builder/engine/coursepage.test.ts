import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuotes, checkDrafted, buildReadings, type Reading, type ReadingActivity } from './reading.js';
import { checkPage, readingMinutes, PAGE_PASSAGE_MAX_CHARS } from './coursepage.js';
import { bookPageLink } from './mbz.js';

const WATER = `# Water

Water is a polar molecule. Its hydrogen atoms carry a slight positive charge, and its oxygen atom a slight negative one.

Ice floats because it is less dense than liquid water.`;
const CARBON = `# Carbon

Carbon can form four covalent bonds, which lets it build long chains and rings. <b>Life</b> on Earth is built on these chains.`;
const OUTLINE = `BIOL 1113 Course Outline

Unit 3 learning outcomes
- Describe the structure of a water molecule and explain why it is polar.
- Explain why carbon is the basis of biological molecules.

Assessment: two quizzes and a final exam.`;

const readings: Reading[] = [
  { id: 1, title: 'Water', text: WATER, source_url: 'https://example.org/water', license: 'CC BY 4.0', attribution: 'An Open Text', include_text: true },
  { id: 2, title: 'Carbon', text: CARBON, source_url: 'https://example.org/carbon', license: '', attribution: 'A Journal', include_text: false },
];
const corpus = readings.map((r) => r.text).join('\n\n');

const guide = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 1, reading: 1, type: 'guide', title: 'Reading Guide: Water', why: 'This reading explains why water behaves as it does.',
  points: [{ idea: 'Water is polar', explanation: 'The charges on a water molecule are uneven.', passage: 'Water is a polar molecule.' }],
  questions: ['Why does ice float?'], ...over,
});
const overview = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 2, reading: 0, type: 'overview', title: 'Module Overview: Chemistry of Life', intro: 'This module is about water and carbon <em>together</em>.',
  outcomes: ['Explain why carbon is the basis of biological molecules.'],
  covers: [{ text: 'Why water is polar.', passage: 'Water is a polar molecule.' }, { text: 'How carbon bonds.', passage: 'Carbon can form four covalent bonds, which lets it build long chains and rings.' }],
  ...over,
});
const takeaways = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 3, reading: 0, type: 'takeaways', title: 'Key Takeaways: Chemistry of Life',
  points: [
    { text: 'Ice is less dense than liquid water, so it floats.', passage: 'Ice floats because it is less dense than liquid water.' },
    { text: 'Carbon’s four bonds let it form chains.', passage: 'Carbon can form four covalent bonds, which lets it build long chains and rings.' },
  ], ...over,
});

test('checkPage: each kind needs its parts, and a passage stays a short quotation', () => {
  assert.deepEqual(checkPage(guide()), []);
  assert.deepEqual(checkPage(overview()), []);
  assert.deepEqual(checkPage(takeaways()), []);
  assert.ok(checkPage(guide({ why: '' })).some((p) => p.includes('Why this reading')));
  assert.ok(checkPage(guide({ points: [] })).some((p) => p.includes('no key ideas')));
  assert.ok(checkPage(overview({ covers: [] })).length > 0);
  assert.ok(checkPage(takeaways({ points: [{ text: 'x', passage: 'y'.repeat(PAGE_PASSAGE_MAX_CHARS + 1) }] })).some((p) => p.includes('too long')));
  assert.deepEqual(checkPage({ n: 9, type: 'quiz', title: 'x' }), ['Unknown page type "quiz".']);
});

test('passages are checked against the reading, outcomes against the outline only', () => {
  assert.deepEqual(checkQuotes(guide(), WATER).map((q) => q.found), [true]);
  assert.deepEqual(checkDrafted(guide({ points: [{ idea: 'Water', explanation: 'x', passage: 'Water is a nonpolar molecule.' }] }), WATER),
    ['Key idea 1: its passage is not in the reading as quoted.']);

  const checks = checkQuotes(overview(), corpus, OUTLINE);
  assert.deepEqual(checks.map((q) => [q.label, q.found]), [['Outcome 1', true], ['Topic 1', true], ['Topic 2', true]]);
  // An outcome reworded by the model, or one that happens to be a sentence of a reading, is not an outcome of the course.
  const reworded = checkDrafted(overview({ outcomes: ['Explain why carbon underlies biological molecules.', 'Water is a polar molecule.'] }), corpus, OUTLINE);
  assert.equal(reworded.filter((p) => p.includes('not in the course outline word for word')).length, 2);
  // With no outline, any outcome fails: they are never drafted.
  assert.ok(checkDrafted(overview(), corpus, '').some((p) => p.startsWith('Outcome 1')));
  assert.deepEqual(checkDrafted(overview({ outcomes: [] }), corpus, ''), []);
});

test('readingMinutes rounds up to five at 200 words a minute', () => {
  assert.equal(readingMinutes('word '.repeat(50)), 5);
  assert.equal(readingMinutes('word '.repeat(1100)), 10);
});

test('buildReadings: the overview is the first page, guides top their readings, takeaways come last', () => {
  const quiz: ReadingActivity = {
    n: 4, reading: 1, type: 'questionset', title: 'Practice Questions: Water',
    questions: [{ type: 'truefalse', question: 'Ice floats.', correct: true, feedback: 'Yes.', source_quote: 'Ice floats because it is less dense than liquid water.' }],
  };
  const r = buildReadings({ name: 'Chemistry of Life', readings, activities: [quiz, guide(), overview(), takeaways()], model: 'test-model', outline: OUTLINE }, { sourceName: '2 readings' });
  assert.deepEqual(r.chapters.map((c) => c.title), ['Module Overview', 'Water', 'Carbon', 'Key Takeaways']);
  assert.deepEqual(r.todo, []);

  const [first, water, carbon, last] = r.chapters.map((c) => c.html) as [string, string, string, string];
  assert.ok(first.includes('This module is about water and carbon &lt;em&gt;together&lt;/em&gt;.'), 'drafted text is escaped');
  assert.ok(first.includes('<h4>Learning outcomes</h4>') && first.includes('<li>Explain why carbon is the basis of biological molecules.</li>'));
  // The "What you will do" list is built by code: links to the reading pages, which now start at page 2.
  assert.ok(first.includes(`Read <a href="${bookPageLink(0, 2)}">Water</a> (about 5 minutes), then try the practice activities on its page.`));
  assert.ok(first.includes(`Read <a href="${bookPageLink(0, 3)}">Carbon</a> (about 5 minutes; the page links to it).`));
  assert.ok(first.includes(`Review the <a href="${bookPageLink(0, 4)}">Key Takeaways</a>.`));
  assert.ok(first.includes('drafted with AI (test-model)'));

  assert.ok(water.indexOf('Why this reading') < water.indexOf('<h4>The reading</h4>'), 'the guide sits above the reading');
  assert.ok(water.indexOf('<h4>The reading</h4>') < water.indexOf('Water is a polar molecule. Its hydrogen'));
  assert.ok(water.includes('<summary style="cursor:pointer;font-weight:600">Water is polar</summary>'));
  assert.ok(!carbon.includes('Why this reading'), 'a reading with no approved guide gets none');

  // Each takeaway names the reading its passage was found in.
  assert.ok(last.includes(`From <a href="${bookPageLink(0, 2)}">Water</a>.`));
  assert.ok(last.includes(`From <a href="${bookPageLink(0, 3)}">Carbon</a>.`));

  assert.equal(r.counts['AI-drafted pages and activities (overview, guides, takeaways, discussion, assignment)'], 3);
  assert.ok(r.report.includes('## Every AI-drafted course page, for the reviewer'));
  assert.ok(r.report.includes('| Module Overview | Outcome 1 | Explain why carbon is the basis of biological molecules. | the course outline | yes |'));
  assert.ok(r.report.includes('| Reading Guide: Water | Key idea 1 | Water is polar: The charges on a water molecule are uneven. | Water is a polar molecule. | yes |'));
});

test('buildReadings: a page whose passage or outcome fails its check is left out and reported', () => {
  const bad = overview({ outcomes: ['Describe the periodic table.'] });
  const r = buildReadings({ name: 'Chemistry of Life', readings, activities: [bad, guide({ points: [{ idea: 'x', explanation: 'y', passage: 'Not in the text at all.' }] })], outline: OUTLINE }, { sourceName: '2 readings' });
  assert.deepEqual(r.chapters.map((c) => c.title), ['Water', 'Carbon']);
  assert.equal(r.todo.filter((t) => t.includes('could not be built')).length, 2);
  assert.ok(!r.chapters[0]!.html.includes('Why this reading'));
});
