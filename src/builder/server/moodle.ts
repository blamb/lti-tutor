/**
 * Module Builder's optional connection to the course in Moodle, used for one
 * thing: reading the course's sections, so the designer picks where a module
 * lands by name instead of by number.
 *
 * A restore puts section N of the file into section N of the course, adds to
 * what is there and keeps the section's name, so a wrong number looks as if
 * nothing arrived. With a web-service token for an account that can see the
 * course, the tool lists the real sections and offers a new one at the end.
 *
 * One token per course, encrypted at rest (core/secrets.ts). It is only ever
 * sent to the Moodle the tool was launched from, and only to read.
 */

import { query } from '../../core/db.js';
import { encryptSecret, decryptSecret } from '../../core/secrets.js';
import { wsClient, WsError, type SiteInfo } from '../../core/moodle-ws.js';
import { ImportError } from '../../core/importers.js';

export const SECTION_FUNCTION = 'core_course_get_contents';

export interface CourseSection { number: number; name: string; items: number; visible: boolean }
export interface MoodleStatus { connected: boolean; user: string; checked_at: string | null }

async function stored(iss: string, contextId: string): Promise<{ token: string | null; status: MoodleStatus }> {
  const rows = await query<{ token_enc: string; ws_user: string; checked_at: string | null }>(
    `select token_enc, ws_user, checked_at::text from moodle_connection where lti_iss = $1 and lti_context_id = $2`, [iss, contextId]);
  const r = rows[0];
  const token = r?.token_enc ? decryptSecret(r.token_enc) : null;
  return { token, status: { connected: !!token, user: token ? r!.ws_user : '', checked_at: token ? r!.checked_at : null } };
}

interface WsSection { section?: number; name?: string; visible?: number; modules?: unknown[] }

async function readSections(iss: string, contextId: string, token: string): Promise<CourseSection[]> {
  if (!/^\d+$/.test(contextId)) throw new ImportError('This launch did not say which Moodle course it came from, so its sections cannot be read.', 400);
  const raw = await wsClient(iss, token).call<WsSection[]>(SECTION_FUNCTION, { courseid: Number(contextId), options: [{ name: 'excludecontents', value: 1 }] });
  return (Array.isArray(raw) ? raw : [])
    .filter((s) => typeof s.section === 'number')
    .map((s) => ({ number: s.section!, name: String(s.name ?? '').trim() || `Section ${s.section}`, items: Array.isArray(s.modules) ? s.modules.length : 0, visible: s.visible !== 0 }))
    .sort((a, b) => a.number - b.number);
}

/** Verify a token and store it. Throws ImportError with a message the designer can act on. */
export async function connectMoodle(iss: string, contextId: string, token: string): Promise<{ status: MoodleStatus; sections: CourseSection[]; fullname: string }> {
  if (!/^[a-f0-9]{32}$/i.test(token)) throw new ImportError('That does not look like a Moodle web-service token (32 letters and digits). Copy it from Moodle without spaces.', 400);
  let site: SiteInfo;
  try {
    site = await wsClient(iss, token).call<SiteInfo>('core_webservice_get_site_info');
  } catch (e) {
    if (e instanceof WsError) throw new ImportError('Moodle did not accept that token. Check that you copied all of it, that it has not expired, and that it was made on the Moodle this course is in.', 400);
    throw e;
  }
  if (!(site.functions ?? []).some((f) => f.name === SECTION_FUNCTION)) {
    throw new ImportError(`The token works (${site.fullname}, ${site.sitename}) but its service does not allow ${SECTION_FUNCTION}. Ask the Moodle administrator to add that function to the service, then try again.`, 400);
  }
  let sections: CourseSection[];
  try {
    sections = await readSections(iss, contextId, token);
  } catch (e) {
    if (e instanceof WsError) throw new ImportError(`The token belongs to ${site.fullname}, but that account cannot read this course (${e.code}). Use a token for an account that teaches or manages the course.`, 400);
    throw e;
  }
  await query(
    `insert into moodle_connection (lti_iss, lti_context_id, token_enc, ws_user, checked_at) values ($1, $2, $3, $4, now())
     on conflict (lti_iss, lti_context_id) do update set token_enc = excluded.token_enc, ws_user = excluded.ws_user, checked_at = now()`,
    [iss, contextId, encryptSecret(token), site.username]);
  return { status: { connected: true, user: site.username, checked_at: new Date().toISOString() }, sections, fullname: site.fullname };
}

export async function disconnectMoodle(iss: string, contextId: string): Promise<void> {
  await query(`delete from moodle_connection where lti_iss = $1 and lti_context_id = $2`, [iss, contextId]);
}

/**
 * The connection's state and, when connected, the course's sections as they
 * are now. A Moodle that cannot be reached, or a token that has stopped
 * working, is reported in `problem` and never thrown: the Download tab must
 * still open, with the plain number box.
 */
export async function moodleState(iss: string, contextId: string): Promise<{ status: MoodleStatus; sections: CourseSection[] | null; problem: string }> {
  const { token, status } = await stored(iss, contextId);
  if (!token) return { status, sections: null, problem: '' };
  try {
    const sections = await readSections(iss, contextId, token);
    void query(`update moodle_connection set checked_at = now() where lti_iss = $1 and lti_context_id = $2`, [iss, contextId]).catch(() => undefined);
    return { status, sections, problem: '' };
  } catch (e) {
    const denied = e instanceof WsError && e.accessDenied;
    return { status, sections: null, problem: denied ? 'Moodle no longer accepts the stored token. Connect again with a new one.' : `The course’s sections could not be read just now (${(e as Error).message}).` };
  }
}
