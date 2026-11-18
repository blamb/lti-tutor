import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { buildReadings, checkDrafted, type Reading, type ReadingActivity } from './reading.js';
import { buildMbz, glossaryImportXml, quizLink } from './mbz.js';
import { checkPage } from './coursepage.js';

const WATER = `# Water

Water is a polar molecule. Cohesion is the attraction between water molecules. Adhesion is the attraction between water and other molecules.

Ice floats because it is less dense than liquid water.`;
const CARBON = 'Carbon can form four covalent bonds, which lets it build long chains and rings. Cohesion is the attraction between water molecules, as the last reading said. '.repeat(3);

const readings: Reading[] = [
  { id: 1, title: 'Water', text: WATER, source_url: 'https://example.org/water', license: 'CC BY 4.0', attribution: 'An Open Text', include_text: true },
  { id: 2, title: 'Carbon', text: CARBON, source_url: 'https://example.org/carbon', license: 'CC BY 4.0', attribution: 'An Open Text', include_text: true },
];
const mc = (question: string, quote: string, right = 1) => ({
  type: 'multichoice', question, source_quote: quote,
  answers: [
    { text: 'It is <em>less</em> dense than liquid water', correct: true, feedback: 'Right & proper.' },
    { text: 'It is more dense <script>', correct: right > 1, feedback: 'No.' },
  ],
});
const set = (n: number, reading: number, questions: unknown[]): ReadingActivity => ({ n, reading, type: 'questionset', title: `Practice Questions: ${reading === 1 ? 'Water' : 'Carbon'}`, questions });
const cards = (n: number, reading: number, list: [string, string, string][]): ReadingActivity => ({
  n, reading, type: 'dialogcards', title: 'Key Terms', description: 'x', cards: list.map(([front, back, source_quote]) => ({ front, back, source_quote })),
});
const COH = 'Cohesion is the attraction between water molecules.';
const acts = (): ReadingActivity[] => [
  set(1, 1, [mc('Why does ice float?', 'Ice floats because it is less dense than liquid water.'),
    { type: 'truefalse', question: 'Water is polar.', correct: true, feedback: 'The reading says so.', source_quote: 'Water is a polar molecule.' },
    mc('Two right answers?', 'Water is a polar molecule.', 2)]),
  cards(2, 1, [['Cohesion', 'the attraction between water molecules', COH], ['Adhesion', 'the attraction between water and other molecules', 'Adhesion is the attraction between water and other molecules.']]),
  set(3, 2, [{ type: 'truefalse', question: 'Carbon forms four bonds.', correct: true, feedback: 'Yes.', source_quote: 'Carbon can form four covalent bonds, which lets it build long chains and rings.' }]),
  cards(4, 2, [['cohesion', 'a second definition of the same term', COH]]),
];
const archive = (mbz: Uint8Array): string => gunzipSync(mbz).toString('latin1');

test('by default nothing changes: questions and terms stay as H5P on the pages', () => {
  const r = buildReadings({ name: 'Chemistry', readings, activities: acts(), approved: [1, 2, 3, 4] }, { sourceName: '2 readings' });
  assert.equal(Object.keys(r.h5p).length, 4);
  assert.equal(r.quiz, undefined);
  assert.equal(r.glossaryXml, undefined);
  assert.ok(!archive(r.mbz).includes('activities/quiz_'));
});

test('a Quiz takes only approved question sets, and only questions it can mark', () => {
  const r = buildReadings({ name: 'Chemistry', readings, activities: acts(), approved: [1], questions_as: 'quiz' }, { sourceName: '2 readings' });
  assert.deepEqual(r.quiz, { name: 'Chemistry: Quiz', questions: 2 });
  assert.deepEqual(Object.keys(r.h5p).length, 2, 'the question sets are no longer H5P; the flashcards still are');
  assert.ok(r.judgement.some((j) => j.includes('Practice Questions: Carbon: not in the Quiz, because it has not been approved')));
  assert.ok(r.judgement.some((j) => j.includes('Water: question 3 is not in the Quiz')), 'two correct answers cannot be marked as single choice');
  const tar = archive(r.mbz);
  assert.ok(tar.includes('activities/quiz_10001/quiz.xml'));
  assert.equal((tar.match(/<question_bank_entry /g) ?? []).length, 2);
  assert.equal((tar.match(/<question_instance /g) ?? []).length, 2);
  assert.ok(tar.includes('<qtype>truefalse</qtype>') && tar.includes('<qtype>multichoice</qtype>'));
  assert.ok(tar.includes('<sumgrades>2.00000</sumgrades>') && tar.includes('<grademax>10.00000</grademax>'));
  // Allowed inline tags survive (escaped once, as XML text); anything else is escaped twice, so Moodle shows it as typed.
  assert.ok(tar.includes('&lt;p&gt;It is &lt;em&gt;less&lt;/em&gt; dense than liquid water&lt;/p&gt;'));
  assert.ok(tar.includes('more dense &amp;lt;script&amp;gt;'));
  assert.ok(tar.includes('Right &amp;amp; proper.'));
  assert.ok(r.report.includes('## Every question in the Moodle Quiz, for the subject reviewer'));
  assert.equal(r.counts['Moodle Quiz (questions)'], 2);
});

