/**
 * Build .h5p packages from short activity specs.
 *
 * The packages hold content only (h5p.json + content/content.json). The H5P
 * libraries themselves must already be installed on the site, at the versions
 * named in semantics.ts (or passed in as `versions`).
 *
 * Spec shapes (all text may contain simple HTML such as <code>):
 *   multichoice  {question, answers: [{text, correct, feedback?}], feedback?, shuffle?}
 *   truefalse    {question, correct: bool, feedback? | feedback_correct?, feedback_wrong?}
 *   blanks       {instructions?, text: "... *answer/alternative* ...", feedback?, case_sensitive?}
 *   dragtext     {instructions?, text: "... *word* ...", feedback?}
 *   dragdrop     {zones: [{label, feedback?}], items: [{text, zone: index}],
 *                 feedback?, feedback_correct?, feedback_incorrect?}   ("instructions" is accepted but, as in
 *                 the Python, not written into the package: Drag and Drop has no task-wording field)
 *   dialogcards  {description?, cards: [{front, back}]}
 *   sort         {instructions, paragraphs: [in the correct order], feedback?}
 *   questionset  {intro?, questions: [any of the above with a type], check_at_end?, pass_percentage?}
 *   accordion    {panels: [{title, text}]}
 *   summary      {instructions?, sets: [{correct, wrong: [..]}], feedback?}     (choose the correct statement, set by set)
 *   markwords    {instructions, text: "... *word* ..." | [lines], feedback?}     (single words only, never phrases)
 *   singlechoice {questions: [{question, correct, wrong: [..]}], feedback?}      (quick questions, one tap each)
 *   crossword    {instructions?, words: [{clue, answer}]}                        (answers without spaces)
 *   timeline     {headline, intro?, events: [{date: "YYYY" | "YYYY-MM" | "YYYY-MM-DD", headline, text?}]}
 *
 * Ported from the Python module builder's h5p.py. `packageH5p` throws on a spec
 * it cannot build (a missing field, an unknown type), as the Python does;
 * `checkActivity` reports those problems, and ones Python lets through but H5P
 * would not play, without throwing.
 */

import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { SEMANTICS as FIRST_SEMANTICS, type SemField, type SemLibrary } from './semantics.js';
import { MORE_SEMANTICS } from './semantics-more.js';

const SEMANTICS: Record<string, SemLibrary> = { ...FIRST_SEMANTICS, ...MORE_SEMANTICS };
import { PyFloat, cut, floorDiv, lstrip, plen, pyJson, pyRound, truthy } from './py.js';

export type Spec = Record<string, unknown>;
type Params = Record<string, unknown>;

export const LIB: Record<string, string> = {
  multichoice: 'H5P.MultiChoice', truefalse: 'H5P.TrueFalse', blanks: 'H5P.Blanks',
  dragtext: 'H5P.DragText', dragdrop: 'H5P.DragQuestion', dialogcards: 'H5P.Dialogcards',
  sort: 'H5P.SortParagraphs', questionset: 'H5P.QuestionSet',
  accordion: 'H5P.Accordion', summary: 'H5P.Summary', markwords: 'H5P.MarkTheWords',
  singlechoice: 'H5P.SingleChoiceSet', crossword: 'H5P.Crossword', timeline: 'H5P.Timeline',
};
export const NAMES: Record<string, string> = {
  multichoice: 'Multiple Choice', truefalse: 'True/False Question', blanks: 'Fill in the Blanks',
  dragtext: 'Drag the Words', dragdrop: 'Drag and Drop', dialogcards: 'Dialog Cards',
  sort: 'Sort the Paragraphs', questionset: 'Question Set',
  accordion: 'Accordion', summary: 'Summary', markwords: 'Mark the Words',
  singlechoice: 'Single Choice Set', crossword: 'Crossword', timeline: 'Timeline',
};

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isDict = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof PyFloat);

