/**
 * Course pages: page content drafted from a module's readings and, when the
 * designer supplies one, the course outline.
 *
 * Three kinds. A reading guide sits at the top of a reading's page: why the
 * reading is here, the ideas to look for, questions to keep in mind. The
 * module overview is the first page of the Book: what the module is about,
 * the learning outcomes, what it covers and what the student will do. The
 * key takeaways are the last page.
 *
 * The wording is a model's, so the same two safeguards apply as for the
 * other drafted material. Every idea, topic and takeaway points at a passage
 * copied from a reading, and code confirms the passage is there (reading.ts,
 * checkQuotes). Learning outcomes are never drafted: they are copied from
 * the outline word for word, and code confirms that too; a module with no
 * outline gets no outcomes. And a page is built only once a person has
 * approved it.
 *
 * Nothing in this file calls a model.
 */

import type { Activity } from './index.js';

export interface PageKind {
  title: string;
  /** One line for the designer: what this page gives students. */
  asks: string;
  /** module: drafted from all the readings. reading: drafted from one. */
  scope: 'module' | 'reading';
}

export const PAGE_KINDS: Record<string, PageKind> = {
  overview: {
    title: 'Module Overview',
    asks: 'The first page of the module: what it is about, the learning outcomes from the outline, what the readings cover and what students will do.',
    scope: 'module',
  },
  guide: {
    title: 'Reading Guide',
    asks: 'At the top of the reading’s page: why this reading, the key ideas to look for, and questions to keep in mind.',
    scope: 'reading',
  },
  takeaways: {
    title: 'Key Takeaways',
    asks: 'The last page of the module: the main points of the readings, each with the passage it comes from.',
    scope: 'module',
  },
  // Two drafted activities, reviewed the same way and under the same rules as the pages.
  discussion: {
    title: 'Discussion',
    asks: 'One ungraded discussion forum for the module, with an opening prompt that starts from passages of the readings.',
    scope: 'module',
  },
  assignment: {
    title: 'Assignment',
    asks: 'One Assignment for the module: the task, what to hand in, suggested steps, and a rubric whose criteria each rest on a learning outcome from the outline.',
    scope: 'module',
  },
};
export const PAGE_TYPES: string[] = Object.keys(PAGE_KINDS);
/** A rubric's levels, best first. The labels and scores are fixed; the description under each is drafted. */
export const RUBRIC_LEVELS: { label: string; score: number }[] = [
  { label: 'Excellent', score: 3 }, { label: 'Good', score: 2 }, { label: 'Developing', score: 1 }, { label: 'Beginning', score: 0 },
];
export const DISCUSSION_HOW = 'Post your own answer first, in a paragraph or two. Then read a few other posts and reply to at least one, adding something to it: an example, a question, or a place where you see it differently. This discussion is not graded.';
export const isPageKind = (act: { type?: unknown }): boolean => typeof act.type === 'string' && Object.prototype.hasOwnProperty.call(PAGE_KINDS, act.type);

/** A passage is a short quotation, also on pages that only link to a copyrighted reading. */
export const PAGE_PASSAGE_MAX_CHARS = 420;

export interface Point { idea: string; explanation: string; passage: string }
export interface Covered { text: string; passage: string }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []).map((x) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v : []).map(str).filter(Boolean);

/** A guide's key ideas. */
export const pointsOf = (act: Activity): Point[] => list(act.points).map((o) => ({ idea: str(o.idea), explanation: str(o.explanation), passage: str(o.passage) }));
/** An overview's topics, or the takeaways: one statement each, with its passage. */
export const coveredOf = (act: Activity): Covered[] => list(act.type === 'overview' ? act.covers : act.points).map((o) => ({ text: str(o.text), passage: str(o.passage) }));
export const outcomesOf = (act: Activity): string[] => strings(act.outcomes);
/** A discussion's or an assignment's anchors: a passage and the line that goes with it (the question it raises, or why to draw on it). */
export const anchorsOf = (act: Activity): { passage: string; note: string }[] =>
  list(act.passages).map((o) => ({ passage: str(o.passage), note: str(act.type === 'discussion' ? o.question : o.why) }));
