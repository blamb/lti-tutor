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
import { RHIZO_KINDS, checkRhizo } from '../engine/rhizo.js';
import { env } from './env.js';

/** The activities that can be drafted from a reading. Which ones a module gets depends on its mode. */
export const ROLES = {
  questions: { title: 'Practice Questions', type: 'questionset', asks: 'Practice questions (multiple choice and true/false)' },
  cards: { title: 'Key Terms', type: 'dialogcards', asks: 'Flashcards of the key terms the reading defines' },
  breadcrumb: { title: 'Breadcrumb Trail', type: 'breadcrumb', asks: RHIZO_KINDS.breadcrumb!.asks },
  trust: { title: 'Trust Audit', type: 'trust', asks: RHIZO_KINDS.trust!.asks },
  unsettled: { title: 'What’s Unsettled', type: 'unsettled', asks: RHIZO_KINDS.unsettled!.asks },
  missing: { title: 'Who’s Missing', type: 'missing', asks: RHIZO_KINDS.missing!.asks },
  contract: { title: 'Community Contract', type: 'contract', asks: RHIZO_KINDS.contract!.asks },
} as const;
export type Role = keyof typeof ROLES;
/** The RhizMode kinds drafted from one reading. The contract is drafted from the whole module (draftContract). */
export type TrailRole = 'breadcrumb' | 'trust' | 'unsettled' | 'missing';
const TRAIL_ROLES: Role[] = ['breadcrumb', 'trust', 'unsettled', 'missing'];
const isTrail = (role: Role): role is TrailRole => TRAIL_ROLES.includes(role);
export type Mode = 'practice' | 'rhizmode';
/** practice: questions with an answer key. rhizmode: open prompts with none (engine/rhizo.ts). */
export const MODE_ROLES: Record<Mode, Role[]> = { practice: ['questions', 'cards'], rhizmode: ['breadcrumb', 'trust', 'unsettled', 'missing'] };

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

const Trails = z.object({
  interpretation: z.string(),
  trails: z.array(z.object({ passage: z.string().min(1), notice: z.string().min(1), questions: z.array(z.string().min(1)).min(1).max(3) })).max(4),
  your_turn: z.string(),
});
const Contract = z.object({ interpretation: z.string(), topic: z.string().min(1), parts: z.array(z.object({ prompt: z.string().min(1) })).length(4) });

/**
 * RhizMode. The pedagogy is Dave Cormier's (Learning in a Time of Abundance);
 * the wording of these prompts is ours. The model is told not to speak for
 * him and not to add facts: what it may say about a passage is limited to
 * what is on the page, and anything else goes to the designer as a note.
 * Each kind has its own brief (what it is for, what to choose, what to ask);
 * the refusals and the output shape are shared.
 */
