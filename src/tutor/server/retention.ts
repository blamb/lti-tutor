/**
 * Data retention and the learner's own delete action.
 *
 *   - DATA_RETENTION_DAYS (env): a nightly job deletes tutor_turn rows (the
 *     transcripts) older than that. Summaries, the learner model and the
 *     report stay, so the instructor's view is unchanged. 0 = keep forever.
 *   - deleteMyData(): a learner removes their profile, learner model,
 *     transcripts, summaries and debriefs for the course. Their student row
 *     stays (it is what the LTI launch maps to) but holds only a display
 *     name that Moodle re-sends on every launch anyway.
 */

import { query } from '../../core/db.js';
import { env } from './env.js';
import type { CourseCtx } from './courses.js';

export interface RetentionResult {
  deleted_turns: number;
  cutoff: string | null;
}

/** Delete transcripts older than the retention window; keeps everything else. */
export async function pruneTranscripts(days = env.DATA_RETENTION_DAYS, now: Date = new Date()): Promise<RetentionResult> {
  if (!days || days <= 0) return { deleted_turns: 0, cutoff: null };
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = await query<{ id: number }>(`delete from tutor_turn where ts < $1::timestamptz returning id`, [cutoff]);
  return { deleted_turns: rows.length, cutoff };
}

let timer: NodeJS.Timeout | null = null;

/** Run once at start-up and then every night at about 03:00 server time. */
export function scheduleRetention(): void {
  if (!env.DATA_RETENTION_DAYS || env.DATA_RETENTION_DAYS <= 0) {
    console.log('[retention] DATA_RETENTION_DAYS is unset or 0: transcripts are kept indefinitely');
    return;
  }
  const run = async () => {
    try {
      const r = await pruneTranscripts();
      console.log(`[retention] deleted ${r.deleted_turns} transcript turn(s) older than ${env.DATA_RETENTION_DAYS} days`);
    } catch (e) {
      console.warn('[retention] prune failed:', (e as Error).message);
    }
  };
  const msUntilThree = () => {
    const next = new Date();
    next.setHours(3, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return next.getTime() - Date.now();
  };
  const arm = () => {
    timer = setTimeout(async () => { await run(); arm(); }, msUntilThree());
    timer.unref?.();
  };
  void run();
  arm();
  console.log(`[retention] transcripts older than ${env.DATA_RETENTION_DAYS} days are deleted nightly at 03:00`);
}

export function stopRetention(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export interface DeleteMyDataResult {
  profile: number;
  learner_model: number;
  sessions: number;
  turns: number;
  debriefs: number;
}

/**
 * Everything the tool holds about one learner in one course, gone. Rows in
 * api_call keep their cost figures but lose the link to the learner
 * (student_id is set null by the FK on the session rows they reference).
 */
export async function deleteMyData(studentId: number, ctx: CourseCtx): Promise<DeleteMyDataResult> {
  const profile = (await query<{ n: number }>(`with d as (delete from student_profile where student_id = $1 returning 1) select count(*)::int as n from d`, [studentId]))[0]!.n;
  const learnerModel = (await query<{ n: number }>(
    `with d as (delete from learner_model where student_id = $1 and lti_iss = $2 and lti_context_id = $3 returning 1) select count(*)::int as n from d`,
    [studentId, ctx.iss, ctx.contextId]
  ))[0]!.n;
  const debriefs = (await query<{ n: number }>(
    `with d as (delete from debrief where student_id = $1 and material_id in (select id from material where lti_iss = $2 and lti_context_id = $3) returning 1)
     select count(*)::int as n from d`,
    [studentId, ctx.iss, ctx.contextId]
  ))[0]!.n;
  const turns = (await query<{ n: number }>(
    `with d as (delete from tutor_turn where session_id in (
        select ts.session_id from tutorial_session ts join tutorial t on t.id = ts.tutorial_id
        where ts.student_id = $1 and t.lti_iss = $2 and t.lti_context_id = $3) returning 1)
     select count(*)::int as n from d`,
    [studentId, ctx.iss, ctx.contextId]
  ))[0]!.n;
  // Deleting the session rows cascades to tutorial_session (summaries, NPS, preparedness).
  const sessions = (await query<{ n: number }>(
    `with d as (delete from session where id in (
        select ts.session_id from tutorial_session ts join tutorial t on t.id = ts.tutorial_id
        where ts.student_id = $1 and t.lti_iss = $2 and t.lti_context_id = $3) returning 1)
     select count(*)::int as n from d`,
    [studentId, ctx.iss, ctx.contextId]
  ))[0]!.n;
  return { profile, learner_model: learnerModel, sessions, turns, debriefs };
}
