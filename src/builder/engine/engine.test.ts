/**
 * Tests for the module builder engine.
 *
 *   npx tsx --test src/builder/engine/engine.test.ts
 *
 * (a) Unit tests on small made-up input. They need no file from outside the repo.
 *
 * (b) A golden test that compares the engine with the output of the Python tool
 *     it was ported from, for one real draft. The draft is not public, so it is
 *     not in the repo: the test runs only when BUILDER_GOLDEN_DIR names a folder
 *     laid out like this, and is skipped otherwise.
 *
 *       $BUILDER_GOLDEN_DIR/
 *         <the draft>.docx        exactly one .docx, under the name it had when Python built it
 *                                 (the report quotes the file name); Word lock files (~$...) are ignored
 *         <the spec>.json         exactly one .json: the spec given to Python as --spec
 *         moodle-build/           the folder Python wrote with --out:
 *           pages/NN-<slug>.html
 *           h5p/<name>.h5p
 *           build-report.md
 *           h5p-specs-found.md
 *           <module>.mbz
 *
 *     The course short name, section number and visibility are read back from
 *     the reference .mbz, so the build is repeated with the options Python had.
 *
 *     BUILDER_GOLDEN_DIR=/path/to/folder npx tsx --test src/builder/engine/engine.test.ts
 *
 *     What cannot be equal, and is masked before comparing: the time of the
 *     build (timecreated, timemodified, added, startdate, backup_date,
 *     original_course_startdate); the random subContentId of each H5P question;
 *     and, because of those ids and the zip container, the bytes of each .h5p,
 *     so its contenthash, its filesize and its files/xx/<hash> path in the backup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ACTIVITY_TYPES, buildModule, checkActivity, inspectDraft, type Activity, type ModuleSpec } from './index.js';
import { packageH5p, LIB } from './h5p.js';
import { buildMbz } from './mbz.js';
import { slug } from './pages.js';
import { render } from './draft.js';
import { parseXml } from './xml.js';
import { pyJson, pyRound, PyFloat, strip, cut } from './py.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Read a .mbz (gzip + tar) into path -> bytes, keeping archive order. */
function untar(mbz: Uint8Array): Map<string, Uint8Array> {
  const buf = new Uint8Array(zlib.gunzipSync(mbz));
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  const field = (at: number, len: number) => dec.decode(buf.subarray(at, at + len)).replace(/\0[^]*$/, '');
  let at = 0;
  while (at + 512 <= buf.length) {
    const name = field(at, 100);
    if (!name) break;
    const size = parseInt(field(at + 124, 12).trim(), 8);
    const prefix = field(at + 257, 5) === 'ustar' && buf[at + 262] === 0 ? field(at + 345, 155) : '';
    out.set(prefix ? `${prefix}/${name}` : name, buf.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const text = (b: Uint8Array | undefined): string => {
  assert.ok(b, 'file is missing from the archive');
  return new TextDecoder().decode(b);
};

function h5pJson(pkg: Uint8Array): { h5p: any; content: any; contentText: string; names: string[] } {
  const z = unzipSync(pkg);
  const contentText = strFromU8(z['content/content.json']!);
  return { h5p: JSON.parse(strFromU8(z['h5p.json']!)), content: JSON.parse(contentText), contentText, names: Object.keys(z).sort() };
}

const SAMPLES: Record<string, Activity> = {
  multichoice: { n: 1, type: 'multichoice', title: 'Pick one', question: 'Which is a fruit?',
    answers: [{ text: 'Apple', correct: true, feedback: 'Yes.' }, { text: 'Chair', correct: false }] },
  truefalse: { n: 2, type: 'truefalse', title: 'True or false', question: 'Water is wet.', correct: true, feedback: 'It is.' },
  blanks: { n: 3, type: 'blanks', title: 'Blanks', text: 'The sky is *blue/azure*.' },
  dragtext: { n: 4, type: 'dragtext', title: 'Drag words', text: ['A *cat* purrs.', 'A *dog* barks.'] },
  dragdrop: { n: 5, type: 'dragdrop', title: 'Sort animals', instructions: 'Drag each animal.',
    zones: [{ label: 'Birds' }, { label: 'Fish', feedback: 'Fish swim.' }],
    items: [{ text: 'Robin', zone: 0 }, { text: '<b>Trout</b>', zone: 1 }, { text: 'Crow', zone: 0 }],
    feedback_correct: 'All placed.', feedback_incorrect: 'Look again.' },
  dialogcards: { n: 6, type: 'dialogcards', title: 'Cards', cards: [{ front: 'Uno', back: 'One' }, { front: 'Dos', back: 'Two' }] },
  sort: { n: 7, type: 'sort', title: 'Order', instructions: 'Put in order.', paragraphs: ['First', 'Second', 'Third'] },
  questionset: { n: 8, type: 'questionset', title: 'Quiz', intro: 'Three quick ones.', check_at_end: true,
    questions: [
      { type: 'truefalse', question: 'Two is even.', correct: true },
      { type: 'multichoice', question: 'Pick the vowel.', answers: [{ text: 'a', correct: true }, { text: 'b' }] },
      { type: 'blanks', title: 'Fill', text: 'One plus one is *two*.' }] },
};

// A tiny made-up Word file: enough structure for the reader and the page rules.
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function para(inner: string, style = '', extra = ''): string {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;
}
const run = (t: string, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
function tinyDocx(): Uint8Array {
  const body = [
    para(run('Sample Module'), 'Heading1'),
    para(run('Welcome'), 'Heading2'),
    para(run('Plain &amp; ') + run('bold', '<w:b/>') + run(' and ') + run('printf()', '<w:rFonts w:ascii="Consolas"/>')
      + `<w:hyperlink r:id="rId5">${run('a link')}</w:hyperlink>`),
    para(run('[@Production: make each step a drop-down accordion]')),
    para(run('Step one'), 'Heading5'),
    para(run('Do this.')),
    para(run('Step two'), 'Heading5'),
    para(run('First'), 'ListParagraph', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    para(run('Second'), 'ListParagraph', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    para(run('Practice'), 'Heading2'),
    para(run('[@Production: Insert H5P activity using the specification below]')),
    para(run('H5P Type: True/False')),
    para(run('Title: Wet water')),
    para(run('Statement: Water is wet. Answer: ') + run('True', '<w:color w:val="EE0000"/>')),
    para(run('[@Production: Insert H5P activity using the specification below]')),
    para(run('H5P Type: Multiple Choice')),
    para(run('Title: Second one')),
    para(run('[@Production: do something nobody has defined]')),
    `<w:tbl><w:tr><w:tc>${para(run('int main(void) {'))}${para(run('  return 0;') + '<w:r><w:tab/></w:r>')}${para(run('}'))}</w:tc></w:tr></w:tbl>`,
    para(run('Table 1.1 Sizes')),
    `<w:tbl><w:tr><w:tc>${para(run('Name'))}</w:tc><w:tc>${para(run('Size'))}</w:tc></w:tr><w:tr><w:tc>${para(run('a.o'))}</w:tc><w:tc>${para(run('4 &lt; 8'))}</w:tc></w:tr></w:tbl>`,
  ].join('');
  return zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W_NS}">`
      + [['Heading1', 'heading 1'], ['Heading2', 'heading 2'], ['Heading5', 'heading 5'], ['ListParagraph', 'List Paragraph']]
        .map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`).join('') + '</w:styles>'),
    'word/numbering.xml': strToU8(`<w:numbering xmlns:w="${W_NS}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>`
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/a?b=1&amp;c=2" TargetMode="External"/></Relationships>'),
  });
}

// ─── (a) unit tests ─────────────────────────────────────────────────────────

test('ACTIVITY_TYPES lists the eight types and each has a sample here', () => {
  assert.deepEqual([...ACTIVITY_TYPES].sort(), Object.keys(SAMPLES).sort());
  assert.equal(ACTIVITY_TYPES.length, 8);
});

for (const [type, spec] of Object.entries(SAMPLES)) {
  test(`h5p: builds a ${type} package`, () => {
    assert.deepEqual(checkActivity(spec), []);
    const { h5p, content, names } = h5pJson(packageH5p(spec));
    assert.deepEqual(names, ['content/content.json', 'h5p.json']);
    assert.equal(h5p.title, spec.title);
    assert.equal(h5p.mainLibrary, LIB[type]);
    assert.deepEqual(h5p.embedTypes, ['iframe']);
    const deps = h5p.preloadedDependencies as { machineName: string; majorVersion: number; minorVersion: number }[];
    assert.equal(deps[0]!.machineName, LIB[type]);
    for (const d of deps) assert.ok(Number.isInteger(d.majorVersion) && Number.isInteger(d.minorVersion), 'versions are whole numbers');
    assert.equal(typeof content, 'object');
    assert.ok(Object.keys(content).length > 3, 'content has the built fields plus the library defaults');
  });
}

test('h5p: the content of each type says what the spec said', () => {
  const c = (t: string) => h5pJson(packageH5p(SAMPLES[t]!)).content;
  const mc = c('multichoice');
  assert.equal(mc.question, '<p>Which is a fruit?</p>');
  assert.equal(mc.behaviour.type, 'single');
  assert.deepEqual(mc.answers[0], { text: '<div>Apple</div>', correct: true, tipsAndFeedback: { chosenFeedback: '<div>Yes.</div>' } });
  assert.equal(typeof mc.UI.checkAnswerButton, 'string', 'interface wording comes from the library defaults');
  const tf = c('truefalse');
  assert.equal(tf.correct, 'true');
  assert.equal(tf.behaviour.feedbackOnCorrect, 'It is.');
  assert.deepEqual(c('blanks').questions, ['<p>The sky is *blue/azure*.</p>']);
  assert.equal(c('dragtext').textField, 'A *cat* purrs.\nA *dog* barks.');
  const dd = c('dragdrop');
  assert.equal(dd.question.task.elements.length, 3);
  assert.deepEqual(dd.question.task.dropZones.map((z: any) => z.correctElements), [['0', '2'], ['1']]);
  assert.equal(dd.question.task.elements[1].type.metadata.title, 'Trout');
  assert.match(dd.question.task.elements[0].type.subContentId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(dd.overallFeedback, [{ from: 0, to: 99, feedback: 'Look again.' }, { from: 100, to: 100, feedback: 'All placed.' }]);
  for (const e of [...dd.question.task.elements, ...dd.question.task.dropZones]) {
    assert.ok(e.x >= 0 && e.x < 100 && e.y >= 0 && e.y < 100, 'positions are percentages');
  }
  assert.equal(c('dialogcards').dialogs[1].answer, '<p style="text-align:center;">Two</p>');
  assert.deepEqual(c('sort').paragraphs, ['<p>First</p>', '<p>Second</p>', '<p>Third</p>']);
  const qs = c('questionset');
  assert.deepEqual(qs.questions.map((q: any) => q.library.split(' ')[0]), ['H5P.TrueFalse', 'H5P.MultiChoice', 'H5P.Blanks']);
  assert.deepEqual(qs.override, { checkButton: false, showSolutionButton: 'on', retryButton: 'on' });
  assert.equal(qs.introPage.showIntroPage, true);
  assert.equal(qs.questions[2].metadata.title, 'Fill');
  const used = h5pJson(packageH5p(SAMPLES['questionset']!)).h5p.preloadedDependencies.map((d: any) => d.machineName);
  for (const lib of ['H5P.QuestionSet', 'H5P.TrueFalse', 'H5P.MultiChoice', 'H5P.Blanks']) assert.ok(used.includes(lib), lib);
});

test('h5p: a library version can be overridden', () => {
  const { h5p, content } = h5pJson(packageH5p(SAMPLES['questionset']!, { 'H5P.QuestionSet': '1.21', 'H5P.TrueFalse': '1.9' }));
  assert.deepEqual(h5p.preloadedDependencies[0], { machineName: 'H5P.QuestionSet', majorVersion: 1, minorVersion: 21 });
  assert.equal(content.questions[0].library, 'H5P.TrueFalse 1.9');
});

test('checkActivity: catches bad specs and passes good ones', () => {
  const bad = (act: Record<string, unknown>, pattern: RegExp) => {
    const problems = checkActivity(act as Activity);
    assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern} in ${JSON.stringify(problems)}`);
  };
  bad({ n: 1, type: 'crossword', title: 'X' }, /unknown type/);
  bad({ n: 1, type: 'truefalse', question: 'Q', correct: true }, /title/);
  bad({ type: 'truefalse', title: 'T', question: 'Q', correct: true }, /"n"/);
  bad({ n: 1, type: 'truefalse', title: 'T', question: 'Q' }, /correct/);
  bad({ n: 1, type: 'multichoice', title: 'T', answers: [{ text: 'a', correct: true }, { text: 'b' }] }, /question/);
  bad({ n: 1, type: 'multichoice', title: 'T', question: 'Q', answers: [{ text: 'a' }, { text: 'b' }] }, /no correct answer/);
  bad({ n: 1, type: 'multichoice', title: 'T', question: 'Q' }, /answers/);
  bad({ n: 1, type: 'dragdrop', title: 'T', zones: [{ label: 'A' }], items: [{ text: 'x', zone: 1 }] }, /zone 1/);
  bad({ n: 1, type: 'dragdrop', title: 'T', zones: [{ label: 'A' }], items: [{ text: 'x', zone: 'A' }] }, /zone number/);
  bad({ n: 1, type: 'dragdrop', title: 'T', zones: [], items: [{ text: 'x', zone: 0 }] }, /zones/);
  bad({ n: 1, type: 'blanks', title: 'T', text: 'No blank here.' }, /asterisks/);
  bad({ n: 1, type: 'dragtext', title: 'T' }, /text/);
  bad({ n: 1, type: 'dialogcards', title: 'T', cards: [{ front: 'only' }] }, /front.*back/);
  bad({ n: 1, type: 'sort', title: 'T', instructions: 'I', paragraphs: ['one'] }, /two/);
  bad({ n: 1, type: 'questionset', title: 'T', questions: [] }, /questions/);
  bad({ n: 1, type: 'questionset', title: 'T', questions: [{ type: 'truefalse', question: 'Q' }] }, /question 1 .*correct/);
  for (const spec of Object.values(SAMPLES)) assert.deepEqual(checkActivity(spec), []);
});

test('h5p: a spec the Python would fail on throws', () => {
  assert.throws(() => packageH5p({ n: 1, type: 'truefalse', title: 'T', question: 'Q' }), /correct/);
  assert.throws(() => packageH5p({ n: 1, type: 'nope', title: 'T' }), /unknown activity type/);
  assert.throws(() => packageH5p({ n: 1, type: 'dragdrop', title: 'T', zones: [{ label: 'A' }], items: [] }), /items/);
});

test('py helpers: rounding, JSON text and whitespace follow Python', () => {
  assert.equal(pyRound(0.03125, 4), 0.0312);     // an exact tie goes to the even digit
  assert.equal(pyRound(2.675, 2), 2.67);
  assert.equal(pyRound(0.5), 0);
  assert.equal(pyRound(1.5), 2);
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(56.25, 1), 56.2);
  assert.equal(pyJson({ a: [1, new PyFloat(2), 'é"'], b: { c: null, d: true } }), '{"a": [1, 2.0, "\\u00e9\\""], "b": {"c": null, "d": true}}');
  assert.equal(pyJson('é', false), '"é"');
  assert.equal(strip('\u001f\u0085 x﻿  '), 'x﻿');
  assert.equal(cut('a😀b', 2), 'a😀');
  assert.equal(slug('  Topic 1: Compiler Drivers & “Static” Linking, and then rather more words  '), 'topic-1-compiler-drivers-static-linking-and-then-r');
});

test('xml reader: namespaces, order, entities, text before the first child', () => {
  const root = parseXml('<?xml version="1.0"?><a:r xmlns:a="urn:x" xmlns="urn:d" a:k="1 &amp; 2" plain=\'q"\'>lead<b/><a:c>t&#233;<![CDATA[<raw>]]></a:c>tail<b x="1"/></a:r>');
  assert.equal(root.tag, '{urn:x}r');
  assert.deepEqual(root.attrs, { '{urn:x}k': '1 & 2', plain: 'q"' });
  assert.equal(root.text, 'lead');
  assert.deepEqual(root.children.map((c) => c.tag), ['{urn:d}b', '{urn:x}c', '{urn:d}b']);
  assert.equal(root.children[1]!.text, 'té<raw>');
});

test('draft: inline runs become joined, escaped HTML', () => {
  assert.equal(render([['a < b ', '', null], ['bold', 'b', null], [' ', 'b', null], ['more', 'b code', null], ['x\ny', 'i', 'https://e.org/?a=1&b="2"']]),
    'a &lt; b <strong>bold <code>more</code></strong><a href="https://e.org/?a=1&amp;b=&quot;2&quot;"><em>x<br>y</em></a>');
  assert.equal(render([['yes', 'red', null]], true), '<mark>yes</mark>');
  assert.equal(render([['yes', 'red', null]]), 'yes');
});

test('mbz: a tiny backup lists the expected entries and files', () => {
  const pic = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const act = packageH5p(SAMPLES['truefalse']!);
  const r = buildMbz('tiny.mbz', { fullname: 'Tiny & Co', shortname: 'TINY' }, { name: 'Unit 1' }, [{
    name: 'Tiny book',
    chapters: [
      { title: 'One <1>', html: '<p>Hello</p><img src="@@PLUGINFILE@@/m-pic.png" alt="">' },
      { title: 'Two', html: '<div class="h5p-placeholder">@@PLUGINFILE@@/m-h5p-01-x.h5p</div><img src="@@PLUGINFILE@@/m-pic.png" alt="">' },
    ],
    files: { 'm-pic.png': pic, 'm-h5p-01-x.h5p': act, 'unused.png': new Uint8Array([9]) },
  }], { now: 1700000000 });
  assert.equal(r.files, 3);
  const tar = untar(r.mbz);
  const sha = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');
  const blobs = [sha(pic), sha(act)].map((h) => `files/${h.slice(0, 2)}/${h}`);
  const expected = [
    ...['book', 'calendar', 'filters', 'grade_history', 'grades', 'inforef', 'module', 'roles'].map((f) => `activities/book_9301/${f}.xml`),
    'badges.xml', 'completion.xml',
    ...['calendar', 'completiondefaults', 'contentbank', 'course', 'enrolments', 'filters', 'inforef', 'roles'].map((f) => `course/${f}.xml`),
    'files.xml', ...blobs,
    'grade_history.xml', 'gradebook.xml', 'groups.xml', 'moodle_backup.xml', 'outcomes.xml', 'questions.xml', 'roles.xml', 'scales.xml',
    'sections/section_9200/inforef.xml', 'sections/section_9200/section.xml',
    'sections/section_9201/inforef.xml', 'sections/section_9201/section.xml',
  ].sort();
  assert.deepEqual([...tar.keys()], expected, 'entries, in sorted order');
  assert.equal(r.entries, expected.length);
  assert.deepEqual(tar.get(blobs[0]!), pic);

  const filesXml = text(tar.get('files.xml'));
  assert.equal((filesXml.match(/<file id=/g) ?? []).length, 3);
  assert.ok(filesXml.includes(`<contenthash>${sha(pic)}</contenthash>`));
  assert.ok(filesXml.includes('<mimetype>application/zip.h5p</mimetype>'));
  assert.ok(!filesXml.includes('unused.png'));
  const book = text(tar.get('activities/book_9301/book.xml'));
  assert.ok(book.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<activity id="9401" moduleid="9301" modulename="book" contextid="9501">\n'));
  assert.ok(book.includes('<title>One &lt;1&gt;</title>\n<content>&lt;p&gt;Hello&lt;/p&gt;&lt;img src="@@PLUGINFILE@@/m-pic.png" alt=""&gt;</content>'));
  assert.ok(book.includes('<timemodified>1700000000</timemodified>'));
  assert.ok(text(tar.get('activities/book_9301/module.xml')).includes('<visible>0</visible>'), 'hidden unless asked');
  assert.ok(text(tar.get('course/course.xml')).includes('<fullname>Tiny &amp; Co</fullname>'));
  const backup = parseXml(text(tar.get('moodle_backup.xml')));
  assert.equal(backup.tag, 'moodle_backup');
  assert.ok(text(tar.get('moodle_backup.xml')).includes('<name>tiny.mbz</name>'));

  assert.throws(() => buildMbz('t.mbz', { fullname: 'T', shortname: 'T' }, { name: 'S' },
    [{ name: 'B', chapters: [{ title: 'C', html: '@@PLUGINFILE@@/missing.png' }], files: {} }]), /missing\.png/);
});

test('mbz: section 0 and visible', () => {
  const r = buildMbz('t.mbz', { fullname: 'T', shortname: 'T' }, { name: 'S' }, [{ name: 'B', chapters: [{ title: 'C', html: '<p>x</p>' }], files: {} }],
    { hidden: false, sectionNumber: 0 });
  const tar = untar(r.mbz);
  assert.ok(!tar.has('sections/section_9200/section.xml'));
  assert.ok(text(tar.get('activities/book_9301/module.xml')).includes('<visible>1</visible>'));
  assert.ok(text(tar.get('sections/section_9201/section.xml')).includes('<number>0</number>'));
});

test('inspectDraft: reads a tiny Word file and applies the page rules', () => {
  const d = inspectDraft(tinyDocx());
  assert.equal(d.name, 'Sample Module');
  assert.deepEqual(d.chapters.map((c) => c.title), ['Welcome', 'Practice']);
  const [welcome, practice] = d.chapters as [typeof d.chapters[0], typeof d.chapters[0]];
  assert.ok(welcome.html.startsWith('<p>Plain &amp; <strong>bold</strong> and <code>printf()</code><a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener">a link</a></p>\n<details '), welcome.html);
  assert.equal((welcome.html.match(/<details /g) ?? []).length, 2, 'two accordion steps');
  assert.ok(welcome.html.includes('<ol><li>First</li><li>Second</li></ol>'));
  assert.deepEqual(d.slots.map((s) => [s.n, s.title, s.type, s.chapter]), [[1, 'Wet water', 'True/False', 'Practice'], [2, 'Second one', 'Multiple Choice', 'Practice']]);
  assert.equal(d.slots[0]!.text, 'H5P Type: True/False\nTitle: Wet water\nStatement: Water is wet. Answer: <mark>True</mark>');
  assert.ok(practice.html.includes('<code>int main(void) {\n  return 0;\n}</code></pre>'));
  assert.ok(practice.html.includes('<caption style="caption-side:top;font-weight:600;font-size:1rem;color:inherit;text-align:left">Table 1.1 Sizes</caption><thead><tr><th scope="col" style="background:#f1f3f5">Name</th>'));
  assert.ok(practice.html.includes('<td>4 &lt; 8</td>'));
  assert.deepEqual(d.todo, [
    'Practice: H5P activity #1 (True/False: Wet water) has not been built yet.',
    'Practice: H5P activity #2 (Multiple Choice: Second one) has not been built yet.',
    'Practice: Production note not understood: [@Production: do something nobody has defined]',
  ]);
});

test('buildModule: builds what it can and reports a bad activity instead of throwing', () => {
  const spec: ModuleSpec = {
    prefix: 't',
    activities: [
      { n: 1, type: 'truefalse', title: 'Wet water', question: 'Water is wet.', correct: true, interpretation: 'As written.' },
      { n: 2, type: 'multichoice', title: 'Second one', question: 'Q' },      // no answers: cannot be built
    ],
  };
  const r = buildModule(tinyDocx(), spec, { sourceName: 'sample.docx' });
  assert.equal(r.name, 'Sample Module');
  assert.equal(r.fileName, 'sample-module.mbz');
  assert.deepEqual(Object.keys(r.h5p), ['t-h5p-01-wet-water.h5p']);
  assert.ok(r.chapters[1]!.html.includes('<div class="h5p-placeholder" contenteditable="false">@@PLUGINFILE@@/t-h5p-01-wet-water.h5p</div>'));
  assert.ok(r.todo.includes('Practice: H5P activity #2 (Multiple Choice: Second one) has not been built yet.'));
  assert.ok(r.todo.some((t) => /^H5P activity #2 \(Second one\) could not be built: .*answers/.test(t)), JSON.stringify(r.todo));
  assert.ok(r.report.startsWith('# Build report: Sample Module\n\nSource: sample.docx\n\n## What was built\n\n| Item | Count |\n|---|---|\n| Book chapters | 2 |\n| H5P activities embedded | 1 |\n| H5P specs found in the draft | 2 |\n| Accordions | 1 (2 steps) |\n'));
  assert.ok(r.report.includes('| 1 | Practice | True/False | truefalse | Wet water | As written. |\n| 2 | Practice | Multiple Choice | NOT BUILT |  |  |\n'));
  assert.ok(r.report.includes('\n## H5P versions this file expects on the Moodle site\n\n- H5P.TrueFalse 1.8\n'));
  assert.equal(r.counts['Book chapters'], 2);
  assert.equal(r.counts['Accordions'], '1 (2 steps)');
  assert.equal(r.counts['Files in the backup'], 1);
  assert.ok(r.specsFound.includes('\n## 1. Wet water\n\nChapter: Practice. Under: .\n\n```\nH5P Type: True/False\n'));
  const tar = untar(r.mbz);
  assert.ok(text(tar.get('moodle_backup.xml')).includes('<original_course_shortname>SAMPLE-MODULE</original_course_shortname>'));
  assert.equal([...tar.keys()].filter((k) => k.startsWith('files/')).length, 1);

  const none = buildModule(tinyDocx(), {}, { sourceName: 'sample.docx', course: 'ABC', section: 3, visible: true });
  assert.deepEqual(none.h5p, {});
  assert.equal(none.counts['H5P activities embedded'], 0);
  const noneTar = untar(none.mbz);
  assert.ok(text(noneTar.get('activities/book_9301/module.xml')).includes('<sectionnumber>3</sectionnumber>'));
  assert.ok(text(noneTar.get('course/course.xml')).includes('<shortname>ABC</shortname>'));
});

// ─── (b) golden test against the Python tool's output ───────────────────────

const GOLDEN = process.env['BUILDER_GOLDEN_DIR'];
const STAMPS = /<(timecreated|timemodified|added|startdate|backup_date|original_course_startdate)>\d+<\//g;
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const maskIds = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(maskIds);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'subContentId' ? 'ID' : maskIds(x)]));
  return v;
};
const tag = (xml: string, name: string): string => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? '';
/** files.xml -> file name -> content hash; and the text with the .h5p rows' hash and size masked. */
function fileRows(xml: string): { hashes: Map<string, string>; masked: string } {
  const hashes = new Map<string, string>();
  const masked = xml.replace(/<file id="\d+">\n[^]*?<\/file>\n/g, (row) => {
    const name = tag(row, 'filename');
    hashes.set(name, tag(row, 'contenthash'));
    return name.endsWith('.h5p') ? row.replace(/<contenthash>[0-9a-f]+</, '<contenthash>H5P<').replace(/<filesize>\d+</, '<filesize>N<') : row;
  });
  return { hashes, masked };
}