const KIND_BRIEF: Record<TrailRole, { purpose: string; passage: string; notice: string; questions: string; your_turn: string }> = {
  breadcrumb: {
    purpose: `A published reading is a finished product. It states things and seldom shows how its author came to know them. In this activity students pick up a few of the reading's claims and ask where each one comes from: who or what stands behind it, what trail the text leaves for a reader to follow, and what they would want to know before passing the claim on to someone else. Then each student makes one claim of their own about the topic and leaves their own trail, in a discussion with classmates. The habit being practised is small and plain: saying "here is where I got this" in place of "I did my research". It is about being honest and visible, not about correct citation: "my own opinion", "something I see at work", "a figure from an article I could not check" and "something I have always taken for granted" are all good trails.`,
    passage: `a sentence in which the reading asserts something that matters to its argument. Where the reading allows, choose claims of different kinds: a number or a fact, a reading of events, a statement of what ought to be done, something known from experience.`,
    notice: `what trail the reading leaves for this claim: a figure with no source, a study cited, the author's own work, a statement of what should be done.`,
    questions: `where this claim comes from and what the student would want to know before repeating it. Across the activity, at least one question asks what the student, or people they know, know about this from somewhere other than a text.`,
    your_turn: `Invite the student to post one thing they believe about this reading's topic (name the topic concretely), to say plainly where they got it, whatever the source is (including "I have always assumed it"), and how sure they are. Do not ask for references or a citation style.`,
  },
  trust: {
    purpose: `Nobody can check everything. On most subjects a person has to decide whom to trust, and has to know when they do not know enough to hold an opinion at all. In this activity students pick up a few places where the reading asks to be taken on trust and look at what kind of trust is being asked for: in a named person, an institution, a study, the people who do this work, or the writer's own experience. For each they ask what they would need before giving that trust, and whether this is something they are in a position to weigh in on. The two habits being practised are trusting on purpose instead of by default, and being willing to say "I don't know enough to say". Be wary of nothing except total certainty: this activity should leave a student more able to choose whom to rely on, not less willing to rely on anyone.`,
    passage: `a sentence where the reading leans on someone or something to make a claim believable: an authority it names, an institution, a study or method, "experts", common knowledge, or the writer's own standing. Choose places that lean on different things.`,
    notice: `who or what the reading leans on in this sentence, as far as the page shows, and whether it tells the reader anything about them.`,
    questions: `what the student would want to know about that person, body or method before trusting it here; and whether they have what they need to judge, or whether the honest answer is that they do not. Do not ask whether the claim is true.`,
    your_turn: `Invite the student to name one thing in this reading's topic (name the topic concretely) that they take on trust, to say whom or what they are trusting and how they came to, and to name one thing on which they have decided not to have an opinion.`,
  },
  unsettled: {
    purpose: `A reading presents its subject tidied up: the disagreements, false starts and loose ends behind it are mostly out of sight. Some questions have answers that can be looked up or worked out, and those answers matter. Others stay open however much is known, because the honest answer is "it depends": on what people value and where they stand. Open does not mean anything goes; some answers are still better than others, and some things are not up for debate. In this activity students pick up a few places where the reading sounds finished, or where it admits it is not, and ask which kind of question lies underneath. They are not asked to resolve anything. The habit being practised is dealing with an open question, deciding what is the best answer for now, without either picking a side to believe and stopping there or giving up on it. A good first question about any passage is simply: is this uncertain?`,
    passage: `a sentence where the reading states something as settled that involves a judgement, a choice or a prediction; or a sentence where the reading itself says something is uncertain, disputed or still changing. Prefer at least one of each if the reading has them.`,
    notice: `how the reading presents the matter in this sentence: as settled or as open, and in what words (for example "is", "must", "is believed", "may").`,
    questions: `whether more information could settle this or whether it turns on what people want and value; and what the student would do or decide in the meantime, not knowing. Do not say or imply which it is.`,
    your_turn: `Invite the student to name one question about this reading's topic (name the topic concretely) that they think is still open, to say whether they think it could be found out or will stay a matter of what people value, where they lean, and what they cannot rule out.`,
  },
  missing: {
    purpose: `Every reading is written from somewhere and for someone, and no page can hold everyone its subject touches. Change and new tools tend to help some people and leave others out, and those left out are hard to see from inside the account. In this activity students pick up a few places where the reading speaks about people, in general or by group, and ask whose experience the sentence speaks from, who is not in the picture, and what they or people they know could add from their own lives. It is not a hunt for blame. The habit being practised is noticing who is left behind, and treating what a community knows first-hand as knowledge the text does not have. What gets written down has mostly been written by people with the time, money and standing to write it, so the gaps are ordinary, and worth caring about.`,
    passage: `a sentence where the reading speaks of people in general ("users", "households", "we", "students", "society"), names a group, describes a benefit or a change, or speaks about people without quoting them.`,
    notice: `who is in this sentence and how they appear: named or lumped together, speaking or spoken about, counted or described.`,
    questions: `who this sentence might not hold, asked as an open question; and what the student, their family, their workplace or their community knows about this first-hand. Do not name a group and say it is missing: you do not know that, and the student may. Ask. Never ask a student to speak as a member of a group.`,
    your_turn: `Invite the student to tell the class about someone the reading does not see in its topic (name the topic concretely): who they are, what the student knows about them and how they know it, saying so when they are guessing about people they do not know.`,
  },
};

