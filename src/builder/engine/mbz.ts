/**
 * Write a Moodle course backup (.mbz) holding one section with Book activities
 * and, optionally, discussion forums after them.
 *
 * The file restores through Moodle's normal Restore screen, either as a new
 * course or merged into an existing one. Layout follows a real Moodle 5 backup;
 * only the parts Restore reads for sections, Books and their files are filled in.
 *
 * Ported from the Python module builder's mbz.py: the same entries and the same
 * XML text. The archive is a gzip-compressed tar written here by hand (ustar
 * headers; the Python wrote GNU headers, which differ only in the magic bytes
 * for the short names a backup uses) and is returned as bytes.
 */

import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { WS, cmp } from './py.js';

export const MOODLE_VERSION = '2025041400';      // stamped as Moodle 5.0; newer sites accept older backups
export const MOODLE_RELEASE = '5.0 (Build: 20250414)';
export const BACKUP_RELEASE = '5.0';
const NULL = '$@NULL@$';
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  h5p: 'application/zip.h5p', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const PLUGINFILE = new RegExp(`@@PLUGINFILE@@/([^"<${WS}]+)`, 'g');

type Value = string | number;
type Attrs = Record<string, Value>;

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrText = (attrs?: Attrs): string =>
  Object.entries(attrs ?? {}).map(([k, v]) => ` ${k}="${escape(String(v)).replace(/"/g, '&quot;')}"`).join('');

/** <tag attrs>escaped value</tag> */
function x(tag: string, value: Value = '', attrs?: Attrs): string {
  return `<${tag}${attrText(attrs)}>${escape(String(value))}</${tag}>\n`;
}

/** <tag attrs> + inner XML, already written + </tag> */
function raw(tag: string, inner = '', attrs?: Attrs): string {
  return `<${tag}${attrText(attrs)}>\n${inner}</${tag}>\n`;
}

const hex = (algorithm: 'sha1' | 'md5', data: Uint8Array | string): string => createHash(algorithm).update(data).digest('hex');

export interface MbzCourse { fullname: string; shortname: string }
export interface MbzSection { name: string; summary?: string }
export interface MbzBook { name: string; intro?: string; chapters: { title: string; html: string }[]; files: Record<string, Uint8Array> }
/**
 * A discussion forum of Moodle's "single simple discussion" type, ungraded. The
 * backup carries no posts (posts belong to users, and a backup without user
 * data has none); on restore Moodle starts the one discussion itself, with
 * `intro` as its first post.
 */
export interface MbzForum { name: string; intro: string }
/**
 * One question for a Moodle Quiz. `text`, answer texts and feedback are HTML,
 * already safe to store. A multiple-choice question has exactly one correct
 * answer; a true/false question says which is right and explains it once.
 */
export interface MbzQuestion {
  type: 'multichoice' | 'truefalse';
  name: string;
  text: string;
  answers?: { text: string; correct: boolean; feedback: string }[];
  correct?: boolean;
  feedback?: string;
}
/**
 * A Quiz with its questions in the quiz's own question bank. Unlimited
 * attempts, highest grade, one question to a page, answers shuffled, the
 * standard review options. It has a grade item (out of `grade`, default 10).
 */
export interface MbzQuiz { name: string; intro: string; questions: MbzQuestion[]; grade?: number }
/**
 * An empty Glossary. Moodle treats glossary entries as user data and restores
 * them only for someone allowed to restore user data (site managers), so the
 * entries travel separately, as a glossary import file (glossaryImportXml).
 */
export interface MbzGlossary { name: string; intro: string }
/**
 * An Assignment: online text and up to three files, one attempt, feedback
 * comments on, marked out of `grade` (default 100). With a rubric, advanced
 * grading is set to it and it is ready to use; level scores are per criterion
 * and Moodle scales the total to the grade.
 */
export interface MbzRubric { name: string; criteria: { description: string; levels: { score: number; definition: string }[] }[] }
export interface MbzAssign { name: string; intro: string; grade?: number; rubric?: MbzRubric }
export interface MbzOptions {
  hidden?: boolean; sectionNumber?: number; now?: number;
  forums?: MbzForum[]; quizzes?: MbzQuiz[]; glossaries?: MbzGlossary[]; assignments?: MbzAssign[];
}

