/**
 * Per-course settings (course_settings): the TRUFlex delivery mode and the
 * course-wide defaults that hang off it. Also builds the CourseCtx that every
 * request carries, so the delivery object is loaded once per request and
 * threaded through prompts, routes and the launch page.
 */

import type { IdToken } from 'ltijs';
import { z } from 'zod';
import { query } from './db.js';
import { contextIdOf } from './reqctx.js';
import { deliveryOf, DEFAULT_TRUFLEX, parseTruFlex, type Delivery } from './delivery.js';

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
  /** null when the course has no row yet (defaults are in effect). */
  updated_at: string | null;
}

export const CourseSettingsInput = z.object({
  truflex: z.number().int().min(1).max(10),
  course_level: z.enum(['abe', 'undergraduate', 'graduate']).nullable().default(null),
  pitch_default: z.string().trim().max(500).default(''),
  ai_disclosure: z.string().trim().max(4000).default(''),
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
  return { lti_iss: iss, lti_context_id: contextId, truflex, course_level: null, pitch_default: '', ai_disclosure: '', updated_at: null };
}

export async function getCourseSettings(iss: string, contextId: string): Promise<CourseSettings> {
  const rows = await query<CourseSettings>(
    `select lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure, updated_at::text
     from course_settings where lti_iss = $1 and lti_context_id = $2`,
    [iss, contextId]
  );
  return rows[0] ?? defaultCourseSettings(iss, contextId);
}

/**
 * Create the row if the course has none, seeded from the LTI custom
 * parameter `truflex` when a Moodle course template sets it. Never overrides
 * a mode the instructor has already chosen.
 */
export async function ensureCourseSettings(iss: string, contextId: string, initialTruflex: number | null): Promise<CourseSettings> {
  if (initialTruflex !== null) {
    await query(
      `insert into course_settings (lti_iss, lti_context_id, truflex) values ($1, $2, $3)
       on conflict (lti_iss, lti_context_id) do nothing`,
      [iss, contextId, initialTruflex]
    );
  }
  return getCourseSettings(iss, contextId);
}

export async function upsertCourseSettings(iss: string, contextId: string, input: CourseSettingsInput): Promise<CourseSettings> {
  const rows = await query<CourseSettings>(
    `insert into course_settings (lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (lti_iss, lti_context_id) do update set
       truflex = excluded.truflex, course_level = excluded.course_level,
       pitch_default = excluded.pitch_default, ai_disclosure = excluded.ai_disclosure, updated_at = now()
     returning lti_iss, lti_context_id, truflex, course_level, pitch_default, ai_disclosure, updated_at::text`,
    [iss, contextId, input.truflex, input.course_level, input.pitch_default, input.ai_disclosure]
  );
  return rows[0]!;
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
  const initial = parseTruFlex(token.platformContext.custom?.truflex);
  const settings = initial !== null
    ? await ensureCourseSettings(iss, contextId, initial)
    : await getCourseSettings(iss, contextId);
  return courseCtxFromSettings(iss, contextId, title, settings);
}