test('"both" keeps the H5P and adds the Quiz and the Glossary; terms are listed once', () => {
  const r = buildReadings({ name: 'Chemistry', readings, activities: acts(), approved: [1, 3], questions_as: 'both', terms_as: 'both' }, { sourceName: '2 readings' });
  assert.equal(Object.keys(r.h5p).length, 4);
  assert.equal(r.quiz?.questions, 3);
  const xml = r.glossaryXml ?? '';
  assert.equal((xml.match(/<ENTRY>/g) ?? []).length, 2, 'Cohesion from the second reading is a duplicate');
  assert.ok(xml.includes('<CONCEPT>Cohesion</CONCEPT>') && xml.includes('&lt;p&gt;the attraction between water molecules&lt;/p&gt;'));
  const tar = archive(r.mbz);
  assert.ok(tar.includes('activities/glossary_12001/glossary.xml'));
  assert.ok(!tar.includes('<entry id='), 'entries are user data to Moodle and are not restored for a teacher, so none are written');
  assert.ok(r.todo.some((t) => t.includes('The Glossary arrives empty') && t.includes('(2 terms)')));
});

test('terms as a Glossary only: no flashcards on the pages', () => {
  const r = buildReadings({ name: 'Chemistry', readings, activities: acts(), approved: [], terms_as: 'glossary' }, { sourceName: '2 readings' });
  assert.equal(Object.keys(r.h5p).length, 2);
  assert.ok(!Object.keys(r.h5p).some((n) => n.includes('key-terms')));
});

test('buildMbz: a quiz question needs exactly one correct answer; the import file escapes its text', () => {
  const quiz = { name: 'Q', intro: '', questions: [{ type: 'multichoice' as const, name: 'bad', text: '<p>x</p>', answers: [{ text: 'a', correct: false, feedback: '' }] }] };
  assert.throws(() => buildMbz('m.mbz', { fullname: 'M', shortname: 'M' }, { name: 'M' }, [], { quizzes: [quiz] }), /exactly one correct answer/);
  assert.ok(glossaryImportXml('G & co', [{ concept: 'A<B', definition: '<p>x</p>' }]).includes('<CONCEPT>A&lt;B</CONCEPT>'));
  assert.equal(quizLink(0), '$@QUIZVIEWBYID*10001@$');
});

// ─── Discussion, Assignment, and a RhizMode discussion in a practice module ───

const OUTLINE = 'Unit outcomes\n1. Explain why water is a polar molecule.\n2. Describe how carbon forms chains.';
const discussion = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 10, reading: 0, type: 'discussion', title: 'Discussion: Chemistry', prompt: 'Where have you seen water behave this way?',
  passages: [{ passage: '"Ice floats because it is less dense than liquid water."', question: 'What would change if ice sank?' }], ...over,
});
const assignment = (over: Record<string, unknown> = {}): ReadingActivity => ({
  n: 11, reading: 0, type: 'assignment', title: 'Assignment: Chemistry', task: 'Explain cohesion to a friend.', deliverable: 'About 300 words.',
  steps: ['Reread the section on cohesion.'], passages: [{ passage: COH, why: 'Use it for your definition.' }],
  rubric: [{ criterion: 'Accuracy', outcome: 'Explain why water is a polar molecule.', levels: ['Accurate throughout.', 'Mostly accurate.', 'Partly accurate.', 'Not yet accurate.'] }], ...over,
});
const trust: ReadingActivity = {
  n: 12, reading: 1, type: 'trust', title: 'Trust Audit: Water', place: 'discussion', your_turn: 'Name one thing you take on trust.',
  trails: [{ passage: 'Water is a polar molecule.', notice: 'The reading states this without a source.', questions: ['What would you want to know first?'] }],
};