/** s[key], failing the way a Python KeyError would. */
function need(s: Spec, key: string): unknown {
  if (!isDict(s) || !own(s, key)) throw new Error(`missing "${key}"`);
  return s[key];
}
function needStr(s: Spec, key: string): string {
  const v = need(s, key);
  if (typeof v !== 'string') throw new Error(`"${key}" must be text`);
  return v;
}
function needList(s: Spec, key: string): Spec[] {
  const v = need(s, key);
  if (!Array.isArray(v)) throw new Error(`"${key}" must be a list`);
  return v as Spec[];
}
/** s.get(key, fallback) */
function get(s: Spec, key: string, fallback: unknown = undefined): unknown {
  return own(s, key) ? s[key] : fallback;
}
function libFor(type: unknown): string {
  if (typeof type !== 'string' || !own(LIB, type)) throw new Error(`unknown activity type "${String(type)}"`);
  return LIB[type]!;
}

export function version(lib: string, versions?: Record<string, string> | null): string {
  const v = versions && own(versions, lib) ? versions[lib] : undefined;
  if (v) return v;
  if (!own(SEMANTICS, lib)) throw new Error(`no field definitions for ${lib}`);
  return SEMANTICS[lib]!.version;
}

/** Fill in the interface wording (button labels, screen-reader text) from the library's own defaults. */
export function defaults(fields: SemField[], params: Params, common = false): Params {
  for (const f of fields) {
    const name = f.name as string;
    const c = common || truthy(f.common);
    const sub_fields = f.fields ?? [];
    if (f.type === 'group' && sub_fields.length > 1) {
      let sub = own(params, name) ? params[name] : undefined;
      if ((sub === undefined || sub === null) && (c || sub_fields.every((x) => own(x, 'default') || x.type === 'group'))) sub = {};
      if (isDict(sub)) {
        defaults(sub_fields, sub, c);
        if (Object.keys(sub).length) params[name] = sub;
      }
    } else if (!own(params, name) && own(f, 'default') && (c || f.type === 'boolean' || f.type === 'select' || f.type === 'number')) {
      params[name] = f.default;
    }
  }
  return params;
}

function overall(textAll?: unknown, correct?: unknown, incorrect?: unknown): Params[] {
  // H5P stores a group that has a single field as that field's value, so this is a bare list.
  if (truthy(correct) || truthy(incorrect)) {
    const out: Params[] = [];
    if (truthy(incorrect)) out.push({ from: 0, to: 99, feedback: incorrect });
    if (truthy(correct)) out.push({ from: 100, to: 100, feedback: correct });
    return out;
  }
  if (truthy(textAll)) return [{ from: 0, to: 100, feedback: textAll }];
  return [{ from: 0, to: 100 }];
}

function p(s: unknown): string {
  if (typeof s !== 'string') throw new Error('text expected, got ' + (s === null ? 'nothing' : typeof s));
  return lstrip(s).startsWith('<') ? s : `<p>${s}</p>`;
}

function asList(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [x];
}

function stripTags(s: unknown): string {
  return (truthy(s) ? String(s) : '').replace(/<[^>]+>/g, '');
}

function multichoice(s: Spec): Params {
  const list = needList(s, 'answers');
  const multi = list.filter((a) => truthy(get(a, 'correct'))).length > 1;
  const answers: Params[] = [];
  for (const a of list) {
    const x: Params = { text: `<div>${String(need(a, 'text'))}</div>`, correct: truthy(get(a, 'correct')) };
    if (truthy(get(a, 'feedback'))) x['tipsAndFeedback'] = { chosenFeedback: `<div>${String(a['feedback'])}</div>` };
    answers.push(x);
  }
  return {
    question: p(need(s, 'question')), answers,
    overallFeedback: overall(get(s, 'feedback')),
    behaviour: {
      type: multi ? 'multi' : 'single', singlePoint: false,
      randomAnswers: get(s, 'shuffle', true), enableRetry: true, enableSolutionsButton: true,
      passPercentage: 100, showSolutionsRequiresInput: true,
    },
  };
}

function truefalse(s: Spec): Params {
  const question = p(need(s, 'question'));
  return {
    question, correct: truthy(need(s, 'correct')) ? 'true' : 'false',
    behaviour: {
      enableRetry: true, enableSolutionsButton: true,
      feedbackOnCorrect: get(s, 'feedback_correct', get(s, 'feedback', '')),
      feedbackOnWrong: get(s, 'feedback_wrong', get(s, 'feedback', '')),
    },
  };
}

