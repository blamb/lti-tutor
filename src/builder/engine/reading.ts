/**
 * Readings to a Moodle restore file: the second kind of starter material.
 *
 * A module can be built from readings instead of a Word draft: a web page or
 * open textbook chapter, an uploaded file, or pasted text. Each reading
 * becomes one Book page. The page either carries the reading's text (when
 * the designer has the right to reuse it) or links to it, followed by the
 * practice activities drafted from it, then the attribution.
 *
 * Nothing here calls a model. The activities arrive already drafted and
 * reviewed; this file lays out the pages, re-checks every activity's
 * supporting quotation against the reading, and writes the backup and the
 * report.
 */

import { ACTIVITY_TYPES, LIB, checkActivity, librariesUsed, packageH5p } from './h5p.js';
import { buildMbz } from './mbz.js';
import { slug } from './pages.js';
import { cmp, pad } from './py.js';
import type { Activity, BuildOptions, BuildResult } from './index.js';

export interface Reading {
  /** Stable id within the module; activities name the reading they belong to. */
  id: number;
  title: string;
  /** Plain text with markdown-style headings (#), bullets (- ) and blank lines between paragraphs. */
  text: string;
  source_url: string;
  /** e.g. "CC BY 4.0"; empty when none was found. */
  license: string;
  attribution: string;
  /** true: the page carries the text. false: the page links to the reading and carries only the activities. */
  include_text: boolean;
}

export interface ReadingActivity extends Activity {
  /** The reading this activity was drafted from. */
  reading: number;
}

export interface ReadingModule {
  name: string;
  prefix?: string;
  readings: Reading[];
  activities: ReadingActivity[];
  /** One line shown above the activities on every page. */
  disclosure?: string;
  h5p_versions?: Record<string, string>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => esc(s).replace(/"/g, '&quot;');
const EMBED = (name: string): string => `<div class="h5p-placeholder" contenteditable="false">@@PLUGINFILE@@/${name}</div>`;
const TODO = (text: string): string =>
  '<div style="border-left:5px solid #b45309;background:#fff8e6;padding:1rem 1.25rem;margin:1.25rem 0;border-radius:.375rem">'
  + `<strong>To do before publishing:</strong> ${esc(text)}</div>`;

export const DEFAULT_DISCLOSURE = 'These practice activities were drafted with AI from the text of this reading and reviewed by the course team. They are not graded.';

/** Bare URLs in escaped text become links. */
function linkify(escaped: string): string {
  return escaped.replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g, (u) => `<a href="${u.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${u}</a>`);
}

/**
 * The reading's text as page HTML. Headings step down so the page title stays
 * the only top heading (# and ## become h4, ### h5, deeper h6); a first
 * heading that repeats the page title is dropped. Every character is escaped:
 * the text may be pasted by hand or scraped from any site.
 */
export function textToHtml(text: string, title = ''): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (para.length) { out.push(`<p>${linkify(esc(para.join(' ')))}</p>`); para = []; }
    if (list.length) { out.push('<ul>\n' + list.map((li) => `<li>${linkify(esc(li))}</li>`).join('\n') + '\n</ul>'); list = []; }
  };
  const same = (a: string, b: string): boolean => a.replace(/\W+/g, '').toLowerCase() === b.replace(/\W+/g, '').toLowerCase();
  let first = true;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const heading = h[2]!.trim();
      if (first && title && same(heading, title)) { first = false; continue; }
      const level = h[1]!.length <= 2 ? 4 : h[1]!.length === 3 ? 5 : 6;
      if (heading) out.push(`<h${level}>${esc(heading)}</h${level}>`);
      first = false;
      continue;
    }
    first = false;
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (li) {
      if (para.length) flush();
      list.push(li[1]!.trim());
      continue;
    }
    if (list.length) flush();
    para.push(line.replace(/\t+/g, ' '));
  }
  flush();
  return out.join('\n');
}