test('a discussion and an assignment become their own activities; the rubric rests on outcomes from the outline', () => {
  const quoted: Reading = { ...readings[0]!, id: 3, title: 'Ice', text: 'A teacher once put it this way. "Ice floats because it is less dense than liquid water." That is the whole of it.' };
  const r = buildReadings({ name: 'Chemistry', readings: [...readings, quoted], activities: [discussion(), assignment(), trust], approved: [10, 11, 12], outline: OUTLINE, model: 'test-model' }, { sourceName: '3 readings' });
  assert.deepEqual(r.todo, []);
  assert.deepEqual(r.forums?.map((f) => f.name), ['Trust Audit: Water', 'Chemistry: Discussion']);
  const post = r.forums![1]!.html;
  assert.ok(post.includes('“Ice floats because it is less dense than liquid water.”'), 'a passage already in quotation marks is not quoted twice');
  assert.ok(post.includes('>Ice</a>'), 'the reading a passage comes from is named by code');
  assert.ok(post.includes('This discussion is not graded.') && post.includes('drafted with AI (test-model)'));
  assert.ok(r.chapters[0]!.html.includes('Trust Audit'), 'a RhizMode discussion works in a practice module too');
  const tar = archive(r.mbz);
  assert.ok(tar.includes('activities/assign_11001/assign.xml') && tar.includes('activities/assign_11001/grading.xml'));
  assert.ok(tar.includes('<activemethod>rubric</activemethod>') && tar.includes('<status>20</status>'));
  assert.ok(tar.includes('<description>Accuracy. Learning outcome: Explain why water is a polar molecule.</description>'));
  assert.equal((tar.match(/<level id=/g) ?? []).length, 4);
  assert.ok(tar.includes('<definition>Excellent: Accurate throughout.</definition>') && tar.includes('<score>3.00000</score>'));
  assert.ok(tar.includes('<itemmodule>assign</itemmodule>') && tar.includes('<grademax>100.00000</grademax>'));
  assert.ok(r.report.includes('| Assignment | Criterion 1 | Accuracy:'));
});

test('a criterion whose outcome is not in the outline blocks the assignment; with no rubric it is marked directly', () => {
  const bad = buildReadings({ name: 'Chemistry', readings, activities: [assignment({ rubric: [{ criterion: 'Flair', outcome: 'Appreciate chemistry deeply.', levels: ['a', 'b', 'c', 'd'] }] })], outline: OUTLINE }, { sourceName: 'x' });
  assert.ok(bad.todo.some((t) => t.includes('Outcome for criterion 1: it is not in the course outline word for word')));
  assert.ok(!archive(bad.mbz).includes('activities/assign_'));
  const plain = buildReadings({ name: 'Chemistry', readings, activities: [assignment({ rubric: [] })] }, { sourceName: 'x' });
  const tar = archive(plain.mbz);
  assert.ok(tar.includes('activities/assign_11001/assign.xml') && !tar.includes('grading.xml'));
  assert.ok(plain.judgement.some((j) => j.includes('has no rubric')));
  assert.ok(checkPage(assignment({ rubric: [{ criterion: 'x', outcome: 'y', levels: ['only one'] }] })).some((p) => p.includes('each of the 4 levels')));
  assert.ok(checkPage(discussion({ passages: [] })).some((p) => p.includes('no passage to start from')));
});

// ─── The H5P types added after the first eight ───

import { packageJson, checkActivity, crosswordAnswer, timelineDate, ACTIVITY_TYPES } from './h5p.js';

const content = (spec: Record<string, unknown>): Record<string, any> => JSON.parse(packageJson({ n: 1, title: 'T', ...spec }).content);
const deps = (spec: Record<string, unknown>): string[] => JSON.parse(packageJson({ n: 1, title: 'T', ...spec }).h5p).preloadedDependencies.map((d: { machineName: string }) => d.machineName);

