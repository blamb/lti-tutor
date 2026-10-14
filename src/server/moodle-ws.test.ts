import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenParams, wsClient, checkConnection, fetchCourseModel, rubricFromDefinitions, WS_FUNCTIONS_REQUIRED } from './moodle-ws.js';
import { buildPreview } from './course-model.js';
import { encryptSecret, decryptSecret } from './secrets.js';
import { platformUrl, parsePlatformHttpHosts } from './outbound.js';

test('secrets round-trip and reject tampering or another secret', () => {
  const enc = encryptSecret('abc123def456abc123def456abc123de');
  assert.match(enc, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(decryptSecret(enc), 'abc123def456abc123def456abc123de');
  assert.equal(decryptSecret(''), null);
  assert.equal(decryptSecret('garbage'), null);
  assert.equal(decryptSecret(enc.slice(0, -2) + 'zz'), null, 'a tampered ciphertext fails the tag');
});

test('platformUrl rewrites listed hosts to plain HTTP and leaves others alone', () => {
  const hosts = parsePlatformHttpHosts('moodbox.example.ca, lms.local:8080');
  assert.equal(platformUrl('https://moodbox.example.ca/webservice/rest/server.php', hosts), 'http://moodbox.example.ca/webservice/rest/server.php');
  assert.equal(platformUrl('https://lms.local/a?b=1', hosts), 'http://lms.local:8080/a?b=1');
  assert.equal(platformUrl('https://api.anthropic.com/v1', hosts), 'https://api.anthropic.com/v1');
  assert.equal(platformUrl('not a url', hosts), 'not a url');
});

test('flattenParams writes Moodle-style nested keys', () => {
  const q = flattenParams({ wstoken: 't', courseids: [12, 13], options: [{ name: 'excludecontents', value: 0 }] });
  assert.equal(q.toString(), 'wstoken=t&courseids%5B0%5D=12&courseids%5B1%5D=13&options%5B0%5D%5Bname%5D=excludecontents&options%5B0%5D%5Bvalue%5D=0');
});

test('rubricFromDefinitions renders a rubric for the matching assignment only', () => {
  const defs = { areas: [
    { cmid: 5, definitions: [{ method: 'rubric', name: 'R', description: '', rubric: { rubric_criteria: [{ description: 'Clarity', levels: [{ score: 1, definition: 'Weak' }, { score: 3, definition: 'Clear' }] }] } }] },
    { cmid: 6, definitions: [{ method: 'guide', name: 'G', description: '<p>Read all.</p>', guide: { guide_criteria: [{ shortname: 'Argument', description: 'States a thesis', descriptionmarkers: '', maxscore: 10 }] } }] },
  ] };
  assert.equal(rubricFromDefinitions(defs, 5), '## Marking rubric: R\n- Clarity\n  3 pts: Clear\n  1 pts: Weak');
  assert.equal(rubricFromDefinitions(defs, 6), '## Marking guide: G\nRead all.\n- Argument (up to 10 marks): States a thesis');
  assert.equal(rubricFromDefinitions(defs, 7), '');
});

/** A fake Moodle: answers the REST functions the sync uses for one small course. */
function fakeMoodle(opts: { allow?: string[]; denyGlossary?: boolean } = {}) {
  const calls: string[] = [];
  const allow = opts.allow ?? [...WS_FUNCTIONS_REQUIRED, 'mod_forum_get_forums_by_courses', 'mod_glossary_get_glossaries_by_courses', 'mod_glossary_get_entries_by_letter', 'core_grading_get_definitions', 'mod_book_get_books_by_courses', 'mod_lesson_get_lessons_by_courses'];
  const answers: Record<string, unknown> = {
    core_webservice_get_site_info: { sitename: 'Moodbox', username: 'brian', fullname: 'Brian Lamb', userid: 3, siteurl: 'https://moodbox.example.ca', functions: allow.map((name) => ({ name })) },
    core_course_get_contents: [
      { id: 7, name: 'Unit 1: Arguments', section: 1, visible: 1, summary: '', modules: [
        { id: 101, name: 'Unit 1: What is an argument?', modname: 'label', visible: 1, description: '<h4>Unit 1: What is an argument?</h4><p>' + 'An argument is a set of statements, one of which is the conclusion. '.repeat(6) + '</p>' },
        { id: 102, name: 'Activity: Exercise 1.1', modname: 'label', visible: 1, description: '<h4>Activity: Exercise 1.1</h4><p>Standardise the following arguments and identify the premises and conclusion. Then say whether each is deductive or inductive.</p>' },
        { id: 103, name: 'Russell, chapter XV', modname: 'resource', visible: 1, url: 'https://moodbox.example.ca/mod/resource/view.php?id=103', contents: [{ type: 'file', filename: 'russell-ch15.txt', fileurl: 'https://moodbox.example.ca/webservice/pluginfile.php/503/mod_resource/content/1/russell-ch15.txt', filesize: 120, mimetype: 'text/plain' }] },
        { id: 105, name: 'Assignment 1', modname: 'assign', visible: 1, url: 'https://moodbox.example.ca/mod/assign/view.php?id=105' },
        { id: 108, name: 'Unit 1 glossary', modname: 'glossary', visible: 1, url: 'https://moodbox.example.ca/mod/glossary/view.php?id=108' },
      ] },
      { id: 8, name: 'Unit 2', section: 2, visible: 0, summary: '', modules: [
        { id: 107, name: 'Unit 2 reading guide', modname: 'page', visible: 1, url: 'https://moodbox.example.ca/mod/page/view.php?id=107' },
      ] },
    ],
    mod_page_get_pages_by_courses: { pages: [{ coursemodule: 107, intro: '', content: '<p>' + 'Knowledge is justified true belief, or so the tradition says. '.repeat(5) + '</p>' }] },
    mod_resource_get_resources_by_courses: { resources: [{ coursemodule: 103, intro: '<p>Read before Unit 1.</p>', contentfiles: [{ filename: 'russell-ch15.txt', fileurl: 'https://moodbox.example.ca/webservice/pluginfile.php/503/mod_resource/content/1/russell-ch15.txt', filesize: 120, mimetype: 'text/plain' }] }] },
    mod_url_get_urls_by_courses: { urls: [] },
    mod_assign_get_assignments: { courses: [{ assignments: [{ cmid: 105, name: 'Assignment 1: Argument Types and Components', intro: '<p>Standardise the three passages below.</p>', duedate: 1761350400, allowsubmissionsfromdate: 0, grade: 100, introattachments: [] }] }] },
    mod_book_get_books_by_courses: { books: [] },
    mod_forum_get_forums_by_courses: [],
    mod_lesson_get_lessons_by_courses: { lessons: [] },
    mod_glossary_get_glossaries_by_courses: { glossaries: [{ id: 9, coursemodule: 108, intro: '<p>Key terms.</p>' }] },
    mod_glossary_get_entries_by_letter: { entries: [{ concept: 'Validity', definition: '<p>An argument is valid when the conclusion follows from the premises.</p>' }] },
    core_grading_get_definitions: { areas: [{ cmid: 105, definitions: [{ method: 'rubric', name: 'A1 rubric', rubric: { rubric_criteria: [{ description: 'Identifies premises', levels: [{ score: 0, definition: 'Missing' }, { score: 5, definition: 'All identified' }] }] } }] }] },
  };
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/webservice/pluginfile.php/')) {
      assert.match(url, /[?&]token=tok/);
      return new Response('CHAPTER XV. THE VALUE OF PHILOSOPHY. Having now come to the end of our brief and very incomplete review of the problems of philosophy, it will be well to consider…', { headers: { 'content-type': 'text/plain' } });
    }
    const params = new URLSearchParams(String(init?.body));
    const fn = params.get('wsfunction')!;
    calls.push(fn);
    assert.equal(params.get('wstoken'), 'tok');
    if (opts.denyGlossary && fn.startsWith('mod_glossary')) return Response.json({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' });
    if (!(fn in answers)) return Response.json({ exception: 'moodle_exception', errorcode: 'invalidrecord', message: `no such function ${fn}` });
    return Response.json(answers[fn]);
  };
  return { fetchImpl, calls };
}

test('checkConnection reports who the token is and which functions are missing', async () => {
  const fake = fakeMoodle({ allow: ['core_webservice_get_site_info', 'core_course_get_contents'] });
  const c = await checkConnection(wsClient('https://moodbox.example.ca/', 'tok', fake.fetchImpl));
  assert.equal(c.site.username, 'brian');
  assert.deepEqual(c.missing, ['mod_page_get_pages_by_courses', 'mod_resource_get_resources_by_courses', 'mod_url_get_urls_by_courses', 'mod_assign_get_assignments']);
  assert.ok(c.missing_optional.includes('core_grading_get_definitions'));
});

test('fetchCourseModel reads a course through web services into the same preview a backup gives', async () => {
  const fake = fakeMoodle();
  const client = wsClient('https://moodbox.example.ca', 'tok', fake.fetchImpl);
  const { model, notes } = await fetchCourseModel(client, '12', { fullname: 'PHIL 1011' });
  assert.deepEqual(notes, []);
  const out = await buildPreview(model);
  assert.equal(out.source, 'sync');
  assert.deepEqual(out.units.map((u) => [u.title, u.order, u.visible]), [['Unit 1: Arguments', 1, true], ['Unit 2', 2, false]]);
  const u1 = out.units[0]!;
  assert.deepEqual(u1.items.map((i) => [i.title, i.role, i.key]), [
    ['Unit 1: Arguments — text', 'reading', 'moodle:section-7-reading'],
    ['Unit 1: Arguments — activities and study questions', 'activities', 'moodle:section-7-activities'],
    ['Russell, chapter XV', 'reading', 'moodle:resource-103'],
    ['Assignment 1', 'assignment', 'moodle:assign-105'],
    ['Unit 1 glossary', 'reading', 'moodle:glossary-108'],
  ]);
  assert.match(u1.items[2]!.text, /THE VALUE OF PHILOSOPHY/);
  assert.match(u1.items[3]!.text, /^Due: 2025-10-25\nMarked out of 100\n\nStandardise[\s\S]*## Marking rubric: A1 rubric\n- Identifies premises\n  5 pts: All identified/);
  assert.match(u1.items[4]!.text, /\*\*Validity\*\*: An argument is valid/);
  assert.equal(u1.items[0]!.source_url, 'https://moodbox.example.ca/course/view.php?id=12&section=1');
  const u2 = out.units[1]!;
  assert.equal(u2.items[0]!.include, false, 'items in a hidden section are unticked');
  assert.ok(u2.items[0]!.notes.includes('in a hidden section'));
  assert.ok(fake.calls.includes('core_grading_get_definitions'));
});

test('a function the token may not call is skipped with a note, not an error', async () => {
  const fake = fakeMoodle({ denyGlossary: true });
  const { model, notes } = await fetchCourseModel(wsClient('https://moodbox.example.ca', 'tok', fake.fetchImpl), '12', { fullname: 'PHIL 1011' });
  assert.ok(notes.some((n) => n.startsWith('mod_glossary_get_glossaries_by_courses is not allowed')), notes.join('; '));
  const glossary = model.sections[0]!.modules.find((m) => m.modname === 'glossary')!;
  assert.equal(glossary.text, '');
});

test('a Moodle error with a bad token is reported plainly', async () => {
  const client = wsClient('https://moodbox.example.ca', 'bad', async () => Response.json({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Invalid token - token not found' }));
  await assert.rejects(checkConnection(client), /Invalid token/);
});
