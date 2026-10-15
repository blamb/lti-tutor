/**
 * Live course sync through Moodle web services.
 *
 * A course stores one token (encrypted, courses.ts). With it the tool reads
 * the course the way the Moodle mobile app does, through the REST protocol:
 * sections and modules from core_course_get_contents, the content of pages,
 * books, resources, URLs, assignments (with rubric), forums, lessons and
 * glossaries from their own read functions, and attached files through the
 * token-authenticated pluginfile endpoint. The result is the same CourseModel
 * a backup produces, so the preview and the import are shared
 * (course-model.ts).
 *
 * Only read functions are used. Nothing here touches users, grades,
 * submissions or posts, and nothing writes to Moodle.
 */

import { ImportError, htmlToText } from './importers.js';
import { platformUrl } from './outbound.js';
import type { CourseModel, ModelFile, ModelModule, ModelSection } from './course-model.js';

/** What the external service in Moodle must allow. Optional ones degrade with a note. */
export const WS_FUNCTIONS_REQUIRED = [
  'core_webservice_get_site_info',
  'core_course_get_contents',
  'mod_page_get_pages_by_courses',
  'mod_resource_get_resources_by_courses',
  'mod_url_get_urls_by_courses',
  'mod_assign_get_assignments',
] as const;
export const WS_FUNCTIONS_OPTIONAL = [
  'mod_book_get_books_by_courses',
  'mod_forum_get_forums_by_courses',
  'mod_lesson_get_lessons_by_courses',
  'mod_glossary_get_glossaries_by_courses',
  'mod_glossary_get_entries_by_letter',
  'core_grading_get_definitions',
] as const;
export const WS_FUNCTIONS = [...WS_FUNCTIONS_REQUIRED, ...WS_FUNCTIONS_OPTIONAL];

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface WsClient {
  call<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T>;
  download(fileurl: string): Promise<Buffer>;
  readonly wwwroot: string;
}

/** Flatten nested params the way Moodle's REST server expects: courseids[0]=12, options[0][name]=x. */
export function flattenParams(params: Record<string, unknown>, prefix = '', out: URLSearchParams = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' && item !== null ? flattenParams(item as Record<string, unknown>, `${key}[${i}]`, out) : out.set(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object' && v !== null) flattenParams(v as Record<string, unknown>, key, out);
    else if (v !== undefined && v !== null) out.set(key, String(v));
  }
  return out;
}

const TIMEOUT_MS = 30_000;