/** The course-module id book number n (from 0) gets in the backup, and its chapter ids: for links between activities. */
export const bookCmid = (n: number): number => 9301 + n;
export const chapterId = (n: number, page: number): number => 9601 + n * 500 + page;
/** The course-module id forum number i (from 0) gets in the backup. */
export const forumCmid = (i: number): number => 9351 + i;
/** A link to a forum, or to one page of a book, in the form Moodle rewrites on restore. */
export const forumLink = (i: number): string => `$@FORUMVIEWBYID*${forumCmid(i)}@$`;
/** The course-module ids quiz and glossary number i (from 0) get in the backup, and links to them. */
export const quizCmid = (i: number): number => 9801 + i;
export const glossaryCmid = (i: number): number => 9831 + i;
export const assignCmid = (i: number): number => 9871 + i;
export const assignLink = (i: number): string => `$@ASSIGNVIEWBYID*${assignCmid(i)}@$`;
export const quizLink = (i: number): string => `$@QUIZVIEWBYID*${quizCmid(i)}@$`;
export const glossaryLink = (i: number): string => `$@GLOSSARYVIEWBYID*${glossaryCmid(i)}@$`;

/** A file for a Glossary's own "Import entries" page: the terms and their definitions (HTML). */
export function glossaryImportXml(name: string, entries: { concept: string; definition: string }[]): string {
  return HEAD + raw('GLOSSARY', raw('INFO', [
    x('NAME', name), x('INTRO', ''), x('INTROFORMAT', 1), x('ALLOWDUPLICATEDENTRIES', 0), x('DISPLAYFORMAT', 'dictionary'),
    x('SHOWSPECIAL', 1), x('SHOWALPHABET', 1), x('SHOWALL', 1), x('ALLOWCOMMENTS', 0), x('USEDYNALINK', 1),
    x('DEFAULTAPPROVAL', 1), x('GLOBALGLOSSARY', 0), x('ENTBYPAGE', 10),
    raw('ENTRIES', entries.map((e) => raw('ENTRY', [
      x('CONCEPT', e.concept), x('DEFINITION', e.definition), x('FORMAT', 1), x('USEDYNALINK', 1), x('CASESENSITIVE', 0),
      x('FULLMATCH', 0), x('TEACHERENTRY', 1)].join(''))).join(''))].join('')));
}
export const bookPageLink = (n: number, page: number): string => `$@BOOKVIEWBYIDCH*${bookCmid(n)}*${chapterId(n, page)}@$`;
export interface MbzResult { mbz: Uint8Array; files: number; entries: number }

/**
 * fileName is the name the backup will be saved under (it is stamped inside the file).
 * Every file a chapter names as @@PLUGINFILE@@/<name> must be in that book's `files`.
 */