function blanks(s: Spec): Params {
  return {
    text: p(get(s, 'instructions', 'Fill in the missing words.')), questions: asList(need(s, 'text')).map((t) => p(t)),
    overallFeedback: overall(get(s, 'feedback')),
    behaviour: {
      caseSensitive: truthy(get(s, 'case_sensitive', false)), enableRetry: true,
      enableSolutionsButton: true, showSolutionsRequiresInput: true, separateLines: false,
      acceptSpellingErrors: false,
    },
  };
}

function dragtext(s: Spec): Params {
  const taskDescription = p(get(s, 'instructions', 'Drag the words into the correct boxes.'));
  const lines = asList(need(s, 'text'));
  for (const l of lines) if (typeof l !== 'string') throw new Error('"text" must be text or a list of text');
  return {
    taskDescription,
    textField: lines.join('\n'), overallFeedback: overall(get(s, 'feedback')),
    behaviour: { enableRetry: true, enableSolutionsButton: true, instantFeedback: false },
  };
}

const ceilDiv = (a: number, b: number): number => {
  if (b === 0) throw new Error('division by zero');
  return -Math.floor(-a / b);
};
const maxOf = (xs: number[], what: string): number => {
  if (!xs.length) throw new Error(`no ${what}`);
  return Math.max(...xs);
};
/** Python's == between a spec value and a zone index (true == 1, 2.0 == 2, "2" != 2). */
const sameIndex = (v: unknown, z: number): boolean => (typeof v === 'boolean' ? Number(v) : v) === z;

/** Lay the task out on a plain canvas: draggable items in rows at the top, drop zones underneath. */
function dragdrop(s: Spec): Params {
  const W_PX = 900, EM = 16.0;
  const W = W_PX / EM;
  const zones = needList(s, 'zones'), items = needList(s, 'items');
  const longest = maxOf(items.map((i) => plen(stripTags(need(i, 'text')))), 'items');
  let per_row = longest <= 22 ? 4 : longest <= 40 ? 3 : 2;
  per_row = Math.min(per_row, items.length);
  const gap = 1.0, margin = 1.0;
  const PAD = 0.9;                      // H5P draws each draggable about this much larger than its stated size
  let z_per_row = zones.length <= 4 && (zones.length <= 2 || longest <= 22) ? zones.length : zones.length > 2 ? 3 : 2;
  if (zones.length > 2 && maxOf(zones.map((z) => plen(stripTags(need(z, 'label')))), 'zones') > 30) {
    z_per_row = 2;                      // long zone names are cut off in narrow zones
  }
  if (z_per_row === 0) throw new Error('no zones');
  const zw = (W - 2 * margin - gap * (z_per_row - 1)) / z_per_row;
  const slot = (W - 2 * margin - gap * (per_row - 1)) / per_row;
  const iw = Math.min(slot, zw - 1.2) - PAD;
  const chars_per_line = Math.max(8, Math.trunc(iw * 1.7));
  const ih = 1.3 + 1.4 * Math.max(1, ceilDiv(longest, chars_per_line));
  const pitch = ih + PAD + 0.6;
  const rows = ceilDiv(items.length, per_row);
  let y = margin;
  const placed: [number, number][] = [];
  items.forEach((_it, n) => {
    const r = Math.floor(n / per_row), c = n % per_row;
    placed.push([margin + c * (slot + gap) + (slot - iw - PAD) / 2, y + r * pitch]);
  });
  y += rows * pitch + 1.5;

  const most = maxOf(zones.map((_z, z) => items.filter((i) => sameIndex(need(i, 'zone'), z)).length), 'zones');
  const stack_w = Math.max(1, Math.trunc(floorDiv(zw - 0.6, iw + PAD + 0.3)));    // items that fit side by side in a zone
  const zh = 2.4 + pitch * Math.max(1, ceilDiv(most, stack_w)) + 0.6;
  const zplaced: [number, number][] = [];
  zones.forEach((_z, n) => {
    const r = Math.floor(n / z_per_row), c = n % z_per_row;
    zplaced.push([margin + c * (zw + gap), y + r * (zh + 1.0)]);
  });
  const H = y + ceilDiv(zones.length, z_per_row) * (zh + 1.0) + margin - 1.0;

  const pct = (x: number, total: number) => new PyFloat(pyRound(100.0 * x / total, 4));
  const elements = items.map((it, n) => {
    const [px, py] = placed[n]!;
    return {
      x: pct(px, W), y: pct(py, H), width: new PyFloat(pyRound(iw, 3)), height: new PyFloat(pyRound(ih, 3)),
      dropZones: zones.map((_z, z) => String(z)), backgroundOpacity: 100, multiple: false,
      type: {
        library: 'H5P.AdvancedText ' + SEMANTICS['H5P.AdvancedText']!.version,
        params: { text: p(it['text']) }, subContentId: randomUUID(),
        metadata: { contentType: 'Text', license: 'U', title: cut(stripTags(it['text']), 60) },
      },
    };
  });
  const dropzones: Params[] = [];
  zones.forEach((zone, z) => {
    const [px, py] = zplaced[z]!;
    const d: Params = {
      x: pct(px, W), y: pct(py, H), width: new PyFloat(pyRound(zw, 3)), height: new PyFloat(pyRound(zh, 3)),
      correctElements: items.map((i, n) => (sameIndex(i['zone'], z) ? String(n) : null)).filter((n) => n !== null),
      showLabel: true, backgroundOpacity: 100, single: false, autoAlign: true,
      label: `<div>${String(need(zone, 'label'))}</div>`, tipsAndFeedback: {},
    };
    if (truthy(get(zone, 'feedback'))) d['tipsAndFeedback'] = { feedbackOnCorrect: zone['feedback'], feedbackOnIncorrect: zone['feedback'] };
    dropzones.push(d);
  });
  return {
    scoreShow: 'Check', tryAgain: 'Retry',
    question: {
      settings: { size: { width: W_PX, height: pyRound(H * EM) } },
      task: { elements, dropZones: dropzones },
    },
    overallFeedback: overall(get(s, 'feedback'), get(s, 'feedback_correct'), get(s, 'feedback_incorrect')),
    behaviour: {
      enableRetry: true, enableCheckButton: true, singlePoint: false, applyPenalties: false,
      enableScoreExplanation: true, dropZoneHighlighting: 'dragging', autoAlignSpacing: 2,
      enableFullScreen: false, showScorePoints: true, showTitle: false,
    },
  };
}

