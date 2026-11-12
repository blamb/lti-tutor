/**
 * The interpretation step: one free-form H5P specification from a course
 * draft becomes one structured activity the engine can build.
 *
 * The page rules are fixed code. This is the only place a model is used,
 * and its output is never built unseen: each reading is shown beside the
 * spec as the author wrote it, with a note wherever the spec did not fit
 * H5P as written, and the designer approves, corrects or leaves it out.
 *
 * The model is told to carry the author's wording across and to write
 * nothing of its own beyond a missing title or instruction line, which it
 * must declare in `interpretation`.
 */

import { z } from 'zod';
import { jsonCall } from '../../core/llm.js';
import type { Attribution } from '../../core/costs.js';
import { checkActivity, type Activity, type Slot } from '../engine/index.js';
import { env } from './env.js';

export const TYPE_LABELS: Record<string, string> = {
  multichoice: 'Multiple choice',
  truefalse: 'True / false',
  blanks: 'Fill in the blanks',
  dragtext: 'Drag the words',
  dragdrop: 'Drag and drop',
  dialogcards: 'Dialog cards',
  sort: 'Sort the paragraphs',
  questionset: 'Question set',
};

const Answer = z.object({ text: z.string(), correct: z.boolean(), feedback: z.string().optional() });

/** One question inside a question set. */
const Question = z.object({
  type: z.enum(['multichoice', 'truefalse', 'blanks', 'dragtext']),
  question: z.string().optional(),
  answers: z.array(Answer).optional(),
  correct: z.boolean().optional(),
  instructions: z.string().optional(),
  text: z.array(z.string()).optional(),
  case_sensitive: z.boolean().optional(),
  feedback: z.string().optional(),
});

/**
 * What the model writes: one flat object, with only the fields its chosen
 * type uses. Flat rather than a union so one schema validates every reply;
 * checkActivity() then enforces what each type needs.
 */
export const Reading = z.object({
  type: z.enum(['multichoice', 'truefalse', 'blanks', 'dragtext', 'dragdrop', 'dialogcards', 'sort', 'questionset']),
  title: z.string(),
  interpretation: z.string(),
  question: z.string().optional(),
  answers: z.array(Answer).optional(),
  correct: z.boolean().optional(),
  instructions: z.string().optional(),
  text: z.array(z.string()).optional(),
  case_sensitive: z.boolean().optional(),
  zones: z.array(z.object({ label: z.string(), feedback: z.string().optional() })).optional(),
  items: z.array(z.object({ text: z.string(), zone: z.number().int() })).optional(),
  description: z.string().optional(),
  cards: z.array(z.object({ front: z.string(), back: z.string() })).optional(),
  paragraphs: z.array(z.string()).optional(),
  questions: z.array(Question).optional(),
  check_at_end: z.boolean().optional(),
  feedback: z.string().optional(),
  feedback_correct: z.string().optional(),
  feedback_incorrect: z.string().optional(),
});
export type Reading = z.infer<typeof Reading>;

const SYSTEM = `You turn one H5P activity specification, written by a course author inside a Word course draft, into a structured activity for Moodle. A production team used to do this by hand. A course designer will check your reading against the spec before anything is built.

The spec is shown as the author wrote it, with light HTML: <strong>, <em>, <code>, and <mark> for words the author coloured red. Red words are the author's way of marking the answers: the blanks in a fill-in-the-blanks, the draggable words in a drag-the-words.

# The rule that matters most
Use the author's wording. Copy questions, answers, feedback, card text and instructions across as written (fix nothing but obvious stray punctuation left by the spec's layout, such as list markers, tick boxes or quotation marks around feedback). Do not add questions, answers, distractors, facts or explanations of your own. Do not improve the author's phrasing. If the spec lacks a title or a one-line instruction that the activity type needs, write a short plain one and say so in "interpretation".

# Activity types and their fields
Return one object. "type", "title" and "interpretation" are always present; include only the other fields the chosen type uses.

- multichoice: "question"; "answers" [{ "text", "correct", "feedback"? }]. One correct answer makes it single choice; more than one makes it select-all-that-apply. Per-answer feedback goes on the answer it belongs to. "feedback"? is one overall line.
- truefalse: "question" (the statement, without a "True or false:" prefix); "correct" (true or false); "feedback"? shown after checking, or "feedback_correct"? and "feedback_incorrect"? when the spec gives different lines for right and wrong.
- blanks (typed answers): "instructions"?; "text": an array of one or more passages, with each blank written as *answer*. Alternatives the spec accepts go inside one pair of asterisks separated by slashes: *uses/calls*. "case_sensitive"? true only if the spec says case matters or the answers are code or symbols where it does. "feedback"?.
- dragtext (drag words into gaps): "instructions"?; "text": an array of sentences or lines, each draggable word or phrase written as *word*. This type shows plain text only, so do not use HTML tags in "text". "feedback"?.
- dragdrop (drag items onto labelled zones): "instructions"?; "zones" [{ "label", "feedback"? }] (a zone's "feedback" is a note the spec gives for that zone); "items" [{ "text", "zone" }] where "zone" is the 0-based index of the zone the item belongs in. List the items in a mixed order, not grouped by zone, because the starting layout follows your order and must not give the answer away. "feedback_correct"?, "feedback_incorrect"?, or one "feedback"?.
- dialogcards (flip cards): "description"? (one line telling the learner what to do); "cards" [{ "front", "back" }].
- sort (put paragraphs in order): "instructions"; "paragraphs": the items in the CORRECT order (the activity shuffles them). "feedback"?.
- questionset (several questions, one at a time): "questions" [{ "type": "multichoice", "truefalse", "blanks" or "dragtext", then that type's fields }]. A question's "feedback" is its own. Keep every question the spec lists, in its order. "check_at_end"? true only when the spec says answers are checked or feedback is shown at the end rather than after each question.

Inline HTML is allowed in every field except dragtext "text": <code>, <strong>, <em>. Keep the author's <code> marking. Never output <mark>.

# When the spec does not fit
Authors name H5P types loosely, and some specs ask for things a type cannot do. Choose the closest type that keeps the author's content and intent, and explain the choice in one or two plain sentences in "interpretation". Common cases:
- A "True/False" spec with several statements: a questionset of truefalse questions.
- Several multiple-choice questions under one spec: a questionset.
- Feedback per blank in a fill-in-the-blanks (the type has none): put the notes together in "feedback".
- A matching task (pairs): dragdrop with one zone per left-hand item, or dragtext if the pairs read as sentences.
- A type this tool cannot build (interactive video, course presentation, branching scenario, image hotspots, anything needing an image or media you do not have): do not approximate it with something that changes the task. Return the closest buildable type only if the learning task survives; otherwise return type "dialogcards" with no cards and explain in "interpretation" that it could not be built and why. The designer will see that and handle it by hand.

"interpretation" is for the designer, who reads sixteen of these in a row: keep it to what they need to check, in one to three plain sentences. Leave it as an empty string when you followed the spec as written. Do not report routine clean-up (removing option letters, tick boxes, "(Correct)" markers or quotation marks, reading bold or red as the answer key, mixing the order of drag items). Do say when you wrote a title or instruction line, changed the activity type, moved or merged feedback, dropped formatting the type cannot show, or left anything out. And flag anything in the spec that looks like a mistake (an answer key that contradicts the feedback, a missing correct answer, a count that does not match). Do not correct such mistakes silently: build what the spec says and flag it.

"title" is plain text with no HTML tags: the spec's title if it has one; otherwise a short one drawn from the question or task (and say so in "interpretation").

Reply with the JSON object only: no text before or after it, no code fence.`;

