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