test('six more H5P types are buildable, each in the shape its library reads', () => {
  for (const t of ['accordion', 'summary', 'markwords', 'singlechoice', 'crossword', 'timeline']) assert.ok(ACTIVITY_TYPES.includes(t), t);

  const acc = content({ type: 'accordion', panels: [{ title: 'One', text: 'Body' }] });
  assert.equal(acc.panels[0].title, 'One');
  assert.equal(acc.panels[0].content.params.text, '<p>Body</p>');
  assert.ok(acc.panels[0].content.library.startsWith('H5P.AdvancedText '));
  assert.ok(deps({ type: 'accordion', panels: [{ title: 'One', text: 'Body' }] }).includes('H5P.AdvancedText'));

  // Summary and Single Choice Set take the first statement or answer as the correct one.
  const sum = content({ type: 'summary', sets: [{ correct: 'Right', wrong: ['Wrong a', 'Wrong b'] }] });
  assert.deepEqual(sum.summaries[0].summary, ['<p>Right</p>', '<p>Wrong a</p>', '<p>Wrong b</p>']);
  const scs = content({ type: 'singlechoice', questions: [{ question: 'Q?', correct: 'Yes', wrong: ['No'] }] });
  assert.deepEqual(scs.choices[0].answers, ['<p>Yes</p>', '<p>No</p>']);
  assert.ok(!deps({ type: 'singlechoice', questions: [{ question: 'Q?', correct: 'Yes', wrong: ['No'] }] }).includes('H5P.MultiChoice'), 'its questions are not sub-activities');

  const mark = content({ type: 'markwords', instructions: 'Click the nouns.', text: ['The *cat* sat.', 'A *dog* ran.'] });
  assert.equal(mark.textField, '<p>The *cat* sat.</p><p>A *dog* ran.</p>');

  const cw = content({ type: 'crossword', words: [{ clue: 'A weak attraction', answer: 'Hydrogen bond' }, { clue: 'Sticking together', answer: 'cohesion' }] });
  assert.deepEqual(cw.words.map((w: { answer: string }) => w.answer), ['HYDROGENBOND', 'COHESION']);
  assert.equal(cw.words[0].clue, 'A weak attraction (8, 4)', 'a phrase loses its space in the grid, so the clue gives the word lengths');
  assert.equal(cw.theme.backgroundColor, '#173354');

  const tl = content({ type: 'timeline', headline: 'History', events: [{ date: '1998-03-07', headline: 'A' }, { date: '2001', headline: 'B', text: 'Body' }] });
  assert.deepEqual(tl.timeline.date.map((d: { startDate: string }) => d.startDate), ['1998,3,7', '2001']);
  assert.deepEqual(tl.timeline.date[0].asset, {}, 'the player fails on an event with no media group');
});

test('the new types are checked before building', () => {
  const problems = (spec: Record<string, unknown>): string => checkActivity({ n: 1, title: 'T', ...spec }).join(' | ');
  assert.equal(problems({ type: 'accordion', panels: [{ title: 'One', text: 'Body' }] }), '');
  assert.match(problems({ type: 'markwords', instructions: 'Click.', text: ['The *big cat* sat.'] }), /can only mark single words/);
  assert.match(problems({ type: 'crossword', words: [{ clue: 'x', answer: 'cat' }] }), /at least two words/);
  assert.match(problems({ type: 'crossword', words: [{ clue: 'x', answer: 'Co-hesion' }, { clue: 'y', answer: 'cohesion' }] }), /repeats the answer "COHESION"/);
  assert.match(problems({ type: 'timeline', headline: 'H', events: [{ date: 'the late 1990s', headline: 'A' }] }), /not a date the timeline can place/);
  assert.match(problems({ type: 'summary', sets: [{ correct: 'Right', wrong: [] }] }), /at least one "wrong" statement/);
  assert.equal(crosswordAnswer('Café-au-lait 2'), 'CAFÉAULAIT2');
  assert.equal(timelineDate('1998/3'), '1998,3');
  assert.throws(() => timelineDate('1998-13'), /no such month/);
});

test('a drafted summary, crossword and timeline are checked against the reading and built onto its page', () => {
  const summary: ReadingActivity = { n: 20, reading: 1, type: 'summary', title: 'Summary: Water', sets: [{ correct: 'Water is polar.', wrong: ['Water is not polar.'], source_quote: 'Water is a polar molecule.' }] };
  const crossword: ReadingActivity = { n: 21, reading: 1, type: 'crossword', title: 'Crossword: Water', words: [
    { clue: 'The attraction between water molecules', answer: 'cohesion', source_quote: COH },
    { clue: 'The attraction between water and other molecules', answer: 'adhesion', source_quote: 'Adhesion is the attraction between water and other molecules.' }] };
  const bad: ReadingActivity = { n: 22, reading: 1, type: 'timeline', title: 'Timeline: Water', headline: 'Water', events: [{ date: '1900', headline: 'Invented', source_quote: 'Water was invented in 1900.' }] };
  const r = buildReadings({ name: 'Chemistry', readings, activities: [summary, crossword], approved: [] }, { sourceName: 'x' });
  assert.deepEqual(Object.keys(r.h5p).sort(), ['r-h5p-20-summary-water.h5p', 'r-h5p-21-crossword-water.h5p']);
  assert.ok(r.chapters[0]!.html.includes('<h5>Summary</h5>') && r.chapters[0]!.html.includes('<h5>Crossword</h5>'));
  assert.ok(r.report.includes('| Water | Crossword: Water | The attraction between water molecules | cohesion |'));
  assert.deepEqual(checkDrafted(bad, WATER), ['Event 1: the supporting sentence is not in the reading as quoted.']);
});
