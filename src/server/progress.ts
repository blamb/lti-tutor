/**
 * Progression for the learner's home view, by delivery mode:
 *
 *   - "suggested next": tutorials whose suggested_after is done (all modes,
 *     advisory only — nothing is ever locked)
 *   - nudges: readiness checks not yet done, recall sessions whose source
 *     concepts have gone stale, reflections not yet done after completed
 *     concept tutorials (all modes, no dates where the course has none)
 *   - where hasFixedDates: tutorials grouped by week with "this week" first,
 *     and date-aware nudges ("due this week", "the cohort moved on")
 *
 * Everything keys on the delivery booleans, never on the TRUFlex number.
 */

import { query } from './db.js';
import type { CourseCtx } from './courses.js';
import type { Tutorial, TutorialSession } from './tutorials.js';

/** A concept untouched for this long counts as stale for recall nudges. */
export const STALE_DAYS = 21;

/** Week 1 begins on course_start; null when the course has no known start. */
export function currentWeek(courseStart: string | null, now: Date = new Date()): number | null {
  if (!courseStart) return null;
  const start = new Date(courseStart + 'T00:00:00Z').getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(1, Math.floor((now.getTime() - start) / (7 * 24 * 3600 * 1000)) + 1);
}

export interface HomeGroup {
  key: string;
  label: string;
  tutorial_ids: number[];
}

export interface Nudge {
  tutorial_id: number;
  kind: 'due' | 'moved_on' | 'readiness' | 'recall' | 'reflection' | 'assignment';
  text: string;
}

export interface HomeProgress {
  groups: HomeGroup[];
  nudges: Nudge[];
  suggested_next: number[];
  current_week: number | null;
}

function isDone(s: TutorialSession | undefined): boolean {
  return s?.status === 'completed';
}

function daysAgo(iso: string | null | undefined, now: Date): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now.getTime() - t) / 86_400_000 : Infinity;
}

/** Which earlier tutorials this learner's stale concepts came from. */
async function staleSources(studentId: number, ctx: CourseCtx, now: Date): Promise<{ tutorialIds: Set<number>; any: boolean }> {
  const rows = await query<{ tutorial_id: number | null }>(
    `select ts.tutorial_id
     from learner_model lm
     left join tutorial_session ts on ts.id = lm.source_tutorial_session_id
     where lm.student_id = $1 and lm.lti_iss = $2 and lm.lti_context_id = $3
       and lm.last_seen < $4::timestamptz - make_interval(days => $5)`,
    [studentId, ctx.iss, ctx.contextId, now.toISOString(), STALE_DAYS]
  );
  return { tutorialIds: new Set(rows.map((r) => r.tutorial_id).filter((x): x is number => x !== null)), any: rows.length > 0 };
}

