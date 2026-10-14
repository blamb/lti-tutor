/**
 * Import a Moodle course backup (.mbz) as course materials.
 *
 * A backup is a gzip-compressed tar (Moodle's default) or a zip. Inside:
 *   moodle_backup.xml           course name, site URL, the list of sections and activities
 *   course/course.xml           full name, short name, summary
 *   sections/section_N/section.xml   number, name, summary, sequence of module ids, visibility
 *   activities/<mod>_N/module.xml    visibility
 *   activities/<mod>_N/<mod>.xml     the activity itself (label intro, page content, assignment text …)
 *   activities/assign_N/grading.xml  the rubric or marking guide, if any
 *   files.xml + files/xx/<hash>      attached files (a resource's PDF, an assignment's brief)
 *
 * The import reads only course structure and content: never users, grades,
 * submissions, forum posts or logs. Each section becomes a unit. Labels are
 * merged per unit into one "text" material and one "activities and study
 * questions" material, by a heuristic on their headings; pages, books,
 * resources, URLs and assignments become materials of their own, with the
 * role set from the module type. The instructor reviews and edits the
 * preview before anything is saved; a later upload of a newer backup updates
 * the same materials in place (matched on `source_key`).
 *
 * Everything here is pure apart from reading the archive from disk, so the
 * parser is testable with synthetic backups.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import { unzipSync } from 'fflate';
import { ImportError, htmlToText, fitMaterial, extractFromFile, decodeEntities } from './importers.js';
import type { MaterialRole } from './tutorials.js';

export const BACKUP_MAX_BYTES = 150 * 1024 * 1024;
/** Attached files larger than this are listed in the preview but not read. */
const ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024;
const XML_MAX_BYTES = 25 * 1024 * 1024;
/** Labels shorter than this (images, dividers, "Welcome!") are dropped. */
const MIN_CHARS = 80;
const ATTACHMENT_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'text/html']);

// ─── Tiny XML reader ────────────────────────────────────────────────────────
//
// Moodle's backup XML is plain and regular (no namespaces, no mixed content
// that matters), so a small recursive reader is enough and avoids a parser
// dependency. Text is decoded; `$@NULL@$` (Moodle's null) becomes ''.

export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { top().text += decodeEntities(src.slice(i)); break; }
    if (lt > i) top().text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); top().text += src.slice(lt + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    const gt = tagEnd(src, lt);
    const tag = src.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (tag.startsWith('/')) { if (stack.length > 1) stack.pop(); continue; }
    const selfClose = tag.endsWith('/');
    const body = selfClose ? tag.slice(0, -1).trim() : tag;
    const sp = body.search(/\s/);
    const name = sp < 0 ? body : body.slice(0, sp);
    const node: XNode = { name, attrs: parseAttrs(sp < 0 ? '' : body.slice(sp)), children: [], text: '' };
    top().children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function tagEnd(src: string, from: number): number {
  let q = '';
  for (let j = from + 1; j < src.length; j++) {
    const c = src[j]!;
    if (q) { if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
  }
  return src.length;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]!] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

export function child(node: XNode | undefined, name: string): XNode | undefined {
  return node?.children.find((c) => c.name === name);
}
export function children(node: XNode | undefined, name: string): XNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}
/** Text of a direct child element, trimmed; '' when absent or Moodle-null. */
export function txt(node: XNode | undefined, name: string): string {
  const t = child(node, name)?.text ?? '';
  const s = t.trim();
  return s === '$@NULL@$' ? '' : s;
}
/** First descendant with this name, depth first. */
export function find(node: XNode | undefined, name: string): XNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.name === name) return c;
    const d = find(c, name);
    if (d) return d;
  }
  return undefined;
}

// ─── Archive reading (tar.gz streamed, zip from memory) ─────────────────────

type Want = (name: string, size: number) => boolean;
type OnFile = (name: string, data: Buffer) => void;

function normalName(name: string): string {
  return name.replace(/^(\.\/|\/)+/, '');
}

