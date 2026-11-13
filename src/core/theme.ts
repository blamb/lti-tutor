/**
 * Reading a Moodle theme from outside, and turning it into this suite's
 * colour tokens.
 *
 * The tools run in a cross-site iframe and the LTI launch carries nothing
 * about the theme, so the look is read the way a browser would get it:
 * Moodle serves every installed theme's compiled stylesheet publicly at
 * /theme/styles.php/<theme>/<rev>/all. A public page (the login page) names
 * the site's default theme and the revision. From the stylesheet only a
 * handful of values are taken: the brand colour, the page background and
 * text colour, and the font. Nothing from Moodle's CSS is loaded into the
 * tool's page.
 *
 * Which theme a course uses is a separate question (theme-store.ts): the
 * site default, the course's own theme read through web services, or the
 * instructor's pick.
 *
 * Every value that reaches the page is rebuilt here (colours as #rrggbb,
 * font names from a strict character set), never passed through, and every
 * text/background pair is brought to at least 4.5:1.
 */

import { platformUrl } from './outbound.js';
import type { WsClient } from './moodle-ws.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// ─── Colour arithmetic ───────────────────────────────────────────────────────

export type Rgb = [number, number, number];

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };

/** #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() with integer channels. Anything else is null. */
export function parseColor(input: string): Rgb | null {
  const s = (NAMED[input.trim().toLowerCase()] ?? input).trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16)) as Rgb;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)) as Rgb;
  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map((n) => Number(n));
    return rgb.every((n) => n <= 255) ? (rgb as Rgb) : null;
  }
  return null;
}

