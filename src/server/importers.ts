/**
 * Material import from open sources: a web page by URL, a Pressbooks chapter
 * or whole book through the Pressbooks REST API (BCcampus open textbooks are
 * Pressbooks), and uploaded files (.txt, .md, .html, .docx, .pdf).
 *
 * Everything lands as plain text in `material`, with source_url, license and
 * attribution so the tutor can cite it and the instructor can keep to OER.
 */

import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';
import { MATERIAL_MAX_CHARS } from './limits.js';

export interface ImportedDoc {
  title: string;
  text: string;
  source_url: string;
  license: string;
  attribution: string;
  truncated: boolean;
  original_chars: number;
}

export class ImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'ImportError';
  }
}

const FETCH_TIMEOUT_MS = 25_000;
const MAX_BYTES = 15 * 1024 * 1024;
// Several Pressbooks hosts refuse unfamiliar user agents outright, so this
// identifies as an ordinary browser and adds the tool's name after it.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 LTI-Tutor-importer';
/** Whole-book imports stop here so one click can't create hundreds of materials. */
export const MAX_BOOK_CHAPTERS = 80;

// ─── URL safety ─────────────────────────────────────────────────────────────

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/i.test(h) || /^fe[89ab]/i.test(h);
  return false;
}

/** Only public http(s) URLs may be fetched server-side. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImportError('Only http and https URLs can be imported.');
  if (isPrivateHost(url.hostname)) throw new ImportError('That address is not reachable from the server.');
  return url;
}

async function fetchLimited(url: URL, accept: string): Promise<{ status: number; contentType: string; body: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT }, redirect: 'follow', signal: ctrl.signal });
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new ImportError('That page is too large to import (over 15 MB).');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new ImportError('That page is too large to import (over 15 MB).');
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: buf.toString('utf8'), finalUrl: res.url || url.toString() };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    const msg = (e as Error).name === 'AbortError' ? 'The site took too long to respond.' : `Could not fetch that URL: ${(e as Error).message}`;
    throw new ImportError(msg, 502);
  } finally {
    clearTimeout(timer);
  }
}

function looksBlocked(status: number, body: string): boolean {
  return (status === 403 || status === 503) && /just a moment|cf-browser-verification|challenge-platform|attention required/i.test(body);
}

// ─── HTML → text ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™',
  times: '×', divide: '÷', deg: '°', middot: '·', bull: '•', laquo: '«', raquo: '»', para: '¶', sect: '§',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
}

const DROP_TAGS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'dialog', 'canvas', 'video', 'audio', 'object'];

/**
 * Readable text from an HTML document or fragment: drops chrome (nav, header,
 * footer, aside, scripts), prefers <main>/<article>, keeps headings as
 * markdown headings and lists as bullets, and normalises whitespace.
 */