/** Streaming ustar/GNU tar reader: keeps only the entries `want` asks for. */
export class TarReader {
  private buf: Buffer = Buffer.alloc(0);
  private state: 'header' | 'data' = 'header';
  private remaining = 0;
  private padding = 0;
  private type = '';
  private name = '';
  private collecting: Buffer[] | null = null;
  private longName: string | null = null;
  private paxPath: string | null = null;
  constructor(private readonly want: Want, private readonly onFile: OnFile) {}

  push(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    this.drain();
  }

  private drain(): void {
    for (;;) {
      if (this.state === 'header') {
        if (this.buf.length < 512) return;
        const h = this.buf.subarray(0, 512);
        this.buf = this.buf.subarray(512);
        if (h.every((b) => b === 0)) continue; // end-of-archive blocks
        const size = parseInt(cstr(h, 124, 12).trim() || '0', 8) || 0;
        const type = String.fromCharCode(h[156]!);
        let name = cstr(h, 0, 100);
        if (h.toString('ascii', 257, 262) === 'ustar') {
          const prefix = cstr(h, 345, 155);
          if (prefix) name = `${prefix}/${name}`;
        }
        if (this.longName !== null) { name = this.longName; this.longName = null; }
        if (this.paxPath !== null) { name = this.paxPath; this.paxPath = null; }
        this.name = normalName(name);
        this.type = type;
        this.remaining = size;
        this.padding = (512 - (size % 512)) % 512;
        const regular = type === '0' || type === '\0' || type === '';
        const keep = type === 'L' || type === 'x' || (regular && this.want(this.name, size));
        this.collecting = keep ? [] : null;
        this.state = 'data';
      } else {
        if (this.remaining > 0) {
          const take = Math.min(this.remaining, this.buf.length);
          if (take === 0) return;
          if (this.collecting) this.collecting.push(Buffer.from(this.buf.subarray(0, take)));
          this.buf = this.buf.subarray(take);
          this.remaining -= take;
          if (this.remaining > 0) return;
        }
        if (this.buf.length < this.padding) return;
        this.buf = this.buf.subarray(this.padding);
        this.padding = 0;
        if (this.collecting) {
          const data = Buffer.concat(this.collecting);
          this.collecting = null;
          if (this.type === 'L') this.longName = data.toString('utf8').replace(/\0+$/, '');
          else if (this.type === 'x') {
            const m = /(?:^|\n)\d+ path=([^\n]*)/.exec(data.toString('utf8'));
            if (m) this.paxPath = m[1]!;
          } else this.onFile(this.name, data);
        }
        this.state = 'header';
      }
    }
  }
}

function cstr(b: Buffer, start: number, len: number): string {
  const s = b.toString('utf8', start, start + len);
  const z = s.indexOf('\0');
  return z < 0 ? s : s.slice(0, z);
}

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const b = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(b, 0, bytes, 0);
    return b.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Visit the archive once, handing `onFile` the entries `want` accepts. */
export async function readArchive(filePath: string, want: Want, onFile: OnFile): Promise<void> {
  const head = await readHead(filePath, 4);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    await new Promise<void>((resolve, reject) => {
      const tar = new TarReader(want, onFile);
      const gz = zlib.createGunzip();
      gz.on('data', (c: Buffer) => { try { tar.push(c); } catch (e) { reject(e); gz.destroy(); } });
      gz.on('end', resolve);
      gz.on('error', (e) => reject(new ImportError(`Could not read the archive: ${e.message}`)));
      fs.createReadStream(filePath).on('error', reject).pipe(gz);
    });
    return;
  }
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const data = await fs.promises.readFile(filePath);
    let files;
    try {
      files = unzipSync(new Uint8Array(data), { filter: (f) => want(normalName(f.name), f.originalSize) });
    } catch (e) {
      throw new ImportError(`Could not read the zip archive: ${(e as Error).message}`);
    }
    for (const [name, bytes] of Object.entries(files)) onFile(normalName(name), Buffer.from(bytes));
    return;
  }
  throw new ImportError('That file is not a Moodle course backup. A backup is a .mbz file: a gzip or zip archive made by Moodle\'s Backup page.');
}

// ─── Backup model ───────────────────────────────────────────────────────────

