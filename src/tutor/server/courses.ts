/**
 * Per-course settings (course_settings): the TRUFlex delivery mode and the
 * course-wide defaults that hang off it. Also builds the CourseCtx that every
 * request carries, so the delivery object is loaded once per request and
 * threaded through prompts, routes and the launch page.
 */

import type { IdToken } from 'ltijs';
import { z } from 'zod';
import { query } from '../../core/db.js';
import { contextIdOf } from '../../core/reqctx.js';
import { deliveryOf, DEFAULT_TRUFLEX, parseTruFlex, type Delivery } from './delivery.js';
import { encryptSecret, decryptSecret } from '../../core/secrets.js';

export type CourseLevel = 'abe' | 'undergraduate' | 'graduate';

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  abe: 'Adult Basic Education (high-school completion)',
  undergraduate: 'Undergraduate',
  graduate: 'Graduate / MBA',
};

export interface CourseSettings {
  lti_iss: string;
  lti_context_id: string;
  truflex: number;
  course_level: CourseLevel | null;
  pitch_default: string;
  ai_disclosure: string;
  /** ISO date (YYYY-MM-DD) of week 1, where the course has fixed dates; null = unknown. */
  course_start: string | null;
  /** null when the course has no row yet (defaults are in effect). */
  updated_at: string | null;
}

export const CourseSettingsInput = z.object({
  truflex: z.number().int().min(1).max(10),
  course_level: z.enum(['abe', 'undergraduate', 'graduate']).nullable().default(null),
  pitch_default: z.string().trim().max(500).default(''),
  ai_disclosure: z.string().trim().max(4000).default(''),
  course_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').nullable().default(null),
});
export type CourseSettingsInput = z.infer<typeof CourseSettingsInput>;

/** What every request carries about the course it is for. */
export interface CourseCtx {
  iss: string;
  contextId: string;
  /** Course title from the LTI launch, for prompts. */
  title?: string;
  delivery: Delivery;
  settings: CourseSettings;
}

export function defaultCourseSettings(iss: string, contextId: string, truflex = DEFAULT_TRUFLEX): CourseSettings {
  return { lti_iss: iss, lti_context_id: contextId, truflex, course_level: null, pitch_default: '', ai_disclosure: '', course_start: null, updated_at: null };
}

export async function getCourseSettings(iss: string, contextId: string): Promise<CourseSettings> {
  const rows = await query<CourseSettings>(
    `select lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure, course_start::text, updated_at::text
     from course_settings where lti_iss = $1 and lti_context_id = $2`,
    [iss, contextId]
  );
  return rows[0] ?? defaultCourseSettings(iss, contextId);
}

/**
 * Seed the course's row from LTI custom parameters on launch: `truflex`
 * (the delivery mode) and `course_start` (week 1). Never overrides a mode
 * the instructor has chosen; fills in a course start only if none is set.
 */
export async function ensureCourseSettings(
  iss: string,
  contextId: string,
  seed: { truflex: number | null; courseStart: string | null }
): Promise<CourseSettings> {
  if (seed.truflex !== null || seed.courseStart !== null) {
    await query(
      `insert into course_settings (lti_iss, lti_context_id, truflex, course_start)
       values ($1, $2, coalesce($3, ${DEFAULT_TRUFLEX}), $4::date)
       on conflict (lti_iss, lti_context_id) do update
         set course_start = coalesce(course_settings.course_start, excluded.course_start)`,
      [iss, contextId, seed.truflex, seed.courseStart]
    );
  }
  return getCourseSettings(iss, contextId);
}

// ─── Moodle web-service connection (live course sync) ───────────────────────

export interface MoodleWsStatus {
  connected: boolean;
  /** Moodle username the token belongs to, for the settings page. */
  user: string;
  checked_at: string | null;
}

/** The decrypted token for this course, or null when none is stored (or it was encrypted under another secret). */
export async function getMoodleWsToken(iss: string, contextId: string): Promise<{ token: string | null; status: MoodleWsStatus }> {
  const rows = await query<{ moodle_ws_token_enc: string; moodle_ws_user: string; moodle_ws_checked_at: string | null }>(
    `select moodle_ws_token_enc, moodle_ws_user, moodle_ws_checked_at::text from course_settings where lti_iss = $1 and lti_context_id = $2`,
    [iss, contextId]
  );
  const r = rows[0];
  const token = r?.moodle_ws_token_enc ? decryptSecret(r.moodle_ws_token_enc) : null;
  return { token, status: { connected: !!token, user: token ? r!.moodle_ws_user : '', checked_at: token ? r!.moodle_ws_checked_at : null } };
}

export async function setMoodleWsToken(iss: string, contextId: string, token: string, user: string): Promise<void> {
  await query(
    `insert into course_settings (lti_iss, lti_context_id, moodle_ws_token_enc, moodle_ws_user, moodle_ws_checked_at)
     values ($1, $2, $3, $4, now())
     on conflict (lti_iss, lti_context_id) do update
       set moodle_ws_token_enc = excluded.moodle_ws_token_enc, moodle_ws_user = excluded.moodle_ws_user, moodle_ws_checked_at = now()`,
    [iss, contextId, encryptSecret(token), user]
  );
}

export async function touchMoodleWs(iss: string, contextId: string): Promise<void> {
  await query(`update course_settings set moodle_ws_checked_at = now() where lti_iss = $1 and lti_context_id = $2`, [iss, contextId]);
}