export function buildMbz(fileName: string, course: MbzCourse, section: MbzSection, books: MbzBook[], opts: MbzOptions = {}): MbzResult {
  const hidden = opts.hidden ?? true;
  const section_number = opts.sectionNumber ?? 1;
  const now = Math.trunc(opts.now || Date.now() / 1000);
  const files = new Map<string, string | Uint8Array>();   // archive path -> content
  const file_rows: string[] = [];                          // files.xml entries
  let next_id = 900001;
  const course_id = 9001, course_ctx = 9101;
  const section_id = 9201;
  const general_id = 9200;

  if (books.length > 50) throw new Error('Too many books for one backup');
  const activities: [number, string, string, string][] = [];
  const module_xml = (cmid: number, modname: string): string => HEAD + raw('module', [
    x('modulename', modname), x('sectionid', section_id), x('sectionnumber', section_number), x('idnumber', ''),
    x('added', now), x('score', 0), x('indent', 0), x('visible', hidden ? 0 : 1), x('visibleoncoursepage', 1),
    x('visibleold', hidden ? 0 : 1), x('groupmode', 0), x('groupingid', 0), x('completion', 0),
    x('completiongradeitemnumber', NULL), x('completionpassgrade', 0), x('completionview', 0),
    x('completionexpected', 0), x('availability', NULL), x('showdescription', 0), x('downloadcontent', 1),
    x('lang', NULL), raw('tags')].join(''), { id: cmid, version: MOODLE_VERSION });
  const common_files = (folder: string, gradeItems = ''): void => {
    files.set(folder + '/grades.xml', HEAD + raw('activity_gradebook', raw('grade_items', gradeItems) + raw('grade_letters')));
    files.set(folder + '/roles.xml', HEAD + raw('roles', raw('role_overrides') + raw('role_assignments')));
    files.set(folder + '/filters.xml', HEAD + raw('filters', raw('filter_actives') + raw('filter_configs')));
    files.set(folder + '/calendar.xml', HEAD + raw('events'));
    files.set(folder + '/grade_history.xml', HEAD + raw('grade_history', raw('grade_grades')));
  };
  books.forEach((book, n) => {
    const cmid = bookCmid(n), book_id = 9401 + n, ctx = 9501 + n;
    const folder = `activities/book_${cmid}`;
    let chapters_xml = '';
    const file_ids: number[] = [];
    book.chapters.forEach((ch, index) => {
      const num = index + 1;
      const chid = chapterId(n, num);
      const used = [...new Set(Array.from(ch.html.matchAll(PLUGINFILE), (m) => m[1]!))].sort(cmp);
      for (const name of used) {
        const data = Object.prototype.hasOwnProperty.call(book.files, name) ? book.files[name] : undefined;
        if (!data) throw new Error(`Chapter "${ch.title}" uses the file ${name}, which was not supplied`);
        const sha = hex('sha1', data);
        files.set(`files/${sha.slice(0, 2)}/${sha}`, data);
        if (next_id >= 999999) throw new Error('Too many files for one backup');
        const fid = next_id++;
        file_ids.push(fid);
        const dot = name.lastIndexOf('.');
        const ext = (dot < 0 ? name : name.slice(dot + 1)).toLowerCase();
        file_rows.push(raw('file', [
          x('contenthash', sha), x('contextid', ctx), x('component', 'mod_book'), x('filearea', 'chapter'),
          x('itemid', chid), x('filepath', '/'), x('filename', name), x('userid', NULL), x('filesize', data.length),
          x('mimetype', Object.prototype.hasOwnProperty.call(MIME, ext) ? MIME[ext]! : 'application/octet-stream'),
          x('status', 0), x('timecreated', now), x('timemodified', now), x('source', name), x('author', NULL),
          x('license', NULL), x('sortorder', 0), x('repositorytype', NULL), x('repositoryid', NULL),
          x('reference', NULL)].join(''), { id: fid }));
      }
      chapters_xml += raw('chapter', [
        x('pagenum', num), x('subchapter', 0), x('title', ch.title), x('content', ch.html),
        x('contentformat', 1), x('hidden', 0), x('timemodified', now), x('importsrc', '')].join(''), { id: chid });
    });
    files.set(folder + '/book.xml', HEAD + raw('activity', raw('book', [
      x('name', book.name), x('intro', book.intro ?? ''), x('introformat', 1), x('numbering', 0),
      x('navstyle', 1), x('customtitles', 0), x('timecreated', now), x('timemodified', now),
      raw('chapters', chapters_xml), raw('chaptertags')].join(''), { id: book_id }),
      { id: book_id, moduleid: cmid, modulename: 'book', contextid: ctx }));
    files.set(folder + '/module.xml', module_xml(cmid, 'book'));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef', raw('fileref', file_ids.map((f) => raw('file', x('id', f))).join(''))));
    common_files(folder);
    activities.push([cmid, book.name, folder, 'book']);
  });

  (opts.forums ?? []).forEach((forum, i) => {
    if (i >= 50) throw new Error('Too many forums for one backup');
    const cmid = forumCmid(i), forum_id = 9451 + i, ctx = 9551 + i;
    const folder = `activities/forum_${cmid}`;
    // The fields Moodle 5's forum backup writes, in its order. Nothing is rated, graded or required.
    files.set(folder + '/forum.xml', HEAD + raw('activity', raw('forum', [
      x('type', 'single'), x('name', forum.name), x('intro', forum.intro), x('introformat', 1), x('duedate', 0),
      x('cutoffdate', 0), x('assessed', 0), x('assesstimestart', 0), x('assesstimefinish', 0), x('scale', 0),
      x('maxbytes', 0), x('maxattachments', 1), x('forcesubscribe', 0), x('trackingtype', 1), x('rsstype', 0),
      x('rssarticles', 0), x('timemodified', now), x('warnafter', 0), x('blockafter', 0), x('blockperiod', 0),
      x('completiondiscussions', 0), x('completionreplies', 0), x('completionposts', 0), x('displaywordcount', 0),
      x('lockdiscussionafter', 0), x('grade_forum', 0), raw('discussions')].join(''), { id: forum_id }),
      { id: forum_id, moduleid: cmid, modulename: 'forum', contextid: ctx }));
    files.set(folder + '/module.xml', module_xml(cmid, 'forum'));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef'));
    common_files(folder);
    activities.push([cmid, forum.name, folder, 'forum']);
  });

  // Quizzes. The fields are those Moodle 5.0 writes for a quiz and its question bank, in its order.
  let question_categories = '';
  const f7 = (n: number): string => n.toFixed(7);
  const f5 = (n: number): string => n.toFixed(5);
  let next_question = 97001, next_answer = 980001, next_slot = 96001;
  (opts.quizzes ?? []).forEach((quiz, i) => {
    if (i >= 5) throw new Error('Too many quizzes for one backup');
    const cmid = quizCmid(i), quiz_id = 9811 + i, ctx = 9821 + i, top = 9701 + 2 * i, cat = top + 1, grade_item = 9861 + i;
    const folder = `activities/quiz_${cmid}`;
    const grade = quiz.grade ?? 10;
    // A stamp is how Moodle recognises a question it already has. These differ on every build, so a second restore adds its own copy.
    const stamp = (what: string): string => `module-builder.invalid+${now}+${hex('md5', `${now}:${fileName}:${i}:${what}`).slice(0, 12)}`;
    const category = (id: number, name: string, info: string, parent: number, sortorder: number, entries: string): string => raw('question_category', [
      x('name', name), x('contextid', ctx), x('contextlevel', 70), x('contextinstanceid', cmid), x('info', info), x('infoformat', 0),
      x('stamp', stamp('cat' + id)), x('parent', parent), x('sortorder', sortorder), x('idnumber', NULL),
      raw('question_bank_entries', entries)].join(''), { id });
    let entries = '', slots = '';
    quiz.questions.forEach((q, k) => {
      const qid = next_question++;
      const answer = (text: string, format: number, right: boolean, feedback: string): [number, string] => {
        const aid = next_answer++;
        return [aid, raw('answer', [x('answertext', text), x('answerformat', format), x('fraction', f7(right ? 1 : 0)),
          x('feedback', feedback), x('feedbackformat', 1)].join(''), { id: aid })];
      };
      let plugin: string;
      if (q.type === 'truefalse') {
        const t = answer('True', 0, q.correct === true, q.feedback ?? ''), f = answer('False', 0, q.correct !== true, q.feedback ?? '');
        plugin = raw('plugin_qtype_truefalse_question', raw('answers', t[1] + f[1])
          + raw('truefalse', x('trueanswer', t[0]) + x('falseanswer', f[0]) + x('showstandardinstruction', 0), { id: qid }));
      } else {
        const answers = q.answers ?? [];
        if (answers.filter((a) => a.correct).length !== 1) throw new Error(`Quiz question "${q.name}" must have exactly one correct answer`);
        plugin = raw('plugin_qtype_multichoice_question', raw('answers', answers.map((a) => answer(a.text, 1, a.correct, a.feedback)[1]).join(''))
          + raw('multichoice', [
            x('layout', 0), x('single', 1), x('shuffleanswers', 1), x('correctfeedback', ''), x('correctfeedbackformat', 1),
            x('partiallycorrectfeedback', ''), x('partiallycorrectfeedbackformat', 1), x('incorrectfeedback', ''),
            x('incorrectfeedbackformat', 1), x('answernumbering', 'abc'), x('shownumcorrect', 0), x('showstandardinstruction', 0)].join(''), { id: qid }));
      }
      entries += raw('question_bank_entry', [
        x('questioncategoryid', cat), x('idnumber', NULL), x('ownerid', NULL),
        raw('question_version', raw('question_versions', [
          x('version', 1), x('status', 'ready'),
          raw('questions', raw('question', [
            x('parent', 0), x('name', q.name), x('questiontext', q.text), x('questiontextformat', 1), x('generalfeedback', ''),
            x('generalfeedbackformat', 1), x('defaultmark', f7(1)), x('penalty', f7(q.type === 'truefalse' ? 1 : 1 / 3)), x('qtype', q.type),
            x('length', 1), x('stamp', stamp('q' + k)), x('timecreated', now), x('timemodified', now), x('createdby', NULL), x('modifiedby', NULL),
            plugin, raw('plugin_qbank_comment_question', raw('comments')), raw('plugin_qbank_customfields_question', raw('customfields')),
            raw('question_hints'), raw('tags')].join(''), { id: qid }))].join(''), { id: qid }))].join(''), { id: qid });
      const slot = next_slot++;
      slots += raw('question_instance', [
        x('quizid', quiz_id), x('slot', k + 1), x('page', k + 1), x('displaynumber', NULL), x('requireprevious', 0), x('maxmark', f7(1)),
        x('quizgradeitemid', NULL),
        raw('question_reference', [x('usingcontextid', ctx), x('component', 'mod_quiz'), x('questionarea', 'slot'),
          x('questionbankentryid', qid), x('version', NULL)].join(''), { id: slot })].join(''), { id: slot });
    });
    question_categories += category(top, 'top', '', 0, 0, '')
      + category(cat, `Default for ${quiz.name}`.slice(0, 255), `The default category for questions shared in context '${quiz.name}'.`, top, 999, entries);
    const review = 69904;   // during the attempt off; straight after, later while open, and after close: on
    files.set(folder + '/quiz.xml', HEAD + raw('activity', raw('quiz', [
      x('name', quiz.name), x('intro', quiz.intro), x('introformat', 1), x('timeopen', 0), x('timeclose', 0), x('timelimit', 0),
      x('overduehandling', 'autosubmit'), x('graceperiod', 86400), x('preferredbehaviour', 'deferredfeedback'), x('canredoquestions', 0),
      x('attempts_number', 0), x('attemptonlast', 0), x('grademethod', 1), x('decimalpoints', 2), x('questiondecimalpoints', -1),
      x('reviewattempt', review), x('reviewcorrectness', review), x('reviewmaxmarks', review), x('reviewmarks', review),
      x('reviewspecificfeedback', review), x('reviewgeneralfeedback', review), x('reviewrightanswer', review), x('reviewoverallfeedback', 4368),
      x('questionsperpage', 1), x('navmethod', 'free'), x('shuffleanswers', 1), x('sumgrades', f5(quiz.questions.length)), x('grade', f5(grade)),
      x('timecreated', now), x('timemodified', now), x('password', ''), x('subnet', ''), x('browsersecurity', ''), x('delay1', 0), x('delay2', 0),
      x('showuserpicture', 0), x('showblocks', 0), x('completionattemptsexhausted', 0), x('completionminattempts', 0), x('allowofflineattempts', 0),
      x('precreateattempts', NULL), raw('subplugin_quizaccess_seb_quiz'), raw('quiz_grade_items'), raw('question_instances', slots),
      raw('sections', raw('section', x('firstslot', 1) + x('heading', '') + x('shufflequestions', 0), { id: quiz_id })),
      raw('feedbacks'), raw('overrides'), raw('grades'), raw('attempts')].join(''), { id: quiz_id }),
      { id: quiz_id, moduleid: cmid, modulename: 'quiz', contextid: ctx }));
    files.set(folder + '/module.xml', module_xml(cmid, 'quiz'));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef', raw('grade_itemref', raw('grade_item', x('id', grade_item)))
      + raw('question_categoryref', raw('question_category', x('id', top)) + raw('question_category', x('id', cat)))));
    common_files(folder, raw('grade_item', [
      x('categoryid', NULL), x('itemname', quiz.name), x('itemtype', 'mod'), x('itemmodule', 'quiz'), x('iteminstance', quiz_id),
      x('itemnumber', 0), x('iteminfo', NULL), x('idnumber', ''), x('calculation', NULL), x('gradetype', 1), x('grademax', f5(grade)),
      x('grademin', f5(0)), x('scaleid', NULL), x('outcomeid', NULL), x('gradepass', f5(0)), x('multfactor', f5(1)), x('plusfactor', f5(0)),
      x('aggregationcoef', f5(0)), x('aggregationcoef2', f5(0)), x('weightoverride', 0), x('sortorder', 1), x('display', 0), x('decimals', NULL),
      x('hidden', 0), x('locked', 0), x('locktime', 0), x('needsupdate', 0), x('timecreated', now), x('timemodified', now),
      raw('grade_grades')].join(''), { id: grade_item }));
    activities.push([cmid, quiz.name, folder, 'quiz']);
  });

  // Assignments, with a rubric when one is given. Field lists as Moodle 5.0 writes them.
  let next_criterion = 99001, next_level = 990001;
  (opts.assignments ?? []).forEach((assign, i) => {
    if (i >= 5) throw new Error('Too many assignments for one backup');
    const cmid = assignCmid(i), assign_id = 9881 + i, ctx = 9891 + i, grade_item = 9895 + i;
    const folder = `activities/assign_${cmid}`;
    const grade = assign.grade ?? 100;
    const configs: [string, string, string, Value][] = [
      ['onlinetext', 'assignsubmission', 'enabled', 1], ['onlinetext', 'assignsubmission', 'wordlimit', 0], ['onlinetext', 'assignsubmission', 'wordlimitenabled', 0],
      ['file', 'assignsubmission', 'enabled', 1], ['file', 'assignsubmission', 'maxfilesubmissions', 3], ['file', 'assignsubmission', 'maxsubmissionsizebytes', NULL],
      ['file', 'assignsubmission', 'filetypeslist', ''], ['comments', 'assignsubmission', 'enabled', 0], ['comments', 'assignfeedback', 'enabled', 1],
      ['comments', 'assignfeedback', 'commentinline', 0], ['editpdf', 'assignfeedback', 'enabled', 0], ['offline', 'assignfeedback', 'enabled', 0],
      ['file', 'assignfeedback', 'enabled', 0]];
    files.set(folder + '/assign.xml', HEAD + raw('activity', raw('assign', [
      x('name', assign.name), x('intro', assign.intro), x('introformat', 1), x('alwaysshowdescription', 1), x('submissiondrafts', 0),
      x('sendnotifications', 0), x('sendlatenotifications', 0), x('sendstudentnotifications', 1), x('duedate', 0), x('cutoffdate', 0),
      x('gradingduedate', 0), x('allowsubmissionsfromdate', 0), x('grade', grade), x('timemodified', now), x('completionsubmit', 0),
      x('requiresubmissionstatement', 0), x('teamsubmission', 0), x('requireallteammemberssubmit', 0), x('teamsubmissiongroupingid', 0),
      x('blindmarking', 0), x('hidegrader', 0), x('revealidentities', 0), x('attemptreopenmethod', 'untilpass'), x('maxattempts', 1),
      x('markingworkflow', 0), x('markingallocation', 0), x('markinganonymous', 0), x('preventsubmissionnotingroup', 0), x('activity', NULL),
      x('activityformat', 0), x('timelimit', 0), x('submissionattachments', 0), x('gradepenalty', 0), raw('userflags'), raw('submissions'), raw('grades'),
      raw('plugin_configs', configs.map(([plugin, subtype, name, value], k) => raw('plugin_config',
        x('plugin', plugin) + x('subtype', subtype) + x('name', name) + x('value', value), { id: 98001 + i * 20 + k })).join('')),
      raw('overrides')].join(''), { id: assign_id }),
      { id: assign_id, moduleid: cmid, modulename: 'assign', contextid: ctx }));
    if (assign.rubric) {
      const criteria = assign.rubric.criteria.map((c, k) => raw('criterion', [
        x('sortorder', k + 1), x('description', c.description), x('descriptionformat', 0),
        raw('levels', [...c.levels].sort((a, b) => a.score - b.score).map((l) => raw('level',
          x('score', f5(l.score)) + x('definition', l.definition) + x('definitionformat', 0), { id: next_level++ })).join(''))].join(''), { id: next_criterion++ })).join('');
      files.set(folder + '/grading.xml', HEAD + raw('areas', raw('area', [
        x('areaname', 'submissions'), x('activemethod', 'rubric'),
        raw('definitions', raw('definition', [
          x('method', 'rubric'), x('name', assign.rubric.name), x('description', ''), x('descriptionformat', 1), x('status', 20),
          x('timecreated', now), x('timemodified', now),
          x('options', '{"sortlevelsasc":1,"lockzeropoints":1,"alwaysshowdefinition":1,"showdescriptionteacher":1,"showdescriptionstudent":1,"showscoreteacher":1,"showscorestudent":1,"enableremarks":1,"showremarksstudent":1}'),
          raw('plugin_gradingform_rubric_definition', raw('criteria', criteria)), raw('instances')].join(''), { id: 9911 + i }))].join(''), { id: 9901 + i })));
    }
    files.set(folder + '/module.xml', module_xml(cmid, 'assign'));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef', raw('grade_itemref', raw('grade_item', x('id', grade_item)))));
    common_files(folder, raw('grade_item', [
      x('categoryid', NULL), x('itemname', assign.name), x('itemtype', 'mod'), x('itemmodule', 'assign'), x('iteminstance', assign_id),
      x('itemnumber', 0), x('iteminfo', NULL), x('idnumber', ''), x('calculation', NULL), x('gradetype', 1), x('grademax', f5(grade)),
      x('grademin', f5(0)), x('scaleid', NULL), x('outcomeid', NULL), x('gradepass', f5(0)), x('multfactor', f5(1)), x('plusfactor', f5(0)),
      x('aggregationcoef', f5(0)), x('aggregationcoef2', f5(0)), x('weightoverride', 0), x('sortorder', 1), x('display', 0), x('decimals', NULL),
      x('hidden', 0), x('locked', 0), x('locktime', 0), x('needsupdate', 0), x('timecreated', now), x('timemodified', now),
      raw('grade_grades')].join(''), { id: grade_item }));
    activities.push([cmid, assign.name, folder, 'assign']);
  });

  (opts.glossaries ?? []).forEach((glossary, i) => {
    if (i >= 5) throw new Error('Too many glossaries for one backup');
    const cmid = glossaryCmid(i), glossary_id = 9841 + i, ctx = 9851 + i;
    const folder = `activities/glossary_${cmid}`;
    files.set(folder + '/glossary.xml', HEAD + raw('activity', raw('glossary', [
      x('name', glossary.name), x('intro', glossary.intro), x('introformat', 1), x('allowduplicatedentries', 0), x('displayformat', 'dictionary'),
      x('mainglossary', 0), x('showspecial', 1), x('showalphabet', 1), x('showall', 1), x('allowcomments', 0), x('allowprintview', 1),
      x('usedynalink', 1), x('defaultapproval', 1), x('globalglossary', 0), x('entbypage', 10), x('editalways', 0), x('rsstype', 0),
      x('rssarticles', 0), x('assessed', 0), x('assesstimestart', 0), x('assesstimefinish', 0), x('scale', 0), x('timecreated', now),
      x('timemodified', now), x('completionentries', 0), raw('entries'), raw('entriestags'), raw('categories')].join(''), { id: glossary_id }),
      { id: glossary_id, moduleid: cmid, modulename: 'glossary', contextid: ctx }));
    files.set(folder + '/module.xml', module_xml(cmid, 'glossary'));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef'));
    common_files(folder);
    activities.push([cmid, glossary.name, folder, 'glossary']);
  });

  const section_xml = (sid: number, number: number, name: string, summary: string, seq: string): string =>
    HEAD + raw('section', [
      x('number', number), x('name', name), x('summary', summary), x('summaryformat', 1), x('sequence', seq),
      x('visible', 1), x('availabilityjson', NULL), x('component', NULL), x('itemid', NULL),
      x('timemodified', now)].join(''), { id: sid });
  const sections: [number, string][] = [[section_id, section.name]];
  files.set(`sections/section_${section_id}/section.xml`, section_xml(
    section_id, section_number, section.name, section.summary ?? '', activities.map((a) => String(a[0])).join(',')));
  files.set(`sections/section_${section_id}/inforef.xml`, HEAD + raw('inforef'));
  if (section_number !== 0) {
    sections.unshift([general_id, 'General']);
    files.set(`sections/section_${general_id}/section.xml`, section_xml(general_id, 0, NULL, '', ''));
    files.set(`sections/section_${general_id}/inforef.xml`, HEAD + raw('inforef'));
  }

  files.set('course/course.xml', HEAD + raw('course', [
    x('shortname', course.shortname), x('fullname', course.fullname), x('idnumber', ''), x('summary', ''),
    x('summaryformat', 1), x('format', 'topics'), x('showgrades', 1), x('newsitems', 0), x('startdate', now),
    x('enddate', 0), x('marker', 0), x('maxbytes', 0), x('legacyfiles', 0), x('showreports', 0), x('visible', 0),
    x('groupmode', 0), x('groupmodeforce', 0), x('defaultgroupingid', 0), x('lang', ''), x('theme', ''),
    x('timecreated', now), x('timemodified', now), x('requested', 0), x('showactivitydates', 0),
    x('showcompletionconditions', 1), x('enablecompletion', 1), x('completionnotify', 0),
    raw('category', x('name', 'Imported') + x('description', ''), { id: 1 }), raw('tags'), raw('customfields')].join(''),
    { id: course_id, contextid: course_ctx }));
  files.set('course/inforef.xml', HEAD + raw('inforef'));
  files.set('course/roles.xml', HEAD + raw('roles', raw('role_overrides') + raw('role_assignments')));
  files.set('course/enrolments.xml', HEAD + raw('enrolments', raw('enrols')));
  files.set('course/filters.xml', HEAD + raw('filters', raw('filter_actives') + raw('filter_configs')));
  files.set('course/calendar.xml', HEAD + raw('events'));
  files.set('course/completiondefaults.xml', HEAD + raw('course_completion_defaults'));
  files.set('course/contentbank.xml', HEAD + raw('contents'));

  files.set('files.xml', HEAD + raw('files', file_rows.join('')));
  files.set('questions.xml', HEAD + raw('question_categories', question_categories));
  files.set('groups.xml', HEAD + raw('groups', raw('groupcustomfields') + raw('groupings', raw('groupingcustomfields'))));
  files.set('outcomes.xml', HEAD + raw('outcomes_definition'));
  files.set('roles.xml', HEAD + raw('roles_definition'));
  files.set('scales.xml', HEAD + raw('scales_definition'));
  files.set('badges.xml', HEAD + raw('badges'));
  files.set('completion.xml', HEAD + raw('course_completion'));
  files.set('grade_history.xml', HEAD + raw('grade_history', raw('grade_grades')));
  files.set('gradebook.xml', HEAD + raw('gradebook', raw('attributes') + raw('grade_categories') + raw('grade_items')
    + raw('grade_letters') + raw('grade_settings')));

  const name = fileName.split('/').pop()!;
  const root: [string, Value][] = [
    ['filename', name], ['users', 0], ['anonymize', 0], ['role_assignments', 0], ['activities', 1], ['blocks', 0],
    ['files', 1], ['filters', 0], ['comments', 0], ['badges', 0], ['calendarevents', 0], ['userscompletion', 0], ['logs', 0],
    ['grade_histories', 0], ['groups', 0], ['competencies', 0], ['customfield', 0], ['contentbankcontent', 0],
    ['xapistate', 0], ['legacyfiles', 0]];
  let settings = root.map(([k, v]) => raw('setting', x('level', 'root') + x('name', k) + x('value', v))).join('');
  const flags: [string, number][] = [['included', 1], ['userinfo', 0]];
  for (const [sid] of sections) {
    for (const [suffix, v] of flags) {
      settings += raw('setting', x('level', 'section') + x('section', `section_${sid}`)
        + x('name', `section_${sid}_${suffix}`) + x('value', v));
    }
  }
  for (const [cmid, , , modname] of activities) {
    for (const [suffix, v] of flags) {
      settings += raw('setting', x('level', 'activity') + x('activity', `${modname}_${cmid}`)
        + x('name', `${modname}_${cmid}_${suffix}`) + x('value', v));
    }
  }
  let contents = raw('activities', activities.map(([cmid, title, folder, modname]) => raw('activity', [
    x('moduleid', cmid), x('sectionid', section_id), x('modulename', modname), x('title', title),
    x('directory', folder), x('insubsection', '')].join(''))).join(''));
  contents += raw('sections', sections.map(([sid, title]) => raw('section', [
    x('sectionid', sid), x('title', title), x('directory', `sections/section_${sid}`), x('parentcmid', ''),
    x('modname', '')].join(''))).join(''));
  contents += raw('course', x('courseid', course_id) + x('title', course.shortname) + x('directory', 'course'));
  files.set('moodle_backup.xml', HEAD + raw('moodle_backup', raw('information', [
    x('name', name), x('moodle_version', MOODLE_VERSION), x('moodle_release', MOODLE_RELEASE),
    x('backup_version', MOODLE_VERSION), x('backup_release', BACKUP_RELEASE), x('backup_date', now),
    x('mnet_remoteusers', 0), x('include_files', 1), x('include_file_references_to_external_content', 0),
    x('original_wwwroot', 'https://module-builder.invalid'),
    x('original_site_identifier_hash', hex('md5', 'moodi-module-builder')),
    x('original_course_id', course_id), x('original_course_format', 'topics'),
    x('original_course_fullname', course.fullname), x('original_course_shortname', course.shortname),
    x('original_course_startdate', now), x('original_course_enddate', 0),
    x('original_course_contextid', course_ctx), x('original_system_contextid', 1),
    raw('details', raw('detail', [
      x('type', 'course'), x('format', 'moodle2'), x('interactive', 1), x('mode', 10), x('execution', 1),
      x('executiontime', 0)].join(''), { backup_id: hex('md5', name) })),
    raw('contents', contents), raw('settings', settings)].join(''))));

  const entries: TarEntry[] = [...files.keys()].sort(cmp).map((path) => {
    const data = files.get(path)!;
    return { name: path, data: typeof data === 'string' ? new TextEncoder().encode(data) : data };
  });
  return { mbz: zlib.gzipSync(tar(entries, now), { level: 9 }), files: file_rows.length, entries: files.size };
}

