/**
 * The drafting step for a module built from readings: practice activities
 * written by a model from the text of one reading.
 *
 * Unlike the reading of a Word draft's H5P specifications (interpret.ts),
 * where the wording is the author's, here the questions are the model's.
 * Two things keep that honest. Every question and card must quote the
 * sentence of the reading it rests on, and code checks that the quotation
 * is really there (engine/reading.ts); an item whose quotation is missing
 * cannot go into the file. And nothing is built unseen: the designer sees
 * each item beside its supporting sentence and approves, changes or drops
 * it, and the build report lists every item for a subject reviewer.
 */

import { z } from 'zod';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import type { Activity } from '../engine/index.js';
import { checkDrafted, type Reading } from '../engine/reading.js';
import { env } from './env.js';

/** The two activities drafted for each reading. */
export const ROLES = {
  questions: { title: 'Practice Questions', type: 'questionset', asks: 'Practice questions (multiple choice and true/false)' },
  cards: { title: 'Key Terms', type: 'dialogcards', asks: 'Flashcards of the key terms the reading defines' },
} as const;
export type Role = keyof typeof ROLES;

/** Readings longer than this are cut for the model; the cut is reported. About 30,000 words. */
export const DRAFT_MAX_CHARS = 180_000;

const Answer = z.object({ text: z.string().min(1), correct: z.boolean(), feedback: z.string().min(1) });
const Question = z.object({
  type: z.enum(['multichoice', 'truefalse']),
  question: z.string().min(1),
  answers: z.array(Answer).optional(),
  correct: z.boolean().optional(),
  feedback: z.string().optional(),
  source_quote: z.string().min(1),
});
const Questions = z.object({ interpretation: z.string(), questions: z.array(Question).min(1).max(12) });
const Cards = z.object({
  interpretation: z.string(),
  cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1), source_quote: z.string().min(1) })).max(24),
});

const COMMON = `You write practice activities for a university course from one reading. A course designer reviews everything you write beside the sentence it rests on, and a subject expert reads it after that. Students use these to check their own understanding; nothing is graded.

# Ground rules
- Use only what this reading says. Do not bring in facts, examples or terms from outside it, even if you are sure of them. If the reading seems to contain an error, do not build an item on that sentence, and mention it in "interpretation".
- Every item carries "source_quote": one sentence (or one clause-complete part of a sentence) copied from the reading character for character, which by itself supports the answer. It is checked by a program against the reading; a paraphrase, a quote stitched from two places, or a quote with words changed fails the check and the item is discarded. Do not quote headings, captions or lists of terms.
- Write in plain Canadian English (colour, centre, analyse). No "all of the above", "none of the above", or negatively worded stems ("Which is NOT...").
- Inline HTML allowed: <code>, <strong>, <em>. No other tags, no markdown.
- "interpretation" is a note to the designer in one to three plain sentences: anything they should check (a doubtful sentence in the reading, a part of the reading you left uncovered and why). Empty string if there is nothing to say.

Reply with the JSON object only: no text before or after it, no code fence.`;

const SYSTEM: Record<Role, string> = {
  questions: `${COMMON}

# This task: practice questions
Return { "interpretation", "questions": [ ... ] } with 6 to 8 questions (fewer if the reading is short; never pad).
- Spread the questions across the reading's main ideas, in the order the reading presents them.
- Most should ask the student to apply or explain an idea in a short concrete situation, not to recall a phrase. A few recall questions on essential terms are fine.
- Multiple choice: { "type": "multichoice", "question", "answers": [ { "text", "correct", "feedback" } x4 ], "source_quote" }. Exactly one answer is correct. Wrong answers must be plausible mistakes a student could make from this reading, similar in length and form to the right one; the correct answer must not be the longest or the most detailed. Every answer has feedback of one sentence: for a wrong answer, why it is wrong in terms of the reading; for the right one, why it is right. List the answers in a sensible order (they are shuffled for the student).
- True/false (at most two): { "type": "truefalse", "question" (a statement, with no "True or false:" in front), "correct", "feedback" (one sentence explaining the answer), "source_quote" }.`,
  cards: `${COMMON}

# This task: key-term flashcards
Return { "interpretation", "cards": [ ... ] }.
- One card for each important term the reading itself defines or explains: "front" is the term, "back" is its meaning in the reading's own words, shortened only by leaving words out. Do not write definitions of your own.
- If the reading has a glossary or a list of key terms with definitions, use those entries as written, and "source_quote" is the definition as it appears.
- Between 5 and 16 cards. If the reading defines fewer than three terms, return an empty "cards" array and say so in "interpretation".`,
};