export function wsClient(wwwroot: string, token: string, fetchImpl: FetchLike = fetch): WsClient {
  const root = wwwroot.replace(/\/+$/, '');
  return {
    wwwroot: root,
    async call<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
      const body = flattenParams({ wstoken: token, wsfunction: fn, moodlewsrestformat: 'json', ...params });
      let res: Response;
      try {
        res = await fetchImpl(platformUrl(`${root}/webservice/rest/server.php`), {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        throw new ImportError(`Could not reach Moodle at ${root}: ${(e as Error).message}`, 502);
      }
      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new ImportError(`Moodle answered ${res.status} without JSON for ${fn}. Is the REST protocol enabled?`, 502); }
      const err = json as { exception?: string; errorcode?: string; message?: string };
      if (err && typeof err === 'object' && err.exception) throw new WsError(fn, err.errorcode ?? err.exception, err.message ?? err.exception);
      return json as T;
    },
    async download(fileurl: string): Promise<Buffer> {
      const url = `${fileurl}${fileurl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
      const res = await fetchImpl(platformUrl(url), { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new ImportError(`Moodle refused the file (${res.status})`, 502);
      const ct = res.headers.get('content-type') ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      // Moodle answers a bad token with a small JSON error and status 200.
      if (ct.includes('application/json') && buf.length < 2000) {
        const j = JSON.parse(buf.toString('utf8')) as { exception?: string; message?: string };
        if (j.exception) throw new ImportError(`Moodle refused the file: ${j.message ?? j.exception}`, 502);
      }
      return buf;
    },
  };
}

export class WsError extends ImportError {
  constructor(public fn: string, public code: string, message: string) {
    super(`Moodle web service ${fn}: ${message}`, 502);
    this.name = 'WsError';
  }
  get accessDenied(): boolean {
    return /accessexception|webservice_access_exception|invalidtoken|nopermissions|required_capability|accessexception/i.test(this.code) || /not allowed|access control exception|Invalid token/i.test(this.message);
  }
}

export interface SiteInfo { sitename: string; username: string; fullname: string; userid: number; siteurl: string; release?: string; functions: Array<{ name: string }> }

/** Verify a token: who it is, and which of the functions we use it is allowed to call. */
export async function checkConnection(client: WsClient): Promise<{ site: SiteInfo; missing: string[]; missing_optional: string[] }> {
  const site = await client.call<SiteInfo>('core_webservice_get_site_info');
  const allowed = new Set((site.functions ?? []).map((f) => f.name));
  return {
    site,
    missing: WS_FUNCTIONS_REQUIRED.filter((f) => !allowed.has(f)),
    missing_optional: WS_FUNCTIONS_OPTIONAL.filter((f) => !allowed.has(f)),
  };
}

// ─── Reading a course ───────────────────────────────────────────────────────

interface WsContent { type: string; filename: string; fileurl?: string; filesize?: number; mimetype?: string; content?: string }
interface WsModule { id: number; name: string; modname: string; visible?: number; description?: string; url?: string; contents?: WsContent[] }
interface WsSection { id: number; name: string; section?: number; visible?: number; summary?: string; modules: WsModule[] }

function html(s: string | undefined): string {
  return s ? htmlToText(s.replace(/@@PLUGINFILE@@\/?/g, ''), { fragment: true }).text : '';
}
function unixDate(n: number | undefined): string | null {
  return n && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
}
function fileOf(client: WsClient, f: { filename?: string; fileurl?: string; mimetype?: string; filesize?: number }): ModelFile | null {
  if (!f.filename || !f.fileurl) return null;
  const url = f.fileurl;
  return { filename: f.filename, mimetype: f.mimetype ?? '', filesize: f.filesize ?? 0, read: () => client.download(url) };
}

/** Rubric or marking guide text from core_grading_get_definitions, '' if none. */
export function rubricFromDefinitions(defs: unknown, cmid: number): string {
  const areas = ((defs as { areas?: Array<{ cmid: number; definitions?: Array<Record<string, unknown>> }> })?.areas ?? []).filter((a) => a.cmid === cmid);
  const out: string[] = [];
  for (const a of areas) {
    for (const d of a.definitions ?? []) {
      const method = String(d.method ?? '');
      const name = String(d.name ?? '');
      const desc = html(String(d.description ?? ''));
      if (method === 'rubric') {
        out.push(`## Marking rubric${name ? `: ${name}` : ''}`);
        if (desc) out.push(desc);
        const criteria = ((d.rubric as { rubric_criteria?: Array<{ description?: string; levels?: Array<{ score?: number; definition?: string }> }> })?.rubric_criteria) ?? [];
        for (const c of criteria) {
          const levels = (c.levels ?? []).map((l) => ({ score: Number(l.score ?? 0), def: html(l.definition) })).sort((x, y) => y.score - x.score).map((l) => `${l.score} pts: ${l.def}`);
          out.push(`- ${html(c.description)}${levels.length ? `\n  ${levels.join('\n  ')}` : ''}`);
        }
      } else if (method === 'guide') {
        out.push(`## Marking guide${name ? `: ${name}` : ''}`);
        if (desc) out.push(desc);
        const criteria = ((d.guide as { guide_criteria?: Array<{ shortname?: string; description?: string; descriptionmarkers?: string; maxscore?: number }> })?.guide_criteria) ?? [];
        for (const c of criteria) {
          const markers = html(c.descriptionmarkers);
          out.push(`- ${c.shortname ?? ''}${c.maxscore ? ` (up to ${c.maxscore} marks)` : ''}: ${html(c.description)}${markers ? ` (for markers: ${markers})` : ''}`);
        }
      }
    }
  }
  return out.join('\n');
}

/** Call an optional function; on access denied or missing function, return null and note it. */
async function optional<T>(client: WsClient, fn: string, params: Record<string, unknown>, notes: string[]): Promise<T | null> {
  try {
    return await client.call<T>(fn, params);
  } catch (e) {
    if (e instanceof WsError) { notes.push(`${fn} is not allowed for this token (${e.code}); related content was skipped`); return null; }
    throw e;
  }
}

/**
 * Read one course into the shared model. `course` carries the title known
 * from the LTI launch; the course id is the LTI context id, which Moodle
 * uses as its course id.
 */