export async function buildHomeProgress(params: {
  ctx: CourseCtx;
  studentId: number;
  tutorials: Tutorial[];
  latest: Map<number, TutorialSession>;
  now?: Date;
}): Promise<HomeProgress> {
  const { ctx, studentId, tutorials, latest } = params;
  const now = params.now ?? new Date();
  const d = ctx.delivery;
  const byId = new Map(tutorials.map((t) => [t.id, t]));
  const done = (t: Tutorial) => isDone(latest.get(t.id));

  // Suggested next: not done, and the one it follows is done.
  const suggestedNext = tutorials
    .filter((t) => !done(t) && t.suggested_after_tutorial_id !== null && byId.has(t.suggested_after_tutorial_id) && done(byId.get(t.suggested_after_tutorial_id)!))
    .map((t) => t.id);

  // Groups.
  const week = d.hasFixedDates ? currentWeek(ctx.settings.course_start, now) : null;
  const groups: HomeGroup[] = [];
  if (d.hasFixedDates) {
    const withWeek = tutorials.filter((t) => t.week !== null);
    const noWeek = tutorials.filter((t) => t.week === null);
    const weeks = [...new Set(withWeek.map((t) => t.week as number))].sort((a, b) => a - b);
    const order = week === null ? weeks : [...weeks.filter((w) => w === week), ...weeks.filter((w) => w > week), ...weeks.filter((w) => w < week)];
    for (const w of order) {
      const label = week === null ? `Week ${w}` : w === week ? `This week (week ${w})` : w > week ? `Week ${w}` : `Week ${w} (earlier)`;
      groups.push({ key: `week-${w}`, label, tutorial_ids: withWeek.filter((t) => t.week === w).map((t) => t.id) });
    }
    if (noWeek.length) groups.push({ key: 'any', label: groups.length ? 'Any time' : '', tutorial_ids: noWeek.map((t) => t.id) });
  } else {
    groups.push({ key: 'all', label: '', tutorial_ids: tutorials.map((t) => t.id) });
  }

  // Nudges. Advisory, capped, and worded for the mode.
  const nudges: Nudge[] = [];
  const title = (t: Tutorial) => t.title;

  if (d.hasFixedDates) {
    const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
    for (const t of tutorials) {
      if (done(t) || !t.due_at) continue;
      const due = new Date(t.due_at);
      if (due >= now && due <= weekEnd) nudges.push({ tutorial_id: t.id, kind: 'due', text: `${title(t)} is due ${due.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}.` });
      else if (due < now && daysAgo(t.due_at, now) < 14) nudges.push({ tutorial_id: t.id, kind: 'due', text: `${title(t)} was due ${due.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} and is still open.` });
    }
    if (d.hasCohort && week !== null) {
      for (const t of tutorials) {
        if (done(t) || t.week === null || t.week >= week || nudges.some((n) => n.tutorial_id === t.id)) continue;
        nudges.push({ tutorial_id: t.id, kind: 'moved_on', text: `The cohort has moved on from week ${t.week}: ${title(t)} is still open. Worth doing before next week.` });
        if (nudges.filter((n) => n.kind === 'moved_on').length >= 3) break;
      }
    }
  }

  // Readiness checks and assignment starts not yet done, where whatever they follow is done.
  for (const t of tutorials) {
    if ((t.kind !== 'readiness' && t.kind !== 'assignment_start') || done(t) || nudges.some((n) => n.tutorial_id === t.id)) continue;
    const after = t.suggested_after_tutorial_id !== null ? byId.get(t.suggested_after_tutorial_id) : undefined;
    if (after && !done(after)) continue;
    if (t.kind === 'assignment_start') {
      nudges.push({
        tutorial_id: t.id, kind: 'assignment',
        text: `Starting the assignment? ${title(t)} helps you unpack the task, connect it to the readings and take the first step. It writes nothing for you.`,
      });
      continue;
    }
    nudges.push({
      tutorial_id: t.id, kind: 'readiness',
      text: d.hasFixedDates && t.week !== null ? `A quick readiness check before week ${t.week}'s material: ${title(t)}.` : `A quick readiness check you haven't done yet: ${title(t)}. A few minutes before you start the next material.`,
    });
  }

  // Recall sessions whose source concepts have gone stale.
  const recalls = tutorials.filter((t) => t.kind === 'recall');
  if (recalls.length) {
    const stale = await staleSources(studentId, ctx, now);
    for (const t of recalls) {
      if (nudges.some((n) => n.tutorial_id === t.id)) continue;
      const s = latest.get(t.id);
      if (s?.status === 'completed' && daysAgo(s.completed_at, now) < STALE_DAYS) continue;
      const relevant = t.recall_tutorial_ids.length ? t.recall_tutorial_ids.some((id) => stale.tutorialIds.has(id)) : stale.any;
      if (!relevant) continue;
      nudges.push({
        tutorial_id: t.id, kind: 'recall',
        text: d.hasCohort && d.hasFixedDates
          ? `Some of what ${title(t)} revisits hasn't had a look for over three weeks. Bring it back before the cohort builds on it.`
          : `Some of what ${title(t)} revisits hasn't had a look for a while. A good moment to bring it back.`,
      });
    }
  }

  // Reflections not yet done since the last completed concept tutorial.
  const reflections = tutorials.filter((t) => t.kind === 'reflection');
  if (reflections.length) {
    const lastReflection = Math.max(0, ...reflections.map((t) => { const s = latest.get(t.id); return s?.status === 'completed' && s.completed_at ? new Date(s.completed_at).getTime() : 0; }));
    const conceptsSince = tutorials.filter((t) => t.kind === 'concept' && done(t) && new Date(latest.get(t.id)!.completed_at ?? 0).getTime() > lastReflection).length;
    if (conceptsSince > 0) {
      const t = reflections.find((r) => !done(r)) ?? reflections[0]!;
      if (!nudges.some((n) => n.tutorial_id === t.id)) {
        nudges.push({ tutorial_id: t.id, kind: 'reflection', text: `You've finished ${conceptsSince} session${conceptsSince === 1 ? '' : 's'} since you last reflected. ${title(t)} takes a few minutes and helps the next one stick.` });
      }
    }
  }

  return { groups, nudges: nudges.slice(0, 5), suggested_next: suggestedNext, current_week: week };
}
