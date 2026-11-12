/**
 * Turn draft blocks into Moodle Book chapters, acting on the production notes.
 *
 * Every rule here is a fixed pattern; nothing is guessed by a model. Whatever a
 * rule cannot place is left on the page as a visible "To do" box and listed in
 * the build report, so a person sees it before the module is shown to learners.
 *
 * Ported from the Python module builder's pages.py. The rules, their order and
 * every output string are the same; where Python and JavaScript regexes differ
 * (whitespace, word characters, "." and newlines) the patterns are spelled out
 * so they match what Python matched.
 */

import { render, type Block, type Piece } from './draft.js';
import { S, WS, WORD, esc, escq, strip, lstrip, rstrip, rstripChars, plen, cut } from './py.js';

const NOTE = new RegExp(`^${S}*\\[@?${S}*Production(?!${WORD})`, 'iu');
const NOTE_INSIDE = new RegExp(`\\[@${S}*Production(?!${WORD})`, 'iu');
const FA_SRC = '\\[fa-([a-z0-9-]+)\\]';
const FA_ALL = new RegExp(FA_SRC, 'g');
const FA_FIRST = new RegExp(FA_SRC);
const FA_START = new RegExp('^' + FA_SRC);
const FA_ALIAS: Record<string, string> = { quiz: 'circle-question' };
const RED = '#b45309';

const CALLOUTS: Record<string, [string, string, string]> = {   // icon -> [default title, border, background]
  'brain': ['Key idea', '#0f6cbf', '#eef5fb'],
  'circle-info': ['Note', '#495057', '#f1f3f5'],
  'lightbulb': ['Tip', '#b45309', '#fff8e6'],
};

const TAGS = /<[^>]+>/g;
const SHOW_CODE = new RegExp(`^\\[fa-code\\]${S}*Show code${S}*$`);
const TITLE_LINE = new RegExp(`^Title:${S}*`);
const TYPE_LINE = new RegExp(`^H5P Type:${S}*`);
const TOOLTIP = new RegExp(`[Ff]ormat${S}*[“"]([^]+?)[”"]${S}*as a pop-up tool ?tip with the text${S}*([^]*)$`);
const TIP_LEAD = new RegExp(`^[${WS}“"]+`);
const TIP_TAIL = new RegExp(`[${WS}\\]"”.]+$`);
const TIP_ENDS_IN_WORD = new RegExp(`(${WORD}|\\)|</code>)$`, 'u');
const IMAGE_DESC = new RegExp(`Image Description:${S}*([^]*)$`, 'iu');
const ALT_TEXT = new RegExp(`alt text:${S}*([^]*)$`, 'iu');
const LINK_TO = /^\[Link to [^\n]*\]$/;
const BUTTON = /button[^\n]*?['‘“"]([^'’”"]+)['’”"]/;
const PROSE = /^[A-Z][a-z]+ [a-z][^\n]*[:.]$/;
const CODE_CHARS = /[;{}=<>#/$|]/;
const FIGURE = /^Figure \p{Nd}/u;
const TABLE_CAPTION = new RegExp(`^Table \\p{Nd}+\\.\\p{Nd}+(?!${WORD})`, 'u');
const PREDICT = new RegExp(`^(<strong>)?Predict:(</strong>)?${S}*`);
const SHAREPOINT_LINK = /<a href="(https:\/\/[^"]*sharepoint\.com[^"]*)">([^\n]*?)<\/a>/g;
const PLAIN_LINK = /<a href="(https?:\/\/[^"]+)">/g;

/** A draft block, or one of the things the note rules make from blocks (reveal, tip, h5p, accordion, button, todo). */
export interface Node extends Block {
  label?: string;
  icon?: string;
  kind?: string;
  children?: Node[];
  items?: { title: string; children: Node[] }[];
  n?: number;
  title?: string;
  type?: string;
  href?: string;
}