function trailSystem(role: TrailRole): string {
  const k = KIND_BRIEF[role];
  return `You draft one open-ended activity for a university course from one reading. The activity is called ${ROLES[role].title}. A course designer reads every word and approves it before students see it. Students answer in a discussion with classmates. Nothing is graded.

# What the activity is for
${k.purpose}

# What the activity refuses to do
- It has no answer key. Never write a question you could mark right or wrong, and never one whose answer you are holding back. Not "What does the author mean by...", not "Which source supports...". If the reading itself answers the question, do not ask it.
- It is not a hunt for faults, and it does not teach distrust. Be curious about the reading, not suspicious of it. Do not call it biased, dated, one-sided or wrong, and do not hint that it is. Relying on people who know more is reasonable; the point is to do it knowingly.
- It never asks for a verdict the student is in no position to give. Do not ask "Is this true?", "Is the author right?" or "What should the government do?". Ask what the student can speak to: what they would want to know, whom they would go to, how the matter touches them or people they know.
- You add no facts. Say nothing about the world beyond this reading: not that a claim is true, false, debated, settled or out of date, not what other people say about it, and not who has been left out of it. About a passage you may state only what a reader can see on the page. If you believe the designer should know something from outside the reading, put it in "interpretation" and nowhere else.
- "I don't know", "I don't know enough to have an opinion, but this is how it affects me" and "here is who I would trust on this" must be acceptable answers to every question. Do not push the student to take a side, do not suggest that every view is as good as any other, and do not steer toward a tidy conclusion: the question may still be open when the discussion ends.
- It does not single anyone out. Never ask a student to speak for a group they belong to, and never rank what someone has read above what someone has lived.
- No praise, no "reflect on", and none of these words: epistemic, positionality, interrogate, unpack, lens, problematize, stakeholder.
- Do not mention any theorist or say whose ideas the activity draws on. The page carries its own credit line.

# What to write
Return { "interpretation", "trails": [ ... ], "your_turn" }.

"trails": two to four, in the order the passages appear in the reading. Each is { "passage", "notice", "questions" }.
- "passage": one sentence, or two that sit next to each other, copied from the reading character for character. At most 60 words. A program compares it with the reading; a paraphrase, a quote stitched from two places, or a quote with words changed fails and is discarded. Do not use headings, captions or lists. Choose ${k.passage}
- "notice": one plain sentence to the student, from the page alone, saying ${k.notice}
- "questions": two questions to the student, written for this passage and no other, about ${k.questions}

"your_turn": two or three sentences. ${k.your_turn}

If this reading gives you nothing honest to work with for this activity (for example it makes no claims of the kind described), do not force it: return an empty "trails" array and an empty "your_turn", and say why in "interpretation". A designer would rather have no activity than a strained one.

"interpretation": a note to the designer, one to three plain sentences: anything they should check, or a part of the reading you passed over and why. Empty string if there is nothing to say.

# Style
Plain Canadian English (colour, centre, analyse). Speak to the student as "you". Short sentences. No HTML and no markdown.

Reply with the JSON object only: no text before or after it, no code fence.`;
}