export interface BackupItem {
  /** Stable identity across re-imports, e.g. "moodle_backup:page-412" or "moodle_backup:section-7-activities". */
  key: string;
  unit: string;
  unit_order: number;
  modname: string;
  title: string;
  role: MaterialRole;
  text: string;
  chars: number;
  visible: boolean;
  source_url: string;
  /** Things the instructor should know: hidden in the course, attachment not read, cut to the limit … */
  notes: string[];
  /** Default tick in the preview. */
  include: boolean;
}

export interface BackupUnit { title: string; order: number; visible: boolean; items: BackupItem[] }

export interface BackupPreview {
  course: { fullname: string; shortname: string; course_id: string; wwwroot: string; backup_date: string | null; moodle_release: string };
  units: BackupUnit[];
  skipped: Array<{ title: string; modname: string; reason: string }>;
}

interface ActivityRef { moduleid: string; sectionid: string; modname: string; title: string; directory: string }
interface SectionRef { sectionid: string; title: string; directory: string }
interface FileRef { contenthash: string; contextid: string; component: string; filearea: string; filename: string; mimetype: string; filesize: number }

const ACTIVITY_WORDS = /^\s*(?:#+\s*)?(?:(?:learning\s+)?activit(?:y|ies)|exercises?|study\s+questions?|discussion\s+questions?|review\s+questions?|questions?\s+for\s+(?:review|reflection|discussion)|practice(?:\s+questions?)?|self[-\s]?(?:check|test|assessment)|check\s+your\s+understanding|try\s+(?:it|this)|think\s+about|reflect(?:ion)?\b)/i;

/** Which role a module's content plays, from its type first and its heading second. */
export function roleFor(modname: string, title: string, text: string): MaterialRole {
  if (modname === 'assign') return 'assignment';
  if (modname === 'forum') return 'activities';
  if (modname === 'label' || modname === 'page' || modname === 'book') {
    const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
    if (ACTIVITY_WORDS.test(title) || ACTIVITY_WORDS.test(firstLine)) return 'activities';
    return 'reading';
  }
  if (modname === 'resource' || modname === 'url' || modname === 'lesson' || modname === 'glossary') return 'reading';
  return 'other';
}

function html(s: string): string {
  return htmlToText(s.replace(/@@PLUGINFILE@@\/?/g, ''), { fragment: true }).text;
}

function unixDate(s: string): string | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
}

/**
 * The rubric or marking guide from an assignment's grading.xml, as markdown;
 * '' if none. Moodle nests the form under a plugin wrapper
 * (`plugin_gradingform_rubric_definition` → `criteria/criterion/levels/level`,
 * `plugin_gradingform_guide_definition` → `guidecriteria/guidecriterion`), so
 * the criteria are found by name below the definition.
 */
export function rubricText(grading: XNode | undefined): string {
  const out: string[] = [];
  for (const area of children(find(grading, 'areas'), 'area')) {
    for (const def of children(child(area, 'definitions'), 'definition')) {
      const method = txt(def, 'method');
      const name = txt(def, 'name');
      const desc = html(txt(def, 'description'));
      if (method === 'rubric') {
        out.push(`## Marking rubric${name ? `: ${name}` : ''}`);
        if (desc) out.push(desc);
        for (const c of children(find(def, 'criteria'), 'criterion')) {
          const levels = children(child(c, 'levels'), 'level')
            .map((l) => ({ score: Number(txt(l, 'score')), def: html(txt(l, 'definition')) }))
            .sort((a, b) => b.score - a.score)
            .map((l) => `${l.score} pts: ${l.def}`);
          out.push(`- ${html(txt(c, 'description'))}${levels.length ? `\n  ${levels.join('\n  ')}` : ''}`);
        }
      } else if (method === 'guide') {
        out.push(`## Marking guide${name ? `: ${name}` : ''}`);
        if (desc) out.push(desc);
        for (const c of children(find(def, 'guidecriteria'), 'guidecriterion')) {
          const max = txt(c, 'maxscore');
          const markers = html(txt(c, 'descriptionmarkers'));
          out.push(`- ${txt(c, 'shortname')}${max ? ` (up to ${max} marks)` : ''}: ${html(txt(c, 'description'))}${markers ? ` (for markers: ${markers})` : ''}`);
        }
      }
    }
  }
  return out.join('\n');
}

interface Parsed {
  text: string;
  /** Files wanted from the archive: component/filearea pairs under this activity's context. */
  attachments: Array<{ component: string; filearea: string }>;
}