/** Text reduced to what a quotation check should compare: no markup, plain quotes and dashes, single spaces, lower case. */
export function normForQuote(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/^\s*(#{1,6}|[-*•])\s+/gm, '')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

export interface QuoteCheck { label: string; quote: string; found: boolean }

/** Every item of an activity that should rest on a sentence of the reading, with whether that sentence is there. */
export function checkQuotes(act: Activity, readingText: string): QuoteCheck[] {
  const source = normForQuote(readingText);
  const one = (label: string, q: unknown): QuoteCheck => {
    const quote = typeof q === 'string' ? q : '';
    const n = normForQuote(quote);
    return { label, quote, found: n.length >= 12 && source.includes(n) };
  };
  const items = (list: unknown, word: string): QuoteCheck[] =>
    Array.isArray(list) ? list.map((x, i) => one(`${word} ${i + 1}`, (x as Record<string, unknown> | null)?.source_quote)) : [];
  if (act.type === 'questionset') return items(act.questions, 'Question');
  if (act.type === 'dialogcards') return items(act.cards, 'Card');
  return [one('This activity', act.source_quote)];
}

/** Problems that keep a drafted activity out of the file: what checkActivity finds, plus any item whose quotation is not in the reading. */
export function checkDrafted(act: Activity, readingText: string): string[] {
  const problems = checkActivity(act);
  for (const q of checkQuotes(act, readingText)) {
    if (!q.found) problems.push(q.quote ? `${q.label}: the supporting sentence is not in the reading as quoted.` : `${q.label}: no supporting sentence was given.`);
  }
  return problems;
}

function keyOf(q: Record<string, unknown>): string {
  if (q.type === 'truefalse') return q.correct ? 'True' : 'False';
  const answers = Array.isArray(q.answers) ? (q.answers as Record<string, unknown>[]) : [];
  return answers.filter((a) => a.correct).map((a) => String(a.text ?? '').replace(/<[^>]+>/g, '')).join(' / ');
}

const cell = (s: unknown): string => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

export function buildReadings(mod: ReadingModule, opts: BuildOptions): BuildResult {
  const prefix = mod.prefix ?? 'r';
  const versions = mod.h5p_versions;
  const disclosure = mod.disclosure ?? DEFAULT_DISCLOSURE;
  const packages: Record<string, Uint8Array> = {};
  const todo: string[] = [];
  const judgement: string[] = [];
  const built: { act: ReadingActivity; name: string }[] = [];

  for (const act of mod.activities) {
    const label = `H5P activity #${act.n}${typeof act.title === 'string' ? ` (${act.title})` : ''}`;
    try {
      if (!ACTIVITY_TYPES.includes(act.type)) throw new Error(`unknown type "${act.type}"`);
      const name = `${prefix}-h5p-${pad(act.n, 2)}-${slug(act.title)}.h5p`;
      packages[name] = packageH5p(act, versions);
      librariesUsed(act, versions);
      built.push({ act, name });
    } catch (e) {
      todo.push(`${label} could not be built: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const chapters = mod.readings.map((r) => {
    const mine = built.filter((b) => b.act.reading === r.id);
    let html = '';
    if (r.include_text) {
      html += textToHtml(r.text, r.title);
      if (!r.license) todo.push(`${r.title}: the text of this reading is on the page and no open licence was found. Confirm you have the right to reuse it, or switch the page to "link only".`);
    } else if (r.source_url) {
      html += `<p>Read <a href="${escAttr(r.source_url)}" target="_blank" rel="noopener">${esc(r.title)}</a>, then return to this page for the practice activities.</p>`;
    } else {
      html += TODO(`Add the reading "${r.title}" here, or a link to it. Its text is not on this page.`);
      todo.push(`${r.title}: the page has no text and no link to the reading. Add the file or a link.`);
    }
    if (mine.length) {
      html += `\n<h4>Check Your Understanding</h4>\n<p style="font-size:.9rem;color:#495057"><i class="fa fa-circle-info" aria-hidden="true"></i> ${esc(disclosure)}</p>`;
      // The activity shows its own full title; the page heading is the short form before the colon.
      for (const b of mine) html += `\n<h5>${esc(String(b.act.title).split(':')[0]!.trim())}</h5>\n${EMBED(b.name)}`;
    }
    const credit = [r.attribution, r.license && !r.attribution.includes(r.license) ? r.license : ''].filter(Boolean).join('. ');
    if (credit || r.source_url) {
      html += '\n<hr>\n<p style="font-size:.85rem;color:#495057">'
        + (credit ? `Source: ${linkify(esc(credit))}${/[.!?]$/.test(credit) ? '' : '.'} ` : '')
        + (r.source_url ? `<a href="${escAttr(r.source_url)}" target="_blank" rel="noopener">Original</a>.` : '') + '</p>';
    } else {
      todo.push(`${r.title}: no source or attribution is recorded for this reading. Add a credit line to the page.`);
    }
    if (!mine.length) judgement.push(`${r.title}: no practice activities are on this page.`);
    return { title: r.title, html };
  });

  const fileName = `${slug(mod.name) || 'module'}.mbz`;
  const stats = buildMbz(fileName, { fullname: mod.name, shortname: opts.course || slug(mod.name).toUpperCase() }, { name: mod.name },
    [{ name: mod.name, chapters, files: packages }], { hidden: !opts.visible, sectionNumber: opts.section ?? 1 });

  const items = built.reduce((n, b) => n + checkQuotes(b.act, '').length, 0);
  const rows: [string, number | string][] = [
    ['Book pages', chapters.length],
    ['Pages carrying the reading’s text', mod.readings.filter((r) => r.include_text).length],
    ['Pages that link to the reading', mod.readings.filter((r) => !r.include_text).length],
    ['H5P activities embedded', built.length],
    ['AI-drafted questions and cards', items],
    ['Files in the backup', stats.files],
  ];

  let report = `# Build report: ${mod.name}\n\nSource: ${opts.sourceName}\n\n## What was built\n\n| Item | Count |\n|---|---|\n`;
  for (const [k, v] of rows) report += `| ${k} | ${v} |\n`;
  report += '\n## Readings\n\n| Page | On the page | Licence found | Source |\n|---|---|---|---|\n';
  for (const r of mod.readings) report += `| ${cell(r.title)} | ${r.include_text ? 'full text' : 'link only'} | ${cell(r.license) || 'none'} | ${cell(r.source_url) || 'uploaded or pasted'} |\n`;
  report += '\n## Needs a person before publishing\n\n';
  for (const t of todo) report += `- ${t}\n`;
  if (!todo.length) report += '- Nothing was flagged.\n';
  report += '\n## Every AI-drafted item, for the subject reviewer\n\n'
    + 'Each answer key was checked against the quoted sentence of the reading, not against outside knowledge. '
    + 'A subject expert should still read every item.\n\n| Page | Activity | Item | Key | Supporting sentence | In the reading |\n|---|---|---|---|---|---|\n';
  for (const { act } of built) {
    const r = mod.readings.find((x) => x.id === act.reading);
    const checks = checkQuotes(act, r?.text ?? '');
    const parts = (act.type === 'questionset' ? act.questions : act.type === 'dialogcards' ? act.cards : [act]) as Record<string, unknown>[];
    checks.forEach((q, i) => {
      const part = parts[i] ?? {};
      const what = act.type === 'dialogcards' ? cell(part.front) : cell(String(part.question ?? act.title).replace(/<[^>]+>/g, ''));
      const key = act.type === 'dialogcards' ? cell(String(part.back ?? '').replace(/<[^>]+>/g, '')) : cell(keyOf(part));
      report += `| ${cell(r?.title)} | ${cell(act.title)} | ${what.slice(0, 120)} | ${key.slice(0, 120)} | ${cell(q.quote).slice(0, 200)} | ${q.found ? 'yes' : 'NO'} |\n`;
    });
  }
  report += '\n## H5P versions this file expects on the Moodle site\n\n';
  const need: Record<string, string> = {};
  for (const { act } of built) Object.assign(need, librariesUsed(act, versions));
  const main = Object.values(LIB);
  for (const k of Object.keys(need).sort(cmp)) {
    if ((k.startsWith('H5P.') && main.includes(k)) || k === 'H5P.AdvancedText') report += `- ${k} ${need[k]}\n`;
  }

  return {
    name: mod.name, fileName, mbz: stats.mbz, report, specsFound: '',
    chapters, slots: [], h5p: packages, images: {},
    counts: Object.fromEntries(rows), todo, judgement,
  };
}