// ─── tar ────────────────────────────────────────────────────────────────────

export interface TarEntry { name: string; data: Uint8Array }

const RECORD = 10240;     // tar pads the archive to whole records of 20 blocks

function header(name: string, size: number, mtime: number): Uint8Array {
  const enc = new TextEncoder();
  let nameBytes = enc.encode(name);
  let prefixBytes = new Uint8Array(0);
  if (nameBytes.length > 100) {
    // ustar: a long path is split at a "/" into prefix (up to 155 bytes) and name (up to 100).
    let cutAt = -1;
    for (let i = name.indexOf('/'); i >= 0; i = name.indexOf('/', i + 1)) {
      if (enc.encode(name.slice(0, i)).length <= 155 && enc.encode(name.slice(i + 1)).length <= 100) { cutAt = i; break; }
    }
    if (cutAt < 0) throw new Error(`Path too long for the backup archive: ${name}`);
    prefixBytes = enc.encode(name.slice(0, cutAt));
    nameBytes = enc.encode(name.slice(cutAt + 1));
  }
  const h = new Uint8Array(512);
  const put = (s: string | Uint8Array, at: number) => h.set(typeof s === 'string' ? enc.encode(s) : s, at);
  const octal = (v: number, width: number) => v.toString(8).padStart(width - 1, '0') + '\0';
  put(nameBytes, 0);
  put(octal(0o644, 8), 100);
  put(octal(0, 8), 108);            // uid
  put(octal(0, 8), 116);            // gid
  put(octal(size, 12), 124);
  put(octal(mtime, 12), 136);
  put('        ', 148);             // checksum field counts as spaces while summing
  put('0', 156);                    // regular file
  put('ustar\0' + '00', 257);
  put(octal(0, 8), 329);            // devmajor
  put(octal(0, 8), 337);            // devminor
  put(prefixBytes, 345);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

/** A plain (uncompressed) tar archive of regular files, mode 644, in the order given. */
export function tar(entries: TarEntry[], mtime: number): Uint8Array {
  let total = 1024;                 // the two empty blocks that end an archive
  for (const e of entries) total += 512 + Math.ceil(e.data.length / 512) * 512;
  total = Math.ceil(total / RECORD) * RECORD;
  const out = new Uint8Array(total);
  let at = 0;
  for (const e of entries) {
    out.set(header(e.name, e.data.length, mtime), at);
    at += 512;
    out.set(e.data, at);
    at += Math.ceil(e.data.length / 512) * 512;
  }
  return out;
}
