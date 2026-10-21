/**
 * The quote book: a thinker's vetted quotations with their sources, the
 * well-known misattributions and how to answer them, and the reading the
 * persona may recommend. The instructor vets it once; the persona then quotes
 * from it with confidence, corrects a student who brings a misattributed line,
 * and recommends only books that exist. Vetted quotations also count as
 * sources for the quotation check (core/quotes.ts), so they get a ✓ chip.
 */

import { z } from 'zod';
import type { QuoteSource } from '../../core/quotes.js';

const str = (max: number) => z.string().trim().max(max).default('');

export const QuoteBook = z.object({
  quotes: z.array(z.object({ text: str(1200), source: str(300), year: str(20), note: str(500) })).max(60).default([]),
  misattributions: z.array(z.object({ text: str(1200), verdict: str(800) })).max(60).default([]),
  reading: z.array(z.object({ title: str(300), year: str(20), note: str(500) })).max(40).default([]),
});
export type QuoteBook = z.infer<typeof QuoteBook>;

export const EMPTY_QUOTE_BOOK: QuoteBook = QuoteBook.parse({});

export function quoteBookOf(raw: unknown): QuoteBook {
  const r = QuoteBook.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_QUOTE_BOOK;
}

const cite = (source: string, year: string) => [source, year ? `(${year})` : ''].filter(Boolean).join(' ');

/** The quote book as prompt text, or '' when it is empty. */
export function quoteBookBlock(b: QuoteBook): string {
  const parts: string[] = [];
  const quotes = b.quotes.filter((q) => q.text);
  const mis = b.misattributions.filter((m) => m.text);
  const reading = b.reading.filter((r) => r.title);
  if (quotes.length) {
    parts.push(`\n## Vetted quotations\nThese are checked against their sources; you may quote them word for word and name the source. Quote any other wording only if it appears in the sources; otherwise paraphrase.\n${quotes.map((q) => `- "${q.text}" (${cite(q.source, q.year)})${q.note ? `. ${q.note}` : ''}`).join('\n')}`);
  }
  if (mis.length) {
    parts.push(`\n## Known misattributions\nIf the student quotes one of these as yours, say plainly that it is not your wording and give the verdict below, with the vetted wording and source where there is one. Do not accept it, build on it or quote it back as yours.\n${mis.map((m) => `- "${m.text}": ${m.verdict}`).join('\n')}`);
  }
  if (reading.length) {
    parts.push(`\n## Reading you may recommend\nWhen the student asks what to read, recommend only from this list, with the title and year as given. If nothing here fits, say so rather than naming another book.\n${reading.map((r) => `- ${cite(r.title, r.year)}${r.note ? `: ${r.note}` : ''}`).join('\n')}`);
  }
  return parts.join('\n') + (parts.length ? '\n' : '');
}

/** Vetted quotations as quotation-check sources. Negative ids keep them apart from material ids. */
export function quoteBookSources(b: QuoteBook): QuoteSource[] {
  return b.quotes.filter((q) => q.text).map((q, i) => ({ id: -(i + 1), title: cite(q.source, q.year) || 'vetted quotation', body: q.text }));
}