/** The readable content of one activity, by module type. */
export function activityContent(modname: string, act: XNode | undefined, grading: XNode | undefined): Parsed {
  const mod = child(act, modname);
  const intro = html(txt(mod, 'intro'));
  switch (modname) {
    case 'label': return { text: intro, attachments: [] };
    case 'page': return { text: [intro, html(txt(mod, 'content'))].filter(Boolean).join('\n\n'), attachments: [] };
    case 'book': {
      const chapters = children(child(mod, 'chapters'), 'chapter')
        .filter((c) => txt(c, 'hidden') !== '1')
        .map((c) => `## ${txt(c, 'title')}\n\n${html(txt(c, 'content'))}`);
      return { text: [intro, ...chapters].filter(Boolean).join('\n\n'), attachments: [] };
    }
    case 'assign': {
      const lines: string[] = [];
      const due = unixDate(txt(mod, 'duedate'));
      const from = unixDate(txt(mod, 'allowsubmissionsfromdate'));
      const grade = Number(txt(mod, 'grade'));
      if (from) lines.push(`Opens: ${from}`);
      if (due) lines.push(`Due: ${due}`);
      if (Number.isFinite(grade) && grade > 0) lines.push(`Marked out of ${grade}`);
      const activity = html(txt(mod, 'activity'));
      const rubric = rubricText(grading);
      return {
        text: [lines.join('\n'), intro, activity ? `## Activity instructions\n\n${activity}` : '', rubric].filter(Boolean).join('\n\n'),
        attachments: [{ component: 'mod_assign', filearea: 'introattachment' }],
      };
    }
    case 'resource': return { text: intro, attachments: [{ component: 'mod_resource', filearea: 'content' }] };
    case 'url': {
      const u = txt(mod, 'externalurl');
      return { text: [u ? `Link: ${u}` : '', intro].filter(Boolean).join('\n\n'), attachments: [] };
    }
    case 'lesson': {
      const pages = children(child(mod, 'pages'), 'page').map((p) => `## ${txt(p, 'title')}\n\n${html(txt(p, 'contents'))}`);
      return { text: [intro, ...pages].filter(Boolean).join('\n\n'), attachments: [] };
    }
    case 'glossary': {
      const entries = children(child(mod, 'entries'), 'entry').map((e) => `**${txt(e, 'concept')}**: ${html(txt(e, 'definition'))}`);
      return { text: [intro, ...entries].filter(Boolean).join('\n\n'), attachments: [] };
    }
    default: return { text: intro, attachments: [] };
  }
}

const XML_PATH = /^(moodle_backup\.xml|files\.xml|course\/course\.xml|sections\/section_\d+\/section\.xml|activities\/([a-z0-9]+)_\d+\/(module|grading|[a-z0-9]+)\.xml)$/;

function wantXml(name: string, size: number): boolean {
  const m = XML_PATH.exec(name);
  if (!m || size > XML_MAX_BYTES) return false;
  if (m[2] && m[3] && m[3] !== 'module' && m[3] !== 'grading' && m[3] !== m[2]) return false;
  return true;
}

