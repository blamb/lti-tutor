import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { shiftLinks, joinPages, buildCourseFile, type ModuleParts } from './combine.js';
import { bookPageLink, forumLink, quizLink, assignLink, glossaryLink, bookCmid, chapterId, forumCmid, quizCmid } from './mbz.js';
import { buildReadings, type Reading, type ReadingActivity } from './reading.js';

const archive = (mbz: Uint8Array): string => gunzipSync(mbz).toString('latin1');
const parts = (name: string, pages: number, over: Partial<ModuleParts> = {}): ModuleParts => ({
  name,
  book: { name, chapters: Array.from({ length: pages }, (_x, i) => ({ title: `${name} page ${i + 1}`, html: `<p>See <a href="${bookPageLink(0, 1)}">the first page</a>.</p>` })), files: {} },
  forums: [], quizzes: [], glossaries: [], assignments: [], ...over,
});

test('shiftLinks moves every kind of link by the right amount and leaves other text alone', () => {
  const html = `a ${bookPageLink(0, 2)} b ${forumLink(1)} c ${quizLink(0)} d ${assignLink(0)} e ${glossaryLink(0)} $@NULL@$ https://example.org/?a=$@x`;
  const out = shiftLinks(html, { book: 3, pages: 4, forum: 2, quiz: 5, glossary: 1, assign: 6 });
  assert.equal(out, `a ${bookPageLink(3, 6)} b ${forumLink(3)} c ${quizLink(5)} d ${assignLink(6)} e ${glossaryLink(1)} $@NULL@$ https://example.org/?a=$@x`);
  assert.equal(shiftLinks(html, { book: 0, pages: 0, forum: 0, quiz: 0, glossary: 0, assign: 0 }), html);
});

test('joinPages: the second half follows the first in one Book, and its links to its own pages move down', () => {
  const word = parts('Unit 1', 3);
  const readings = parts('Unit 1', 2, { forums: [{ name: 'Talk', intro: `<a href="${bookPageLink(0, 2)}">back</a>` }] });
  const j = joinPages(word, readings);
  assert.equal(j.book.chapters.length, 5);
  assert.ok(j.book.chapters[0]!.html.includes(bookPageLink(0, 1)), 'the first half is untouched');
  assert.ok(j.book.chapters[3]!.html.includes(bookPageLink(0, 4)), 'page 1 of the second half is now page 4');
  assert.ok(j.forums[0]!.intro.includes(bookPageLink(0, 5)));
  const clash = parts('Unit 1', 1); clash.book.files['a.png'] = new Uint8Array([1]);
  const other = parts('Unit 1', 1); other.book.files['a.png'] = new Uint8Array([2]);
  assert.throws(() => joinPages(clash, other), /Both halves/);
});

test('buildCourseFile: each module gets its own section and Book, and links stay inside their module', () => {
  const quiz = { name: 'Q', intro: `<a href="${bookPageLink(0, 1)}">read first</a>`, questions: [{ type: 'truefalse' as const, name: 'q', text: '<p>x</p>', correct: true, feedback: '' }] };
  const a = parts('Unit 1', 2, { forums: [{ name: 'Unit 1 talk', intro: 'x' }] });
  const b = parts('Unit 2', 1, { forums: [{ name: 'Unit 2 talk', intro: `<a href="${bookPageLink(0, 1)}">page</a>` }], quizzes: [quiz] });
  b.book.chapters[0]!.html += `<a href="${forumLink(0)}">discuss</a><a href="${quizLink(0)}">quiz</a>`;
  const r = buildCourseFile([a, b], { fileName: 'course.mbz', course: { fullname: 'C', shortname: 'C' }, firstSection: 3, now: 1700000000 });
  const tar = archive(r.mbz);
  // Two sections, numbered from the one asked for, each listing its own activities.
  assert.ok(tar.includes('<number>3</number>') && tar.includes('<number>4</number>'));
  assert.ok(tar.includes(`<sequence>${bookCmid(0)},${forumCmid(0)}</sequence>`));
  assert.ok(tar.includes(`<sequence>${bookCmid(1)},${forumCmid(1)},${quizCmid(0)}</sequence>`));
  assert.ok(tar.includes(`activities/book_${bookCmid(1)}/book.xml`));
  // Unit 2's links point at Unit 2's Book and forum, not Unit 1's.
  assert.ok(tar.includes(`$@BOOKVIEWBYIDCH*${bookCmid(1)}*${chapterId(1, 1)}@$`));
  assert.ok(tar.includes(forumLink(1)) && !tar.includes(`${forumLink(0)}"&gt;discuss`));
  assert.throws(() => buildCourseFile([], { fileName: 'x.mbz', course: { fullname: 'C', shortname: 'C' } }), /No modules/);
});

test('a readings module hands back its parts, and they rebuild to the same activities', () => {
  const reading: Reading = { id: 1, title: 'Water', text: 'Water is a polar molecule. Ice floats because it is less dense than liquid water. '.repeat(3), source_url: '', license: 'CC BY 4.0', attribution: 'x', include_text: true };
  const act: ReadingActivity = { n: 1, reading: 1, type: 'questionset', title: 'Practice Questions: Water', questions: [{ type: 'truefalse', question: 'Ice floats.', correct: true, feedback: 'Yes.', source_quote: 'Ice floats because it is less dense than liquid water.' }] };
  const one = buildReadings({ name: 'Unit 1', readings: [reading], activities: [act], approved: [1], questions_as: 'both' }, { sourceName: 'x' });
  assert.ok(one.parts && one.parts.book.chapters.length === 1 && one.parts.quizzes.length === 1);
  const two = buildCourseFile([one.parts!, { ...one.parts!, name: 'Unit 2' }], { fileName: 'c.mbz', course: { fullname: 'C', shortname: 'C' } });
  const tar = archive(two.mbz);
  assert.equal((tar.match(/<modulename>quiz<\/modulename>/g) ?? []).length >= 2, true);
  assert.ok(tar.includes(`activities/quiz_${quizCmid(1)}/quiz.xml`));
});