/** One H5P spec found in the draft. */
export interface FoundSlot { n: number; chapter: string; under: string; type: string; title: string; note: string; spec: Block[] }

export interface BuiltChapter { title: string; blocks: Node[]; html: string }

/** What the Builder needs from a draft: its blocks and a way to fetch an image by its path inside word/. */
export interface DraftLike { blocks: Block[]; image(name: string): Uint8Array }

export type ReportKey = 'h5p' | 'accordion' | 'tooltip' | 'panel' | 'callout' | 'code' | 'table' | 'image' | 'todo' | 'judgement' | 'dropped';
const REPORT_KEYS: ReportKey[] = ['h5p', 'accordion', 'tooltip', 'panel', 'callout', 'code', 'table', 'image', 'todo', 'judgement', 'dropped'];

export function icons(s: string): string {
  return s.replace(FA_ALL, (_m, name: string) =>
    `<i class="fa fa-${Object.prototype.hasOwnProperty.call(FA_ALIAS, name) ? FA_ALIAS[name] : name}" aria-hidden="true"></i>`);
}

export function slug(s: string): string {
  return cut(s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), 50);
}

function isNote(b: Node): boolean {
  return (b.t === 'p' || b.t === 'cont') && (NOTE.test(b.text ?? '') || NOTE_INSIDE.test(b.text ?? ''));
}

function oneCell(b: Node): boolean {
  return b.t === 'table' && b.rows!.length === 1 && b.rows![0]!.length === 1;
}

function isCodeTable(b: Node): boolean {
  return oneCell(b) && !lstrip(b.text ?? '').startsWith('[fa-');
}

function isCalloutTable(b: Node): boolean {
  return oneCell(b) && lstrip(b.text ?? '').startsWith('[fa-');
}

/**
 * An override pattern is written as a Python regular expression. The common
 * forms are the same in JavaScript; the few Python-only spellings are rewritten.
 */
