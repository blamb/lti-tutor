import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync, zipSync } from 'fflate';
import { parseXml, txt, child, roleFor, rubricText, parseMoodleBackup, TarReader } from './moodle-backup.js';

// ─── A synthetic backup, the way Moodle lays it out ─────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function backupFiles(opts: { hiddenLabel?: boolean } = {}): Record<string, string> {
  const unitText = '<h4>Unit 1: What is an argument?</h4><p>' + 'An argument is a set of statements, one of which is the conclusion. '.repeat(6) + '</p>';
  const activity = '<h4>Activity: Exercise 1.1</h4><p>Standardise the following arguments and identify the premises and conclusion.</p><ol><li>All men are mortal; Socrates is a man; so Socrates is mortal.</li><li>If it rains the ground is wet. It rained. So the ground is wet.</li></ol>';
  const studyQ = '<p><strong>Study questions</strong></p><ul><li>What distinguishes a deductive from an inductive argument?</li><li>Why does validity not require true premises?</li></ul>';
  const image = '<p><img src="@@PLUGINFILE@@/banner.png" alt=""></p>';
  return {
    'moodle_backup.xml': `<?xml version="1.0" encoding="UTF-8"?>
<moodle_backup><information>
  <name>backup-moodle2-course-12-phil1011-20261013.mbz</name>
  <moodle_release>4.5 (Build: 20241007)</moodle_release>
  <backup_date>1760313600</backup_date>
  <original_wwwroot>https://moodbox.example.ca</original_wwwroot>
  <original_course_id>12</original_course_id>
  <original_course_fullname>PHIL 1011 - Introduction to Epistemology</original_course_fullname>
  <original_course_shortname>PHIL1011</original_course_shortname>
  <contents>
    <activities>
      <activity><moduleid>101</moduleid><sectionid>7</sectionid><modulename>label</modulename><title>Unit 1: What is an argument?</title><directory>activities/label_101</directory></activity>
      <activity><moduleid>102</moduleid><sectionid>7</sectionid><modulename>label</modulename><title>Activity: Exercise 1.1</title><directory>activities/label_102</directory></activity>
      <activity><moduleid>103</moduleid><sectionid>7</sectionid><modulename>resource</modulename><title>Russell, chapter XV</title><directory>activities/resource_103</directory></activity>
      <activity><moduleid>104</moduleid><sectionid>7</sectionid><modulename>label</modulename><title>Study questions</title><directory>activities/label_104</directory></activity>
      <activity><moduleid>105</moduleid><sectionid>7</sectionid><modulename>assign</modulename><title>Assignment 1</title><directory>activities/assign_105</directory></activity>
      <activity><moduleid>106</moduleid><sectionid>7</sectionid><modulename>label</modulename><title>banner</title><directory>activities/label_106</directory></activity>
      <activity><moduleid>107</moduleid><sectionid>8</sectionid><modulename>page</modulename><title>Unit 2 reading guide</title><directory>activities/page_107</directory></activity>
      <activity><moduleid>108</moduleid><sectionid>8</sectionid><modulename>forum</modulename><title>Unit 2 discussion</title><directory>activities/forum_108</directory></activity>
    </activities>
    <sections>
      <section><sectionid>6</sectionid><title>General</title><directory>sections/section_6</directory></section>
      <section><sectionid>7</sectionid><title>Unit 1</title><directory>sections/section_7</directory></section>
      <section><sectionid>8</sectionid><title>Unit 2</title><directory>sections/section_8</directory></section>
    </sections>
  </contents>
</information></moodle_backup>`,
    'course/course.xml': `<?xml version="1.0" encoding="UTF-8"?><course id="12"><shortname>PHIL1011</shortname><fullname>PHIL 1011 - Introduction to Epistemology &amp; Metaphysics</fullname><summary></summary></course>`,
    'sections/section_6/section.xml': `<?xml version="1.0" encoding="UTF-8"?><section id="6"><number>0</number><name>$@NULL@$</name><summary>&lt;p&gt;Welcome.&lt;/p&gt;</summary><sequence></sequence><visible>1</visible></section>`,
    'sections/section_7/section.xml': `<?xml version="1.0" encoding="UTF-8"?><section id="7"><number>1</number><name>Unit 1: Arguments</name><summary></summary><sequence>101,102,103,104,105,106</sequence><visible>1</visible></section>`,
    'sections/section_8/section.xml': `<?xml version="1.0" encoding="UTF-8"?><section id="8"><number>2</number><name>Unit 2: Knowledge</name><summary></summary><sequence>107,108</sequence><visible>1</visible></section>`,
    'activities/label_101/module.xml': `<module id="101"><visible>1</visible></module>`,
    'activities/label_101/label.xml': `<activity id="101" moduleid="101" modulename="label" contextid="501"><label id="101"><name>Unit 1: What is an argument?</name><intro>${esc(unitText)}</intro></label></activity>`,
    'activities/label_102/module.xml': `<module id="102"><visible>${opts.hiddenLabel ? 0 : 1}</visible></module>`,
    'activities/label_102/label.xml': `<activity id="102" moduleid="102" modulename="label" contextid="502"><label id="102"><name>Activity: Exercise 1.1</name><intro>${esc(activity)}</intro></label></activity>`,
    'activities/resource_103/module.xml': `<module id="103"><visible>1</visible></module>`,
    'activities/resource_103/resource.xml': `<activity id="103" moduleid="103" modulename="resource" contextid="503"><resource id="103"><name>Russell, chapter XV</name><intro>&lt;p&gt;Read before Unit 1.&lt;/p&gt;</intro></resource></activity>`,
    'activities/label_104/module.xml': `<module id="104"><visible>1</visible></module>`,
    'activities/label_104/label.xml': `<activity id="104" moduleid="104" modulename="label" contextid="504"><label id="104"><name>Study questions</name><intro>${esc(studyQ)}</intro></label></activity>`,
    'activities/assign_105/module.xml': `<module id="105"><visible>1</visible></module>`,
    'activities/assign_105/assign.xml': `<activity id="105" moduleid="105" modulename="assign" contextid="505"><assign id="105"><name>Assignment 1: Argument Types and Components</name><intro>&lt;p&gt;Standardise the three passages below and identify each argument's type.&lt;/p&gt;</intro><duedate>1761350400</duedate><allowsubmissionsfromdate>0</allowsubmissionsfromdate><grade>100</grade></assign></activity>`,
    'activities/assign_105/grading.xml': `<areas><area id="1"><areaname>submissions</areaname><activemethod>rubric</activemethod><definitions><definition id="3"><method>rubric</method><name>Assignment 1 rubric</name><description></description><plugin_gradingform_rubric_definition><criteria><criterion id="1"><sortorder>1</sortorder><description>Identifies premises and conclusion</description><descriptionformat>0</descriptionformat><levels><level id="1"><score>0.00000</score><definition>Missing</definition><definitionformat>0</definitionformat></level><level id="2"><score>5.00000</score><definition>All identified correctly</definition><definitionformat>0</definitionformat></level></levels></criterion></criteria></plugin_gradingform_rubric_definition></definition></definitions></area></areas>`,
    'activities/label_106/module.xml': `<module id="106"><visible>1</visible></module>`,
    'activities/label_106/label.xml': `<activity id="106" moduleid="106" modulename="label" contextid="506"><label id="106"><name>banner</name><intro>${esc(image)}</intro></label></activity>`,
    'activities/page_107/module.xml': `<module id="107"><visible>0</visible></module>`,
    'activities/page_107/page.xml': `<activity id="107" moduleid="107" modulename="page" contextid="507"><page id="107"><name>Unit 2 reading guide</name><intro></intro><content>${esc('<p>' + 'Knowledge is justified true belief, or so the tradition says. '.repeat(5) + '</p>')}</content></page></activity>`,
    'activities/forum_108/module.xml': `<module id="108"><visible>1</visible></module>`,
    'activities/forum_108/forum.xml': `<activity id="108" moduleid="108" modulename="forum" contextid="508"><forum id="108"><name>Unit 2 discussion</name><intro>${esc('<p>Post one example of something you know but cannot prove, and reply to two classmates with a challenge to their example.</p>')}</intro></forum></activity>`,
    'files.xml': `<files><file id="1"><contenthash>ab12cd</contenthash><contextid>503</contextid><component>mod_resource</component><filearea>content</filearea><filename>.</filename><mimetype>$@NULL@$</mimetype><filesize>0</filesize></file><file id="2"><contenthash>ab12cd</contenthash><contextid>503</contextid><component>mod_resource</component><filearea>content</filearea><filename>russell-ch15.txt</filename><mimetype>text/plain</mimetype><filesize>120</filesize></file></files>`,
    'files/ab/ab12cd': 'CHAPTER XV. THE VALUE OF PHILOSOPHY. Having now come to the end of our brief and very incomplete review of the problems of philosophy…',
    'questions.xml': '<question_categories/>',
  };
}

