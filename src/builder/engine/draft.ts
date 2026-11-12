/**
 * Read a Word course draft into a flat list of blocks.
 *
 * Nothing here interprets production notes; it only records what the document
 * says and how it is formatted, so that pages.ts can act on it. Ported from
 * the Python module builder's draft.py: same rules, same strings.
 *
 * Block shapes:
 *   {t: 'h', level: 1-6, html, text}
 *   {t: 'p', html, text, all_code, code_style, pieces}
 *   {t: 'li', html, text, num: numId, lvl, fmt: 'bullet'|'decimal'|..., pieces}
 *   {t: 'cont', html, text, pieces}     a List Paragraph with no number: belongs to the item above
 *   {t: 'img', file, alt}
 *   {t: 'table', rows: [[ [blocks], ... ], ...], text}
 *
 * The .docx arrives as bytes; nothing touches the disk.
 */

import { unzipSync } from 'fflate';
import { S, esc, escq, strip } from './py.js';
import { parseXml, child, childrenOf, iter, descendant, type XEl } from './xml.js';

const W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';
const R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}';
const A = '{http://schemas.openxmlformats.org/drawingml/2006/main}';
const WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}';
const REL = '{http://schemas.openxmlformats.org/package/2006/relationships}';

const MONO = ['consolas', 'consola', 'courier new', 'courier', 'menlo', 'monaco'];
const CODE_RUN_STYLES = ['CodeChar', 'HTMLCode'];

/** One run of text: [text, marks, link]. Marks are the names in MARK_ORDER that apply, space-separated. */
export type Piece = [string, string, string | null];
const MARK_ORDER = ['b', 'i', 'code', 'red'];
export const hasMark = (marks: string, m: string): boolean => marks.split(' ').includes(m);

export interface Block {
  t: string;
  html?: string;
  text?: string;
  level?: number;
  all_code?: boolean;
  code_style?: boolean;
  num?: string;
  lvl?: number;
  fmt?: string;
  pieces?: Piece[];
  file?: string;
  alt?: string;
  /** Long description attached by a production note (set in pages.ts). */
  desc?: string;
  rows?: Block[][][];
}

function int(s: string | undefined, what: string): number {
  if (s === undefined || !/^\s*[+-]?\d+\s*$/.test(s)) throw new Error(`Draft: ${what} is not a whole number (${String(s)})`);
  return parseInt(s, 10);
}

export class Draft {
  private zip: Record<string, Uint8Array>;
  rels: Record<string, string> = Object.create(null) as Record<string, string>;
  styles: Record<string, string>;
  numfmt: Record<string, Record<number, string>>;
  blocks: Block[];

  constructor(docx: Uint8Array) {
    try {
      this.zip = unzipSync(docx);
    } catch {
      throw new Error('This file could not be opened as a Word document (.docx).');
    }
    for (const r of iter(parseXml(this.read('word/_rels/document.xml.rels')), REL + 'Relationship')) {
      if (r.attrs['Id'] !== undefined) this.rels[r.attrs['Id']] = r.attrs['Target'] ?? '';
    }
    this.styles = this.readStyles();
    this.numfmt = this.readNumbering();
    const body = child(parseXml(this.read('word/document.xml')), W + 'body');
    if (!body) throw new Error('Draft: word/document.xml has no body');
    this.blocks = this.readBlocks(body);
  }

  private read(name: string): Uint8Array {
    const f = this.zip[name];
    if (!f) throw new Error(`Draft: "${name}" is missing from the Word file`);
    return f;
  }

  // ---- lookups -------------------------------------------------------

  private readStyles(): Record<string, string> {
    const out = Object.create(null) as Record<string, string>;
    for (const s of iter(parseXml(this.read('word/styles.xml')), W + 'style')) {
      const name = child(s, W + 'name');
      const id = s.attrs[W + 'styleId'];
      out[String(id)] = name ? (name.attrs[W + 'val'] as string) : (id as string);
    }
    return out;
  }