const CONTRACT_SYSTEM = `You draft one open-ended activity for a university course module. It is called Community Contract. A course designer reads every word and approves it before students see it. Nothing is graded.

# What the activity is for
What a person learns depends partly on whom they learn it with: the people in the room know things the readings do not, and how they treat each other is part of what everyone learns. Saying out loud what you value, and why, makes it possible to disagree fairly. Before the module's readings, each student tells the group four things: what they bring to this subject, what they need from the group, what they are willing to have challenged, and where they draw a line. They post it where classmates can read it, and come back to it at the end.

# What the activity refuses to do
- It has no right answers and is not a test of what students already know. Do not ask anything the readings answer.
- It is not a personality exercise or an icebreaker. Every question is about this module's subject.
- It does not ask students to disclose anything private. Ask what they are willing to share.
- You add no facts about the subject beyond what the readings say, and you take no position on it.
- No praise, no "reflect on", no "safe space", and none of these words: epistemic, positionality, interrogate, unpack, lens, stakeholder.
- Do not mention any theorist or say whose ideas the activity draws on. The page carries its own credit line.

# What to write
Return { "interpretation", "topic", "parts": [ {"prompt"}, {"prompt"}, {"prompt"}, {"prompt"} ] }.

"topic": one or two plain sentences to the student saying what this module is about and what is at stake in it, in everyday words, drawn from the readings. Not a list of the readings.

"parts": exactly four, in this order. Each "prompt" is one or two sentences, a question to the student, specific to this module's subject:
1. What I bring: what the student already knows, has done or has lived that touches this subject. Work, family and community count as much as coursework.
2. What I need from this group: what kind of help, challenge or patience would let them learn this subject with these people. Ask for something concrete.
3. What I am willing to have challenged: one thing they believe about this subject that they would let the group question.
4. Where I draw a line: something about this subject they are not prepared to treat as up for debate, and why it matters to them. Word it so that the answer is about what they value, not about other people in the class.

"interpretation": a note to the designer, one to three plain sentences, or an empty string.

# Style
Plain Canadian English (colour, centre, analyse). Speak to the student as "you". Short sentences. No HTML and no markdown.

Reply with the JSON object only: no text before or after it, no code fence.`;

const COMMON = `You write practice activities for a university course from one reading. A course designer reviews everything you write beside the sentence it rests on, and a subject expert reads it after that. Students use these to check their own understanding; nothing is graded.

# Ground rules
- Use only what this reading says. Do not bring in facts, examples or terms from outside it, even if you are sure of them. If the reading seems to contain an error, do not build an item on that sentence, and mention it in "interpretation".
- Every item carries "source_quote": one sentence (or one clause-complete part of a sentence) copied from the reading character for character, which by itself supports the answer. It is checked by a program against the reading; a paraphrase, a quote stitched from two places, or a quote with words changed fails the check and the item is discarded. Do not quote headings, captions or lists of terms.
- Write in plain Canadian English (colour, centre, analyse). No "all of the above", "none of the above", or negatively worded stems ("Which is NOT...").
- Inline HTML allowed: <code>, <strong>, <em>. No other tags, no markdown.
- "interpretation" is a note to the designer in one to three plain sentences: anything they should check (a doubtful sentence in the reading, a part of the reading you left uncovered and why). Empty string if there is nothing to say.

Reply with the JSON object only: no text before or after it, no code fence.`;

