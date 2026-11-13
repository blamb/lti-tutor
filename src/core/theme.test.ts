import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, toHex, contrast, cleanFontList, parseThemeCss, buildTokens, themeCss, applyThemeToHtml,
  parseSitePage, probeSite, fetchTheme, courseThemeViaWs, themeLabel, type Rgb,
} from './theme.js';
import type { WsClient } from './moodle-ws.js';

const rgb = (s: string) => parseColor(s) as Rgb;

// A Moodle 5 (Bootstrap 5) stylesheet in miniature: light variables first, a dark set later, custom SCSS last.
const BS5 = `:root{--bs-blue:#0f6cbf;--bs-primary:#257b8a;--bs-font-sans-serif:"Adelle Sans", "Segoe UI", -apple-system, sans-serif;--bs-body-color:#1d2125;--bs-body-bg:#ffffff;--bs-link-color:#185665}
[data-bs-theme=dark]{--bs-body-color:#dee2e6;--bs-body-bg:#1d2125}
body{margin:0;color:var(--bs-body-color);background-color:var(--bs-body-bg)}
.navbar.fixed-top{background-color:#003447!important}
body,#page,#page.drawers,#page-wrapper{background-color:#f2f1ec}
.course-content .activity-item:hover{background-color:#000000}`;

// Moodle 4 (Bootstrap 4): unprefixed variables, no body variables.
const BS4 = `:root{--blue:#0f6cbf;--primary:#0f6cbf;--font-family-sans-serif:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto;}body{background-color:#fff;color:#1d2125}`;

test('parseColor reads hex and rgb forms and refuses anything else', () => {
  assert.deepEqual(parseColor('#FFF'), [255, 255, 255]);
  assert.deepEqual(parseColor('#257b8a'), [37, 123, 138]);
  assert.deepEqual(parseColor('#257b8aff'), [37, 123, 138]);
  assert.deepEqual(parseColor('rgb(0, 52, 71)'), [0, 52, 71]);
  assert.deepEqual(parseColor('rgba(0,52,71,.5)'), [0, 52, 71]);
  assert.equal(parseColor('var(--x)'), null);
  assert.equal(parseColor('red;}</style><script>'), null);
  assert.equal(parseColor('rgb(300,0,0)'), null);
  assert.equal(toHex([37, 123, 138]), '#257b8a');
});

test('parseThemeCss takes the light values, and the page background from the last body rule', () => {
  const t = parseThemeCss(BS5);
  assert.deepEqual(t, { primary: '#257b8a', bodyBg: '#f2f1ec', bodyColor: '#1d2125', fonts: ['Adelle Sans', 'Segoe UI', '-apple-system', 'sans-serif'] });
});

