/**
 * Module builder engine: Word course draft -> Moodle restore file (.mbz).
 *
 * A port of the Python module builder (draft.py, pages.py, h5p.py, mbz.py and
 * the build_module.py command line) that works on bytes in memory.
 *
 *   draft.ts   reads the .docx into blocks
 *   pages.ts   acts on the production notes and writes each chapter's HTML
 *   h5p.ts     builds .h5p packages from the activity specs
 *   mbz.ts     writes the backup
 *
 * The two steps are the same as in the Python tool. inspectDraft is the fixed
 * rules alone: it shows what the draft holds and lists the H5P specs as the
 * author worded them. Someone (or a model) turns those into a ModuleSpec, and
 * buildModule then makes the restore file, the build report and the list of
 * specs found, with the same text the Python command line wrote to
 * build-report.md and h5p-specs-found.md.
 */

import { Draft } from './draft.js';
import { Builder, slug, specText, type FoundSlot } from './pages.js';
import { ACTIVITY_TYPES as TYPES, LIB, checkActivity as check, librariesUsed, packageH5p } from './h5p.js';
import { buildMbz } from './mbz.js';
import { S, cmp, pad } from './py.js';

export interface Activity { n: number; type: string; title: string; interpretation?: string; [k: string]: unknown }
export interface ModuleSpec {
  prefix?: string;
  overrides?: Record<string, unknown>;       // same keys the Python Builder accepts, e.g. drop_text_matching
  h5p_versions?: Record<string, string>;
  activities?: Activity[];
}
export interface Slot { n: number; title: string; chapter: string; under: string; type: string; text: string }  // text = spec_text(slot)
export interface Chapter { title: string; html: string }
export interface BuildOptions { sourceName: string; course?: string; section?: number; visible?: boolean }
export interface BuildResult {
  name: string;                 // module name (Builder.name)
  fileName: string;             // slug(name) + '.mbz'
  mbz: Uint8Array;
  report: string;               // build-report.md text, same as the Python CLI writes
  specsFound: string;           // h5p-specs-found.md text
  chapters: Chapter[];
  slots: Slot[];
  h5p: Record<string, Uint8Array>;   // package file name -> bytes
  images: Record<string, Uint8Array>; // image file name -> bytes (Builder.files)
  counts: Record<string, number | string>;  // the "What was built" rows, label -> value
  todo: string[];
  judgement: string[];          // judgement + dropped, as in the report
}

const NOTES_LEFT = new RegExp(`\\[@?${S}*Production`, 'g');

const toSlot = (s: FoundSlot): Slot => ({ n: s.n, title: s.title, chapter: s.chapter, under: s.under, type: s.type, text: specText(s) });
const toChapter = (c: { title: string; html: string }): Chapter => ({ title: c.title, html: c.html });

/** Read the draft and apply the page rules without building any H5P: what the draft contains and which specs need interpreting. */
export function inspectDraft(docx: Uint8Array, overrides?: Record<string, unknown>, prefix?: string): { name: string; chapters: Chapter[]; slots: Slot[]; todo: string[] } {
  const b = new Builder(new Draft(docx), null, overrides, prefix ?? 'm');
  return { name: b.name, chapters: b.chapters.map(toChapter), slots: b.slots.map(toSlot), todo: [...b.report.todo] };
}