const SYSTEM: Record<'questions' | 'cards', string> = {
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
    const common = { system: isTrail(role) ? trailSystem(role) : SYSTEM[role as 'questions' | 'cards'], userPrompt: base + extra, maxTokens: 6000, effort: 'medium' as const, attribution, endpoint, model: env.BUILDER_MODEL, promptOnly: true, preprocess: dropNulls };
    if (role === 'contract') throw new Error('A Community Contract is drafted from the whole module, not from one reading.');
    if (isTrail(role)) return await jsonCall({ ...common, schema: Trails });
    return role === 'questions' ? await jsonCall({ ...common, schema: Questions }) : await jsonCall({ ...common, schema: Cards });
  };
  const toSpec = (r: Record<string, unknown>): Activity => {
    const note = [String(r.interpretation ?? '').trim(), cut ? `The reading is long; only its first ${Math.round(DRAFT_MAX_CHARS / 1000)},000 characters were used.` : ''].filter(Boolean).join(' ');
    const body = isTrail(role)
      // Where students answer is the designer's choice; a redraft keeps it.
      ? { place: (change?.previous as { place?: unknown } | undefined)?.place === 'page' ? 'page' : 'discussion', trails: r.trails, your_turn: r.your_turn }
      : role === 'questions' ? { questions: r.questions } : { description: 'Read the term, say what it means to yourself, then turn the card.', cards: r.cards };
    return { n, type: ROLES[role].type, title: `${ROLES[role].title}: ${reading.title}`.slice(0, 120), interpretation: note, reading: reading.id, ...body } as Activity;
  };

  let extra = '';
  if (change) {
    extra = `\n\nYou drafted this before:\n<previous>\n${JSON.stringify(change.previous, null, 1)}\n</previous>\n\n`
      + `The course designer reviewed it and asks for this change:\n<designer_note>\n${change.note}\n</designer_note>\n\n`
      + 'Return the whole activity again with the change made. Keep the items the note does not touch as they are. '
      + (isTrail(role) ? 'The rules still hold: every passage is copied exactly from the reading, and you add no facts from outside it.' : 'The ground rules still hold: every item rests on a sentence quoted exactly from the reading.');
  }
  let spec = toSpec(await ask(extra, change ? 'builder.redraft' : 'builder.draft'));
  let problems = checkDrafted(spec, reading.text);
  const quoteProblems = problems.filter((p) => /supporting sentence|not in the reading as quoted|no passage was given/.test(p));
  if (quoteProblems.length) {
    const retry = `${extra}\n\nYou drafted this:\n<draft>\n${JSON.stringify(isTrail(role) ? { trails: spec.trails, your_turn: spec.your_turn } : role === 'questions' ? spec.questions : spec.cards, null, 1)}\n</draft>\n\n`
      + `A program compared each ${isTrail(role) ? '"passage"' : '"source_quote"'} with the reading and these did not match:\n${quoteProblems.map((p) => '- ' + p).join('\n')}\n\n`
      + (isTrail(role)
        ? 'Return the whole activity again. For each passage listed, copy it from the reading exactly, or choose another passage you can copy exactly and rewrite its notice and questions to fit. Leave the others unchanged.'
        : 'Return the whole activity again. For each item listed, copy its supporting sentence from the reading exactly, or replace the item with one you can support with an exact quotation. Leave the other items unchanged.');
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

/** Each reading's share of the text sent for a Community Contract: enough to know what the module is about. */
const CONTRACT_CHARS_PER_READING = 12_000;

/**
 * Draft the module's Community Contract from all its readings. It has no
 * passages, so there is no anchor check: the four questions are about the
 * student, and the only thing drawn from the readings is what the module
 * is about.
 */
export async function draftContract(n: number, moduleName: string, readings: Reading[], attribution: Attribution, change?: { previous: unknown; note: string }): Promise<DraftResult> {
  const texts = readings.map((r) => `<reading title="${r.title.replace(/"/g, "'")}">\n${r.text.slice(0, CONTRACT_CHARS_PER_READING)}\n</reading>`).join('\n\n');
  let userPrompt = `The module is called "${moduleName}". Its readings (the start of each):\n\n${texts}`;
  if (change) {
    userPrompt += `\n\nYou drafted this before:\n<previous>\n${JSON.stringify(change.previous, null, 1)}\n</previous>\n\n`
      + `The course designer reviewed it and asks for this change:\n<designer_note>\n${change.note}\n</designer_note>\n\n`
      + 'Return the whole activity again with the change made. Keep what the note does not touch as it is.';
  }
  const r = await jsonCall({
    system: CONTRACT_SYSTEM, userPrompt, maxTokens: 3000, effort: 'medium' as const, attribution,
    endpoint: change ? 'builder.redraft' : 'builder.draft', model: env.BUILDER_MODEL, promptOnly: true, preprocess: dropNulls, schema: Contract,
  });
  const spec = {
    n, type: 'contract', title: `Community Contract: ${moduleName}`.slice(0, 120), interpretation: r.interpretation.trim(), reading: 0,
    place: (change?.previous as { place?: unknown } | undefined)?.place === 'page' ? 'page' : 'discussion', topic: r.topic, parts: r.parts,
  } as Activity;
  return { spec, problems: checkRhizo(spec) };
}
