/**
 * The drafting step for course pages (engine/coursepage.ts): a reading guide
 * from one reading, and a module overview and key takeaways from all of a
 * module's readings, with the course outline when the designer has given
 * one.
 *
 * The page wording is the model's. What keeps it honest is the same as for
 * the practice questions: every key idea, topic and takeaway carries a
 * passage copied from a reading, code checks the passage is there, and a
 * miss is sent back once. Learning outcomes are never written by the model:
 * it may only copy them from the outline, and code checks that as well.
 */

import { z } from 'zod';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import type { Activity } from '../engine/index.js';
import { checkDrafted, type Reading } from '../engine/reading.js';
import { PAGE_KINDS, RUBRIC_LEVELS } from '../engine/coursepage.js';
import { env } from './env.js';

export type PageRole = 'overview' | 'guide' | 'takeaways' | 'discussion' | 'assignment';
export const PAGE_ROLES: PageRole[] = ['overview', 'guide', 'takeaways', 'discussion', 'assignment'];
export const isPageRole = (role: string): role is PageRole => (PAGE_ROLES as string[]).includes(role);

/** One reading sent whole for its guide, up to this many characters. */
const GUIDE_MAX_CHARS = 180_000;
/** All the readings together, for the overview and the takeaways. Each gets an equal share. */
const MODULE_MAX_CHARS = 240_000;
const OUTLINE_MAX_CHARS = 60_000;

const RULES = `# Ground rules
- Use only what the reading material says. Add no facts, examples, dates, names or terms from outside it, even ones you are sure of. If something in it looks wrong, leave it out and mention it in "interpretation".
- Do not judge the material: not "important", "seminal", "classic", "dated", "biased" or "controversial". Say what it says.
- Do not say anything about how the course runs (dates, marks, assignments, how long anything takes). Other parts of the page are built from the course itself.
- Every "passage" is one sentence, or two that sit next to each other, copied from a reading character for character. At most 60 words. A program compares it with the reading; a paraphrase, a quote stitched from two places, or a quote with words changed fails and the item is discarded. Do not use headings, captions or lists as passages.
- Speak to the student as "you". Plain Canadian English (colour, centre, analyse). Short sentences. No praise, no promises about how the student will feel, and none of these words: delve, dive, explore, journey, crucial, fascinating, landscape, unpack.
- No HTML and no markdown.
- "interpretation" is a note to the course designer, one to three plain sentences: anything they should check, or a part of the material you passed over and why. Empty string if there is nothing to say.

Reply with the JSON object only: no text before or after it, no code fence.`;

const OUTLINE_USE = `If a course outline is given, use it only to see which ideas matter for this course and to match its vocabulary. It is the course's own document, written by the course team.`;

