/**
 * Quotation checking. A reply's quoted spans (five words or more, inside
 * straight or curly double quotes) are looked for in the attached sources,
 * after both sides are normalised (case, quote and dash variants, spacing).
 * A verified quote names its source and the surrounding text; an unverified
 * one is reported so the reader knows it was not found in the sources,
 * which is not the same as wrong, but is worth knowing. Pure.
 */

export interface QuoteSource { id: number; title: string; body: string }

export interface VerifiedQuote { quote: string; material_id: number; title: string; context: string }

export interface QuoteCheck { verified: VerifiedQuote[]; unverified: string[] }

export function normalizeForMatch(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[ \s]+/g, ' ')
    .toLowerCase()
    .trim();
}

const MIN_WORDS = 5;
const MAX_WORDS = 120;

/** The quoted spans in a reply worth checking: long enough to be a quotation rather than a phrase in quotes. */
export function extractQuotes(text: string): string[] {
  const out: string[] = [];
  const re = /["“]([^"“”]{12,1500})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const q = m[1]!.trim();
    const words = q.split(/\s+/).length;
    if (words >= MIN_WORDS && words <= MAX_WORDS) out.push(q);
  }
  return out;
}

/** Strip the trailing punctuation and ellipses a quotation often carries that the source does not. */
function core(q: string): string {
  return normalizeForMatch(q).replace(/^[\s.,;:!?'"-]+|[\s.,;:!?'"-]+$/g, '').replace(/\s*\.\.\.\s*$/, '');
}

export function checkQuotes(text: string, sources: QuoteSource[], normalized?: Map<number, string>): QuoteCheck {
  const quotes = extractQuotes(text);
  if (quotes.length === 0 || sources.length === 0) return { verified: [], unverified: quotes };
  const norm = normalized ?? new Map(sources.map((s) => [s.id, normalizeForMatch(s.body)]));
  const verified: VerifiedQuote[] = [];
  const unverified: string[] = [];
  for (const q of quotes) {
    const needle = core(q);
    if (needle.length < 12) continue;
    let hit: VerifiedQuote | null = null;
    for (const s of sources) {
      const hay = norm.get(s.id) ?? '';
      const i = hay.indexOf(needle);
      if (i < 0) continue;
      const a = Math.max(0, i - 100);
      const b = Math.min(hay.length, i + needle.length + 100);
      hit = { quote: q, material_id: s.id, title: s.title, context: `${a > 0 ? '…' : ''}${hay.slice(a, b)}${b < hay.length ? '…' : ''}` };
      break;
    }
    if (hit) verified.push(hit); else unverified.push(q);
  }
  return { verified, unverified };
}