function dialogcards(s: Spec): Params {
  const centre = (t: unknown) => `<p style="text-align:center;">${String(t)}</p>`;
  return {
    title: '', mode: 'normal', description: get(s, 'description', ''),
    dialogs: needList(s, 'cards').map((c) => ({ text: centre(need(c, 'front')), answer: centre(need(c, 'back')), tips: {} })),
    behaviour: { enableRetry: true, disableBackwardsNavigation: false, scaleTextNotCard: false, randomCards: false },
  };
}

function sort(s: Spec): Params {
  return {
    taskDescription: p(need(s, 'instructions')), paragraphs: needList(s, 'paragraphs').map((x) => p(x)),
    overallFeedback: overall(get(s, 'feedback')),
    behaviour: {
      scoringMode: 'positions', applyPenalties: false, duplicatesInterchangeable: true,
      addButtonsForMovement: true, enableRetry: true, enableSolutionsButton: true,
    },
  };
}

function questionset(s: Spec, versions?: Record<string, string> | null): Params {
  const at_end = truthy(get(s, 'check_at_end'));
  const qs: Params[] = [];
  for (const q of needList(s, 'questions')) {
    const lib = libFor(need(q, 'type'));
    const type = q['type'] as string;
    const library = `${lib} ${version(lib, versions)}`;
    const params = paramsFor(q, versions);
    const title = truthy(get(q, 'title')) ? q['title'] : truthy(get(q, 'question')) ? q['question'] : 'Question';
    qs.push({
      library, params, subContentId: randomUUID(),
      metadata: { contentType: NAMES[type], license: 'U', title: cut(stripTags(title), 80) },
    });
  }
  const override: Params = { checkButton: !at_end };
  const out: Params = {
    introPage: { showIntroPage: truthy(get(s, 'intro')), title: get(s, 'title', ''), introduction: truthy(get(s, 'intro')) ? p(s['intro']) : '' },
    progressType: 'dots', passPercentage: get(s, 'pass_percentage', 50), questions: qs,
    disableBackwardsNavigation: false, randomQuestions: false,
    endGame: {
      showResultPage: true, showSolutionButton: true, showRetryButton: true,
      overallFeedback: [{ from: 0, to: 100 }], showAnimations: false, skippable: false,
    },
    override,
  };
  if (at_end) { override['showSolutionButton'] = 'on'; override['retryButton'] = 'on'; }
  return out;
}