  private readNumbering(): Record<string, Record<number, string>> {
    if (!this.zip['word/numbering.xml']) return Object.create(null) as Record<string, Record<number, string>>;
    const root = parseXml(this.zip['word/numbering.xml']);
    const abstract = Object.create(null) as Record<string, Record<number, string>>;
    for (const a of iter(root, W + 'abstractNum')) {
      const lv: Record<number, string> = {};
      for (const l of iter(a, W + 'lvl')) {
        const f = child(l, W + 'numFmt');
        lv[int(l.attrs[W + 'ilvl'], 'a list level')] = f ? (f.attrs[W + 'val'] as string) : 'bullet';
      }
      abstract[String(a.attrs[W + 'abstractNumId'])] = lv;
    }
    const out = Object.create(null) as Record<string, Record<number, string>>;
    for (const n of iter(root, W + 'num')) {
      const ref = child(n, W + 'abstractNumId');
      if (!ref) throw new Error('Draft: a list definition in word/numbering.xml has no abstractNumId');
      out[String(n.attrs[W + 'numId'])] = abstract[String(ref.attrs[W + 'val'])] ?? {};
    }
    return out;
  }

  image(name: string): Uint8Array {
    return this.read('word/' + name);
  }

  // ---- inline --------------------------------------------------------

  private runMarks(r: XEl): Set<string> {
    const marks = new Set<string>();
    const pr = child(r, W + 'rPr');
    if (!pr) return marks;
    const on = (tag: string): boolean => {
      const e = child(pr, W + tag);
      return e !== undefined && e.attrs[W + 'val'] !== '0' && e.attrs[W + 'val'] !== 'false';
    };
    if (on('b')) marks.add('b');
    if (on('i')) marks.add('i');
    const fonts = child(pr, W + 'rFonts');
    const font = fonts ? (fonts.attrs[W + 'ascii'] || '').toLowerCase() : '';
    const style = child(pr, W + 'rStyle');
    const hl = child(pr, W + 'highlight');
    if (MONO.includes(font) || (style !== undefined && CODE_RUN_STYLES.includes(style.attrs[W + 'val'] as string))
        || (hl !== undefined && hl.attrs[W + 'val'] === 'lightGray')) {
      marks.add('code');
    }
    const col = child(pr, W + 'color');
    if (col !== undefined && ['EE0000', 'FF0000', 'C00000'].includes((col.attrs[W + 'val'] || '').toUpperCase()) && !marks.has('code')) {
      marks.add('red');
    }
    if (font === 'wingdings') marks.add('wingdings');
    return marks;
  }

  /** html, text, images, all_code and the merged pieces for one paragraph. */
  private inline(p: XEl): { html: string; text: string; images: { file: string; alt: string }[]; all_code: boolean; pieces: Piece[] } {
    const pieces: Piece[] = [];
    const images: { file: string; alt: string }[] = [];

    const walk = (node: XEl, href: string | null) => {
      for (const ch of node.children) {
        if (ch.tag === W + 'r') {
          const marks = this.runMarks(ch);
          const key = MARK_ORDER.filter((m) => marks.has(m)).join(' ');
          for (const x of ch.children) {
            if (x.tag === W + 't') {
              let t = x.text || '';
              if (marks.has('wingdings')) t = t.replaceAll('ü', '✓').replaceAll('', '✓');
              pieces.push([t, key, href]);
            } else if (x.tag === W + 'br' || x.tag === W + 'cr') {
              pieces.push(['\n', key, href]);
            } else if (x.tag === W + 'tab') {
              pieces.push(['    ', key, href]);
            } else if (x.tag === W + 'drawing') {
              const blip = descendant(x, A + 'blip');
              const doc = descendant(x, WP + 'docPr');
              if (blip) {
                const file = this.rels[String(blip.attrs[R + 'embed'])];
                if (file === undefined) throw new Error('Draft: a picture has no embedded image file (it may be linked, not embedded)');
                images.push({ file, alt: doc ? (doc.attrs['descr'] || '') : '' });
              }
            }
          }
        } else if (ch.tag === W + 'hyperlink') {
          const id = ch.attrs[R + 'id'];
          walk(ch, (id !== undefined ? this.rels[id] : undefined) || href);
        } else if (ch.tag === W + 'ins' || ch.tag === W + 'smartTag' || ch.tag === W + 'sdt' || ch.tag === W + 'sdtContent') {
          walk(ch, href);
        }
      }
    };
    walk(p, null);

    let merged: Piece[] = [];
    for (const [t, m, h] of pieces) {
      const last = merged[merged.length - 1];
      if (last && last[1] === m && last[2] === h) last[0] += t;
      else merged.push([t, m, h]);
    }
    // Formatting on whitespace only is noise; fold it into its neighbour.
    merged = merged.filter((x) => x[0] !== '');
    const text = merged.map((x) => x[0]).join('');
    const visible = merged.filter((x) => strip(x[0]));
    const all_code = visible.length > 0 && visible.every((x) => hasMark(x[1], 'code'));
    return { html: render(merged), text, images, all_code, pieces: merged };
  }