export interface DraftResult {
  spec: Activity;
  problems: string[];
}

function dropNulls(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(dropNulls);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
  return x;
}

/**
 * Draft one activity from a reading. `change` is set when the designer asks
 * for a change: the model sees its earlier draft and the designer's note.
 * Items whose quotation is not in the reading are dropped once and the
 * model is asked to replace them; whatever still fails is reported as a
 * problem on the activity.
 */
export async function draftActivity(n: number, reading: Reading, role: Role, attribution: Attribution, change?: { previous: unknown; note: string }): Promise<DraftResult> {
  const cut = reading.text.length > DRAFT_MAX_CHARS;
  const text = cut ? reading.text.slice(0, DRAFT_MAX_CHARS) : reading.text;
  const base = `The reading is titled "${reading.title}".\n\n<reading>\n${text}\n</reading>`;
  const ask = async (extra: string, endpoint: string): Promise<Record<string, unknown>> => {
    const common = { system: SYSTEM[role], userPrompt: base + extra, maxTokens: 6000, effort: 'medium' as const, attribution, endpoint, model: env.BUILDER_MODEL, promptOnly: true, preprocess: dropNulls };
    return role === 'questions' ? await jsonCall({ ...common, schema: Questions }) : await jsonCall({ ...common, schema: Cards });
  };
  const toSpec = (r: Record<string, unknown>): Activity => {
    const note = [String(r.interpretation ?? '').trim(), cut ? `The reading is long; only its first ${Math.round(DRAFT_MAX_CHARS / 1000)},000 characters were used.` : ''].filter(Boolean).join(' ');
    const body = role === 'questions' ? { questions: r.questions } : { description: 'Read the term, say what it means to yourself, then turn the card.', cards: r.cards };
    return { n, type: ROLES[role].type, title: `${ROLES[role].title}: ${reading.title}`.slice(0, 120), interpretation: note, reading: reading.id, ...body } as Activity;
  };

  let extra = '';
  if (change) {
    extra = `\n\nYou drafted this before:\n<previous>\n${JSON.stringify(change.previous, null, 1)}\n</previous>\n\n`
      + `The course designer reviewed it and asks for this change:\n<designer_note>\n${change.note}\n</designer_note>\n\n`
      + 'Return the whole activity again with the change made. Keep the items the note does not touch as they are. '
      + 'The ground rules still hold: every item rests on a sentence quoted exactly from the reading.';
  }
  let spec = toSpec(await ask(extra, change ? 'builder.redraft' : 'builder.draft'));
  let problems = checkDrafted(spec, reading.text);
  const quoteProblems = problems.filter((p) => /supporting sentence/.test(p));
  if (quoteProblems.length) {
    const retry = `${extra}\n\nYou drafted this:\n<draft>\n${JSON.stringify(role === 'questions' ? spec.questions : spec.cards, null, 1)}\n</draft>\n\n`
      + `A program compared each "source_quote" with the reading and these did not match:\n${quoteProblems.map((p) => '- ' + p).join('\n')}\n\n`
      + 'Return the whole activity again. For each item listed, copy its supporting sentence from the reading exactly, or replace the item with one you can support with an exact quotation. Leave the other items unchanged.';
    try {
      const second = toSpec(await ask(retry, 'builder.draft.requote'));
      const secondProblems = checkDrafted(second, reading.text);
      if (secondProblems.length <= problems.length) { spec = second; problems = secondProblems; }
    } catch (e) {
      console.warn('builder: requote retry failed, keeping the first draft:', (e as Error).message);
    }
  }
  return { spec, problems };
}