function accordion(s: Spec): Params {
  return {
    panels: needList(s, 'panels').map((panel) => ({
      title: stripTags(need(panel, 'title')),
      content: {
        library: 'H5P.AdvancedText ' + SEMANTICS['H5P.AdvancedText']!.version,
        params: { text: p(need(panel, 'text')) }, subContentId: randomUUID(),
        metadata: { contentType: 'Text', license: 'U', title: cut(stripTags(panel['title']), 60) },
      },
    })),
    hTag: 'h4',
  };
}

function summary(s: Spec): Params {
  return {
    intro: p(get(s, 'instructions', 'Choose the correct statement.')),
    // H5P takes the first statement of each set as the correct one and shuffles them for the learner.
    summaries: needList(s, 'sets').map((set) => {
      const wrong = need(set, 'wrong');
      if (!Array.isArray(wrong)) throw new Error('"wrong" must be a list');
      return { summary: [need(set, 'correct'), ...wrong].map((x) => p(x)), tip: '', subContentId: randomUUID() };
    }),
    overallFeedback: overall(get(s, 'feedback')),
  };
}

function markwords(s: Spec): Params {
  const lines = asList(need(s, 'text'));
  for (const l of lines) if (typeof l !== 'string') throw new Error('"text" must be text or a list of text');
  return {
    taskDescription: p(need(s, 'instructions')), textField: (lines as string[]).map((l) => p(l)).join(''),
    overallFeedback: overall(get(s, 'feedback')),
    behaviour: { enableRetry: true, enableSolutionsButton: true, enableCheckButton: true, showScorePoints: true },
  };
}

function singlechoice(s: Spec): Params {
  return {
    choices: needList(s, 'questions').map((q) => {
      const wrong = need(q, 'wrong');
      if (!Array.isArray(wrong)) throw new Error('"wrong" must be a list');
      // The first answer is the correct one; H5P shuffles them.
      return { question: p(need(q, 'question')), answers: [need(q, 'correct'), ...wrong].map((x) => p(x)), subContentId: randomUUID() };
    }),
    overallFeedback: overall(get(s, 'feedback')),
    behaviour: { autoContinue: true, timeoutCorrect: 2000, timeoutWrong: 3000, soundEffectsEnabled: false, enableRetry: true, enableSolutionsButton: true, passPercentage: 100 },
  };
}

/** A crossword answer as H5P wants it: no spaces or punctuation. "Hydrogen bond" becomes "HYDROGENBOND"; the clue says it is two words. */
export function crosswordAnswer(answer: unknown): string {
  return stripTags(answer).normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
}

function crossword(s: Spec): Params {
  const theme: Params = {};
  for (const f of (SEMANTICS['H5P.Crossword']!.semantics.find((x) => x.name === 'theme')?.fields ?? [])) {
    if (typeof f.default === 'string') theme[f.name as string] = f.default;
  }
  return {
    taskDescription: p(get(s, 'instructions', 'Fill in the crossword from the clues.')),
    words: needList(s, 'words').map((w) => {
      const raw = stripTags(need(w, 'answer')).trim();
      const parts = raw.split(/[\s-]+/).filter(Boolean);
      // A learner cannot see spaces in the grid, so the clue gives the word lengths of a phrase.
      const clue = stripTags(need(w, 'clue')).trim() + (parts.length > 1 ? ` (${parts.map((x) => crosswordAnswer(x).length).join(', ')})` : '');
      return { clue, answer: crosswordAnswer(raw), fixWord: false, orientation: 'across' };
    }),
    theme,
    behaviour: { enableInstantFeedback: false, scoreWords: true, applyPenalties: false, enableRetry: true, enableSolutionsButton: true, keepCorrectAnswers: false },
  };
}