/** The full build. Activities missing from the spec are left as the Python tool leaves them (report says NOT BUILT). */
export function buildModule(docx: Uint8Array, spec: ModuleSpec, opts: BuildOptions): BuildResult {
  const prefix = spec.prefix ?? 'm';
  const versions = spec.h5p_versions;
  const listed = Array.isArray(spec.activities) ? spec.activities : [];

  // One bad activity must not block the file: a package that cannot be built is
  // reported and its slot is left as the Python tool leaves a missing one.
  const packages: Record<string, Uint8Array> = {};
  const names: Record<number, string> = {};
  const built: Activity[] = [];
  const failed: string[] = [];
  listed.forEach((act, index) => {
    const label = act && typeof act === 'object'
      ? `H5P activity #${String(act.n ?? '?')}${typeof act.title === 'string' ? ` (${act.title})` : ''}`
      : `Activity ${index + 1} in the spec`;
    try {
      if (!act || typeof act !== 'object') throw new Error('not an object');
      if (typeof act.n !== 'number' || !Number.isFinite(act.n)) throw new Error('missing "n", the number of the spec it answers');
      if (typeof act.title !== 'string') throw new Error('missing "title"');
      const name = `${prefix}-h5p-${pad(act.n, 2)}-${slug(act.title)}.h5p`;
      const bytes = packageH5p(act, versions);
      librariesUsed(act, versions);
      packages[name] = bytes;
      names[act.n] = name;
      built.push(act);
    } catch (e) {
      failed.push(`${label} could not be built: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const b = new Builder(new Draft(docx), names, spec.overrides, prefix);
  const files: Record<string, Uint8Array> = { ...b.files, ...packages };
  const short = opts.course || slug(b.name).toUpperCase();
  const fileName = `${slug(b.name)}.mbz`;
  const stats = buildMbz(fileName, { fullname: b.name, shortname: short }, { name: b.name },
    [{ name: b.name, chapters: b.chapters, files }],
    { hidden: !opts.visible, sectionNumber: opts.section ?? 1 });

  let specsFound = '# H5P specs found in the draft\n\nRed words in the draft are shown as `<mark>`.\n';
  for (const s of b.slots) {
    specsFound += `\n## ${s.n}. ${s.title || '(no title)'}\n\nChapter: ${s.chapter}. Under: ${s.under}.\n\n\`\`\`\n${specText(s)}\n\`\`\`\n`;
  }

  const acts = new Map<number, Activity>();
  for (const a of built) acts.set(a.n, a);
  const html_all = b.chapters.map((c) => c.html).join('\n');
  const r = b.report;
  const todo = [...r.todo, ...failed];
  const judgement = [...r.judgement, ...r.dropped];
  // As in the Python: the first "<number> steps" in each line, which is the count unless a chapter title contains the same words.
  const steps = r.accordion.reduce((sum, s) => sum + parseInt(/(\d+) steps/.exec(s)![1]!, 10), 0);
  const rows: [string, number | string][] = [
    ['Book chapters', b.chapters.length], ['H5P activities embedded', r.h5p.length],
    ['H5P specs found in the draft', b.slots.length],
    ['Accordions', `${r.accordion.length} (${steps} steps)`],
    ['Pop-up hints and answers', r.tooltip.length], ['Collapsed solution panels', r.panel.length],
    ['Callouts', r.callout.length], ['Code blocks', r.code.filter((c) => c.includes('code block')).length],
    ['"Show code" toggles', r.code.filter((c) => c.includes('Show code')).length],
    ['Data tables', r.table.length], ['Images', Object.keys(b.files).length],
    ['Files in the backup', stats.files],
    ['Production notes left in the text', (html_all.match(NOTES_LEFT) ?? []).length],
    ['Icon markers left in the text', html_all.split('[fa-').length - 1]];

  let report = `# Build report: ${b.name}\n\nSource: ${opts.sourceName}\n\n`;
  report += '## What was built\n\n| Item | Count |\n|---|---|\n';
  for (const [k, v] of rows) report += `| ${k} | ${v} |\n`;
  report += '\n## Needs a person before publishing\n\n';
  for (const t of todo) report += `- ${t}\n`;
  report += '\n## Judgement calls made by the page rules\n\n';
  for (const t of judgement) report += `- ${t}\n`;
  report += '\n## H5P activities and how each spec was read\n\n| # | Chapter | Draft asks for | Built as | Title | Note |\n|---|---|---|---|---|---|\n';
  for (const s of b.slots) {
    const act = acts.get(s.n);
    report += `| ${s.n} | ${s.chapter} | ${s.type} | ${act ? act.type : 'NOT BUILT'} | ${act ? act.title : ''} | ${act && act.interpretation !== undefined ? String(act.interpretation) : ''} |\n`;
  }
  report += '\n## H5P versions this file expects on the Moodle site\n\n';
  const need: Record<string, string> = {};
  for (const act of built) Object.assign(need, librariesUsed(act, versions));
  const main = Object.values(LIB);
  for (const k of Object.keys(need).sort(cmp)) {
    if ((k.startsWith('H5P.') && main.includes(k)) || k === 'H5P.AdvancedText') report += `- ${k} ${need[k]}\n`;
  }
  for (const [key, title] of [['accordion', 'Accordions'], ['tooltip', 'Pop-up hints and answers'], ['panel', 'Collapsed panels']] as const) {
    report += `\n## ${title}\n\n`;
    for (const t of r[key]) report += `- ${t}\n`;
  }

  return {
    name: b.name, fileName, mbz: stats.mbz, report, specsFound,
    chapters: b.chapters.map(toChapter), slots: b.slots.map(toSlot),
    h5p: packages, images: { ...b.files },
    counts: Object.fromEntries(rows), todo, judgement,
  };
}

/** Problems with one activity spec that would make h5p.package throw or produce a broken activity (missing fields, zone index out of range, no correct answer...). Empty array = fine. */
export function checkActivity(act: Activity): string[] {
  return check(act);
}

export const ACTIVITY_TYPES: string[] = TYPES;   // the types h5p.ts can build