test('parseThemeCss reads a Bootstrap 4 theme and gives null when there is no brand colour', () => {
  const t = parseThemeCss(BS4);
  assert.equal(t?.primary, '#0f6cbf');
  assert.equal(t?.bodyBg, '#ffffff');
  assert.deepEqual(t?.fonts, ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto']);
  assert.equal(parseThemeCss('body{color:red}'), null);
});

test('cleanFontList drops anything that is not a plain font name', () => {
  assert.deepEqual(cleanFontList(`"Open Sans", x;}body{display:none}, url(evil), 'Lato', sans-serif`), ['Open Sans', 'Lato', 'sans-serif']);
});

test('buildTokens keeps every text and background pair at 4.5:1 or better', () => {
  for (const primary of ['#257b8a', '#003143', '#ffc107', '#ffffff', '#00e5ff', '#ff69b4', '#000000']) {
    for (const bodyBg of ['#f2f1ec', '#ffffff', '#1d2125', null]) {
      const t = buildTokens({ primary, bodyBg, bodyColor: '#1d2125', fonts: [] });
      const where = `${primary} on ${bodyBg}`;
      for (const bg of [t.bg, '#ffffff', t.accentSoft, '#eef0f3']) assert.ok(contrast(rgb(t.accent), rgb(bg)) >= 4.5, `accent on ${bg} for ${where}`);
      assert.ok(contrast(rgb(t.accentFg), rgb(t.accent)) >= 4.5, `button text for ${where}`);
      assert.ok(contrast(rgb(t.fg), rgb(t.bg)) >= 7, `body text for ${where}`);
      assert.ok(contrast(rgb(t.fg), rgb(t.accentSoft)) >= 4.5, `text on the soft tint for ${where}`);
      assert.ok(contrast(rgb(t.muted), rgb(t.bg)) >= 4.5, `muted text for ${where}`);
    }
  }
});

test('buildTokens leaves a readable brand colour alone and does not follow a dark page', () => {
  const t = buildTokens({ primary: '#003143', bodyBg: '#1d2125', bodyColor: '#dee2e6', fonts: ['OpenSans', 'sans-serif'] });
  assert.equal(t.accent, '#003143');
  assert.equal(t.accentFg, '#ffffff');
  assert.equal(t.bg, '#f5f6f8');
  assert.equal(t.fg, '#1a1a1a');
  assert.equal(t.font, 'OpenSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
  assert.equal(buildTokens({ primary: '#003143', bodyBg: null, bodyColor: null, fonts: [] }).font, '');
});

test('applyThemeToHtml marks <html> and adds one rule at the end of <head>', () => {
  const page = '<!doctype html>\n<html lang="en">\n<head><style>:root{--accent:#0b5fa8}</style>\n</head><body>const x = "</head>";</body></html>';
  const tokens = buildTokens(parseThemeCss(BS5)!);
  const out = applyThemeToHtml(page, { name: 'boost', tokens });
  assert.ok(out.includes('<html data-course-theme="boost" lang="en">'));
  assert.equal(out.split('<style id="course-theme">').length, 2);
  assert.ok(out.indexOf('<style id="course-theme">') > out.indexOf('--accent:#0b5fa8'));
  assert.ok(out.indexOf('<style id="course-theme">') < out.indexOf('<body>'));
  assert.ok(themeCss(tokens).startsWith(':root{color-scheme:light;--bg:#f2f1ec;'));
  assert.equal(applyThemeToHtml(page, null), page);
});

test('parseSitePage finds the default theme with and without slash arguments', () => {
  const slash = '<link rel="stylesheet" type="text/css" href="https://m.example/theme/yui_combo.php?x" /><link rel="stylesheet" href="https://m.example/theme/styles.php/boost_union/1794532182_1/all" />';
  assert.deepEqual(parseSitePage(slash), { theme: 'boost_union', cssPath: '/theme/styles.php/{theme}/1794532182_1/all' });
  const query = '<link rel="stylesheet" href="https://m.example/theme/styles.php?theme=classic&amp;rev=17&amp;type=all" />';
  assert.deepEqual(parseSitePage(query), { theme: 'classic', cssPath: '/theme/styles.php?theme={theme}&rev=17&type=all' });
  assert.equal(parseSitePage('<html>SSO login</html>'), null);
});

function fakeSite(pages: Record<string, { status?: number; body?: string; location?: string }>) {
  const seen: string[] = [];
  const fetchImpl = async (url: string) => {
    seen.push(url);
    const u = new URL(url);
    const page = pages[u.pathname + u.search] ?? { status: 404, body: 'not found' };
    return new Response(page.location ? null : page.body ?? '', { status: page.status ?? 200, headers: page.location ? { location: page.location } : {} });
  };
  return { fetchImpl, seen };
}

test('probeSite and fetchTheme read a site, stay on it, and report a missing theme as null', async () => {
  const login = '<link rel="stylesheet" href="https://m.example/moodle/theme/styles.php/boost_union/5_1/all" />';
  const { fetchImpl, seen } = fakeSite({
    '/moodle/login/index.php?noredirect=1': { status: 303, location: 'https://sso.example/login' },
    '/moodle/login/forgot_password.php': { status: 302, location: '/moodle/login/forgot.php' },
    '/moodle/login/forgot.php': { body: login },
    '/moodle/theme/styles.php/boost/5_1/all': { body: BS5 },
  });
  const site = await probeSite('https://m.example/moodle/', fetchImpl);
  assert.deepEqual(site, { theme: 'boost_union', cssPath: '/theme/styles.php/{theme}/5_1/all' });
  assert.ok(!seen.some((u) => u.includes('sso.example')), 'a redirect off the site is not followed');
  assert.equal((await fetchTheme('https://m.example/moodle', site!, 'boost', fetchImpl))?.primary, '#257b8a');
  assert.equal(await fetchTheme('https://m.example/moodle', site!, 'nosuch', fetchImpl), null);
  assert.equal(await fetchTheme('https://m.example/moodle', site!, '../etc', fetchImpl), null);
});

function fakeWs(answers: Record<string, (params: Record<string, unknown>) => unknown>): WsClient {
  return {
    wwwroot: 'https://m.example',
    async call<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
      const a = answers[fn];
      if (!a) throw new Error(`${fn} not allowed`);
      return a(params) as T;
    },
    async download() { return Buffer.alloc(0); },
  };
}

test('courseThemeViaWs: the course theme, then the category chain, then none; null when Moodle will not say', async () => {
  assert.equal(await courseThemeViaWs(fakeWs({ core_course_get_courses_by_field: () => ({ courses: [{ theme: 'boost', categoryid: 3 }] }) }), '14'), 'boost');
  const cats: Record<number, { id: number; parent: number; theme: string }> = { 3: { id: 3, parent: 1, theme: '' }, 1: { id: 1, parent: 0, theme: 'classic' } };
  const viaCategory = fakeWs({
    core_course_get_courses_by_field: () => ({ courses: [{ theme: '', categoryid: 3 }] }),
    core_course_get_categories: (p) => [cats[(p.criteria as Array<{ value: number }>)[0]!.value]],
  });
  assert.equal(await courseThemeViaWs(viaCategory, '14'), 'classic');
  assert.equal(await courseThemeViaWs(fakeWs({ core_course_get_courses_by_field: () => ({ courses: [{ theme: '', categoryid: 3 }] }) }), '14'), '');
  // A student-level token gets the course without the theme field.
  assert.equal(await courseThemeViaWs(fakeWs({ core_course_get_courses_by_field: () => ({ courses: [{ categoryid: 3 }] }) }), '14'), null);
  assert.equal(await courseThemeViaWs(fakeWs({}), '14'), null);
});

test('themeLabel', () => {
  assert.equal(themeLabel('boost_union'), 'Boost Union');
});
