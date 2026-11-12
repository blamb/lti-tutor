/**
 * Small helpers that make JavaScript behave like the Python the engine was
 * ported from, where the two differ and the difference would change output.
 *
 *   whitespace   Python's str.strip() and regex \s use one set of characters;
 *                JavaScript's trim() and \s use another (U+FEFF, U+001C-1F, U+0085).
 *   length/slice Python counts code points, JavaScript counts UTF-16 units.
 *   truthiness   [] and {} are false in Python.
 *   rounding     round() goes to the even neighbour on an exact tie.
 *   escaping     html.escape and xml.sax.saxutils.escape.
 *   json.dumps   ", " and ": " separators, optional \uXXXX for non-ASCII, floats keep ".0".
 */

/** Python's whitespace, as the inside of a regex character class. */
export const WS = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
/** Python's \s as a regex source fragment. */
export const S = `[${WS}]`;
/** Python's \w (letters, numbers, underscore, any script). Needs the u flag. */
export const WORD = '[\\p{L}\\p{N}_]';

const LEAD = new RegExp(`^${S}+`);
const TRAIL = new RegExp(`${S}+$`);

export const lstrip = (s: string): string => s.replace(LEAD, '');
export const rstrip = (s: string): string => s.replace(TRAIL, '');
export const strip = (s: string): string => s.replace(LEAD, '').replace(TRAIL, '');

/** s.rstrip(chars) for a literal set of characters. */
export function rstripChars(s: string, chars: string): string {
  let e = s.length;
  while (e > 0 && chars.includes(s[e - 1]!)) e--;
  return s.slice(0, e);
}

/** len(s): code points. */
export function plen(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** s[:n]: the first n code points. */
export function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  let out = '', k = 0;
  for (const ch of s) { if (k++ >= n) break; out += ch; }
  return out;
}

/** Sort order of Python strings (by code point). */
export function cmp(a: string, b: string): number {
  const x = Array.from(a), y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}

/** bool(v). */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (typeof v === 'number' && Number.isNaN(v)) return true;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyFloat) return v.v !== 0;
  if (typeof v === 'object' && (v as object).constructor === Object) return Object.keys(v as object).length > 0;
  return true;
}

/** html.escape(s, quote=False). */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** html.escape(s): also quotes. */
export function escq(s: string): string {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/** '%02d' % n and friends. */
export function pad(n: number, width: number): string {
  const s = String(Math.trunc(n));
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/** round(x, digits) for a float: nearest, and the even neighbour on an exact tie. */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  const near = Number(x.toFixed(digits));           // toFixed rounds the exact binary value, ties upward
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 60));
  const tail = exact.slice(exact.indexOf('.') + 1 + digits);
  if (/^50*$/.test(tail)) {                          // an exact tie: Python picks the even last digit
    const step = Math.pow(10, -digits);
    const lower = Number((Math.abs(x) - step / 2).toFixed(digits));
    const upper = Number((Math.abs(x) + step / 2).toFixed(digits));
    const lastDigit = (v: number) => Number(v.toFixed(digits).slice(-1));
    const pick = lastDigit(lower) % 2 === 0 ? lower : upper;
    return x < 0 ? -pick : pick;
  }
  return near;
}

/** a // b for floats, as CPython computes it. */
export function floorDiv(a: number, b: number): number {
  if (b === 0) throw new Error('float floor division by zero');
  let mod = a % b;
  let div = (a - mod) / b;
  if (mod !== 0 && (b < 0) !== (mod < 0)) { mod += b; div -= 1; }
  if (div === 0) return 0;
  let f = Math.floor(div);
  if (div - f > 0.5) f += 1;
  return f;
}

/** A number Python holds as a float, so that json.dumps writes 12.0 where JavaScript would write 12. */
export class PyFloat {
  constructor(public v: number) {}
  toJSON(): number { return this.v; }
}

function jsonString(s: string, ascii: boolean): string {
  const q = JSON.stringify(s);
  if (!ascii) return q;
  return q.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** json.dumps(v, ensure_ascii=ascii) with Python's default separators. */
export function pyJson(v: unknown, ascii = true): string {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return jsonString(v, ascii);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
  if (v instanceof PyFloat) {
    const s = String(v.v);
    return Number.isInteger(v.v) && !/e/i.test(s) ? s + '.0' : s;
  }
  if (Array.isArray(v)) return '[' + v.map((x) => pyJson(x, ascii)).join(', ') + ']';
  if (typeof v === 'object') {
    return '{' + Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => jsonString(k, ascii) + ': ' + pyJson(x, ascii)).join(', ') + '}';
  }
  throw new Error('Cannot write ' + typeof v + ' as JSON');
}
