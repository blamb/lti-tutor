/**
 * Write a Moodle course backup (.mbz) holding one section with Book activities.
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
export interface MbzOptions { hidden?: boolean; sectionNumber?: number; now?: number }
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

  const activities: [number, string, string][] = [];
  books.forEach((book, n) => {
    const cmid = 9301 + n, book_id = 9401 + n, ctx = 9501 + n;
    const folder = `activities/book_${cmid}`;
    let chapters_xml = '';
    const file_ids: number[] = [];
    book.chapters.forEach((ch, index) => {
      const num = index + 1;
      const chid = 9601 + n * 500 + num;
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
    files.set(folder + '/module.xml', HEAD + raw('module', [
      x('modulename', 'book'), x('sectionid', section_id), x('sectionnumber', section_number), x('idnumber', ''),
      x('added', now), x('score', 0), x('indent', 0), x('visible', hidden ? 0 : 1), x('visibleoncoursepage', 1),
      x('visibleold', hidden ? 0 : 1), x('groupmode', 0), x('groupingid', 0), x('completion', 0),
      x('completiongradeitemnumber', NULL), x('completionpassgrade', 0), x('completionview', 0),
      x('completionexpected', 0), x('availability', NULL), x('showdescription', 0), x('downloadcontent', 1),
      x('lang', NULL), raw('tags')].join(''), { id: cmid, version: MOODLE_VERSION }));
    files.set(folder + '/inforef.xml', HEAD + raw('inforef', raw('fileref', file_ids.map((f) => raw('file', x('id', f))).join(''))));
    files.set(folder + '/grades.xml', HEAD + raw('activity_gradebook', raw('grade_items') + raw('grade_letters')));
    files.set(folder + '/roles.xml', HEAD + raw('roles', raw('role_overrides') + raw('role_assignments')));
    files.set(folder + '/filters.xml', HEAD + raw('filters', raw('filter_actives') + raw('filter_configs')));
    files.set(folder + '/calendar.xml', HEAD + raw('events'));
    files.set(folder + '/grade_history.xml', HEAD + raw('grade_history', raw('grade_grades')));
    activities.push([cmid, book.name, folder]);
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
  files.set('questions.xml', HEAD + raw('question_categories'));
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
  for (const [cmid] of activities) {
    for (const [suffix, v] of flags) {
      settings += raw('setting', x('level', 'activity') + x('activity', `book_${cmid}`)
        + x('name', `book_${cmid}_${suffix}`) + x('value', v));
    }
  }
  let contents = raw('activities', activities.map(([cmid, title, folder]) => raw('activity', [
    x('moduleid', cmid), x('sectionid', section_id), x('modulename', 'book'), x('title', title),
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