  // ---- blocks --------------------------------------------------------

  private para(p: XEl): Block[] {
    const ppr = child(p, W + 'pPr');
    let style = '';
    let num: [string, number] | null = null;
    if (ppr) {
      const s = child(ppr, W + 'pStyle');
      if (s) {
        const id = s.attrs[W + 'val'] as string;
        style = this.styles[id] ?? id;
      }
      const n = child(ppr, W + 'numPr');
      const numId = n ? child(n, W + 'numId') : undefined;
      if (n && numId && numId.attrs[W + 'val'] !== '0') {
        const lvl = child(n, W + 'ilvl');
        num = [numId.attrs[W + 'val'] as string, lvl ? int(lvl.attrs[W + 'val'], 'a list level') : 0];
      }
    }
    const { html, text, images, all_code, pieces } = this.inline(p);
    const out: Block[] = images.map((i) => ({ t: 'img', file: i.file, alt: i.alt }));
    if (!strip(text)) {
      if (style === 'Code') out.push({ t: 'p', html: '', text: '', all_code: true, code_style: true, pieces });
      return out;
    }
    const m = /^[Hh]eading (\d)/.exec(style ?? '');
    if (m) {
      out.push({ t: 'h', level: parseInt(m[1]!, 10), html, text: strip(text) });
    } else if (num) {
      const fmt = this.numfmt[num[0]]?.[num[1]] ?? 'bullet';
      out.push({ t: 'li', html, text, num: num[0], lvl: num[1], fmt, pieces });
    } else if (style === 'List Paragraph') {
      out.push({ t: 'cont', html, text, pieces });
    } else {
      out.push({ t: 'p', html, text, all_code, code_style: style === 'Code', pieces });
    }
    return out;
  }

  private readBlocks(parent: XEl): Block[] {
    const out: Block[] = [];
    for (const ch of parent.children) {
      if (ch.tag === W + 'p') {
        out.push(...this.para(ch));
      } else if (ch.tag === W + 'tbl') {
        const rows: Block[][][] = [];
        for (const tr of childrenOf(ch, W + 'tr')) rows.push(childrenOf(tr, W + 'tc').map((tc) => this.readBlocks(tc)));
        const texts: string[] = [];
        for (const r of rows) for (const c of r) for (const b of c) texts.push(b.text ?? '');
        out.push({ t: 'table', rows, text: texts.join('\n') });
      }
    }
    return out;
  }
}

export { esc };

const JOIN = ['code', 'strong', 'em'].map((tag) => ({
  tag,
  split: new RegExp(`</${tag}>(${S}*)<${tag}>`, 'g'),
  lead: new RegExp(`<${tag}>(${S}+)`, 'g'),
  trail: new RegExp(`(${S}+)</${tag}>`, 'g'),
}));

/** Inline pieces to HTML. Red is a spec marker, not styling, so it is dropped unless asked for. */
export function render(pieces: Piece[], keepRed = false): string {
  let out = '';
  for (const [t, m, h] of pieces) {
    let s = esc(t).replaceAll('\n', '<br>');
    if (hasMark(m, 'code')) s = '<code>' + s + '</code>';
    if (hasMark(m, 'b')) s = '<strong>' + s + '</strong>';
    if (hasMark(m, 'i')) s = '<em>' + s + '</em>';
    if (keepRed && hasMark(m, 'red')) s = '<mark>' + s + '</mark>';
    if (h) s = `<a href="${escq(h)}">${s}</a>`;
    out += s;
  }
  // Join formatting split across Word runs.
  for (const j of JOIN) out = out.replace(j.split, (_m, ws: string) => ws);
  // Keep spaces outside the tags so words do not run together.
  for (const j of JOIN) {
    out = out.replace(j.lead, (_m, ws: string) => ws + `<${j.tag}>`);
    out = out.replace(j.trail, (_m, ws: string) => `</${j.tag}>` + ws);
    out = out.replaceAll(`<${j.tag}></${j.tag}>`, '');
  }
  return strip(out);
}