export async function fetchCourseModel(client: WsClient, courseId: string, course: { fullname: string; shortname?: string }): Promise<{ model: CourseModel; notes: string[] }> {
  const notes: string[] = [];
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) throw new ImportError(`The course id "${courseId}" is not a Moodle course id.`);
  const sections = await client.call<WsSection[]>('core_course_get_contents', { courseid: cid, options: [{ name: 'excludecontents', value: 0 }] });
  const by = <T extends { coursemodule?: number; cmid?: number }>(list: T[] | undefined) => new Map((list ?? []).map((x) => [Number(x.coursemodule ?? x.cmid), x]));

  const pages = by((await client.call<{ pages?: Array<{ coursemodule: number; intro?: string; content?: string }> }>('mod_page_get_pages_by_courses', { courseids: [cid] })).pages);
  const resources = by((await client.call<{ resources?: Array<{ coursemodule: number; intro?: string; contentfiles?: WsContent[] }> }>('mod_resource_get_resources_by_courses', { courseids: [cid] })).resources);
  const urls = by((await client.call<{ urls?: Array<{ coursemodule: number; intro?: string; externalurl?: string }> }>('mod_url_get_urls_by_courses', { courseids: [cid] })).urls);
  const assignRes = await client.call<{ courses?: Array<{ assignments?: Array<{ cmid: number; name: string; intro?: string; duedate?: number; allowsubmissionsfromdate?: number; grade?: number; activity?: string; introattachments?: WsContent[] }> }> }>('mod_assign_get_assignments', { courseids: [cid], includenotenrolledcourses: 1 });
  const assigns = by(assignRes.courses?.[0]?.assignments);
  const books = by((await optional<{ books?: Array<{ coursemodule: number; intro?: string }> }>(client, 'mod_book_get_books_by_courses', { courseids: [cid] }, notes))?.books);
  const forums = by((await optional<Array<{ cmid: number; intro?: string }>>(client, 'mod_forum_get_forums_by_courses', { courseids: [cid] }, notes)) ?? undefined);
  const lessons = by((await optional<{ lessons?: Array<{ coursemodule: number; intro?: string }> }>(client, 'mod_lesson_get_lessons_by_courses', { courseids: [cid] }, notes))?.lessons);
  const glossaries = by((await optional<{ glossaries?: Array<{ id: number; coursemodule: number; intro?: string }> }>(client, 'mod_glossary_get_glossaries_by_courses', { courseids: [cid] }, notes))?.glossaries);
  const assignCmids = [...assigns.keys()];
  const grading = assignCmids.length ? await optional<unknown>(client, 'core_grading_get_definitions', { cmids: assignCmids, areaname: 'submissions', activeonly: 1 }, notes) : null;

  const modelSections: ModelSection[] = [];
  for (const s of sections) {
    const number = Number(s.section ?? 0);
    const sec: ModelSection = {
      id: String(s.id), number, name: s.name ?? '', summary: html(s.summary), visible: s.visible !== 0,
      url: `${client.wwwroot}/course/view.php?id=${cid}&section=${number}`, modules: [],
    };
    for (const m of s.modules ?? []) {
      const files: ModelFile[] = [];
      const modNotes: string[] = [];
      let text = '';
      const intro = (x: { intro?: string } | undefined) => html(x?.intro);
      switch (m.modname) {
        case 'label': text = html(m.description); break;
        case 'page': { const pg = pages.get(m.id); text = [intro(pg), html(pg?.content)].filter(Boolean).join('\n\n'); break; }
        case 'resource': {
          text = intro(resources.get(m.id));
          for (const f of (resources.get(m.id)?.contentfiles ?? m.contents ?? [])) { const mf = fileOf(client, f); if (mf) files.push(mf); }
          break;
        }
        case 'url': { const u = urls.get(m.id); text = [u?.externalurl ? `Link: ${u.externalurl}` : '', intro(u)].filter(Boolean).join('\n\n'); break; }
        case 'assign': {
          const a = assigns.get(m.id);
          const lines: string[] = [];
          const from = unixDate(a?.allowsubmissionsfromdate); const due = unixDate(a?.duedate);
          if (from) lines.push(`Opens: ${from}`);
          if (due) lines.push(`Due: ${due}`);
          if (a?.grade && a.grade > 0) lines.push(`Marked out of ${a.grade}`);
          const activity = html(a?.activity);
          text = [lines.join('\n'), intro(a), activity ? `## Activity instructions\n\n${activity}` : '', grading ? rubricFromDefinitions(grading, m.id) : ''].filter(Boolean).join('\n\n');
          for (const f of a?.introattachments ?? []) { const mf = fileOf(client, f); if (mf) files.push(mf); }
          break;
        }
        case 'book': {
          const chapters: string[] = [];
          for (const c of m.contents ?? []) {
            if (c.type !== 'content' || !c.fileurl || !/\.html?$/i.test(c.filename)) continue;
            try { chapters.push(html((await client.download(c.fileurl)).toString('utf8'))); } catch (e) { modNotes.push(`a chapter could not be read: ${(e as Error).message}`); }
          }
          text = [intro(books.get(m.id)), ...chapters].filter(Boolean).join('\n\n');
          break;
        }
        case 'forum': text = intro(forums.get(m.id)); break;
        case 'lesson': { text = intro(lessons.get(m.id)); if (text) modNotes.push('lesson pages are not read through web services; only the description'); break; }
        case 'glossary': {
          const g = glossaries.get(m.id);
          const entries = g ? await optional<{ entries?: Array<{ concept: string; definition?: string }> }>(client, 'mod_glossary_get_entries_by_letter', { id: g.id, letter: 'ALL', from: 0, limit: 300 }, notes) : null;
          text = [intro(g), ...((entries?.entries ?? []).map((e) => `**${e.concept}**: ${html(e.definition)}`))].filter(Boolean).join('\n\n');
          break;
        }
        default: text = html(m.description);
      }
      const mod: ModelModule = { id: String(m.id), modname: m.modname, name: m.name, visible: m.visible !== 0, text, files, url: m.url ?? '', notes: modNotes };
      sec.modules.push(mod);
    }
    modelSections.push(sec);
  }
  return {
    model: {
      source: 'sync',
      course: { fullname: course.fullname, shortname: course.shortname ?? '', course_id: courseId, wwwroot: client.wwwroot, backup_date: null, moodle_release: '' },
      sections: modelSections,
    },
    notes: [...new Set(notes)],
  };
}