function pyRegex(pattern: string): RegExp {
  let flags = '';
  let p = pattern;
  const inline = /^\(\?([ims]+)\)/.exec(p);
  if (inline) { flags = inline[1]!; p = p.slice(inline[0].length); }
  p = p.replace(/\\A/g, '^').replace(/\\Z/g, '$').replace(/\(\?P</g, '(?<');
  try {
    return new RegExp(p, flags);
  } catch (e) {
    throw new Error(`Override pattern is not a valid regular expression: ${pattern} (${(e as Error).message})`);
  }
}

function fa(text: string, what: string): string {
  const m = FA_START.exec(text);
  if (!m) throw new Error(`${what} starts with "[fa-" but is not a complete icon marker such as [fa-brain]: "${cut(text, 40)}"`);
  return m[1]!;
}

export class Builder {
  draft: DraftLike;
  h5p_files: Record<number, string>;
  overrides: Record<string, unknown>;
  prefix: string;
  report: Record<ReportKey, string[]>;
  slots: FoundSlot[] = [];                    // H5P specs found, in order
  files: Record<string, Uint8Array> = {};     // published name -> bytes
  name: string;
  chapters: BuiltChapter[];
  private olCount = new Map<string, number>();
  private links: Map<string, string>;
  private chapter = '';
  private lastImg: Node | null = null;

  constructor(draft: DraftLike, h5pFiles?: Record<number, string> | null, overrides?: Record<string, unknown> | null, prefix = 'm') {
    this.draft = draft;
    this.h5p_files = h5pFiles || {};
    this.overrides = overrides || {};
    this.prefix = prefix;
    this.report = Object.fromEntries(REPORT_KEYS.map((k) => [k, [] as string[]])) as Record<ReportKey, string[]>;
    this.links = this.findLinks();
    const { name, chapters } = this.split();
    this.name = name;
    this.chapters = chapters;
  }

  // ---- structure -----------------------------------------------------

  private findLinks(): Map<string, string> {
    const out = new Map<string, string>();
    const scan = (blocks: Block[]) => {
      for (const b of blocks) {
        for (const [t, , h] of b.pieces ?? []) {
          if (h && strip(t) && !out.has(strip(t))) out.set(strip(t), h);
        }
        if (b.t === 'table') for (const r of b.rows!) for (const c of r) scan(c);
      }
    };
    scan(this.draft.blocks);
    return out;
  }

  private split(): { name: string; chapters: BuiltChapter[] } {
    const patterns = this.overrides['drop_text_matching'];
    const drops = (Array.isArray(patterns) ? patterns : []).map((p) => pyRegex(String(p)));
    const blocks: Node[] = [];
    let prev: Node | null = null;
    for (const b of this.draft.blocks as Node[]) {
      const text = strip(b.text ?? '');
      if ((b.t === 'p' || b.t === 'cont') && (text === ']' || text === '].' || text === '"]')) continue;
      if (b.t === 'p' && prev !== null && prev.t === 'p' && text && text === strip(prev.text ?? '')
          && !b.code_style && !b.all_code) {
        this.report.judgement.push(`Removed a paragraph repeated twice in a row: "${cut(text, 80)}"`);
        continue;
      }
      if ((b.t === 'p' || b.t === 'cont') && drops.some((d) => d.test(text))) {
        this.report.dropped.push(`Left out by the override list: "${cut(text, 110)}"`);
        continue;
      }
      blocks.push(b);
      prev = b;
    }
    let name = 'Module';
    const chapters: BuiltChapter[] = [];
    let front: Node[] = [];
    for (const b of blocks) {
      if (b.t === 'h' && b.level === 1) {
        name = b.text!;
      } else if (b.t === 'h' && b.level === 2) {
        chapters.push({ title: b.text!, blocks: chapters.length === 0 ? front : [], html: '' });
        front = [];
      } else if (chapters.length) {
        chapters[chapters.length - 1]!.blocks.push(b);
      } else {
        front.push(b);
      }
    }
    for (const c of chapters) c.html = this.buildChapter(c);
    return { name, chapters };
  }

  // ---- production notes ----------------------------------------------

  private buildChapter(ch: BuiltChapter): string {
    this.chapter = ch.title;
    this.lastImg = null;
    let nodes = this.notes(ch.blocks);
    nodes = this.accordions(nodes);
    return this.render(nodes);
  }

  private notes(B: Node[]): Node[] {
    const out: Node[] = [];
    let i = 0;
    let heading = '';
    while (i < B.length) {
      const b = B[i]!;
      const text = strip(b.text ?? '');
      const nxt = i + 1 < B.length ? B[i + 1]! : null;
      if (b.t === 'h') heading = b.text!;
      if (b.t === 'img') this.lastImg = b;

      // "[fa-code] Show code" above a code box: a click-to-show code block.
      if (b.t === 'p' && SHOW_CODE.test(text) && nxt !== null && isCodeTable(nxt)) {
        out.push({ t: 'reveal', label: 'Show code', icon: 'code', children: [nxt], kind: 'code' });
        this.report.code.push(`${this.chapter}: code hidden behind "Show code"`);
        i += 2;
        continue;
      }

      // "View a sample solution" label that sits just above its panel note.
      if (b.t === 'p' && text.startsWith('[fa-') && nxt !== null && isNote(nxt) && nxt.text!.includes('click-to-expand')) {
        B[i] = nxt;             // put the note first; the label is picked up below
        B[i + 1] = b;
        continue;
      }

      if (!isNote(b)) {
        out.push(b);
        i += 1;
        continue;
      }

      const low = text.toLowerCase();
      if (low.includes('font awesome icons')) {
        i += nxt !== null && nxt.t === 'table' ? 2 : 1;
        continue;
      }

      if (low.includes('insert h5p')) {
        let j = i + 1;
        const spec: Node[] = [];
        while (j < B.length && B[j]!.t !== 'h' && !isNote(B[j]!) && !lstrip(B[j]!.text ?? '').startsWith('[fa-')) {
          spec.push(B[j]!);
          j += 1;
        }
        const n = this.slots.length + 1;
        const titleLine = spec.find((s) => (s.text ?? '').startsWith('Title:'));
        const title = titleLine ? strip(titleLine.text!.replace(TITLE_LINE, '')) : '';
        const kindLine = spec.find((s) => (s.text ?? '').startsWith('H5P Type:'));
        const kind = kindLine ? strip(kindLine.text!.replace(TYPE_LINE, '')) : '';
        this.slots.push({ n, chapter: this.chapter, under: heading, type: kind, title, note: text, spec });
        out.push({ t: 'h5p', n, title: title || heading, type: kind });
        i = j;
        continue;
      }

      if (low.includes('accordion')) {
        out.push({ t: 'accordion_start' });
        i += 1;
        continue;
      }

      if (low.includes('click-to-expand') || low.includes('collapsed')) {
        let j = i + 1;
        let label = 'Sample solution';
        if (j < B.length && B[j]!.t === 'p' && lstrip(B[j]!.text!).startsWith('[fa-')) {
          label = strip(B[j]!.text!.replace(FA_ALL, ''));
          j += 1;
        }
        const body: Node[] = [];
        while (j < B.length && B[j]!.t !== 'h' && !isNote(B[j]!)) {
          body.push(B[j]!);
          j += 1;
        }
        out.push({ t: 'reveal', label, icon: 'code', children: body, kind: 'panel' });
        this.report.panel.push(`${this.chapter}: "${label}" (${body.length} blocks)`);
        i = j;
        continue;
      }

      const bhtml = b.html ?? '';
      let m = TOOLTIP.exec(bhtml);
      if (m) {
        const label = strip(m[1]!.replace(TAGS, ''));
        let tip = m[2]!.replace(TIP_LEAD, '');
        tip = tip.replace(TIP_TAIL, '');
        if (TIP_ENDS_IN_WORD.test(tip)) tip += '.';
        // The label is either at the start of this paragraph or the paragraph above.
        // (As in the Python: when the paragraph has no "[", find() gives -1 and the slice drops the last character.)
        const lead = strip(bhtml.slice(0, bhtml.indexOf('[')).replace(TAGS, ''));
        const above = out[out.length - 1];
        if (!lead && above && above.t === 'p' && strip(above.text ?? '') === label) out.pop();
        out.push({ t: 'tip', label, html: tip });
        this.report.tooltip.push(`${this.chapter}: "${label}" - ${cut(tip.replace(TAGS, ''), 70)}`);
        i += 1;
        continue;
      }

      m = IMAGE_DESC.exec(text);
      if (m && this.lastImg !== null) {
        this.lastImg.desc = strip(rstripChars(strip(m[1]!), ']'));
        this.report.image.push(`${this.chapter}: long description attached to ${this.lastImg.file}`);
        i += 1;
        continue;
      }
      m = ALT_TEXT.exec(text);
      if (m && this.lastImg !== null) {
        this.lastImg.desc = strip(rstripChars(strip(m[1]!), ']'));
        this.report.image.push(`${this.chapter}: note asked for alt text; the image already had a short one, so the note `
          + `became the long description of ${this.lastImg.file}`);
        i += 1;
        continue;
      }

      if (low.includes('embed video')) {
        if (nxt !== null && LINK_TO.test(strip(nxt.text ?? ''))) i += 1;
        out.push({ t: 'todo', text: 'Embed the module intro video here. The draft has no link for it.' });
        i += 1;
        continue;
      }

      m = BUTTON.exec(text);
      if (m) {
        const label = strip(m[1]!);
        let href: string | null = null;
        for (const [t, h] of this.links) {
          if (label.includes(t) || label.endsWith(t)) { href = h; break; }
        }
        if (href) {
          out.push({ t: 'button', label, href });
          this.report.judgement.push(`${this.chapter}: button "${label}" points to ${href}, the address the draft links to elsewhere`);
        } else {
          out.push({ t: 'todo', text: `Button "${label}" needs a link.` });
        }
        i += 1;
        continue;
      }

      out.push({ t: 'todo', text: 'Production note not understood: ' + text });
      i += 1;
    }
    return out;
  }

  private accordions(nodes: Node[]): Node[] {
    const out: Node[] = [];
    let i = 0;
    while (i < nodes.length) {
      if (nodes[i]!.t !== 'accordion_start') {
        out.push(nodes[i]!);
        i += 1;
        continue;
      }
      i += 1;
      const items: { title: string; children: Node[] }[] = [];
      let cur: { title: string; children: Node[] } | null = null;
      while (i < nodes.length) {
        const n = nodes[i]!;
        if ((n.t === 'h' && n.level! <= 4) || (n.t === 'reveal' && n.kind === 'panel')) break;
        if (n.t === 'h' && n.level === 5) {
          cur = { title: n.html!, children: [] };
          items.push(cur);
        } else if (cur === null) {
          out.push(n);
        } else {
          cur.children.push(n);
        }
        i += 1;
      }
      if (items.length) {
        out.push({ t: 'accordion', items });
        this.report.accordion.push(`${this.chapter}: ${items.length} steps`);
      } else {
        out.push({ t: 'todo', text: 'An accordion was asked for here but no step headings followed.' });
      }
    }
    return out;
  }

  // ---- rendering -----------------------------------------------------

  private imgName(f: string): string {
    const name = `${this.prefix}-${f.split('/').pop()}`;
    this.files[name] = this.draft.image(f);
    return name;
  }

  private code(lines: string[]): string {
    while (lines.length && !strip(lines[lines.length - 1]!)) lines.pop();
    while (lines.length && !strip(lines[0]!)) lines.shift();
    const body = esc(lines.map((l) => rstrip(l.replaceAll(' ', ' '))).join('\n'));
    return '<pre style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:.375rem;padding:.75rem 1rem;'
      + `overflow-x:auto;font-size:.875rem;line-height:1.45"><code>${body}</code></pre>`;
  }

  private cell(blocks: Node[]): string {
    const parts: string[] = [];
    for (const b of blocks) {
      if (b.t === 'p' || b.t === 'cont' || b.t === 'li') {
        if (!strip(b.text!)) continue;
        let h = icons(b.html!);
        if (b.code_style && !h.includes('<code>')) h = `<code>${h}</code>`;
        parts.push((b.t === 'li' ? '• ' : '') + h);
      } else {
        parts.push(this.render([b]));
      }
    }
    return parts.join('<br>');
  }

  private table(b: Node, caption: string): string {
    const rows = b.rows!;
    let h = '<div style="overflow-x:auto"><table class="table table-bordered table-sm" style="width:auto;max-width:100%">';
    if (caption) {
      h += `<caption style="caption-side:top;font-weight:600;font-size:1rem;color:inherit;text-align:left">${caption}</caption>`;
    }
    const head = rows.length > 1 ? rows[0]! : null;
    const body = rows.length > 1 ? rows.slice(1) : rows;
    if (head && head.length) {
      h += '<thead><tr>' + head.map((c) => `<th scope="col" style="background:#f1f3f5">${this.cell(c)}</th>`).join('') + '</tr></thead>';
    }
    h += '<tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${this.cell(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
    if (!rows.length) throw new Error(`${this.chapter}: a table in the draft has no rows`);
    this.report.table.push(`${this.chapter}: ${rows.length}x${rows[0]!.length}${caption ? ', captioned' : ''}`);
    return h + '</table></div>';
  }

  private callout(icon: string, title: string, body: string): string {
    const [d, border, bg] = Object.prototype.hasOwnProperty.call(CALLOUTS, icon) ? CALLOUTS[icon]! : CALLOUTS['circle-info']!;
    this.report.callout.push(`${this.chapter}: ${title || d}`);
    return `<div style="border-left:5px solid ${border};background:${bg};padding:1rem 1.25rem;margin:1.25rem 0;border-radius:.375rem">`
      + `<p style="font-weight:700;margin-bottom:.5rem"><i class="fa fa-${icon}" aria-hidden="true"></i> ${title || d}</p>${body}</div>`;
  }

  private calloutTable(b: Node): string {
    const cell = b.rows![0]![0]!.filter((x) => strip(x.text ?? '') || (x.t !== 'p' && x.t !== 'cont')) as Node[];
    const first = cell[0];
    if (!first || first.text === undefined) throw new Error(`${this.chapter}: a callout box does not start with its icon marker`);
    const icon = fa(strip(first.text), `${this.chapter}: a callout box`);
    const firstHtml = strip((first.html ?? '').replace(FA_FIRST, ''));
    const firstText = strip(first.text.replace(FA_FIRST, ''));
    let title = '';
    let rest = cell.slice(1);
    if (!firstText) {
      // the icon stands alone; the rest is the body
    } else if (rest.length && plen(firstText) < 70 && !firstText.endsWith('.')) {
      title = firstHtml;
    } else {
      rest = [{ ...first, html: firstHtml, text: firstText }, ...rest];
    }
    return this.callout(icon, title, this.render(rest));
  }

  private details(summary: string, body: string, boxed: boolean): string {
    if (boxed) {
      return '<details style="border:1px solid #ced4da;border-radius:.375rem;margin:.5rem 0">'
        + '<summary style="padding:.7rem 1rem;cursor:pointer;background:#f1f3f5;border-radius:.375rem">'
        + `<span role="heading" aria-level="5" style="font-weight:600">${summary}</span></summary>`
        + `<div style="padding:1rem 1rem .25rem">${body}</div></details>`;
    }
    return `<details style="margin:.5rem 0 1rem"><summary style="cursor:pointer;font-weight:600;color:#0f6cbf">${summary}</summary>`
      + `<div style="border-left:3px solid #0f6cbf;margin:.5rem 0 0 .35rem;padding:.25rem 0 .25rem 1rem">${body}</div></details>`;
  }

  private list(items: Node[]): string {
    const out: string[] = [];
    const stack: [string, number][] = [];
    const top = () => stack[stack.length - 1]!;
    for (const it of items) {
      if (it.t === 'cont') {
        out.push(`<p style="margin:.5rem 0">${icons(it.html!)}</p>`);
        continue;
      }
      const tag = it.fmt === 'bullet' ? 'ul' : 'ol';
      const lvl = it.lvl!;
      while (stack.length && top()[1] > lvl) out.push(`</li></${stack.pop()![0]}>`);
      if (stack.length && top()[1] === lvl) {
        if (top()[0] === tag) out.push('</li>');
        else out.push(`</li></${stack.pop()![0]}>`);
      }
      const key = `${it.num}\u0000${lvl}`;
      if (!stack.length || top()[1] < lvl || top()[0] !== tag) {
        let attr = '';
        if (tag === 'ol') {
          const seen = this.olCount.get(key);
          if (seen) attr = ` start="${seen + 1}"`;
          if (it.fmt === 'lowerLetter') attr += ' type="a"';
        }
        out.push(`<${tag}${attr}>`);
        stack.push([tag, lvl]);
      }
      if (tag === 'ol') this.olCount.set(key, (this.olCount.get(key) ?? 0) + 1);
      out.push('<li>' + icons(it.html!));
    }
    while (stack.length) out.push(`</li></${stack.pop()![0]}>`);
    return out.join('');
  }

  private isCodeP(b: Node): boolean {
    if (b.t !== 'p' || !(b.code_style || b.all_code)) return false;
    const t = strip(b.text!);
    if (b.code_style && !b.all_code && PROSE.test(t) && !CODE_CHARS.test(t)) {
      this.report.judgement.push(`${this.chapter}: paragraph in the Code style reads as prose, kept as text: "${cut(t, 70)}"`);
      b.code_style = false;
      return false;
    }
    return true;
  }

  private figure(b: Node, caption: string): string {
    const name = this.imgName(b.file!);
    if (!b.alt) this.report.todo.push(`${this.chapter}: image ${name} has no alt text`);
    let h = `<figure style="margin:1.25rem 0;text-align:center"><img src="@@PLUGINFILE@@/${name}" alt="${escq(b.alt ?? '')}" class="img-fluid" style="max-width:100%;height:auto">`;
    if (caption) h += `<figcaption style="font-size:.9rem;margin-top:.5rem">${caption}</figcaption>`;
    h += '</figure>';
    if (b.desc) h += this.details('Image description', `<p>${esc(b.desc)}</p>`, false);
    this.report.image.push(`${this.chapter}: ${name}${caption ? ', captioned' : ''}`);
    return h;
  }

  private render(nodes: Node[]): string {
    const out: string[] = [];
    let i = 0;
    while (i < nodes.length) {
      const b = nodes[i]!;
      const t = b.t;
      const nxt = i + 1 < nodes.length ? nodes[i + 1]! : null;
      if (t === 'h') {
        const lvl = Math.min(b.level! + 1, 6);
        out.push(`<h${lvl} id="${slug(b.text!)}">${icons(b.html!)}</h${lvl}>`);
      } else if (t === 'li' || t === 'cont') {
        let j = i;
        while (j < nodes.length && (nodes[j]!.t === 'li' || nodes[j]!.t === 'cont')) j += 1;
        if (t === 'cont') {
          out.push(`<p>${icons(b.html!)}</p>`);
          j = i + 1;
        } else {
          out.push(this.list(nodes.slice(i, j)));
        }
        i = j;
        continue;
      } else if (t === 'img') {
        let capAt: number | null = null;
        if (nxt !== null && nxt.t === 'p' && FIGURE.test(strip(nxt.text!))) {
          capAt = i + 1;
        } else if (i + 2 < nodes.length && nodes[i + 1]!.t === 'p' && nodes[i + 2]!.t === 'p'
            && FIGURE.test(strip(nodes[i + 2]!.text!))) {
          out.push(`<p>${icons(nodes[i + 1]!.html!)}</p>`);   // text typed beside the picture goes above it
          capAt = i + 2;
        }
        out.push(this.figure(b, capAt ? icons(nodes[capAt]!.html!) : ''));
        if (capAt) {
          i = capAt + 1;
          continue;
        }
      } else if (t === 'table') {
        if (isCalloutTable(b)) {
          out.push(this.calloutTable(b));
        } else if (isCodeTable(b)) {
          out.push(this.code(b.rows![0]![0]!.map((x) => x.text ?? '')));
          this.report.code.push(`${this.chapter}: code block, ${b.rows![0]![0]!.length} lines`);
        } else {
          out.push(this.table(b, ''));
        }
      } else if (t === 'p') {
        const text = strip(b.text!);
        if (!text) {
          // nothing to show
        } else if (this.isCodeP(b)) {
          let j = i;
          while (j < nodes.length && this.isCodeP(nodes[j]!)) j += 1;
          out.push(this.code(nodes.slice(i, j).map((x) => x.text!)));
          this.report.code.push(`${this.chapter}: code block, ${j - i} lines`);
          i = j;
          continue;
        } else if (TABLE_CAPTION.test(text) && nxt !== null && nxt.t === 'table' && !isCodeTable(nxt)) {
          out.push(this.table(nxt, icons(b.html!)));
          i += 2;
          continue;
        } else if (text.startsWith('[fa-')) {
          const icon = fa(text, `${this.chapter}: a paragraph`);
          const restHtml = strip(b.html!.replace(FA_FIRST, ''));
          const restText = strip(text.replace(FA_FIRST, ''));
          const m = PREDICT.exec(restHtml);
          if (m) {
            out.push(this.callout(icon, 'Predict', `<p>${icons(restHtml.slice(m[0].length))}</p>`));
          } else if (plen(restText) > 70 && Object.prototype.hasOwnProperty.call(CALLOUTS, icon)) {
            out.push(this.callout(icon, '', `<p>${icons(restHtml)}</p>`));
          } else {
            out.push(`<p style="font-weight:700;margin-top:1.25rem">${icons(b.html!)}</p>`);
          }
        } else {
          out.push(`<p>${icons(b.html!)}</p>`);
        }
      } else if (t === 'h5p') {
        const f = this.h5p_files[b.n!];
        if (f) {
          out.push(`<div class="h5p-placeholder" contenteditable="false">@@PLUGINFILE@@/${f}</div>`);
          this.report.h5p.push(`${this.chapter}: #${b.n} ${b.type} - ${b.title}`);
        } else {
          out.push(this.todo(`H5P activity #${b.n} (${b.type}: ${b.title}) has not been built yet.`));
        }
      } else if (t === 'accordion') {
        out.push(b.items!.map((it) => this.details(icons(it.title), this.render(it.children), true)).join(''));
      } else if (t === 'reveal') {
        out.push(this.details(`<i class="fa fa-${b.icon}" aria-hidden="true"></i> ${esc(b.label!)}`, this.render(b.children!), false));
      } else if (t === 'tip') {
        out.push(this.details(`<i class="fa fa-circle-question" aria-hidden="true"></i> ${esc(b.label!)}`, `<p>${b.html}</p>`, false));
      } else if (t === 'button') {
        out.push(`<p><a class="btn btn-primary" href="${escq(b.href!)}" target="_blank" rel="noopener">${esc(b.label!)}</a></p>`);
      } else if (t === 'todo') {
        out.push(this.todo(b.text!));
      }
      i += 1;
    }
    let h = out.filter((x) => x).join('\n');
    // Links that only staff can open are flagged, not published.
    h = h.replace(SHAREPOINT_LINK, (_whole, _url: string, inner: string) => {
      const label = strip(inner.replace(TAGS, ''));
      if (!label.toLowerCase().includes('handout') || !label.includes('[')) return inner;
      this.report.todo.push(`${this.chapter}: "${cut(label, 70)}" links to a staff-only SharePoint file; upload the file and relink`);
      return `${inner} <span style="border:1px dashed ${RED};color:${RED};padding:0 .3rem;font-size:.8rem">file needed</span>`;
    });
    h = h.replace(PLAIN_LINK, (_whole, url: string) => `<a href="${url}" target="_blank" rel="noopener">`);
    return h;
  }

  private todo(text: string): string {
    this.report.todo.push(`${this.chapter}: ${text}`);
    return `<div style="border:2px dashed ${RED};background:#fffbeb;padding:.75rem 1rem;margin:1rem 0">`
      + `<strong>To do before publishing:</strong> ${esc(text)}</div>`;
  }
}

/** The spec as the author wrote it, with red words marked, for whoever (or whatever) interprets it. */
export function specText(slot: { spec: Block[] }): string {
  const lines: string[] = [];
  for (const b of slot.spec) {
    if (b.t === 'table') {
      for (const r of b.rows!) lines.push(r.map((c) => c.map((x) => x.text ?? '').join(' ')).join(' | '));
    } else if (strip(b.text ?? '')) {
      const pieces: Piece[] | undefined = b.pieces;
      const h = pieces && pieces.length ? render(pieces, true) : b.text!;
      lines.push((b.t === 'li' ? '- ' : '') + h);
    }
  }
  return lines.join('\n');
}