/** "1998", "1998-03" or "1998-03-07" (also with commas or slashes) as TimelineJS wants it: "1998,3,7". Throws on anything else. */
export function timelineDate(date: unknown): string {
  const m = /^\s*(-?\d{1,6})(?:[-,/](\d{1,2})(?:[-,/](\d{1,2}))?)?\s*$/.exec(String(date ?? ''));
  if (!m) throw new Error(`"${String(date)}" is not a date the timeline can place: use a year, year-month or year-month-day`);
  const month = m[2] ? parseInt(m[2], 10) : 0, day = m[3] ? parseInt(m[3], 10) : 0;
  if (m[2] && (month < 1 || month > 12)) throw new Error(`"${String(date)}" has no such month`);
  if (m[3] && (day < 1 || day > 31)) throw new Error(`"${String(date)}" has no such day`);
  return [m[1], ...(m[2] ? [String(month)] : []), ...(m[3] ? [String(day)] : [])].join(',');
}

function timeline(s: Spec): Params {
  return {
    timeline: {
      headline: stripTags(need(s, 'headline')), text: truthy(get(s, 'intro')) ? p(s['intro']) : '', defaultZoomLevel: '0', height: 600, language: 'en',
      date: needList(s, 'events').map((e) => ({
        startDate: timelineDate(need(e, 'date')), headline: stripTags(need(e, 'headline')), text: truthy(get(e, 'text')) ? p(e['text']) : '',
        asset: {},     // no media, but the player reads the group and fails without it
      })),
      asset: {},
    },
  };
}

const BUILD: Record<string, (s: Spec) => Params> = {
  multichoice, truefalse, blanks, dragtext, dragdrop, dialogcards, sort,
  accordion, summary, markwords, singlechoice, crossword, timeline,
};

/** The types this file can build. */
export const ACTIVITY_TYPES: string[] = Object.keys(LIB);

export function paramsFor(s: Spec, versions?: Record<string, string> | null): Params {
  const lib = libFor(need(s, 'type'));
  const type = s['type'] as string;
  const params = type === 'questionset' ? questionset(s, versions) : BUILD[type]!(s);
  return defaults(SEMANTICS[lib]!.semantics, params);
}

export function librariesUsed(s: Spec, versions?: Record<string, string> | null): Record<string, string> {
  const used: Record<string, string> = {};
  const add = (lib: string) => {
    used[lib] = version(lib, versions);
    for (const d of (own(SEMANTICS, lib) ? SEMANTICS[lib]!.deps : undefined) ?? []) {
      const [name, ver, kind] = d.split(' ') as [string, string, string];
      if (kind === 'preloaded' && !own(used, name)) used[name] = ver;
    }
  };
  add(libFor(need(s, 'type')));
  if (s['type'] === 'dragdrop' || s['type'] === 'accordion') add('H5P.AdvancedText');
  // Only a question set's questions are activities of their own; a single choice set's are plain text.
  const questions = s['type'] === 'questionset' ? get(s, 'questions', []) : [];
  if (!Array.isArray(questions)) throw new Error('"questions" must be a list');
  for (const q of questions as Spec[]) add(libFor(need(q, 'type')));
  return used;
}

/** The two JSON files of a package, as text. */
export function packageJson(s: Spec, versions?: Record<string, string> | null): { h5p: string; content: string } {
  const lib = libFor(need(s, 'type'));
  const h5p = {
    title: need(s, 'title'), language: 'en', mainLibrary: lib, embedTypes: ['iframe'], license: 'U',
    defaultLanguage: 'en',
    preloadedDependencies: Object.entries(librariesUsed(s, versions)).map(([n, v]) => {
      const [major, minor] = v.split('.');
      if (!/^\d+$/.test(major ?? '') || !/^\d+$/.test(minor ?? '')) throw new Error(`library version "${v}" of ${n} is not major.minor`);
      return { machineName: n, majorVersion: parseInt(major!, 10), minorVersion: parseInt(minor!, 10) };
    }),
  };
  return { h5p: pyJson(h5p, true), content: pyJson(paramsFor(s, versions), false) };
}