export function toHex(rgb: Rgb): string {
  return '#' + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` of b mixed into a (0 = a, 1 = b). */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return a.map((v, i) => v + (b[i]! - v) * amount) as Rgb;
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** Darken `c` in small steps until it reaches `ratio` against every background. */
function darkenUntil(c: Rgb, backgrounds: Rgb[], ratio = 4.5): Rgb {
  let out = c;
  for (let i = 0; i < 40 && backgrounds.some((bg) => contrast(out, bg) < ratio); i++) out = mix(out, BLACK, 0.06);
  return out;
}

// ─── What is read from a stylesheet ──────────────────────────────────────────

/** The few values taken from a theme's stylesheet. Colours are #rrggbb. */
export interface RawTheme {
  primary: string;
  bodyBg: string | null;
  bodyColor: string | null;
  /** Font family names, in order, unquoted. */
  fonts: string[];
}

const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded']);

/** A font-family list reduced to names made of letters, digits, spaces, hyphens and underscores. */
export function cleanFontList(value: string): string[] {
  const out: string[] = [];
  for (const part of value.split(',')) {
    const name = part.trim().replace(/^["']|["']$/g, '').trim();
    if (!/^-?[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(name)) continue;
    if (!out.some((f) => f.toLowerCase() === name.toLowerCase())) out.push(name);
    if (out.length >= 8) break;
  }
  return out;
}

function firstVar(css: string, names: string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`--${name}:\\s*([^;}]{1,200})`).exec(css);
    if (m) return m[1]!.trim();
  }
  return null;
}

function firstColorVar(css: string, names: string[]): string | null {
  const v = firstVar(css, names);
  const rgb = v ? parseColor(v) : null;
  return rgb ? toHex(rgb) : null;
}

/** The background colour of the last rule that styles `body` itself (custom SCSS comes last). */
function bodyBackground(css: string): string | null {
  let found: string | null = null;
  const rule = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    const sel = m[1]!;
    if (!sel.includes('body')) continue;
    if (!sel.split(',').some((s) => s.trim() === 'body')) continue;
    const decl = /(?:^|;)\s*background(?:-color)?:\s*([^;!]+)/.exec(m[2]!);
    const rgb = decl ? parseColor(decl[1]!.trim()) : null;
    if (rgb) found = toHex(rgb);
  }
  return found;
}

/**
 * Pull the brand values out of a compiled Moodle stylesheet. Bootstrap 5
 * themes (Moodle 5) publish --bs-* variables, Bootstrap 4 themes (Moodle 4)
 * the unprefixed ones. Returns null when no brand colour can be found, which
 * means the theme is not one this reader understands.
 */
export function parseThemeCss(css: string): RawTheme | null {
  const primary = firstColorVar(css, ['bs-primary', 'primary']);
  if (!primary) return null;
  const font = firstVar(css, ['bs-font-sans-serif', 'font-family-sans-serif']);
  return {
    primary,
    bodyBg: bodyBackground(css) ?? firstColorVar(css, ['bs-body-bg']),
    bodyColor: firstColorVar(css, ['bs-body-color']),
    fonts: font ? cleanFontList(font) : [],
  };
}

// ─── Tokens for the tools ────────────────────────────────────────────────────

/** The tools' own light palette (launch.html). A theme changes some of these; the rest stay. */
const BASE = {
  bg: '#f5f6f8', fg: '#1a1a1a', muted: '#5b5f66', card: '#ffffff', surface2: '#eef0f3', hover: '#f0f3f7',
};
const SYSTEM_FONTS = ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto'];

export interface ThemeTokens {
  bg: string; fg: string; muted: string;
  accent: string; accentFg: string; accentSoft: string; focus: string;
  /** A complete font-family value, or '' to keep the tool's own. */
  font: string;
}

const hex = (s: string): Rgb => parseColor(s)!;

/**
 * The tool's tokens for a theme. The brand colour is darkened until it reads
 * at 4.5:1 as text on the page, on a card and on its own soft tint, which
 * also makes white text on it readable. A dark page background is not
 * followed: the tools stay light and only the accent and font change.
 */
export function buildTokens(raw: RawTheme): ThemeTokens {
  const card = hex(BASE.card);
  const rawBg = raw.bodyBg ? parseColor(raw.bodyBg) : null;
  const bg = rawBg && luminance(rawBg) >= 0.7 ? rawBg : hex(BASE.bg);
  const surfaces = [bg, card, hex(BASE.surface2), hex(BASE.hover)];

  const rawFg = raw.bodyColor ? parseColor(raw.bodyColor) : null;
  const fg = rawFg && surfaces.every((s) => contrast(rawFg, s) >= 7) ? rawFg : hex(BASE.fg);
  const muted = darkenUntil(hex(BASE.muted), surfaces);

  let accent = darkenUntil(hex(raw.primary), surfaces);
  let soft = mix(accent, WHITE, 0.88);
  for (let i = 0; i < 10 && (contrast(accent, soft) < 4.5 || contrast(fg, soft) < 4.5); i++) {
    accent = mix(accent, BLACK, 0.06);
    soft = mix(accent, WHITE, 0.9);
  }
  const accentFg = contrast(WHITE, accent) >= 4.5 ? WHITE : hex(BASE.fg);

  // The theme's named fonts, then the tool's own stack, then one generic family last.
  const isGeneric = (f: string) => GENERIC_FONTS.has(f.toLowerCase());
  const fonts = raw.fonts.filter((f) => !isGeneric(f));
  for (const f of SYSTEM_FONTS) if (!isGeneric(f) && !fonts.some((x) => x.toLowerCase() === f.toLowerCase())) fonts.push(f);
  fonts.push(raw.fonts.find((f) => f.toLowerCase() === 'serif') ? 'serif' : 'sans-serif');
  const font = raw.fonts.length ? fonts.map((f) => (/^-?[A-Za-z][A-Za-z0-9-]*$/.test(f) ? f : `"${f}"`)).join(', ') : '';

  return {
    bg: toHex(bg), fg: toHex(fg), muted: toHex(muted),
    accent: toHex(accent), accentFg: toHex(accentFg), accentSoft: toHex(soft), focus: toHex(accent),
    font,
  };
}

/** The style rule that puts a theme's tokens over the tool's own. */
export function themeCss(t: ThemeTokens): string {
  const decls = [
    'color-scheme:light',
    `--bg:${t.bg}`, `--fg:${t.fg}`, `--muted:${t.muted}`, `--muted-2:${t.muted}`,
    `--accent:${t.accent}`, `--accent-fg:${t.accentFg}`, `--accent-soft:${t.accentSoft}`, `--focus:${t.focus}`,
  ];
  if (t.font) decls.push(`font-family:${t.font}`);
  return `:root{${decls.join(';')}}`;
}

/**
 * Put a theme into a launch page: mark <html> (which also switches off the
 * page's dark palette, since Moodle stays light) and add the override rule
 * as the last thing in <head>.
 */
export function applyThemeToHtml(html: string, theme: { name: string; tokens: ThemeTokens } | null): string {
  if (!theme) return html;
  const head = html.indexOf('</head>');
  const open = html.indexOf('<html');
  if (head < 0 || open < 0 || open > head) return html;
  const withStyle = html.slice(0, head) + `<style id="course-theme">${themeCss(theme.tokens)}</style>\n` + html.slice(head);
  const name = /^[a-z][a-z0-9_]*$/.test(theme.name) ? theme.name : 'theme';
  return withStyle.slice(0, open + 5) + ` data-course-theme="${name}"` + withStyle.slice(open + 5);
}

// ─── Reading a site ──────────────────────────────────────────────────────────

export const THEME_NAME = /^[a-z][a-z0-9_]{0,60}$/;

/** What a public Moodle page says about the site's look. */
export interface SiteProbe {
  /** The site's default theme. */
  theme: string;
  /** The stylesheet path for any theme, with {theme} where its name goes. */
  cssPath: string;
}

/** Find the default theme and the stylesheet address pattern in a Moodle page's HTML. */
export function parseSitePage(html: string): SiteProbe | null {
  const href = /href="([^"]*\/theme\/styles\.php[^"]*)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!href) return null;
  const path = href.slice(href.indexOf('/theme/styles.php'));
  // Slash arguments (the default): /theme/styles.php/<theme>/<rev>/all
  let m = /^\/theme\/styles\.php\/([a-z][a-z0-9_]*)\/([0-9_-]+)\/all(?:-rtl)?$/.exec(path);
  if (m) return { theme: m[1]!, cssPath: `/theme/styles.php/{theme}/${m[2]}/all` };
  // Without slash arguments: /theme/styles.php?theme=<theme>&rev=<rev>&type=all
  m = /^\/theme\/styles\.php\?(.+)$/.exec(path);
  if (m) {
    const q = new URLSearchParams(m[1]!);
    const theme = q.get('theme') ?? '';
    const rev = q.get('rev') ?? '';
    if (THEME_NAME.test(theme) && /^[0-9_-]+$/.test(rev)) return { theme, cssPath: `/theme/styles.php?theme={theme}&rev=${rev}&type=all` };
  }
  return null;
}

const MAX_CSS_BYTES = 12 * 1024 * 1024;

/** GET a path on the Moodle site, following redirects only while they stay on that site. */
async function siteGet(wwwroot: string, path: string, fetchImpl: FetchLike, timeoutMs: number): Promise<Response | null> {
  const root = new URL(wwwroot.replace(/\/+$/, '') + '/');
  let url = new URL(path.replace(/^\//, ''), root).toString();
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(platformUrl(url), { redirect: 'manual', headers: { accept: 'text/html,text/css,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return null;
    }
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get('location');
    if (!loc) return null;
    const next = new URL(loc, url);
    if (next.hostname !== root.hostname) return null;
    next.protocol = root.protocol;
    next.port = root.port;
    url = next.toString();
  }
  return null;
}

/** Ask the site which theme is its default. Tries pages that Moodle renders without a login. */
export async function probeSite(wwwroot: string, fetchImpl: FetchLike = fetch): Promise<SiteProbe | null> {
  for (const path of ['/login/index.php?noredirect=1', '/login/forgot_password.php']) {
    const res = await siteGet(wwwroot, path, fetchImpl, 15_000);
    if (!res || !res.ok) continue;
    const probe = parseSitePage(await res.text());
    if (probe) return probe;
  }
  return null;
}

/** Fetch and read one theme's stylesheet. null when the site has no such theme or it cannot be read. */
export async function fetchTheme(wwwroot: string, site: SiteProbe, theme: string, fetchImpl: FetchLike = fetch): Promise<RawTheme | null> {
  if (!THEME_NAME.test(theme)) return null;
  const res = await siteGet(wwwroot, site.cssPath.replace('{theme}', theme), fetchImpl, 60_000);
  if (!res || !res.ok) return null;
  if (Number(res.headers.get('content-length') ?? 0) > MAX_CSS_BYTES) return null;
  const css = await res.text();
  if (css.length > MAX_CSS_BYTES) return null;
  return parseThemeCss(css);
}

/** Themes worth asking a site about when the instructor wants to pick one. The site default is always added. */
export const COMMON_THEMES = [
  'boost', 'classic', 'boost_union', 'moove', 'adaptable', 'snap', 'fordson', 'academi', 'klass', 'eguru',
  'lambda', 'lambda2', 'remui', 'edumy', 'space', 'trema', 'degrade', 'almondb', 'pimenko', 'learnr',
  'boost_campus', 'mb2nl', 'workplace', 'essential', 'school',
];

/** "boost_union" -> "Boost Union". */
export function themeLabel(name: string): string {
  return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── The course's own theme, through web services ────────────────────────────

export const WS_THEME_FUNCTION = 'core_course_get_courses_by_field';

/**
 * The theme set on a course (or, failing that, on its category chain), read
 * with the course's web-service token. '' means none is set, so the site
 * default applies. null means Moodle would not say: the service does not
 * allow the function, or the account cannot see the field.
 */
export async function courseThemeViaWs(client: WsClient, courseId: string): Promise<string | null> {
  let course: { theme?: string; categoryid?: number } | undefined;
  try {
    const r = await client.call<{ courses?: Array<{ theme?: string; categoryid?: number }> }>(WS_THEME_FUNCTION, { field: 'id', value: courseId });
    course = r.courses?.[0];
  } catch {
    return null;
  }
  if (!course || typeof course.theme !== 'string') return null;
  if (course.theme) return THEME_NAME.test(course.theme) ? course.theme : null;
  // No theme on the course itself: a category can force one on its courses.
  let categoryId = course.categoryid;
  try {
    for (let depth = 0; depth < 8 && categoryId; depth++) {
      const cats = await client.call<Array<{ id: number; parent?: number; theme?: string }>>('core_course_get_categories', {
        criteria: [{ key: 'id', value: categoryId }], addsubcategories: 0,
      });
      const cat = cats?.[0];
      if (!cat) break;
      if (cat.theme && THEME_NAME.test(cat.theme)) return cat.theme;
      categoryId = cat.parent;
    }
  } catch {
    // Categories are a refinement; without them the course's own answer stands.
  }
  return '';
}
