/**
 * Per-course settings for Persona Chat: the Moodle web-service token, stored
 * encrypted (core/secrets.ts) so the course can be read live.
 */

import { query } from '../../core/db.js';
import { encryptSecret, decryptSecret } from '../../core/secrets.js';
import type { Scope } from '../../core/materials.js';

export interface MoodleWsStatus {
  connected: boolean;
  /** Moodle username the token belongs to, for the settings page. */
  user: string;
  checked_at: string | null;
}

/** The decrypted token for this course, or null when none is stored (or it was encrypted under another secret). */
export async function getMoodleWsToken(scope: Scope): Promise<{ token: string | null; status: MoodleWsStatus }> {
  const rows = await query<{ moodle_ws_token_enc: string; moodle_ws_user: string; moodle_ws_checked_at: string | null }>(
    `select moodle_ws_token_enc, moodle_ws_user, moodle_ws_checked_at::text from persona_course_settings where lti_iss = $1 and lti_context_id = $2`,
    [scope.iss, scope.contextId]
  );
  const r = rows[0];
  const token = r?.moodle_ws_token_enc ? decryptSecret(r.moodle_ws_token_enc) : null;
  return { token, status: { connected: !!token, user: token ? r!.moodle_ws_user : '', checked_at: token ? r!.moodle_ws_checked_at : null } };
}

export async function setMoodleWsToken(scope: Scope, token: string, user: string): Promise<void> {
  await query(
    `insert into persona_course_settings (lti_iss, lti_context_id, moodle_ws_token_enc, moodle_ws_user, moodle_ws_checked_at)
     values ($1, $2, $3, $4, now())
     on conflict (lti_iss, lti_context_id) do update
       set moodle_ws_token_enc = excluded.moodle_ws_token_enc, moodle_ws_user = excluded.moodle_ws_user, moodle_ws_checked_at = now(), updated_at = now()`,
    [scope.iss, scope.contextId, encryptSecret(token), user]
  );
}

export async function touchMoodleWs(scope: Scope): Promise<void> {
  await query(`update persona_course_settings set moodle_ws_checked_at = now() where lti_iss = $1 and lti_context_id = $2`, [scope.iss, scope.contextId]);
}

export async function clearMoodleWsToken(scope: Scope): Promise<void> {
  await query(
    `update persona_course_settings set moodle_ws_token_enc = '', moodle_ws_user = '', moodle_ws_checked_at = null, updated_at = now() where lti_iss = $1 and lti_context_id = $2`,
    [scope.iss, scope.contextId]
  );
}