/** Drop empty optional fields so the stored spec is as small as a hand-written one. */
function tidy(r: Reading): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '' && k !== 'title') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  // Fields that belong to other types confuse the reviewer and the engine alike.
  const keep: Record<string, string[]> = {
    multichoice: ['question', 'answers', 'feedback'],
    truefalse: ['question', 'correct', 'feedback', 'feedback_correct', 'feedback_incorrect'],
    blanks: ['instructions', 'text', 'case_sensitive', 'feedback'],
    dragtext: ['instructions', 'text', 'feedback'],
    dragdrop: ['instructions', 'zones', 'items', 'feedback', 'feedback_correct', 'feedback_incorrect'],
    dialogcards: ['description', 'cards'],
    sort: ['instructions', 'paragraphs', 'feedback'],
    questionset: ['questions', 'check_at_end'],
  };
  const allowed = new Set(['type', 'title', 'interpretation', ...(keep[r.type] ?? [])]);
  for (const k of Object.keys(out)) if (!allowed.has(k)) delete out[k];
  if (out.type === 'truefalse' && typeof out.feedback_incorrect === 'string') {
    // The engine's name for this field on a true/false question.
    out.feedback_wrong = out.feedback_incorrect;
    delete out.feedback_incorrect;
  }
  return out;
}

/** A model writing free JSON sometimes fills an unused field with null; the schema wants it absent. */
function dropNulls(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(dropNulls);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
  }
  return x;
}

export interface ReadResult {
  spec: Activity;
  problems: string[];
}

/**
 * Read one spec. `previous` and `note` are set when the designer asks for a
 * change: the model sees its earlier reading and the designer's instruction.
 */
export async function readSpec(slot: Slot, attribution: Attribution, change?: { previous: unknown; note: string }): Promise<ReadResult> {
  const where = `This spec is in the chapter "${slot.chapter}", under the heading "${slot.under}".` +
    (slot.title ? ` The draft gives it the title "${slot.title}".` : ' The draft gives it no title.');
  let userPrompt = `${where}\n\n<spec>\n${slot.text}\n</spec>`;
  if (change) {
    userPrompt += `\n\nYou read this spec before as:\n<previous>\n${JSON.stringify(change.previous, null, 1)}\n</previous>\n\n` +
      `The course designer reviewed that and asks for this change:\n<designer_note>\n${change.note}\n</designer_note>\n\n` +
      `Return the whole activity again with the change made. The designer's note overrides the spec where they differ; ` +
      `the rule about not adding content of your own still holds unless the note itself supplies the content. Update "interpretation" to match.`;
  }
  const reading = await jsonCall({
    schema: Reading,
    system: SYSTEM,
    userPrompt,
    maxTokens: 4000,
    effort: 'medium',
    attribution,
    endpoint: change ? 'builder.reread' : 'builder.read',
    model: env.BUILDER_MODEL,
    // The flat schema has a dozen optional fields; as a structured-output
    // grammar it makes the request time out, so the prompt asks for JSON and
    // the schema validates it (with jsonCall's one correction retry).
    promptOnly: true,
    preprocess: dropNulls,
  });
  const spec = { n: slot.n, ...tidy(reading) } as Activity;
  return { spec, problems: checkActivity(spec) };
}

/** A plain-language outline of an activity for the review screen (HTML-safe fields are the author's own inline HTML). */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