/** Return the bytes of a .h5p file for one activity spec. */
export function packageH5p(s: Spec, versions?: Record<string, string> | null): Uint8Array {
  const j = packageJson(s, versions);
  return zipSync({ 'h5p.json': strToU8(j.h5p), 'content/content.json': strToU8(j.content) }, { level: 6 });
}

// ─── Checking a spec before building ────────────────────────────────────────

const text = (v: unknown): v is string => typeof v === 'string' && lstrip(v) !== '';

function checkOne(s: Spec, where: string, out: string[], nested: boolean): void {
  const say = (msg: string) => out.push(where + msg);
  if (!isDict(s)) { say('is not an object'); return; }
  const type = s['type'];
  if (typeof type !== 'string' || !own(LIB, type)) {
    say(`has an unknown type "${String(type)}" (use one of: ${ACTIVITY_TYPES.join(', ')})`);
    return;
  }
  const list = (key: string): Spec[] | null => {
    const v = s[key];
    if (!Array.isArray(v) || v.length === 0) { say(`needs a non-empty "${key}" list`); return null; }
    if (v.some((x) => !isDict(x))) { say(`"${key}" must be a list of objects`); return null; }
    return v as Spec[];
  };
  const optionalText = (key: string) => {
    if (own(s, key) && typeof s[key] !== 'string') say(`"${key}" must be text`);
  };
  const starred = (key: string, what: string) => {
    const v = s[key];
    const lines = Array.isArray(v) ? v : [v];
    if (v === undefined || lines.length === 0) { say(`needs "${key}"`); return; }
    if (lines.some((l) => typeof l !== 'string')) { say(`"${key}" must be text or a list of text`); return; }
    if (!lines.some((l) => /\*[^*\n]+\*/.test(l as string))) say(`"${key}" marks no ${what}: put *asterisks* around each one`);
    for (const l of lines as string[]) if ((l.match(/\*/g) ?? []).length % 2) say(`"${key}" has an unmatched * in "${cut(l, 40)}"`);
  };

  if (type === 'multichoice') {
    if (!text(s['question'])) say('needs a "question"');
    const answers = list('answers');
    if (answers) {
      answers.forEach((a, i) => { if (!text(a['text'])) say(`answer ${i + 1} needs "text"`); });
      if (answers.length < 2) say('needs at least two answers');
      if (!answers.some((a) => truthy(a['correct']))) say('has no correct answer');
    }
  } else if (type === 'truefalse') {
    if (!text(s['question'])) say('needs a "question"');
    if (typeof s['correct'] !== 'boolean') say('needs "correct" set to true or false');
  } else if (type === 'blanks') {
    optionalText('instructions');
    starred('text', 'blanks');
  } else if (type === 'dragtext') {
    optionalText('instructions');
    starred('text', 'words to drag');
  } else if (type === 'dragdrop') {
    const zones = list('zones');
    const items = list('items');
    if (zones) zones.forEach((z, i) => { if (!text(z['label'])) say(`zone ${i + 1} needs a "label"`); });
    if (items) {
      items.forEach((it, i) => {
        if (!text(it['text'])) say(`item ${i + 1} needs "text"`);
        const z = it['zone'];
        if (typeof z !== 'number' || !Number.isInteger(z)) say(`item ${i + 1} needs "zone" as a zone number (0 for the first zone)`);
        else if (zones && (z < 0 || z >= zones.length)) say(`item ${i + 1} points to zone ${z}, but the zones are numbered 0 to ${zones.length - 1}`);
      });
    }
  } else if (type === 'dialogcards') {
    optionalText('description');
    const cards = list('cards');
    if (cards) cards.forEach((c, i) => { if (!text(c['front']) || !text(c['back'])) say(`card ${i + 1} needs "front" and "back"`); });
  } else if (type === 'sort') {
    if (!text(s['instructions'])) say('needs "instructions"');
    const ps = s['paragraphs'];
    if (!Array.isArray(ps) || ps.length < 2) say('needs at least two "paragraphs"');
    else if (ps.some((x) => !text(x))) say('"paragraphs" must be a list of text');
  } else if (type === 'accordion') {
    const panels = list('panels');
    if (panels) panels.forEach((x, i) => { if (!text(x['title']) || !text(x['text'])) say(`panel ${i + 1} needs a "title" and "text"`); });
  } else if (type === 'summary' || type === 'singlechoice') {
    const key = type === 'summary' ? 'sets' : 'questions', word = type === 'summary' ? 'set' : 'question';
    optionalText('instructions');
    const sets = list(key);
    if (sets) sets.forEach((x, i) => {
      if (type === 'singlechoice' && !text(x['question'])) say(`question ${i + 1} needs a "question"`);
      if (!text(x['correct'])) say(`${word} ${i + 1} needs the "correct" ${type === 'summary' ? 'statement' : 'answer'}`);
      const wrong = x['wrong'];
      if (!Array.isArray(wrong) || wrong.length === 0 || wrong.some((w) => !text(w))) say(`${word} ${i + 1} needs at least one "wrong" ${type === 'summary' ? 'statement' : 'answer'}`);
    });
  } else if (type === 'markwords') {
    if (!text(s['instructions'])) say('needs "instructions" saying which words to mark');
    starred('text', 'words to mark');
    const lines = (Array.isArray(s['text']) ? s['text'] : [s['text']]).filter((l): l is string => typeof l === 'string');
    for (const l of lines) for (const m of l.matchAll(/\*([^*\n]+)\*/g)) if (/\s/.test(m[1]!.trim())) say(`marks the phrase "${cut(m[1]!, 40)}", but this type can only mark single words`);
  } else if (type === 'crossword') {
    optionalText('instructions');
    const words = list('words');
    if (words) {
      if (words.length < 2) say('needs at least two words');
      const seen = new Set<string>();
      words.forEach((w, i) => {
        if (!text(w['clue'])) say(`word ${i + 1} needs a "clue"`);
        const a = text(w['answer']) ? crosswordAnswer(w['answer']) : '';
        if (a.length < 2) say(`word ${i + 1} needs an "answer" of at least two letters`);
        else if (seen.has(a)) say(`word ${i + 1} repeats the answer "${a}"`);
        seen.add(a);
      });
    }
  } else if (type === 'timeline') {
    if (!text(s['headline'])) say('needs a "headline"');
    const events = list('events');
    if (events) events.forEach((e, i) => {
      if (!text(e['headline'])) say(`event ${i + 1} needs a "headline"`);
      try { timelineDate(e['date']); } catch (err) { say(`event ${i + 1}: ${(err as Error).message}`); }
    });
  } else if (type === 'questionset') {
    if (nested) say('is a question set inside a question set, which H5P does not allow');
    if (own(s, 'intro') && truthy(s['intro']) && typeof s['intro'] !== 'string') say('"intro" must be text');
    if (own(s, 'pass_percentage') && (typeof s['pass_percentage'] !== 'number' || s['pass_percentage'] < 0 || s['pass_percentage'] > 100)) {
      say('"pass_percentage" must be a number from 0 to 100');
    }
    const qs = list('questions');
    if (qs) qs.forEach((q, i) => checkOne(q, `${where}question ${i + 1} `, out, true));
  }
}

/**
 * Problems with one activity spec that would make packageH5p throw or produce
 * a broken activity. Empty array = fine.
 */
export function checkActivity(act: Spec): string[] {
  const out: string[] = [];
  if (!isDict(act)) return ['The activity is not an object'];
  if (typeof act['n'] !== 'number' || !Number.isInteger(act['n']) || act['n'] < 1) out.push('needs "n", the number of the spec it answers (1 for the first spec in the draft)');
  if (typeof act['title'] !== 'string' || !lstrip(act['title'])) out.push('needs a "title"');
  checkOne(act, '', out, false);
  if (!out.length) {
    try { packageJson(act); } catch (e) { out.push((e as Error).message); }
  }
  return out;
}
