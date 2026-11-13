/**
 * Which theme a course gets, and the routes an instructor uses to change it.
 *
 * Order of preference for a course in 'auto' mode: the theme Moodle reports
 * for the course through its web-service token (when the course has one and
 * the service allows the lookup), otherwise the site's default theme. An
 * instructor can instead pick one of the site's themes, or switch the
 * course back to the tool's own look.
 *
 * Everything read from Moodle is cached in theme_cache and refreshed in the
 * background, so a launch only waits the first time a site or theme is seen,
 * and never longer than LAUNCH_BUDGET_MS.
 */

import type { Express, Request, Response } from 'express';
import { query } from './db.js';
import { gateTeacher, contextIdOf } from './reqctx.js';
import { wsClient } from './moodle-ws.js';
import {
  buildTokens, themeCss, themeLabel, probeSite, fetchTheme, courseThemeViaWs, COMMON_THEMES, THEME_NAME,
  type RawTheme, type SiteProbe, type ThemeTokens,
} from './theme.js';

const FRESH_MS = 12 * 3600_000;
const MISS_FRESH_MS = 10 * 60_000;
const LAUNCH_BUDGET_MS = 3500;

export type ThemeMode = 'auto' | 'picked' | 'off';
export interface AppliedTheme { name: string; label: string; source: 'picked' | 'ws' | 'site'; tokens: ThemeTokens; css: string }

/** A course's web-service token, when the app keeps one. */
export type WsTokenFn = (iss: string, contextId: string) => Promise<string | null>;

// ─── Cache ───────────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

/**
 * A cached read of something on the Moodle site. A stale entry is returned
 * at once and refreshed behind it; only a missing entry is waited for. A
 * failed read (null) is remembered briefly so a broken site is not asked on
 * every launch.
 */