export interface Criterion { criterion: string; outcome: string; levels: string[] }
export const rubricOf = (act: Activity): Criterion[] => list(act.rubric).map((o) => ({ criterion: str(o.criterion), outcome: str(o.outcome), levels: (Array.isArray(o.levels) ? o.levels : []).map(str) }));
export const stepsOf = (act: Activity): string[] => strings(act.steps);
export const questionsOf = (act: Activity): string[] => strings(act.questions);

/** Problems that keep a drafted page out of the file, apart from the passage and outcome checks. Empty = fine. */
export function checkPage(act: Activity): string[] {
  const problems: string[] = [];
  if (!isPageKind(act)) return [`Unknown page type "${String(act.type)}".`];
  if (!str(act.title)) problems.push('The page has no title.');
  const long = (label: string, passage: string): void => {
    if (passage.length > PAGE_PASSAGE_MAX_CHARS) problems.push(`${label}: its passage is too long for a short quotation (${passage.length} characters; the limit is ${PAGE_PASSAGE_MAX_CHARS}).`);
  };
  if (act.type === 'guide') {
    if (!str(act.why)) problems.push('“Why this reading” is empty.');
    const points = pointsOf(act);
    if (!points.length) problems.push('The guide has no key ideas.');
    if (points.length > 8) problems.push('The guide has more than eight key ideas; keep the few that matter most.');
    points.forEach((p, i) => {
      if (!p.idea) problems.push(`Key idea ${i + 1}: it has no heading.`);
      if (!p.explanation) problems.push(`Key idea ${i + 1}: it has no explanation.`);
      long(`Key idea ${i + 1}`, p.passage);
    });
    return problems;
  }
  if (act.type === 'discussion') {
    if (!str(act.prompt)) problems.push('The opening prompt is empty.');
    const anchors = anchorsOf(act);
    if (!anchors.length) problems.push('The discussion has no passage to start from.');
    if (anchors.length > 4) problems.push('The discussion has more than four passages; keep the one or two that matter most.');
    anchors.forEach((a, i) => { if (!a.note) problems.push(`Passage ${i + 1}: it has no question.`); long(`Passage ${i + 1}`, a.passage); });
    return problems;
  }
  if (act.type === 'assignment') {
    if (!str(act.task)) problems.push('The task is empty.');
    if (!str(act.deliverable)) problems.push('“What to hand in” is empty.');
    anchorsOf(act).forEach((a, i) => long(`Passage ${i + 1}`, a.passage));
    const rubric = rubricOf(act);
    if (rubric.length > 6) problems.push('The rubric has more than six criteria; keep the few that matter most.');
    rubric.forEach((c, i) => {
      if (!c.criterion) problems.push(`Criterion ${i + 1}: it has no name.`);
      if (c.levels.length !== RUBRIC_LEVELS.length || c.levels.some((l) => !l)) problems.push(`Criterion ${i + 1}: it needs a description for each of the ${RUBRIC_LEVELS.length} levels (${RUBRIC_LEVELS.map((l) => l.label).join(', ')}).`);
    });
    return problems;
  }
  if (act.type === 'overview') {
    if (!str(act.intro)) problems.push('The introduction is empty.');
    const covers = coveredOf(act);
    if (!covers.length) problems.push('“What this module covers” is empty.');
    covers.forEach((c, i) => { if (!c.text) problems.push(`Topic ${i + 1}: it has no text.`); long(`Topic ${i + 1}`, c.passage); });
    return problems;
  }
  const points = coveredOf(act);
  if (!points.length) problems.push('There are no takeaways.');
  if (points.length > 10) problems.push('There are more than ten takeaways; keep the few that matter most.');
  points.forEach((p, i) => { if (!p.text) problems.push(`Takeaway ${i + 1}: it has no text.`); long(`Takeaway ${i + 1}`, p.passage); });
  return problems;
}