test('golden: same output as the Python tool for the reference draft', { skip: GOLDEN ? false : 'set BUILDER_GOLDEN_DIR to run' }, async (t) => {
  const dir = GOLDEN!;
  const only = (ext: string): string => {
    const found = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext) && !f.startsWith('~$') && !f.startsWith('.'));
    assert.equal(found.length, 1, `expected exactly one ${ext} file in ${dir}, found ${found.length}`);
    return path.join(dir, found[0]!);
  };
  const docxPath = only('.docx');
  const spec = JSON.parse(fs.readFileSync(only('.json'), 'utf8')) as ModuleSpec;
  const ref = path.join(dir, 'moodle-build');
  const refMbzName = fs.readdirSync(ref).filter((f) => f.endsWith('.mbz'));
  assert.equal(refMbzName.length, 1, 'expected exactly one .mbz in moodle-build');
  const refTar = untar(new Uint8Array(fs.readFileSync(path.join(ref, refMbzName[0]!))));
  const refModule = text(refTar.get('activities/book_9301/module.xml'));

  const r = buildModule(new Uint8Array(fs.readFileSync(docxPath)), spec, {
    sourceName: path.basename(docxPath),
    course: tag(text(refTar.get('course/course.xml')), 'shortname'),
    section: Number(tag(refModule, 'sectionnumber')),
    visible: tag(refModule, 'visible') === '1',
  });
  const tar = untar(r.mbz);

  await t.test('1. chapter titles and HTML equal pages/*.html', () => {
    const pages = fs.readdirSync(path.join(ref, 'pages')).filter((f) => f.endsWith('.html')).sort();
    assert.deepEqual(r.chapters.map((c, i) => `${String(i + 1).padStart(2, '0')}-${slug(c.title)}.html`), pages);
    r.chapters.forEach((c, i) => {
      const want = fs.readFileSync(path.join(ref, 'pages', pages[i]!), 'utf8');
      assert.equal(`<!doctype html><meta charset="utf-8"><title>${c.title}</title>\n<h1>${c.title}</h1>\n${c.html}\n`, want, pages[i]);
    });
  });

  await t.test('2. every .h5p has the same h5p.json and content.json (subContentId aside)', () => {
    const names = fs.readdirSync(path.join(ref, 'h5p')).filter((f) => f.endsWith('.h5p')).sort();
    assert.deepEqual(Object.keys(r.h5p).sort(), names);
    for (const name of names) {
      const want = h5pJson(new Uint8Array(fs.readFileSync(path.join(ref, 'h5p', name))));
      const got = h5pJson(r.h5p[name]!);
      assert.deepEqual(got.names, want.names, name);
      assert.deepEqual(got.h5p, want.h5p, `${name} h5p.json`);
      assert.deepEqual(maskIds(got.content), maskIds(want.content), `${name} content.json`);
      // Stronger than asked: the JSON text itself is the same once the random ids are masked.
      assert.equal(got.contentText.replace(UUIDS, 'ID'), want.contentText.replace(UUIDS, 'ID'), `${name} content.json text`);
      const z = (b: Uint8Array) => strFromU8(unzipSync(b)['h5p.json']!);
      assert.equal(z(r.h5p[name]!), z(new Uint8Array(fs.readFileSync(path.join(ref, 'h5p', name)))), `${name} h5p.json text`);
    }
  });

  await t.test('3. build-report.md and h5p-specs-found.md equal', () => {
    assert.equal(r.report, fs.readFileSync(path.join(ref, 'build-report.md'), 'utf8'));
    assert.equal(r.specsFound, fs.readFileSync(path.join(ref, 'h5p-specs-found.md'), 'utf8'));
  });

  await t.test('4. the .mbz has the same entries, file hashes and XML', () => {
    assert.equal(r.fileName, refMbzName[0]);
    const got = fileRows(text(tar.get('files.xml')));
    const want = fileRows(text(refTar.get('files.xml')));
    assert.deepEqual([...got.hashes.keys()], [...want.hashes.keys()], 'files.xml lists the same files in the same order');
    let images = 0;
    for (const [name, hash] of want.hashes) {
      if (name.endsWith('.h5p')) {
        // The package bytes differ (random ids, zip container); what is stored must be the package this build made.
        const mine = got.hashes.get(name)!;
        assert.deepEqual(tar.get(`files/${mine.slice(0, 2)}/${mine}`), r.h5p[name], `${name} stored as built`);
      } else {
        images++;
        assert.equal(got.hashes.get(name), hash, `${name} content hash`);
        assert.deepEqual(tar.get(`files/${hash.slice(0, 2)}/${hash}`), refTar.get(`files/${hash.slice(0, 2)}/${hash}`), `${name} bytes`);
      }
    }
    assert.ok(images > 0, 'the reference has images to compare');

    // Entry lists: equal once each .h5p blob path is renamed after its file.
    const named = (entries: Map<string, Uint8Array>, hashes: Map<string, string>): string[] => {
      const h5pPaths = new Map([...hashes].filter(([n]) => n.endsWith('.h5p')).map(([n, h]) => [`files/${h.slice(0, 2)}/${h}`, `files/<${n}>`]));
      return [...entries.keys()].map((k) => h5pPaths.get(k) ?? k).sort();
    };
    assert.deepEqual(named(tar, got.hashes), named(refTar, want.hashes), 'archive entries');
    assert.deepEqual([...tar.keys()].filter((k) => !k.startsWith('files/')), [...refTar.keys()].filter((k) => !k.startsWith('files/')), 'XML entries, in archive order');

    let compared = 0;
    for (const [name, bytes] of refTar) {
      if (!name.endsWith('.xml')) continue;
      const a = text(tar.get(name)).replace(STAMPS, '<$1>T</');
      const b = text(bytes).replace(STAMPS, '<$1>T</');
      if (name === 'files.xml') assert.equal(fileRows(a).masked, fileRows(b).masked, name);
      else assert.equal(a, b, name);
      compared++;
    }
    assert.ok(compared >= 30, `compared ${compared} XML files`);
  });
});