const SYSTEM: Record<PageRole, string> = {
  guide: `You draft a reading guide for one reading in a university course. It sits at the top of the reading's page on the course site, and students see it before they start reading. A course designer reads every word and approves it before students see it.

# What the guide is for
A student about to start a reading is helped by knowing why it is there, what to watch for, and what they should be able to answer at the end. The guide does not replace the reading and must not be something a student could read instead of it.

${OUTLINE_USE}

# What to write
Return { "interpretation", "why", "points": [ ... ], "questions": [ ... ] }.

"why": one or two sentences to the student saying what this reading is about and what it gives them. From the reading alone; when an outline is given you may name the topic of the course it serves, in the outline's own words.

"points": three to six key ideas, in the order the reading presents them. Each is { "idea", "explanation", "passage" }.
- "idea": a heading of two to eight words, no full stop.
- "explanation": one or two sentences, in your own plain words, saying what the reading says about this idea. Your wording, the reading's content.
- "passage": the place in the reading where the idea is stated most clearly.

"questions": two to four questions the reading itself answers, which a student can test themselves against when they finish. Not yes-or-no questions. Do not give the answers.

If the reading is too short or too thin to guide anyone through (a list, a table, a fragment), return an empty "points" array and say why in "interpretation".

${RULES}`,

  overview: `You draft the overview page of one module in a university course: the first page a student opens. A course designer reads every word and approves it before students see it.

# What the page is for
It tells the student what the module is about and how its readings fit together, before they start. A list of what they will do, with links and reading times, is added to the page by a program; do not write one.

${OUTLINE_USE}

# What to write
Return { "interpretation", "intro", "outcomes": [ ... ], "covers": [ ... ] }.

"intro": two to four sentences to the student saying what this module is about and how the readings relate to each other. Drawn from the readings; with an outline, you may use its description of this part of the course.

"outcomes": learning outcomes, and only ever copied. If a course outline is given and it lists learning outcomes or objectives, copy each one that this module's readings serve, word for word, one string each, without its number or bullet. Prefer outcomes the outline lists under this module; if it lists them only for the whole course, copy the ones these readings clearly serve. A program checks every outcome against the outline, and one that is reworded, merged or shortened is rejected. Never write an outcome yourself. With no outline, or an outline with no outcomes, return an empty array and say so in "interpretation".

"covers": three to six topics, in the order the readings take them up. Each is { "text", "passage" }: "text" is one sentence saying what the readings deal with under this topic; "passage" is a place in a reading where that topic is taken up.

${RULES}`,

  takeaways: `You draft the key takeaways page of one module in a university course: the last page, which a student reads after the readings. A course designer reads every word and approves it before students see it.

# What the page is for
It states the main points of the module's readings plainly, so a student can check what they took from them and go back to a reading where they are unsure. Under each point the page shows the passage it rests on, and a program adds the name of the reading.

${OUTLINE_USE}

# What to write
Return { "interpretation", "points": [ ... ] }.

"points": four to eight, spread across all the readings, in the order the readings appear. Each is { "text", "passage" }.
- "text": one or two sentences stating one main point, in your own plain words. Your wording, the reading's content. A point is a claim or an explanation, not a topic: "Water is polar because its electrons are shared unequally", not "The polarity of water".
- "passage": the sentence of the reading that the point rests on.

Do not introduce the list and do not sum it up.

${RULES}`,

  discussion: `You draft the opening prompt of one discussion forum for a module in a university course. Students post an answer and reply to each other. It is not graded. A course designer reads every word and approves it before students see it.

# What the prompt is for
A good discussion prompt gives students something specific to respond to and room to answer differently from each other. It starts from particular places in the readings, and asks for a view, an application or a comparison that the readings inform but do not settle. A question with one right answer makes a poor discussion, because the second student has nothing left to say.

${OUTLINE_USE}

# What to write
Return { "interpretation", "prompt", "passages": [ ... ] }.

"prompt": two to four sentences to the student that set up the discussion: what the readings raise, and the main question you are asking them to answer from their own reasoning or experience. One main question, not a list.

"passages": one to three places in the readings the discussion starts from, in the order the readings appear. Each is { "passage", "question" }: "question" is one question to the student about that passage, which the passage raises and does not answer. Students should be able to answer it having done the readings, without outside research.

Do not tell students how to post or reply, how long to write, or that it is ungraded: fixed wording under the prompt does that.

${RULES}`,

  assignment: `You draft one assignment for a module in a university course: the task, what students hand in, suggested steps and a marking rubric. It will be graded by an instructor. A course designer and the instructor read every word and approve it before students see it, and they will adjust it to the course.

# What the assignment is for
It asks students to use what the module's readings say, not to repeat it: to apply an idea to a case, compare two positions, or explain something to a particular audience. A student should not be able to do it without the readings, and should not need sources beyond them unless the outline says the course expects that.

${OUTLINE_USE} If the outline describes an assignment for this module, draft that assignment and keep to what the outline says about it.

# What to write
Return { "interpretation", "task", "deliverable", "steps": [ ... ], "passages": [ ... ], "rubric": [ ... ] }.

"task": two to five sentences to the student saying what they are to do and why it matters for this module.

"deliverable": one to three sentences saying what they hand in: its form and a sensible length. No due date, no marks, no weighting, no late policy and no citation style unless the outline gives one for this assignment.

"steps": two to five short suggested steps, each a sentence.

"passages": one to three places in the readings the student should draw on, each { "passage", "why" }: "why" is one sentence saying what to use it for.

"rubric": the marking criteria, and only where the outline supports them. If a course outline is given and it lists learning outcomes, write three to five criteria, each { "criterion", "outcome", "levels" }:
- "criterion": a name of two to six words for one thing the work is marked on.
- "outcome": the learning outcome from the outline that this criterion assesses, copied word for word, without its number or bullet. A program checks it against the outline, and a reworded or invented outcome is rejected. Use only outcomes this task really lets a student show; two criteria may share an outcome.
- "levels": exactly ${RUBRIC_LEVELS.length} strings, best first (${RUBRIC_LEVELS.map((l) => l.label).join(', ')}). Each is one sentence describing what work at that level looks like for this criterion, in terms an instructor can see in the work. Describe the work, not the student. The lowest level describes work that does not yet do the thing, without scorn.
With no outline, or an outline with no learning outcomes, return an empty "rubric" array and say so in "interpretation". Never write an outcome yourself.

${RULES}`,
};