export async function clearMoodleWsToken(iss: string, contextId: string): Promise<void> {
  await query(`update course_settings set moodle_ws_token_enc = '', moodle_ws_user = '', moodle_ws_checked_at = null where lti_iss = $1 and lti_context_id = $2`, [iss, contextId]);
}

export async function upsertCourseSettings(iss: string, contextId: string, input: CourseSettingsInput): Promise<CourseSettings> {
  const rows = await query<CourseSettings>(
    `insert into course_settings (lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure, course_start)
     values ($1, $2, $3, $4, $5, $6, $7::date)
     on conflict (lti_iss, lti_context_id) do update set
       truflex = excluded.truflex, course_level = excluded.course_level,
       pitch_default = excluded.pitch_default, ai_disclosure = excluded.ai_disclosure,
       course_start = excluded.course_start, updated_at = now()
     returning lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure, course_start::text, updated_at::text`,
    [iss, contextId, input.truflex, input.course_level, input.pitch_default, input.ai_disclosure, input.course_start]
  );
  return rows[0]!;
}

/**
 * What the instructor can see about one learner: the single source for every
 * learner-facing statement about it (the disclosure, the Tutorials card, My
 * learning, About you and the feedback box), so they cannot drift apart.
 *
 * It must match what the tool actually shows instructors: the per-session
 * report lists each run with the learner's name, mastery, sticking points,
 * ratings and feedback comments (routes.ts, getTutorialReport); the Concepts
 * tab and the CSV export carry no names; no instructor route returns a
 * transcript, an About you profile or a learner's own My learning list.
 * Change this text only together with that behaviour.
 */
export interface InstructorVisibility {
  /** One paragraph for the disclosure. */
  full: string;
  /** One clause for the Tutorials card, after "You get a summary at the end;". */
  short: string;
  /** The note on the feedback comment box. */
  feedback: string;
  /** The note on My learning. */
  learning: string;
  /** The note on About you. */
  profile: string;
}

export function instructorVisibility(d: Delivery): InstructorVisibility {
  const patterns = d.hasCohort
    ? 'They also see, without names, which ideas the class finds hard.'
    : 'They also see, without names, which ideas learners find hard, and use that to revise the course.';
  return {
    full: `Your instructor's report lists each session you finish with your name: its summary (what you showed you understand and where you got stuck), your ratings and your feedback comments. ${patterns} The conversation itself, what you write under *About you* and your *My learning* list are not shown to your instructor.`,
    short: 'your instructor sees it with your name, but not the conversation itself.',
    feedback: 'optional; your instructor sees it with your name',
    learning: 'Your instructor does not see this list, only counts per idea across the course, without names.',
    profile: "Everything here is optional, and your instructor can't see it.",
  };
}

/**
 * What learners are told about the tutor, unless the course sets its own
 * text (course_settings.ai_disclosure). Markdown; mode-aware wording.
 */
export function defaultAiDisclosure(toolName: string, d: Delivery): string {
  return [
    `**${toolName} is an AI tutor.** It follows a brief your instructor wrote and asks questions rather than giving answers, so you do the thinking. It can be wrong: your course materials and your instructor are the authority, and nothing here is a grade.`,
    `**What it keeps.** The text of each session, a short summary of each session, what you have shown you understand (see *My learning*), your ratings and comments, and anything you enter under *About you*. You can delete all of it from this page at any time.`,
    `**What your instructor sees.** ${instructorVisibility(d).full}`,
    `**Voice.** If you use *Speak*, your browser sends your audio to its maker's speech service (Google for Chrome and Edge, Apple for Safari) to turn it into text; this tool only ever receives the text. Typing is always available and works everywhere, including with no microphone.`,
    `**Where your words go.** To write its replies, the tool sends the session text and your *About you* notes to the AI service your institution has configured. The session text is kept only as long as your institution's retention setting allows.`,
  ].join('\n\n');
}

export function courseCtxFromSettings(iss: string, contextId: string, title: string, settings: CourseSettings): CourseCtx {
  return { iss, contextId, title, settings, delivery: deliveryOf(settings.truflex) };
}

/**
 * Build the CourseCtx for a validated launch token. On a first launch the
 * custom parameter `truflex` (set by a Moodle course template or by the
 * instructor on the External tool activity) seeds the course's mode.
 */
export async function courseCtxFromToken(token: IdToken): Promise<CourseCtx> {
  const iss = token.iss;
  const contextId = contextIdOf(token);
  const title = token.platformContext.context?.title || '';
  const truflex = parseTruFlex(token.platformContext.custom?.truflex);
  const courseStart = parseCourseStart(token.platformContext.custom?.course_start);
  const settings = truflex !== null || courseStart !== null
    ? await ensureCourseSettings(iss, contextId, { truflex, courseStart })
    : await getCourseSettings(iss, contextId);
  return courseCtxFromSettings(iss, contextId, title, settings);
}

/**
 * A course start from a custom parameter: an ISO date, or the Unix
 * timestamp Moodle substitutes for $CourseSection.timeFrame.begin.
 */
export function parseCourseStart(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{9,13}$/.test(v)) {
    const ms = v.length > 10 ? Number(v) : Number(v) * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) && d.getFullYear() > 2000 ? d.toISOString().slice(0, 10) : null;
  }
  return null;
}
