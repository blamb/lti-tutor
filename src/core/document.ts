/**
 * Standalone HTML documents (inline CSS, no JavaScript): a transcript, a
 * paper script, a debrief, saved or printed by the reader. Model markdown
 * is re-levelled into a proper outline and rendered with no raw HTML
 * passthrough.
 */

import { marked } from 'marked';

const PRINT_CSS = `
  @page { margin: 2cm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; background: #fff; margin: 0; padding: 1.5rem; line-height: 1.55; font-size: 12pt; }
  main { max-width: 42em; margin: 0 auto; }
  h1 { font-size: 1.6em; margin: 0 0 .25em; line-height: 1.2; }
  h2 { font-size: 1.2em; margin: 1.5em 0 .4em; border-bottom: 1px solid #bbb; padding-bottom: .15em; page-break-after: avoid; }
  h3 { font-size: 1.05em; margin: 1.2em 0 .3em; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 1.4em; }
  .sub { color: #555; font-size: .95em; margin: 0 0 1.25em; }
  .write { margin: .5em 0 1.2em; page-break-inside: avoid; }
  .write div { border-bottom: 1px solid #999; height: 2em; }
  .foot { margin-top: 2.5em; padding-top: .75em; border-top: 1px solid #bbb; color: #555; font-size: .85em; }
  a { color: inherit; }
  @media screen { body { background: #f3f3f3; } main { background: #fff; padding: 2.5rem 3rem; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
`;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Re-level markdown headings so the top level is `base` and no heading is
 * more than one level deeper than the one before it (a proper outline).
 */
export function normalizeMarkdownHeadings(markdown: string, base = 2): string {
  const lines = markdown.split('\n');
  const levels = lines.map((l) => /^(#{1,6})\s/.exec(l)?.[1]?.length ?? 0).filter((n) => n > 0);
  if (levels.length === 0) return markdown;
  const top = Math.min(...levels);
  let prev = base - 1;
  return lines.map((l) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(l);
    if (!m) return l;
    let level = m[1]!.length - top + base;
    if (level > prev + 1) level = prev + 1;
    level = Math.min(6, Math.max(base, level));
    prev = level;
    return `${'#'.repeat(level)} ${m[2]}`;
  }).join('\n');
}

/** Model markdown → HTML with no raw HTML passthrough and [write] markers as ruled lines. */
export function markdownToPrintHtml(markdown: string): string {
  const safe = normalizeMarkdownHeadings(markdown, 1).replace(/</g, '&lt;');
  const html = marked.parse(safe, { gfm: true, breaks: false, async: false }) as string;
  const lines = '<div class="write" aria-label="Space to write">' + '<div></div>'.repeat(6) + '</div>';
  return html.replace(/<p>\s*\[write\]\s*<\/p>/g, lines).replace(/\[write\]/g, '');
}

export function standaloneHtml(opts: { title: string; subtitle?: string; markdown: string; footer?: string; lang?: string }): string {
  return `<!doctype html>
<html lang="${opts.lang ?? 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<main>
${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
${markdownToPrintHtml(opts.markdown)}
${opts.footer ? `<div class="foot">${escapeHtml(opts.footer)}</div>` : ''}
</main>
</body>
</html>
`;
}