async function cached<T>(iss: string, key: string, load: () => Promise<T | null>, force = false): Promise<T | null> {
  const refresh = (): Promise<T | null> => {
    const id = `${iss}\n${key}`;
    const running = inflight.get(id) as Promise<T | null> | undefined;
    if (running) return running;
    const p = (async () => {
      const data = await load().catch(() => null);
      await query(
        `insert into theme_cache (lti_iss, key, data) values ($1, $2, $3::jsonb)
         on conflict (lti_iss, key) do update set data = excluded.data, fetched_at = now()`,
        [iss, key, JSON.stringify(data)]
      );
      return data;
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  };
  if (force) return refresh();
  const rows = await query<{ data: T | null; age_ms: number }>(
    `select data, (extract(epoch from now() - fetched_at) * 1000)::float8 as age_ms from theme_cache where lti_iss = $1 and key = $2`,
    [iss, key]
  );
  const row = rows[0];
  if (!row) return refresh();
  if (row.age_ms > (row.data === null ? MISS_FRESH_MS : FRESH_MS)) void refresh().catch(() => {});
  return row.data;
}

const siteOf = (iss: string, force = false) => cached<SiteProbe>(iss, 'site', () => probeSite(iss), force);

async function rawTheme(iss: string, name: string, force = false): Promise<RawTheme | null> {
  if (!THEME_NAME.test(name)) return null;
  return cached<RawTheme>(iss, `theme:${name}`, async () => {
    const site = await siteOf(iss);
    return site ? fetchTheme(iss, site, name) : null;
  }, force);
}

/** The site's themes this reader can use, the default first. Asks the site about each common theme name. */
async function installedThemes(iss: string, force = false): Promise<string[]> {
  const list = await cached<string[]>(iss, 'installed', async () => {
    const site = await siteOf(iss, force);
    if (!site) return null;
    const names = [site.theme, ...COMMON_THEMES.filter((n) => n !== site.theme)];
    const found: string[] = [];
    // A few at a time: Moodle may have to compile a theme nobody has used yet.
    for (let i = 0; i < names.length; i += 4) {
      const batch = names.slice(i, i + 4);
      const raws = await Promise.all(batch.map((n) => rawTheme(iss, n, force)));
      batch.forEach((n, j) => { if (raws[j]) found.push(n); });
    }
    return found;
  }, force);
  return list ?? [];
}

// ─── A course's choice ───────────────────────────────────────────────────────

interface CourseThemeRow { mode: ThemeMode; picked_theme: string; ws_theme: string | null; ws_age_ms: number | null }

async function courseRow(iss: string, contextId: string): Promise<CourseThemeRow> {
  const rows = await query<CourseThemeRow>(
    `select mode, picked_theme, ws_theme, (extract(epoch from now() - ws_checked_at) * 1000)::float8 as ws_age_ms
       from course_theme where lti_iss = $1 and lti_context_id = $2`,
    [iss, contextId]
  );
  return rows[0] ?? { mode: 'auto', picked_theme: '', ws_theme: null, ws_age_ms: null };
}

async function saveChoice(iss: string, contextId: string, mode: ThemeMode, picked: string): Promise<void> {
  await query(
    `insert into course_theme (lti_iss, lti_context_id, mode, picked_theme) values ($1, $2, $3, $4)
     on conflict (lti_iss, lti_context_id) do update set mode = excluded.mode, picked_theme = excluded.picked_theme, updated_at = now()`,
    [iss, contextId, mode, picked]
  );
}

/** Ask Moodle which theme the course uses, at most once per FRESH_MS unless forced. null = Moodle would not say. */
async function wsTheme(iss: string, contextId: string, row: CourseThemeRow, wsToken: WsTokenFn | undefined, force: boolean): Promise<string | null> {
  if (!wsToken) return null;
  if (!force && row.ws_age_ms !== null && row.ws_age_ms < FRESH_MS) return row.ws_theme;
  const token = await wsToken(iss, contextId).catch(() => null);
  const found = token ? await courseThemeViaWs(wsClient(iss, token), contextId) : null;
  await query(
    `insert into course_theme (lti_iss, lti_context_id, ws_theme, ws_checked_at) values ($1, $2, $3, now())
     on conflict (lti_iss, lti_context_id) do update set ws_theme = excluded.ws_theme, ws_checked_at = now()`,
    [iss, contextId, found]
  );
  return found;
}

function applied(name: string, source: AppliedTheme['source'], raw: RawTheme): AppliedTheme {
  const tokens = buildTokens(raw);
  return { name, label: themeLabel(name), source, tokens, css: themeCss(tokens) };
}

/** The theme a course's pages should take, or null for the tool's own look. */
export async function resolveCourseTheme(iss: string, contextId: string, wsToken?: WsTokenFn, force = false): Promise<AppliedTheme | null> {
  const row = await courseRow(iss, contextId);
  if (row.mode === 'off') return null;
  if (row.mode === 'picked' && row.picked_theme) {
    const raw = await rawTheme(iss, row.picked_theme, force);
    if (raw) return applied(row.picked_theme, 'picked', raw);
  }
  const fromWs = await wsTheme(iss, contextId, row, wsToken, force);
  if (fromWs) {
    const raw = await rawTheme(iss, fromWs, force);
    if (raw) return applied(fromWs, 'ws', raw);
  }
  const site = await siteOf(iss, force);
  if (!site) return null;
  const raw = await rawTheme(iss, site.theme, force);
  return raw ? applied(site.theme, 'site', raw) : null;
}

/**
 * The theme for a launch. Never throws and never holds the page up for long:
 * past the budget the page goes out in the tool's own look while the reading
 * carries on and is cached for the next launch.
 */
export async function launchTheme(iss: string, contextId: string, wsToken?: WsTokenFn): Promise<AppliedTheme | null> {
  const work = resolveCourseTheme(iss, contextId, wsToken).catch((e) => {
    console.warn('[theme] could not resolve a course theme:', (e as Error).message);
    return null;
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), LAUNCH_BUDGET_MS); });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Instructor routes ───────────────────────────────────────────────────────

async function stateFor(iss: string, contextId: string, wsToken: WsTokenFn | undefined, force = false) {
  const theme = await resolveCourseTheme(iss, contextId, wsToken, force);
  const row = await courseRow(iss, contextId);
  const site = await siteOf(iss);
  return {
    mode: row.mode,
    picked_theme: row.picked_theme,
    site_theme: site?.theme ?? '',
    site_readable: !!site,
    /** Whether Moodle answered the per-course lookup (needs the web-service connection). */
    course_lookup: row.ws_theme !== null,
    can_lookup: !!wsToken,
    applied: theme,
  };
}

/**
 *   GET  /api/teacher/theme            the course's setting and the theme now applied
 *   GET  /api/teacher/theme/options    the site's themes, each with its tokens, for the picker
 *   PUT  /api/teacher/theme            { mode: 'auto' | 'picked' | 'off', theme? }
 *   POST /api/teacher/theme/refresh    read the site again now
 */
export function registerThemeRoutes(app: Express, opts: { wsToken?: WsTokenFn } = {}): void {
  const handle = (fn: (iss: string, contextId: string, req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const token = gateTeacher(res);
      if (!token) return;
      res.json(await fn(token.iss, contextIdOf(token), req));
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      if (status >= 500) console.error(`${req.method} ${req.path} failed:`, e);
      res.status(status).json({ error: (e as Error).message });
    }
  };
  const bad = (message: string) => Object.assign(new Error(message), { status: 400 });

  app.get('/api/teacher/theme', handle((iss, ctx) => stateFor(iss, ctx, opts.wsToken)));

  app.get('/api/teacher/theme/options', handle(async (iss) => {
    const names = await installedThemes(iss);
    const options = [];
    for (const name of names) {
      const raw = await rawTheme(iss, name);
      if (raw) options.push({ name, label: themeLabel(name), tokens: buildTokens(raw) });
    }
    return { options };
  }));

  app.put('/api/teacher/theme', handle(async (iss, ctx, req) => {
    const mode = String(req.body?.mode ?? '');
    if (mode !== 'auto' && mode !== 'picked' && mode !== 'off') throw bad('mode must be auto, picked or off.');
    let picked = '';
    if (mode === 'picked') {
      picked = String(req.body?.theme ?? '').trim().toLowerCase().replace(/\s+/g, '_');
      if (!THEME_NAME.test(picked)) throw bad('That is not a Moodle theme name. Use the short name, such as boost or classic.');
      if (!(await rawTheme(iss, picked))) throw bad(`This Moodle site has no readable theme called "${picked}".`);
    }
    await saveChoice(iss, ctx, mode, picked);
    return stateFor(iss, ctx, opts.wsToken);
  }));

  app.post('/api/teacher/theme/refresh', handle(async (iss, ctx) => {
    await query(`delete from theme_cache where lti_iss = $1 and key = 'installed'`, [iss]);
    return stateFor(iss, ctx, opts.wsToken, true);
  }));
}