const Passage = z.string().min(1);
const Discussion = z.object({
  interpretation: z.string(),
  prompt: z.string(),
  passages: z.array(z.object({ passage: Passage, question: z.string().min(1) })).max(4),
});
const Assignment = z.object({
  interpretation: z.string(),
  task: z.string(),
  deliverable: z.string(),
  steps: z.array(z.string().min(1)).max(6).default([]),
  passages: z.array(z.object({ passage: Passage, why: z.string() })).max(4).default([]),
  rubric: z.array(z.object({ criterion: z.string().min(1), outcome: z.string().min(1), levels: z.array(z.string().min(1)).length(RUBRIC_LEVELS.length) })).max(6).default([]),
});

const Guide = z.object({
  interpretation: z.string(),
  why: z.string(),
  points: z.array(z.object({ idea: z.string().min(1), explanation: z.string().min(1), passage: Passage })).max(8),
  questions: z.array(z.string().min(1)).max(6).default([]),
});
const Overview = z.object({
  interpretation: z.string(),
  intro: z.string(),
  outcomes: z.array(z.string().min(1)).max(20).default([]),
  covers: z.array(z.object({ text: z.string().min(1), passage: Passage })).max(8),
});
const Takeaways = z.object({
  interpretation: z.string(),
  points: z.array(z.object({ text: z.string().min(1), passage: Passage })).max(10),
});

function dropNulls(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(dropNulls);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
  return x;
}