/** Minimal ustar writer, enough for Moodle-like paths. */
function tar(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    h.write('0000644\0', 100, 8, 'ascii');
    h.write('0000000\0', 108, 8, 'ascii');
    h.write('0000000\0', 116, 8, 'ascii');
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    h.write('00000000000\0', 136, 12, 'ascii');
    h.write('        ', 148, 8, 'ascii');
    h.write('0', 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    h.write('00', 263, 2, 'ascii');
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function tmpFile(name: string, data: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbz-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, data);
  return p;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('parseXml handles attributes, entities, CDATA, self-closing tags and Moodle nulls', () => {
  const x = parseXml(`<?xml version="1.0"?><a id="1" name='x &amp; y'><!-- c --><b>1 &lt; 2</b><c/><d><![CDATA[<p>raw</p>]]></d><e>$@NULL@$</e></a>`);
  const a = child(x, 'a')!;
  assert.deepEqual(a.attrs, { id: '1', name: 'x & y' });
  assert.equal(txt(a, 'b'), '1 < 2');
  assert.ok(child(a, 'c'));
  assert.equal(txt(a, 'd'), '<p>raw</p>');
  assert.equal(txt(a, 'e'), '');
});

test('roleFor: assignments, forums and activity-headed labels; readings otherwise', () => {
  assert.equal(roleFor('assign', 'Essay 1', ''), 'assignment');
  assert.equal(roleFor('forum', 'Discussion', ''), 'activities');
  assert.equal(roleFor('label', 'Activity: Exercise 1.1', 'Standardise…'), 'activities');
  assert.equal(roleFor('label', 'Section 3', '#### Study Questions\n- Why…'), 'activities');
  assert.equal(roleFor('label', 'Unit 1: What is an argument?', 'An argument is…'), 'reading');
  assert.equal(roleFor('page', 'Reading guide', 'text'), 'reading');
  assert.equal(roleFor('resource', 'Russell', ''), 'reading');
  assert.equal(roleFor('quiz', 'Quiz 1', ''), 'other');
});

test('rubricText renders a rubric (levels highest first) and a marking guide, as Moodle nests them', () => {
  const g = parseXml(`<areas><area><definitions><definition><method>rubric</method><name>R</name><description></description><plugin_gradingform_rubric_definition><criteria><criterion><description>Clarity</description><levels><level><score>1.00000</score><definition>Weak</definition></level><level><score>3.00000</score><definition>Clear</definition></level></levels></criterion></criteria></plugin_gradingform_rubric_definition></definition></definitions></area></areas>`);
  assert.equal(rubricText(g), '## Marking rubric: R\n- Clarity\n  3 pts: Clear\n  1 pts: Weak');
  const m = parseXml(`<areas><area><definitions><definition><method>guide</method><name>G</name><description>Read the whole thing.</description><plugin_gradingform_guide_definition><guidecriteria><guidecriterion><shortname>Argument</shortname><description>States a thesis</description><descriptionmarkers>Look for one sentence.</descriptionmarkers><maxscore>10.00000</maxscore></guidecriterion></guidecriteria></plugin_gradingform_guide_definition></definition></definitions></area></areas>`);
  assert.equal(rubricText(m), '## Marking guide: G\nRead the whole thing.\n- Argument (up to 10.00000 marks): States a thesis (for markers: Look for one sentence.)');
});

test('TarReader streams entries in small chunks and honours GNU long names', () => {
  const longName = 'activities/' + 'x'.repeat(120) + '/label.xml';
  const files = { 'a.xml': '<a/>', [longName]: '<b/>' };
  // Build with a GNU 'L' entry for the long name.
  const plain = tar({ 'a.xml': '<a/>' });
  const l = Buffer.alloc(512); l.write('././@LongLink', 0, 100, 'utf8'); l.write((longName.length + 1).toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii'); l.write('L', 156, 1, 'ascii'); l.write('ustar  \0', 257, 8, 'ascii');
  let sum = 0; l.write('        ', 148, 8, 'ascii'); for (const b of l) sum += b; l.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  const lname = Buffer.concat([Buffer.from(longName + '\0'), Buffer.alloc((512 - ((longName.length + 1) % 512)) % 512)]);
  const entry = tar({ 'short.xml': '<b/>' });
  const body = Buffer.concat([plain.subarray(0, plain.length - 1024), l, lname, entry]);
  const got: Record<string, string> = {};
  const reader = new TarReader(() => true, (name, data) => { got[name] = data.toString(); });
  for (let i = 0; i < body.length; i += 7) reader.push(body.subarray(i, i + 7));
  assert.deepEqual(got, files);
});

for (const format of ['tgz', 'zip'] as const) {
  test(`parseMoodleBackup (${format}): units, merged labels by role, resources with file text, assignments with rubric, skips`, async () => {
    const files = backupFiles();
    const archive = format === 'tgz'
      ? Buffer.from(gzipSync(new Uint8Array(tar(files))))
      : Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)]))));
    const p = tmpFile(`backup.${format === 'tgz' ? 'mbz' : 'zip'}`, archive);
    const out = await parseMoodleBackup(p);
    assert.equal(out.course.fullname, 'PHIL 1011 - Introduction to Epistemology & Metaphysics');
    assert.equal(out.course.course_id, '12');
    assert.equal(out.course.wwwroot, 'https://moodbox.example.ca');
    assert.equal(out.course.backup_date, '2025-10-13');
    assert.deepEqual(out.units.map((u) => [u.title, u.order]), [['Unit 1: Arguments', 1], ['Unit 2: Knowledge', 2]], 'the empty General section is dropped');

    const u1 = out.units[0]!;
    assert.deepEqual(u1.items.map((i) => [i.title, i.role, i.modname]), [
      ['Unit 1: Arguments — text', 'reading', 'label'],
      ['Unit 1: Arguments — activities and study questions', 'activities', 'label'],
      ['Russell, chapter XV', 'reading', 'resource'],
      ['Assignment 1: Argument Types and Components', 'assignment', 'assign'],
    ]);
    const acts = u1.items[1]!;
    assert.match(acts.text, /Exercise 1\.1[\s\S]*Study questions[\s\S]*deductive/);
    assert.equal(acts.key, 'moodle_backup:section-7-activities');
    assert.equal(acts.source_url, 'https://moodbox.example.ca/course/view.php?id=12&section=1');
    const russell = u1.items[2]!;
    assert.match(russell.text, /THE VALUE OF PHILOSOPHY/);
    assert.ok(russell.notes.some((n) => n.includes('russell-ch15.txt')));
    assert.equal(russell.source_url, 'https://moodbox.example.ca/mod/resource/view.php?id=103');
    const a1 = u1.items[3]!;
    assert.match(a1.text, /^Due: 2025-10-25\nMarked out of 100\n\nStandardise/);
    assert.match(a1.text, /## Marking rubric: Assignment 1 rubric\n- Identifies premises and conclusion\n  5 pts: All identified correctly/);
    assert.equal(a1.key, 'moodle_backup:assign-105');
    assert.ok(u1.items.every((i) => i.include && i.visible));

    const u2 = out.units[1]!;
    assert.deepEqual(u2.items.map((i) => [i.title, i.role, i.visible, i.include]), [
      ['Unit 2 reading guide', 'reading', false, false],
      ['Unit 2 discussion', 'activities', true, true],
    ]);
    assert.ok(u2.items[0]!.notes.includes('hidden in the course'));
    assert.ok(u2.items[1]!.notes.some((n) => /forum posts are never imported/.test(n)));
    assert.deepEqual(out.skipped, [{ title: 'banner', modname: 'label', reason: 'no text (an image or a divider)' }]);
    fs.rmSync(path.dirname(p), { recursive: true, force: true });
  });
}

test('a hidden label is left out of the merged unit text and reported', async () => {
  const p = tmpFile('b.mbz', Buffer.from(gzipSync(new Uint8Array(tar(backupFiles({ hiddenLabel: true }))))));
  const out = await parseMoodleBackup(p);
  const acts = out.units[0]!.items.find((i) => i.role === 'activities')!;
  assert.doesNotMatch(acts.text, /Exercise 1\.1/);
  assert.ok(out.skipped.some((s) => s.title === 'Activity: Exercise 1.1' && s.reason === 'hidden in the course'));
  fs.rmSync(path.dirname(p), { recursive: true, force: true });
});

test('a file that is not a backup is refused with a plain message', async () => {
  const notBackup = tmpFile('x.mbz', Buffer.from('hello'));
  await assert.rejects(parseMoodleBackup(notBackup), /not a Moodle course backup/);
  const noManifest = tmpFile('y.mbz', Buffer.from(gzipSync(new Uint8Array(tar({ 'readme.txt': 'nope' })))));
  await assert.rejects(parseMoodleBackup(noManifest), /No moodle_backup\.xml/);
  fs.rmSync(path.dirname(notBackup), { recursive: true, force: true });
  fs.rmSync(path.dirname(noManifest), { recursive: true, force: true });
});
