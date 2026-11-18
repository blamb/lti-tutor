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
import { buildMbz, forumLink, bookPageLink, assignLink, type MbzAssign, quizLink, glossaryLink, glossaryImportXml, type MbzForum, type MbzQuestion, type MbzQuiz, type MbzGlossary } from './mbz.js';
import {
  isRhizo, isContract, checkRhizo, rhizoDisclosure, rhizoPageHtml, rhizoForumHtml, contractPageHtml, contractForumHtml,
  trailsOf, partsOf, placeOf, RHIZO_KINDS, CREDIT_TEXT,
} from './rhizo.js';
import {
  isPageKind, checkPage, pageDisclosure, guideHtml, overviewHtml, takeawaysHtml, pointsOf, coveredOf, outcomesOf, questionsOf, readingMinutes,
  anchorsOf, rubricOf, stepsOf, discussionForumHtml, assignmentHtml, RUBRIC_LEVELS, PAGE_KINDS, type OverviewStep,
} from './coursepage.js';
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
  /** rhizmode: the activities are open prompts (rhizo.ts), not practice questions. */
  mode?: 'practice' | 'rhizmode';
  /** The model that drafted the activities, named on RhizMode pages. */
  model?: string;
  /** Where the practice questions go: H5P on each reading's page (the default), one Moodle Quiz for the module, or both. */
  questions_as?: 'h5p' | 'quiz' | 'both';
  /** Where the key terms go: H5P flashcards on each page (the default), one Moodle Glossary for the module, or both. */
  terms_as?: 'h5p' | 'glossary' | 'both';
  /** The activities a person has approved. A Quiz is graded, so it takes only questions from approved sets. */
  approved?: number[];
  /** The course outline, when the designer gave one. Learning outcomes on the overview page must be in it word for word. */
  outline?: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => esc(s).replace(/"/g, '&quot;');
const EMBED = (name: string): string => `<div class="h5p-placeholder" contenteditable="false">@@PLUGINFILE@@/${name}</div>`;
const TODO = (text: string): string =>
  '<div style="border-left:5px solid #b45309;background:#fff8e6;padding:1rem 1.25rem;margin:1.25rem 0;border-radius:.375rem">'
  + `<strong>To do before publishing:</strong> ${esc(text)}</div>`;

/** Author text with the few inline tags the drafts may use (<code>, <strong>, <em>); everything else is escaped. */
const inlineHtml = (s: string): string => esc(s).replace(/&lt;(\/?(?:code|strong|em))&gt;/g, '<$1>');
const para = (s: string): string => (s.trim() ? `<p>${inlineHtml(s.trim())}</p>` : '');
export const QUIZ_DISCLOSURE = 'These questions were drafted with AI from this module’s readings and reviewed by the course team.';

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

/**
 * Every item of an activity that should rest on a sentence of the reading, with whether that sentence is there.
 * For a page drafted from the whole module (coursepage.ts) `readingText` is all the readings together, and
 * `outline` is the course outline its learning outcomes must be copied from.
 */
export function checkQuotes(act: Activity, readingText: string, outline = ''): QuoteCheck[] {
  const source = normForQuote(readingText);
  const one = (label: string, q: unknown, within = source): QuoteCheck => {
    const quote = typeof q === 'string' ? q : '';
    const n = normForQuote(quote);
    return { label, quote, found: n.length >= 12 && within.includes(n) };
  };
  const items = (list: unknown, word: string, field = 'source_quote'): QuoteCheck[] =>
    Array.isArray(list) ? list.map((x, i) => one(`${word} ${i + 1}`, (x as Record<string, unknown> | null)?.[field])) : [];
  if (act.type === 'guide') return items(act.points, 'Key idea', 'passage');
  if (act.type === 'discussion') return items(act.passages, 'Passage', 'passage');
  if (act.type === 'assignment') {
    const o = normForQuote(outline);
    // A rubric criterion rests on an outcome of the course, copied from the outline like the overview's.
    return [...rubricOf(act).map((c, i) => one(`Outcome for criterion ${i + 1}`, c.outcome, o)), ...items(act.passages, 'Passage', 'passage')];
  }
  if (act.type === 'takeaways') return items(act.points, 'Takeaway', 'passage');
  if (act.type === 'overview') {
    const o = normForQuote(outline);
    return [...outcomesOf(act).map((text, i) => one(`Outcome ${i + 1}`, text, o)), ...items(act.covers, 'Topic', 'passage')];
  }
  // RhizMode: the passage each prompt is anchored to. A Community Contract belongs to the whole module and has none.
  if (isContract(act)) return [];
  if (isRhizo(act)) return items(act.trails, 'Passage', 'passage');
  if (act.type === 'questionset') return items(act.questions, 'Question');
  if (act.type === 'summary') return items(act.sets, 'Statement');
  if (act.type === 'crossword') return items(act.words, 'Word');
  if (act.type === 'timeline') return items(act.events, 'Event');
  if (act.type === 'dialogcards') return items(act.cards, 'Card');
  return [one('This activity', act.source_quote)];
}

/** Problems that keep a drafted activity out of the file: what checkActivity finds, plus any item whose quotation is not in the reading. */
export function checkDrafted(act: Activity, readingText: string, outline = ''): string[] {
  if (isPageKind(act)) {
    const problems = checkPage(act);
    for (const q of checkQuotes(act, readingText, outline)) {
      if (q.found) continue;
      if (q.label.startsWith('Outcome')) problems.push(`${q.label}: it is not in the course outline word for word. Outcomes are copied from the outline, never drafted.`);
      else problems.push(q.quote ? `${q.label}: its passage is not in the ${act.type === 'guide' ? 'reading' : 'readings'} as quoted.` : `${q.label}: no passage was given.`);
    }
    return problems;
  }
  if (isRhizo(act)) {
    const problems = checkRhizo(act);
    for (const q of checkQuotes(act, readingText)) {
      if (!q.found) problems.push(q.quote ? `${q.label}: it is not in the reading as quoted.` : `${q.label}: no passage was given.`);
    }
    return problems;
  }
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
  const rhizmode = mod.mode === 'rhizmode';
  const open: ReadingActivity[] = [];      // RhizMode activities that passed their checks
  const forums: MbzForum[] = [];
  const drafted: ReadingActivity[] = [];   // course pages that passed their checks
  const corpus = mod.readings.map((r) => r.text).join('\n\n');

  const questionsAs = rhizmode ? 'h5p' : mod.questions_as ?? 'h5p';
  const termsAs = rhizmode ? 'h5p' : mod.terms_as ?? 'h5p';
  const approved = new Set(mod.approved ?? []);
  const quizQuestions: MbzQuestion[] = [];
  const quizRows: { reading: string; name: string; text: string; key: string; quote: string }[] = [];
  const terms: { concept: string; definition: string; reading: string }[] = [];
  const titleOf = (rid: number): string => mod.readings.find((x) => x.id === rid)?.title ?? '';

  for (const act of mod.activities) {
    // Practice questions for the module's Quiz: only sets a person approved, and only items whose key rests on the reading.
    if (act.type === 'questionset' && questionsAs !== 'h5p') {
      const r = mod.readings.find((x) => x.id === act.reading);
      const problems = r ? checkDrafted(act, r.text) : ['its reading is no longer in the module.'];
      if (problems.length) todo.push(`${String(act.title)} is not in the Quiz: ${problems.join(' ')}`);
      else if (!approved.has(act.n)) judgement.push(`${String(act.title)}: not in the Quiz, because it has not been approved. A Quiz is graded, so it takes only questions a person has approved.`);
      else {
        (Array.isArray(act.questions) ? act.questions as Record<string, unknown>[] : []).forEach((q, i) => {
          const name = `${titleOf(act.reading)}: question ${i + 1}`.slice(0, 250);
          const answers = (Array.isArray(q.answers) ? q.answers as Record<string, unknown>[] : []);
          if (q.type === 'truefalse') {
            quizQuestions.push({ type: 'truefalse', name, text: para(String(q.question ?? '')), correct: q.correct === true, feedback: para(String(q.feedback ?? '')) });
          } else if (q.type === 'multichoice' && answers.filter((a) => a.correct).length === 1) {
            quizQuestions.push({ type: 'multichoice', name, text: para(String(q.question ?? '')),
              answers: answers.map((a) => ({ text: para(String(a.text ?? '')), correct: a.correct === true, feedback: para(String(a.feedback ?? '')) })) });
          } else {
            judgement.push(`${name} is not in the Quiz: the Quiz takes true/false questions and multiple-choice questions with one correct answer.`);
            return;
          }
          quizRows.push({ reading: titleOf(act.reading), name, text: String(q.question ?? ''), key: keyOf(q), quote: String(q.source_quote ?? '') });
        });
      }
      if (questionsAs === 'quiz') continue;
    }
    // Key terms for the module's Glossary: each term once, the first reading that defines it wins.
    if (act.type === 'dialogcards' && termsAs !== 'h5p') {
      const r = mod.readings.find((x) => x.id === act.reading);
      const problems = r ? checkDrafted(act, r.text) : ['its reading is no longer in the module.'];
      if (problems.length) todo.push(`${String(act.title)} is not in the Glossary file: ${problems.join(' ')}`);
      else for (const c of (Array.isArray(act.cards) ? act.cards as Record<string, unknown>[] : [])) {
        const concept = String(c.front ?? '').replace(/<[^>]+>/g, '').trim();
        if (concept && !terms.some((t) => t.concept.toLowerCase() === concept.toLowerCase())) terms.push({ concept, definition: para(String(c.back ?? '')), reading: titleOf(act.reading) });
      }
      if (termsAs === 'glossary') continue;
    }
    if (isPageKind(act)) {
      const r = mod.readings.find((x) => x.id === act.reading);
      const problems = act.type !== 'guide' ? checkDrafted(act, corpus, mod.outline ?? '')
        : r ? checkDrafted(act, r.text) : ['its reading is no longer in the module.'];
      if (problems.length) todo.push(`${String(act.title)} could not be built: ${problems.join(' ')}`);
      else drafted.push(act);
      continue;
    }
    if (isRhizo(act)) {
      const r = mod.readings.find((x) => x.id === act.reading);
      const problems = isContract(act) ? checkRhizo(act) : r ? checkDrafted(act, r.text) : ['its reading is no longer in the module.'];
      if (problems.length) todo.push(`${String(act.title)} could not be built: ${problems.join(' ')}`);
      else open.push(act);
      continue;
    }
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

  // The Community Contract, when there is one, is the first page and the first forum.
  const contract = open.find(isContract);
  const overview = drafted.find((a) => a.type === 'overview');
  const takeaways = drafted.find((a) => a.type === 'takeaways');
  // Pages ahead of the first reading: the overview, then the contract.
  const first = (overview ? 1 : 0) + (contract ? 1 : 0);
  const readingHref = (i: number): string => bookPageLink(0, first + i + 1);
  // Which reading a passage is in is found by code, not taken from the model.
  const sourceOfPassage = (passage: string): { title: string; href: string } | undefined => {
    const n = normForQuote(passage);
    const i = mod.readings.findIndex((r) => normForQuote(r.text).includes(n));
    return i < 0 ? undefined : { title: mod.readings[i]!.title, href: readingHref(i) };
  };
  let contractPage: { title: string; html: string } | undefined;
  if (contract) {
    const note = rhizoDisclosure(mod.model, true);
    const discuss = placeOf(contract) === 'discussion';
    if (discuss) forums.push({ name: String(contract.title), intro: contractForumHtml(contract, note) });
    contractPage = { title: RHIZO_KINDS.contract!.title, html: contractPageHtml(contract, note, discuss ? forumLink(0) : undefined) };
  }

  const readingPages = mod.readings.map((r, page) => {
    const mine = built.filter((b) => b.act.reading === r.id);
    const prompts = open.filter((a) => !isContract(a) && a.reading === r.id);
    let html = '';
    const guide = drafted.find((a) => a.type === 'guide' && a.reading === r.id);
    if (guide) html += guideHtml(guide, pageDisclosure('guide', mod.model)) + '\n<h4>The reading</h4>\n';
    if (r.include_text) {
      html += textToHtml(r.text, r.title);
      if (!r.license) todo.push(`${r.title}: the text of this reading is on the page and no open licence was found. Confirm you have the right to reuse it, or switch the page to "link only".`);
    } else if (r.source_url) {
      html += `<p>Read <a href="${escAttr(r.source_url)}" target="_blank" rel="noopener">${esc(r.title)}</a>, then return to this page for the ${rhizmode ? 'prompts below' : 'practice activities'}.</p>`;
    } else {
      html += TODO(`Add the reading "${r.title}" here, or a link to it. Its text is not on this page.`);
      todo.push(`${r.title}: the page has no text and no link to the reading. Add the file or a link.`);
    }
    if (mine.length) {
      html += `\n<h4>Check Your Understanding</h4>\n<p style="font-size:.9rem;color:#495057"><i class="fa fa-circle-info" aria-hidden="true"></i> ${esc(disclosure)}</p>`;
      // The activity shows its own full title; the page heading is the short form before the colon.
      for (const b of mine) html += `\n<h5>${esc(String(b.act.title).split(':')[0]!.trim())}</h5>\n${EMBED(b.name)}`;
    }
    for (const act of prompts) {
      const note = rhizoDisclosure(mod.model);
      if (placeOf(act) === 'discussion') {
        const i = forums.length;
        forums.push({ name: String(act.title), intro: rhizoForumHtml(act, r.title, note, bookPageLink(0, first + page + 1)) });
        html += rhizoPageHtml(act, note, forumLink(i));
      } else {
        html += rhizoPageHtml(act, note);
      }
    }
    const credit = [r.attribution, r.license && !r.attribution.includes(r.license) ? r.license : ''].filter(Boolean).join('. ');
    if (credit || r.source_url) {
      html += '\n<hr>\n<p style="font-size:.85rem;color:#495057">'
        + (credit ? `Source: ${linkify(esc(credit))}${/[.!?]$/.test(credit) ? '' : '.'} ` : '')
        + (r.source_url ? `<a href="${escAttr(r.source_url)}" target="_blank" rel="noopener">Original</a>.` : '') + '</p>';
    } else {
      todo.push(`${r.title}: no source or attribution is recorded for this reading. Add a credit line to the page.`);
    }
    if (!mine.length && !prompts.length) judgement.push(`${r.title}: no ${rhizmode ? 'prompts' : 'practice activities'} are on this page.`);
    return { title: r.title, html };
  });
  const chapters = contractPage ? [contractPage, ...readingPages] : readingPages;
  // The module's own discussion and assignment come after the Book.
  const discussion = drafted.find((a) => a.type === 'discussion');
  let discussionForum = -1;
  if (discussion) {
    discussionForum = forums.length;
    forums.push({ name: `${mod.name}: Discussion`.slice(0, 250), intro: discussionForumHtml(discussion, pageDisclosure('discussion', mod.model), anchorsOf(discussion).map((a) => sourceOfPassage(a.passage))) });
  }
  const assignment = drafted.find((a) => a.type === 'assignment');
  const assignments: MbzAssign[] = [];
  if (assignment) {
    const rubric = rubricOf(assignment);
    assignments.push({
      name: `${mod.name}: Assignment`.slice(0, 250),
      intro: assignmentHtml(assignment, pageDisclosure('assignment', mod.model), anchorsOf(assignment).map((a) => sourceOfPassage(a.passage))),
      rubric: rubric.length ? {
        name: `${mod.name}: rubric`.slice(0, 250),
        criteria: rubric.map((c) => ({
          description: `${c.criterion}. Learning outcome: ${c.outcome}`,
          levels: RUBRIC_LEVELS.map((l, i) => ({ score: l.score, definition: `${l.label}: ${c.levels[i] ?? ''}` })),
        })),
      } : undefined,
    });
    judgement.push(rubric.length
      ? `The Assignment is marked out of 100 with a rubric of ${rubric.length} criteria at ${RUBRIC_LEVELS.length} levels (${RUBRIC_LEVELS.map((l) => `${l.label} ${l.score}`).join(', ')} points each); Moodle scales the total to the grade. It takes online text or up to three files, has no due date, and has a gradebook column. Change any of this in its settings after restoring.`
      : 'The Assignment has no rubric, because no learning outcomes were available to tie criteria to. It is marked out of 100 by direct grading. Add the course outline and draft it again for a rubric.');
  }
  if (overview) {
    const steps: OverviewStep[] = mod.readings.map((r, i) => ({
      title: r.title, href: readingHref(i), minutes: readingMinutes(r.text), linkOnly: !r.include_text,
      doing: [
        ...(built.some((b) => b.act.reading === r.id) ? ['try the practice activities on its page'] : []),
        ...(open.some((a) => !isContract(a) && a.reading === r.id) ? ['answer the prompts on its page'] : []),
      ],
    }));
    const after = [
      ...(takeaways ? [`Review the <a href="${bookPageLink(0, first + mod.readings.length + 1)}">${esc(PAGE_KINDS.takeaways!.title)}</a>.`] : []),
      ...(terms.length ? [`Look up terms in the <a href="${glossaryLink(0)}">Glossary</a> whenever you need them.`] : []),
      ...(discussion ? [`Join the <a href="${forumLink(discussionForum)}">Discussion</a>.`] : []),
      ...(quizQuestions.length ? [`Take the <a href="${quizLink(0)}">Quiz</a>.`] : []),
      ...(assignment ? [`Complete the <a href="${assignLink(0)}">Assignment</a>.`] : []),
    ];
    chapters.unshift({ title: PAGE_KINDS.overview!.title, html: overviewHtml(overview, pageDisclosure('overview', mod.model), steps, after) });
  }
  if (takeaways) {
    // Which reading each takeaway rests on is found by code, not taken from the model.
    const sources = coveredOf(takeaways).map((p) => sourceOfPassage(p.passage));
    chapters.push({ title: PAGE_KINDS.takeaways!.title, html: takeawaysHtml(takeaways, pageDisclosure('takeaways', mod.model), sources) });
  }

  const fileName = `${slug(mod.name) || 'module'}.mbz`;
  const quizzes: MbzQuiz[] = quizQuestions.length ? [{ name: `${mod.name}: Quiz`.slice(0, 250), intro: `<p>${esc(QUIZ_DISCLOSURE)}</p>`, questions: quizQuestions }] : [];
  const glossaryName = `${mod.name}: Key Terms`.slice(0, 250);
  const glossaries: MbzGlossary[] = terms.length ? [{ name: glossaryName, intro: '<p>The key terms of this module’s readings, in the readings’ own words.</p>' }] : [];
  if (terms.length) todo.push(`The Glossary arrives empty: Moodle restores glossary entries only for site managers. After restoring, open “${glossaryName}”, choose Import entries, and give it the glossary file from the Download tab (${terms.length} terms).`);
  if (quizzes.length) judgement.push(`The Quiz has ${quizQuestions.length} questions, is marked out of 10, allows unlimited attempts and keeps the highest grade. It has a column in the gradebook. Change any of this in the Quiz’s settings after restoring.`);
  const stats = buildMbz(fileName, { fullname: mod.name, shortname: opts.course || slug(mod.name).toUpperCase() }, { name: mod.name },
    [{ name: mod.name, chapters, files: packages }], { hidden: !opts.visible, sectionNumber: opts.section ?? 1, forums, quizzes, glossaries, assignments });

  const items = built.reduce((n, b) => n + checkQuotes(b.act, '').length, 0);
  const rows: [string, number | string][] = [
    ['Book pages', chapters.length],
    ['Pages carrying the reading’s text', mod.readings.filter((r) => r.include_text).length],
    ['Pages that link to the reading', mod.readings.filter((r) => !r.include_text).length],
    ...(drafted.length ? [['AI-drafted pages and activities (overview, guides, takeaways, discussion, assignment)', drafted.length]] as [string, number][] : []),
    ...(open.length || rhizmode ? [
      ['Open-prompt activities on the pages', open.length],
      ['Discussion forums', forums.length],
      ['Passages the prompts point to', open.reduce((n, a) => n + (isContract(a) ? 0 : trailsOf(a).length), 0)],
    ] as [string, number][] : []),
    ...(rhizmode && !built.length ? [] : [
      ['H5P activities embedded', built.length],
      ['AI-drafted questions and cards', items],
    ] as [string, number][]),
    ...(assignments.length ? [['Moodle Assignment (rubric criteria)', assignments[0]!.rubric?.criteria.length ?? 0]] as [string, number][] : []),
    ...(quizzes.length ? [['Moodle Quiz (questions)', quizQuestions.length]] as [string, number][] : []),
    ...(glossaries.length ? [['Moodle Glossary (terms, in a separate import file)', terms.length]] as [string, number][] : []),
    ['Files in the backup', stats.files],
  ];

  let report = `# Build report: ${mod.name}\n\nSource: ${opts.sourceName}\n\n## What was built\n\n| Item | Count |\n|---|---|\n`;
  for (const [k, v] of rows) report += `| ${k} | ${v} |\n`;
  report += '\n## Readings\n\n| Page | On the page | Licence found | Source |\n|---|---|---|---|\n';
  for (const r of mod.readings) report += `| ${cell(r.title)} | ${r.include_text ? 'full text' : 'link only'} | ${cell(r.license) || 'none'} | ${cell(r.source_url) || 'uploaded or pasted'} |\n`;
  report += '\n## Needs a person before publishing\n\n';
  for (const t of todo) report += `- ${t}\n`;
  if (!todo.length) report += '- Nothing was flagged.\n';
  if (open.length) {
    report += '\n## Every AI-drafted prompt, for the reviewer\n\n'
      + 'These activities have no answer key and are not graded. Each prompt points at a passage of the reading, and a program checked that the passage is there as quoted. '
      + 'The check shows what a prompt is responding to; it does not judge whether the prompt is a good one. Only activities a person approved are in the file.\n\n'
      + `${CREDIT_TEXT}\n\n`
      + '| Page | Activity | Students answer | Passage | In the reading | What the page says about it | Questions |\n|---|---|---|---|---|---|---|\n';
    for (const act of open) {
      const r = mod.readings.find((x) => x.id === act.reading);
      const checks = checkQuotes(act, r?.text ?? '');
      const where = placeOf(act) === 'discussion' ? 'in a discussion forum' : 'on their own';
      if (isContract(act)) {
        report += `| ${RHIZO_KINDS.contract!.title} | ${cell(act.title)} | ${where} | (none: drafted from the whole module) | | ${cell(act.topic)} | ${cell(partsOf(act).map((p) => `${p.label}: ${p.prompt}`).join(' / '))} |\n`;
        continue;
      }
      trailsOf(act).forEach((t, i) => {
        report += `| ${cell(r?.title)} | ${cell(act.title)} | ${where} | ${cell(t.passage)} | ${checks[i]?.found ? 'yes' : 'NO'} | ${cell(t.notice)} | ${cell(t.questions.join(' / '))} |\n`;
      });
      report += `| ${cell(r?.title)} | ${cell(act.title)} | ${where} | (Your turn) | | ${cell(act.your_turn)} | |\n`;
    }
    report += '\nFixed wording, the same on every page, not drafted by AI:\n\n';
    for (const [type, k] of Object.entries(RHIZO_KINDS)) {
      if (open.some((a) => a.type === type)) report += `- ${k.title}, on the page: ${k.how}\n- ${k.title}, in the discussion: ${k.forum_how}\n`;
    }
    report += `- Disclosure: ${rhizoDisclosure(mod.model)}\n`;
  }
  if (drafted.length) {
    report += '\n## Every AI-drafted course page, for the reviewer\n\n'
      + 'The wording of these pages is a model’s. Each key idea, topic and takeaway points at a passage of a reading, and a program checked that the passage is there as quoted. '
      + 'Learning outcomes are copied from the course outline, and a program checked each is there word for word. '
      + 'The checks show where a statement comes from; they do not judge whether it is a fair account of the reading. Only pages a person approved are in the file.\n\n'
      + '| Page | Part | What the page says | Passage or source | Found |\n|---|---|---|---|---|\n';
    for (const act of drafted) {
      const r = mod.readings.find((x) => x.id === act.reading);
      const where = act.type === 'guide' ? `${PAGE_KINDS.guide!.title}: ${cell(r?.title)}` : PAGE_KINDS[act.type]!.title;
      const checks = act.type === 'guide' ? checkQuotes(act, r?.text ?? '') : checkQuotes(act, corpus, mod.outline ?? '');
      if (act.type === 'discussion') {
        report += `| ${where} | Opening prompt | ${cell(act.prompt)} | (no passage) | |\n`;
        anchorsOf(act).forEach((a, i) => { report += `| ${where} | Passage ${i + 1} | ${cell(a.note)} | ${cell(a.passage)} | ${checks[i]?.found ? 'yes' : 'NO'} |\n`; });
        continue;
      }
      if (act.type === 'assignment') {
        const rubric = rubricOf(act);
        report += `| ${where} | Task | ${cell(act.task)} | (no passage) | |\n| ${where} | What to hand in | ${cell(act.deliverable)} | (no passage) | |\n`;
        stepsOf(act).forEach((st, i) => { report += `| ${where} | Step ${i + 1} | ${cell(st)} | (no passage) | |\n`; });
        rubric.forEach((c, i) => { report += `| ${where} | Criterion ${i + 1} | ${cell(c.criterion)}: ${cell(c.levels.map((l, k) => `${RUBRIC_LEVELS[k]?.label ?? ''}: ${l}`).join(' / '))} | outline: ${cell(c.outcome)} | ${checks[i]?.found ? 'yes' : 'NO'} |\n`; });
        anchorsOf(act).forEach((a, i) => { report += `| ${where} | Passage ${i + 1} | ${cell(a.note)} | ${cell(a.passage)} | ${checks[rubric.length + i]?.found ? 'yes' : 'NO'} |\n`; });
        continue;
      }
      const row = (part: string, says: string, source = '', found = ''): void => { report += `| ${where} | ${part} | ${cell(says)} | ${cell(source)} | ${found} |\n`; };
      const yes = (i: number): string => (checks[i]?.found ? 'yes' : 'NO');
      if (act.type === 'guide') {
        row('Why this reading', String(act.why ?? ''), '(no passage: a summary of the reading)');
        pointsOf(act).forEach((p, i) => row(`Key idea ${i + 1}`, `${p.idea}: ${p.explanation}`, p.passage, yes(i)));
        questionsOf(act).forEach((q, i) => row(`Question ${i + 1}`, q, '(no passage)'));
      } else if (act.type === 'overview') {
        row('Introduction', String(act.intro ?? ''), '(no passage: a summary of the readings)');
        const outcomes = outcomesOf(act);
        outcomes.forEach((o, i) => row(`Outcome ${i + 1}`, o, 'the course outline', yes(i)));
        coveredOf(act).forEach((c, i) => row(`Topic ${i + 1}`, c.text, c.passage, yes(outcomes.length + i)));
      } else {
        coveredOf(act).forEach((p, i) => row(`Takeaway ${i + 1}`, p.text, p.passage, yes(i)));
      }
    }
    report += '\nFixed wording and lists not drafted by AI: the headings, the “What you will do” list on the overview (built from the module’s contents, with reading times at 200 words a minute), and the name of the reading under each takeaway.\n';
    for (const t of new Set(drafted.map((a) => a.type))) report += `- Disclosure, ${PAGE_KINDS[t]!.title}: ${pageDisclosure(t, mod.model)}\n`;
  }
  if (!rhizmode || built.length) report += '\n## Every AI-drafted item, for the subject reviewer\n\n'
    + 'Each answer key was checked against the quoted sentence of the reading, not against outside knowledge. '
    + 'A subject expert should still read every item.\n\n| Page | Activity | Item | Key | Supporting sentence | In the reading |\n|---|---|---|---|---|---|\n';
  for (const { act } of built) {
    const r = mod.readings.find((x) => x.id === act.reading);
    const checks = checkQuotes(act, r?.text ?? '');
    const parts = (act.type === 'questionset' ? act.questions : act.type === 'dialogcards' ? act.cards : act.type === 'summary' ? act.sets
      : act.type === 'crossword' ? act.words : act.type === 'timeline' ? act.events : [act]) as Record<string, unknown>[];
    checks.forEach((q, i) => {
      const part = parts[i] ?? {};
      const what = act.type === 'dialogcards' ? cell(part.front) : act.type === 'summary' ? `Statement set ${i + 1}` : act.type === 'crossword' ? cell(part.clue)
        : act.type === 'timeline' ? cell(part.headline) : cell(String(part.question ?? act.title).replace(/<[^>]+>/g, ''));
      const key = act.type === 'dialogcards' ? cell(String(part.back ?? '').replace(/<[^>]+>/g, '')) : act.type === 'summary' ? cell(part.correct)
        : act.type === 'crossword' ? cell(part.answer) : act.type === 'timeline' ? cell(part.date) : cell(keyOf(part));
      report += `| ${cell(r?.title)} | ${cell(act.title)} | ${what.slice(0, 120)} | ${key.slice(0, 120)} | ${cell(q.quote).slice(0, 200)} | ${q.found ? 'yes' : 'NO'} |\n`;
    });
  }
  if (quizRows.length) {
    report += '\n## Every question in the Moodle Quiz, for the subject reviewer\n\n'
      + 'The Quiz is graded. It holds only questions from sets a person approved, and each key was checked against the quoted sentence of the reading, not against outside knowledge. '
      + 'The questions are stored in the Quiz’s own question bank.\n\n| Reading | Question | Key | Supporting sentence |\n|---|---|---|---|\n';
    for (const q of quizRows) report += `| ${cell(q.reading)} | ${cell(q.text.replace(/<[^>]+>/g, '')).slice(0, 160)} | ${cell(q.key).slice(0, 120)} | ${cell(q.quote).slice(0, 200)} |\n`;
  }
  if (terms.length) {
    report += '\n## Terms in the Glossary import file\n\n| Term | Definition | Reading |\n|---|---|---|\n';
    for (const t of terms) report += `| ${cell(t.concept)} | ${cell(t.definition.replace(/<[^>]+>/g, '')).slice(0, 200)} | ${cell(t.reading)} |\n`;
  }
  if (!rhizmode || built.length) report += '\n## H5P versions this file expects on the Moodle site\n\n';
  const need: Record<string, string> = {};
  for (const { act } of built) Object.assign(need, librariesUsed(act, versions));
  const main = Object.values(LIB);
  for (const k of Object.keys(need).sort(cmp)) {
    if ((k.startsWith('H5P.') && main.includes(k)) || k === 'H5P.AdvancedText') report += `- ${k} ${need[k]}\n`;
  }

  return {
    name: mod.name, fileName, mbz: stats.mbz, report, specsFound: '',
    chapters, slots: [], h5p: packages, images: {}, forums: forums.map((f) => ({ name: f.name, html: f.intro })),
    parts: { name: mod.name, book: { name: mod.name, chapters, files: packages }, forums, quizzes, glossaries, assignments },
    glossaryXml: terms.length ? glossaryImportXml(glossaryName, terms) : undefined,
    quiz: quizzes.length ? { name: quizzes[0]!.name, questions: quizQuestions.length } : undefined,
    counts: Object.fromEntries(rows), todo, judgement,
  };
}