/** Read a backup from disk into a preview the instructor can review. */
export async function parseMoodleBackup(filePath: string): Promise<BackupPreview> {
  const xml = new Map<string, string>();
  await readArchive(filePath, wantXml, (name, data) => { xml.set(name, data.toString('utf8')); });
  const manifest = xml.get('moodle_backup.xml');
  if (!manifest) throw new ImportError('No moodle_backup.xml inside: that archive is not a Moodle course backup. In Moodle, open the course, then More → Course reuse → Backup.');
  const info = child(child(parseXml(manifest), 'moodle_backup'), 'information');
  const courseXml = xml.get('course/course.xml');
  const courseNode = courseXml ? child(parseXml(courseXml), 'course') : undefined;
  const wwwroot = txt(info, 'original_wwwroot').replace(/\/+$/, '');
  const courseId = txt(info, 'original_course_id');
  const course = {
    fullname: txt(courseNode, 'fullname') || txt(info, 'original_course_fullname'),
    shortname: txt(courseNode, 'shortname') || txt(info, 'original_course_shortname'),
    course_id: courseId,
    wwwroot,
    backup_date: unixDate(txt(info, 'backup_date')),
    moodle_release: txt(info, 'moodle_release'),
  };
  const contents = child(info, 'contents');
  const sections: SectionRef[] = children(child(contents, 'sections'), 'section').map((s) => ({ sectionid: txt(s, 'sectionid'), title: txt(s, 'title'), directory: txt(s, 'directory') }));
  const activities: ActivityRef[] = children(child(contents, 'activities'), 'activity').map((a) => ({
    moduleid: txt(a, 'moduleid'), sectionid: txt(a, 'sectionid'), modname: txt(a, 'modulename'), title: txt(a, 'title'), directory: txt(a, 'directory'),
  }));
  const files: FileRef[] = children(child(parseXml(xml.get('files.xml') ?? '<files/>'), 'files'), 'file').map((f) => ({
    contenthash: txt(f, 'contenthash'), contextid: txt(f, 'contextid'), component: txt(f, 'component'), filearea: txt(f, 'filearea'),
    filename: txt(f, 'filename'), mimetype: txt(f, 'mimetype'), filesize: Number(txt(f, 'filesize')) || 0,
  })).filter((f) => f.filename && f.filename !== '.');

  const skipped: BackupPreview['skipped'] = [];
  const byModule = new Map(activities.map((a) => [a.moduleid, a]));
  const units: BackupUnit[] = [];
  // Attachments to fetch on a second pass: archive path → where the text goes.
  const wanted = new Map<string, Array<{ item: BackupItem; file: FileRef }>>();

  for (const s of sections) {
    const sx = xml.get(`${s.directory}/section.xml`);
    const sec = sx ? child(parseXml(sx), 'section') : undefined;
    const number = Number(txt(sec, 'number')) || 0;
    const name = txt(sec, 'name') || s.title || (number === 0 ? 'General' : `Section ${number}`);
    const visible = txt(sec, 'visible') !== '0';
    const summary = html(txt(sec, 'summary'));
    const sequence = txt(sec, 'sequence').split(',').map((x) => x.trim()).filter(Boolean);
    const inSection = activities.filter((a) => a.sectionid === s.sectionid).map((a) => a.moduleid);
    const order = [...sequence.filter((id) => byModule.has(id)), ...inSection.filter((id) => !sequence.includes(id))];
    const sectionUrl = `${wwwroot}/course/view.php?id=${courseId}&section=${number}`;
    const unit: BackupUnit = { title: name, order: number, visible, items: [] };
    const merged: Record<'reading' | 'activities', string[]> = { reading: summary ? [summary] : [], activities: [] };

    for (const id of order) {
      const a = byModule.get(id)!;
      const ax = xml.get(`${a.directory}/${a.modname}.xml`);
      const mx = xml.get(`${a.directory}/module.xml`);
      const act = ax ? child(parseXml(ax), 'activity') : undefined;
      const moduleVisible = mx ? txt(child(parseXml(mx), 'module'), 'visible') !== '0' : true;
      const grading = a.modname === 'assign' && xml.get(`${a.directory}/grading.xml`) ? parseXml(xml.get(`${a.directory}/grading.xml`)!) : undefined;
      const { text, attachments } = activityContent(a.modname, act, grading);
      const title = txt(child(act, a.modname), 'name') || a.title || `${a.modname} ${a.moduleid}`;
      const role = roleFor(a.modname, title, text);
      if (a.modname === 'label') {
        if (text.length < MIN_CHARS) { skipped.push({ title: title.slice(0, 80), modname: 'label', reason: text.length ? 'too short to be useful' : 'no text (an image or a divider)' }); continue; }
        if (!moduleVisible) { skipped.push({ title: title.slice(0, 80), modname: 'label', reason: 'hidden in the course' }); continue; }
        merged[role === 'activities' ? 'activities' : 'reading'].push(text);
        continue;
      }
      const contextid = act?.attrs.contextid ?? '';
      const item: BackupItem = {
        key: `moodle_backup:${a.modname}-${a.moduleid}`,
        unit: name, unit_order: number, modname: a.modname, title: title.slice(0, 160), role, text, chars: text.length,
        visible: visible && moduleVisible,
        source_url: wwwroot ? `${wwwroot}/mod/${a.modname}/view.php?id=${a.moduleid}` : '',
        notes: [], include: true,
      };
      if (!moduleVisible) item.notes.push('hidden in the course');
      if (a.modname === 'quiz') item.notes.push('quiz questions are not imported, only the description');
      if (a.modname === 'forum') item.notes.push('forum posts are never imported, only the prompt');
      for (const att of attachments) {
        for (const f of files.filter((f) => f.contextid === contextid && f.component === att.component && f.filearea === att.filearea)) {
          if (!ATTACHMENT_TYPES.has(f.mimetype)) { item.notes.push(`attached "${f.filename}" is not a text, Word or PDF file and was not read`); continue; }
          if (f.filesize > ATTACHMENT_MAX_BYTES) { item.notes.push(`attached "${f.filename}" is over 40 MB and was not read`); continue; }
          const path = `files/${f.contenthash.slice(0, 2)}/${f.contenthash}`;
          const list = wanted.get(path) ?? [];
          list.push({ item, file: f });
          wanted.set(path, list);
        }
      }
      unit.items.push(item);
    }

    const mergedItem = (role: 'reading' | 'activities', parts: string[]): BackupItem | null => {
      const text = parts.join('\n\n').trim();
      if (text.length < MIN_CHARS) return null;
      const suffix = role === 'activities' ? 'activities and study questions' : 'text';
      return {
        key: `moodle_backup:section-${s.sectionid}-${role}`,
        unit: name, unit_order: number, modname: 'label', title: `${name} — ${suffix}`.slice(0, 160), role, text, chars: text.length,
        visible, source_url: wwwroot ? sectionUrl : '', notes: [], include: true,
      };
    };
    const reading = mergedItem('reading', merged.reading);
    const acts = mergedItem('activities', merged.activities);
    if (reading) unit.items.unshift(reading);
    if (acts) unit.items.splice(reading ? 1 : 0, 0, acts);
    if (!visible) for (const it of unit.items) it.notes.push('in a hidden section');
    if (unit.items.length) units.push(unit);
  }

  // Second pass: the attachments, read into text where the type allows.
  if (wanted.size) {
    await readArchive(filePath, (name) => wanted.has(name), (name, data) => {
      for (const { item, file } of wanted.get(name) ?? []) {
        item.notes.push(`__pending:${file.filename}`);
        (item as BackupItem & { _files?: Array<{ file: FileRef; data: Buffer }> })._files ??= [];
        (item as BackupItem & { _files?: Array<{ file: FileRef; data: Buffer }> })._files!.push({ file, data });
      }
    });
    for (const unit of units) {
      for (const item of unit.items) {
        const pend = (item as BackupItem & { _files?: Array<{ file: FileRef; data: Buffer }> })._files;
        if (!pend) continue;
        delete (item as BackupItem & { _files?: unknown })._files;
        item.notes = item.notes.filter((n) => !n.startsWith('__pending:'));
        for (const { file, data } of pend) {
          try {
            const { text } = await extractFromFile(file.filename, data);
            const clean = text.trim();
            if (clean.length < 20) { item.notes.push(`attached "${file.filename}" has no readable text (a scanned PDF needs OCR first)`); continue; }
            item.text = item.modname === 'resource' && !item.text ? clean : `${item.text}\n\n## Attached: ${file.filename}\n\n${clean}`.trim();
            item.notes.push(`includes the text of "${file.filename}"`);
          } catch (e) {
            item.notes.push(`attached "${file.filename}" could not be read: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  // Fit to the material limit and decide the default ticks.
  for (const unit of units) {
    for (const item of unit.items) {
      const fit = fitMaterial(item.text);
      if (fit.truncated) item.notes.push(`cut from ${Math.round(fit.original_chars / 1000)}k to the 200,000-character limit`);
      item.text = fit.text;
      item.chars = item.text.length;
      item.include = item.visible && item.chars >= MIN_CHARS;
      if (item.chars < MIN_CHARS) item.notes.push('little or no text');
    }
  }
  if (!units.length) throw new ImportError('The backup holds no course content the tool can use (no sections with text, pages, files or assignments).');
  return { course, units, skipped };
}