const tag = (s: string): string => s.replace(/"/g, "'");

export interface PageDraftInput {
  n: number;
  role: PageRole;
  moduleName: string;
  /** All the module's readings. A guide uses the one named by `reading`. */
  readings: Reading[];
  reading?: Reading;
  outline: string;
}

/**
 * Draft one course page. `change` is set when the designer asks for a
 * change. Items whose passage (or outcome) is not found are sent back once;
 * whatever still fails is reported as a problem on the page.
 */
export async function draftPage(input: PageDraftInput, attribution: Attribution, change?: { previous: unknown; note: string }): Promise<{ spec: Activity; problems: string[] }> {
  const { n, role, moduleName, readings, outline } = input;
  const notes: string[] = [];
  let source: string;      // what the passages are checked against
  let material: string;
  if (role === 'guide') {
    const r = input.reading;
    if (!r) throw new Error('A reading guide needs its reading.');
    source = r.text;
    if (r.text.length > GUIDE_MAX_CHARS) notes.push(`The reading is long; only its first ${Math.round(GUIDE_MAX_CHARS / 1000)},000 characters were used.`);
    material = `The module is called "${moduleName}". The reading is titled "${r.title}".\n\n<reading>\n${r.text.slice(0, GUIDE_MAX_CHARS)}\n</reading>`;
  } else {
    if (!readings.length) throw new Error('Add a reading first: this page is drafted from the module’s readings.');
    source = readings.map((r) => r.text).join('\n\n');
    const share = Math.floor(MODULE_MAX_CHARS / readings.length);
    if (readings.some((r) => r.text.length > share)) notes.push(`The readings are long together; only the first ${Math.round(share / 1000)},000 characters of each were used.`);
    material = `The module is called "${moduleName}". Its readings, in order:\n\n`
      + readings.map((r) => `<reading title="${tag(r.title)}">\n${r.text.slice(0, share)}\n</reading>`).join('\n\n');
  }
  const cutOutline = outline.trim().slice(0, OUTLINE_MAX_CHARS);
  material += cutOutline
    ? `\n\nThe course outline:\n\n<outline>\n${cutOutline}\n</outline>`
    : '\n\nNo course outline was given.';
  if (role === 'assignment' && !cutOutline) notes.push('No course outline was given, so the assignment has no rubric: criteria are only written against learning outcomes copied from the outline. Add the outline and draft the assignment again for one.');
  if (role === 'overview' && !cutOutline) notes.push('No course outline was given, so the page has no learning outcomes. Add the outline on the Course pages tab and draft the overview again to include them.');

  const ask = async (extra: string, endpoint: string): Promise<Record<string, unknown>> => {
    const common = { system: SYSTEM[role], userPrompt: material + extra, maxTokens: role === 'assignment' ? 7000 : 5000, effort: 'medium' as const, attribution, endpoint, model: env.BUILDER_MODEL, promptOnly: true, preprocess: dropNulls };
    if (role === 'guide') return await jsonCall({ ...common, schema: Guide });
    if (role === 'discussion') return await jsonCall({ ...common, schema: Discussion });
    if (role === 'assignment') return await jsonCall({ ...common, schema: Assignment });
    return role === 'overview' ? await jsonCall({ ...common, schema: Overview }) : await jsonCall({ ...common, schema: Takeaways });
  };
  const bodyOf = (r: Record<string, unknown>): Record<string, unknown> =>
    role === 'guide' ? { why: r.why, points: r.points, questions: r.questions }
      : role === 'discussion' ? { prompt: r.prompt, passages: r.passages }
      : role === 'assignment' ? { task: r.task, deliverable: r.deliverable, steps: r.steps, passages: r.passages, rubric: r.rubric }
      : role === 'overview' ? { intro: r.intro, outcomes: r.outcomes, covers: r.covers }
        : { points: r.points };
  const title = role === 'guide' ? `${PAGE_KINDS.guide!.title}: ${input.reading!.title}` : `${PAGE_KINDS[role]!.title}: ${moduleName}`;
  const toSpec = (r: Record<string, unknown>): Activity => ({
    n, type: role, title: title.slice(0, 120), interpretation: [String(r.interpretation ?? '').trim(), ...notes].filter(Boolean).join(' '),
    reading: role === 'guide' ? input.reading!.id : 0, ...bodyOf(r),
  } as Activity);
  const check = (spec: Activity): string[] => checkDrafted(spec, source, role === 'overview' || role === 'assignment' ? outline : '');

  let extra = '';
  if (change) {
    extra = `\n\nYou drafted this before:\n<previous>\n${JSON.stringify(change.previous, null, 1)}\n</previous>\n\n`
      + `The course designer reviewed it and asks for this change:\n<designer_note>\n${change.note}\n</designer_note>\n\n`
      + 'Return the whole page again with the change made. Keep what the note does not touch as it is. The ground rules still hold: every passage is copied exactly from a reading, and outcomes are only ever copied from the outline.';
  }
  let spec = toSpec(await ask(extra, change ? 'builder.page.redraft' : 'builder.page.draft'));
  let problems = check(spec);
  const misses = problems.filter((p) => /not in the readings? as quoted|no passage was given|not in the course outline/.test(p));
  if (misses.length) {
    const retry = `${extra}\n\nYou drafted this:\n<draft>\n${JSON.stringify(bodyOf(spec as unknown as Record<string, unknown>), null, 1)}\n</draft>\n\n`
      + `A program compared it with the material and these did not match:\n${misses.map((p) => '- ' + p).join('\n')}\n\n`
      + 'Return the whole page again. For each passage listed, copy it from the reading exactly, or choose another passage you can copy exactly and adjust the wording beside it to fit. '
      + 'For each outcome listed, copy it from the outline exactly as it is written there, or remove it. Leave everything else unchanged.';
    try {
      const second = toSpec(await ask(retry, 'builder.page.requote'));
      const secondProblems = check(second);
      if (secondProblems.length <= problems.length) { spec = second; problems = secondProblems; }
    } catch (e) {
      console.warn('builder: page requote retry failed, keeping the first draft:', (e as Error).message);
    }
  }
  return { spec, problems };
}