/** The line every drafted page section carries. It is only true of approved pages, which is all that is built. */
export function pageDisclosure(type: string, model?: string): string {
  const what = type === 'guide' ? 'This guide was' : type === 'overview' ? 'This overview was' : type === 'discussion' ? 'This prompt was'
    : type === 'assignment' ? 'This assignment and its rubric were' : 'These takeaways were';
  const from = type === 'guide' ? 'the text of this reading' : type === 'overview' || type === 'assignment' ? 'this module’s readings and the course outline' : 'this module’s readings';
  return `${what} drafted with AI${model ? ` (${model})` : ''} from ${from} and reviewed by the course team.`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A passage as shown to students: a web page's note markers ("[12]", "[citation needed]") are dropped, as in any quotation. */
const shown = (passage: string): string => esc(passage.replace(/\s*\[(?:\d{1,3}|citation needed|note \d+)\]/gi, '').trim()
  // The page puts its own quotation marks round a passage, so a pair the source already had round the whole of it goes.
  .replace(/^["“]([^"“”]*)["”]$/, '$1'));
const SMALL = 'font-size:.85rem;color:#495057';
const QUOTE = 'border-left:4px solid #6c757d;margin:.75rem 0 .5rem;padding:.25rem 0 .25rem 1rem;font-style:italic';
const INFO = '<i class="fa fa-circle-info" aria-hidden="true"></i> ';
const CALLOUT = 'border-left:5px solid #0f6cbf;background:#eef5fb;padding:1rem 1.25rem;margin:1rem 0 1.25rem;border-radius:.375rem';
const DETAILS = 'border:1px solid #ced4da;border-radius:.375rem;margin:.5rem 0;padding:.6rem .9rem';
const SUMMARY = 'cursor:pointer;font-weight:600';

/** Minutes to read a text at a study pace, rounded up to five. */
export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.ceil(words / 200 / 5) * 5);
}

/** A reading guide, as the top of its reading's page. The reading (or the link to it) follows under its own heading. */
export function guideHtml(act: Activity, disclosure: string): string {
  let html = `<div style="${CALLOUT}"><strong>Why this reading</strong><br>${esc(str(act.why))}</div>`
    + '\n<h4>Key ideas to look for</h4>\n<p>Open each one for a short explanation and the place in the reading where it comes up.</p>';
  for (const p of pointsOf(act)) {
    html += `\n<details style="${DETAILS}"><summary style="${SUMMARY}">${esc(p.idea)}</summary>\n<p style="margin:.6rem 0 0">${esc(p.explanation)}</p>`
      + `\n<blockquote style="${QUOTE}">“${shown(p.passage)}”</blockquote></details>`;
  }
  const questions = questionsOf(act);
  if (questions.length) {
    html += '\n<h4>Questions to keep in mind</h4>\n<p>The reading answers these. See if you can answer them in your own words when you finish.</p>\n<ul>\n'
      + questions.map((q) => `<li>${esc(q)}</li>`).join('\n') + '\n</ul>';
  }
  return html + `\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>`;
}

export interface OverviewStep { title: string; href: string; minutes: number; linkOnly: boolean; doing: string[] }

/** The module overview's own page. `steps` is what the Book holds, worked out by code, not drafted. */
export function overviewHtml(act: Activity, disclosure: string, steps: OverviewStep[], after: string[] = []): string {
  let html = `<p>${esc(str(act.intro))}</p>`;
  const outcomes = outcomesOf(act);
  if (outcomes.length) {
    html += '\n<h4>Learning outcomes</h4>\n<p>By the end of this module you should be able to:</p>\n<ul>\n'
      + outcomes.map((o) => `<li>${esc(o)}</li>`).join('\n') + '\n</ul>';
  }
  html += '\n<h4>What this module covers</h4>\n<ul>\n' + coveredOf(act).map((c) => `<li>${esc(c.text)}</li>`).join('\n') + '\n</ul>';
  if (steps.length || after.length) {
    html += '\n<h4>What you will do</h4>\n<ol>\n' + steps.map((s) => {
      const read = `Read <a href="${s.href}">${esc(s.title)}</a> (about ${s.minutes} minutes${s.linkOnly ? '; the page links to it' : ''})`;
      return `<li>${read}${s.doing.length ? ', then ' + s.doing.join(' and ') : ''}.</li>`;
    }).join('\n') + after.map((a) => `\n<li>${a}</li>`).join('') + '\n</ol>';
  }
  return html + `\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>`;
}

export interface TakeawaySource { title: string; href: string }

/** The key takeaways' own page. `sources[i]` is the reading takeaway i was found in, worked out by code. */
export function takeawaysHtml(act: Activity, disclosure: string, sources: (TakeawaySource | undefined)[]): string {
  let html = '<p>The main points of this module’s readings. Open “Where this comes from” under any of them to see the passage it rests on.</p>';
  coveredOf(act).forEach((p, i) => {
    const src = sources[i];
    html += `\n<p style="margin:1.1rem 0 .25rem"><strong>${i + 1}. ${esc(p.text)}</strong></p>`
      + `\n<details style="${DETAILS}"><summary style="cursor:pointer;${SMALL}">Where this comes from</summary>`
      + `\n<blockquote style="${QUOTE}">“${shown(p.passage)}”</blockquote>`
      + (src ? `\n<p style="${SMALL};margin:0">From <a href="${src.href}">${esc(src.title)}</a>.</p>` : '') + '</details>';
  });
  return html + `\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>`;
}

/** The first post of the module's discussion forum. `sources[i]` is the reading passage i was found in. */
export function discussionForumHtml(act: Activity, disclosure: string, sources: (TakeawaySource | undefined)[]): string {
  let html = `<p>${esc(str(act.prompt))}</p>`;
  anchorsOf(act).forEach((a, i) => {
    const src = sources[i];
    html += `\n<blockquote style="${QUOTE}">“${shown(a.passage)}”${src ? ` <span style="font-style:normal;${SMALL}">(<a href="${src.href}">${esc(src.title)}</a>)</span>` : ''}</blockquote>\n<p>${esc(a.note)}</p>`;
  });
  return html + `\n<p>${esc(DISCUSSION_HOW)}</p>\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>`;
}

/** The Assignment's description. The rubric itself is attached to the Assignment as Moodle's advanced grading, and shown to students there. */
export function assignmentHtml(act: Activity, disclosure: string, sources: (TakeawaySource | undefined)[]): string {
  let html = `<p>${esc(str(act.task))}</p>\n<h4>What to hand in</h4>\n<p>${esc(str(act.deliverable))}</p>`;
  const steps = stepsOf(act);
  if (steps.length) html += '\n<h4>Suggested steps</h4>\n<ol>\n' + steps.map((s) => `<li>${esc(s)}</li>`).join('\n') + '\n</ol>';
  const anchors = anchorsOf(act);
  if (anchors.length) {
    html += '\n<h4>Parts of the readings to draw on</h4>';
    anchors.forEach((a, i) => {
      const src = sources[i];
      html += `\n<blockquote style="${QUOTE}">“${shown(a.passage)}”${src ? ` <span style="font-style:normal;${SMALL}">(<a href="${src.href}">${esc(src.title)}</a>)</span>` : ''}</blockquote>${a.note ? `\n<p>${esc(a.note)}</p>` : ''}`;
    });
  }
  if (rubricOf(act).length) html += '\n<h4>How it is marked</h4>\n<p>With the rubric shown on this page. Each criterion is tied to one of the module’s learning outcomes.</p>';
  return html + `\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>`;
}