export function htmlToText(html: string, opts: { fragment?: boolean } = {}): { title: string; text: string } {
  let s = html.replace(/<!--[\s\S]*?-->/g, '');
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  for (const tag of DROP_TAGS) s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  if (!opts.fragment) {
    const main = s.match(/<main\b[\s\S]*?<\/main\s*>/i) ?? s.match(/<article\b[\s\S]*?<\/article\s*>/i) ?? s.match(/<body\b[\s\S]*?<\/body\s*>/i);
    if (main) s = main[0];
  }
  const h1 = s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '')
    .replace(/<\/(p|div|tr|blockquote|section|table|figure|figcaption|pre|dd|dt)\s*>/gi, '\n')
    .replace(/<(p|div|blockquote|section|table|figure|pre)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s)
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/ ?\t+ ?/g, '\t')
    .replace(/\t+\n/g, '\n')
    .replace(/ *\n */g, '\n')
    .replace(/^- ?$/gm, '')          // list items that were only images or links
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const title = decodeEntities((h1?.[1] ?? titleMatch?.[1] ?? '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return { title, text: s };
}

/** "CC BY-SA 4.0" and friends from a Creative Commons link on the page; empty if none. */
export function detectLicense(html: string): string {
  const cc = html.match(/creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/i);
  if (cc) return `CC ${cc[1]!.toUpperCase()} ${cc[2]}`;
  if (/creativecommons\.org\/publicdomain\/zero/i.test(html)) return 'CC0 1.0';
  if (/creativecommons\.org\/publicdomain\/mark/i.test(html)) return 'Public domain';
  return '';
}

export function fitMaterial(text: string): { text: string; truncated: boolean; original_chars: number } {
  const original = text.length;
  if (original <= MATERIAL_MAX_CHARS) return { text, truncated: false, original_chars: original };
  return { text: text.slice(0, MATERIAL_MAX_CHARS - 40).trimEnd() + '\n\n[truncated: material limit reached]', truncated: true, original_chars: original };
}

// ─── Pressbooks ─────────────────────────────────────────────────────────────

interface PbItem { id: number; title: string; link: string }
interface PbPart extends PbItem { chapters?: PbItem[]; has_post_content?: boolean }
interface PbToc { 'front-matter'?: PbItem[]; parts?: PbPart[]; 'back-matter'?: PbItem[] }
/** A thing to import, with the REST collection it lives in. */
interface PbUnit extends PbItem { part: string; collection: 'chapters' | 'parts' }
interface PbMeta { name: string; authors: string[]; license: string; licenseUrl: string }

function stripHtml(s: unknown): string {
  return decodeEntities(String(s ?? '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function normLink(u: string): string {
  return u.trim().replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

async function pbJson<T>(root: string, path: string): Promise<T | null> {
  const res = await fetchLimited(new URL(`${root}/wp-json/pressbooks/v2/${path}`), 'application/json');
  if (looksBlocked(res.status, res.body)) throw new ImportError('The site blocked automated access (a bot-protection page). Download the chapter or book from the site (Pressbooks offers PDF, EPUB and HTML exports) and upload the file instead.', 502);
  if (res.status !== 200 || !/json/i.test(res.contentType)) return null;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}

/** The book root (where /wp-json/pressbooks/v2/ lives) for a URL on a Pressbooks site, or null. */
async function findPressbooksRoot(url: URL): Promise<{ root: string; toc: PbToc } | null> {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  const candidates = [seg ? `${url.origin}/${seg}` : null, url.origin].filter((c): c is string => !!c);
  for (const root of candidates) {
    const toc = await pbJson<PbToc>(root, 'toc');
    if (toc && (Array.isArray(toc.parts) || Array.isArray(toc['front-matter']))) return { root, toc };
  }
  return null;
}

async function pbMetadata(root: string): Promise<PbMeta> {
  const m = await pbJson<Record<string, unknown>>(root, 'metadata');
  const name = stripHtml(m?.name);
  const rawAuthors = m?.author;
  const authors = (Array.isArray(rawAuthors) ? rawAuthors : rawAuthors ? [rawAuthors] : [])
    .map((a) => (typeof a === 'string' ? a : stripHtml((a as { name?: string })?.name)))
    .filter(Boolean);
  const lic = m?.license;
  let license = '';
  let licenseUrl = '';
  if (typeof lic === 'string') {
    licenseUrl = /^https?:/.test(lic) ? lic : '';
    license = licenseUrl ? detectLicense(licenseUrl) : lic;
  } else if (lic && typeof lic === 'object') {
    const l = lic as { name?: string; url?: string; code?: string };
    licenseUrl = l.url ?? '';
    license = stripHtml(l.code) || (licenseUrl ? detectLicense(licenseUrl) : '') || stripHtml(l.name);
  }
  return { name, authors, license, licenseUrl };
}

/**
 * Chapters in TOC order. Some books (e.g. older imports) keep their text in
 * the parts themselves and have no chapters at all; then each part with
 * content is a unit.
 */
function pbChapters(toc: PbToc): PbUnit[] {
  const out: PbUnit[] = [];
  for (const part of toc.parts ?? []) {
    for (const ch of part.chapters ?? []) out.push({ ...ch, title: stripHtml(ch.title), part: stripHtml(part.title), collection: 'chapters' });
  }
  if (out.length === 0) {
    for (const part of toc.parts ?? []) {
      if (part.has_post_content === false) continue;
      out.push({ id: part.id, link: part.link, title: stripHtml(part.title), part: '', collection: 'parts' });
    }
  }
  return out;
}

async function pbChapterDoc(root: string, meta: PbMeta, ch: PbUnit): Promise<ImportedDoc> {
  const data = await pbJson<{ title?: { rendered?: string }; content?: { rendered?: string }; link?: string }>(root, `${ch.collection}/${ch.id}`);
  if (!data) throw new ImportError(`Could not load chapter "${ch.title}" from the Pressbooks API.`, 502);
  const title = stripHtml(data.title?.rendered) || ch.title;
  const { text } = htmlToText(data.content?.rendered ?? '', { fragment: true });
  const fit = fitMaterial(`# ${title}\n\n${text}`);
  const fullTitle = [meta.name, ch.part && ch.part !== meta.name ? ch.part : '', title].filter(Boolean).join(' › ').slice(0, 160);
  return {
    title: fullTitle,
    text: fit.text,
    source_url: data.link ?? ch.link,
    license: meta.license,
    attribution: `${meta.name || 'Open textbook'}${meta.authors.length ? ` by ${meta.authors.join(', ')}` : ''}${meta.license ? `, ${meta.license}` : ''}. ${root}`.slice(0, 500),
    truncated: fit.truncated,
    original_chars: fit.original_chars,
  };
}

// ─── Entry points ───────────────────────────────────────────────────────────

/**
 * Import one web page, one Pressbooks chapter, or (wholeBook) every chapter
 * of a Pressbooks book as separate materials.
 */
export async function importFromUrl(rawUrl: string, opts: { wholeBook: boolean }): Promise<{ docs: ImportedDoc[]; pressbooks: boolean; book?: string }> {
  const url = assertPublicHttpUrl(rawUrl);

  const pb = await findPressbooksRoot(url);
  if (pb) {
    const meta = await pbMetadata(pb.root);
    const chapters = pbChapters(pb.toc);
    if (opts.wholeBook) {
      if (chapters.length === 0) throw new ImportError('The Pressbooks API returned no chapters for this book.', 502);
      const docs: ImportedDoc[] = [];
      for (const ch of chapters.slice(0, MAX_BOOK_CHAPTERS)) docs.push(await pbChapterDoc(pb.root, meta, ch));
      return { docs, pressbooks: true, book: meta.name };
    }
    const wanted = normLink(url.toString());
    const match = chapters.find((c) => normLink(c.link) === wanted);
    if (match) return { docs: [await pbChapterDoc(pb.root, meta, match)], pressbooks: true, book: meta.name };
    if (normLink(pb.root) === wanted) {
      throw new ImportError(`This is the home page of "${meta.name || 'the book'}" (${chapters.length} chapters). Tick "whole book" to import every chapter as its own material, or paste one chapter's URL.`);
    }
    // Front/back matter or a page the TOC doesn't list: fall through to the page importer.
  }

  const page = await fetchLimited(url, 'text/html,application/xhtml+xml');
  if (looksBlocked(page.status, page.body)) {
    throw new ImportError('The site blocked automated access (a bot-protection page). Download the page or book from the site and upload the file instead.', 502);
  }
  if (page.status >= 400) throw new ImportError(`The site returned HTTP ${page.status} for that URL.`, 502);
  if (!/html|xml/i.test(page.contentType) && /^[^<]*$/.test(page.body.slice(0, 200))) {
    // Plain text (or similar) served directly.
    const fit = fitMaterial(page.body);
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? url.hostname);
    return { docs: [{ title: name.slice(0, 160), text: fit.text, source_url: page.finalUrl, license: '', attribution: `${name} (${url.hostname})`, truncated: fit.truncated, original_chars: fit.original_chars }], pressbooks: false };
  }
  const { title, text } = htmlToText(page.body);
  if (text.length < 200) throw new ImportError('That page has almost no readable text (it may need JavaScript, or be a login or index page). Try a chapter URL, or upload the file.');
  const fit = fitMaterial(text);
  const name = (title || url.hostname).slice(0, 160);
  return {
    docs: [{
      title: name, text: fit.text, source_url: page.finalUrl, license: detectLicense(page.body),
      attribution: `${name} (${url.hostname})`.slice(0, 500), truncated: fit.truncated, original_chars: fit.original_chars,
    }],
    pressbooks: false,
  };
}

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'text']);

/** Plain text from an uploaded file, by extension. */
export async function extractFromFile(filename: string, buffer: Buffer): Promise<{ title: string; text: string }> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 160) || 'Uploaded material';
  if (TEXT_EXTS.has(ext)) return { title: base, text: buffer.toString('utf8') };
  if (ext === 'html' || ext === 'htm') {
    const { title, text } = htmlToText(buffer.toString('utf8'));
    return { title: title || base, text };
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return { title: base, text: value };
  }
  if (ext === 'pdf') {
    const { text } = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    return { title: base, text: String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() };
  }
  throw new ImportError('Unsupported file type. Upload .txt, .md, .html, .docx or .pdf.');
}
