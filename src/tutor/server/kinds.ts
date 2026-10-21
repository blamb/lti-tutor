/**
 * Tutorial kinds: the six shapes a one-on-one tutorial can take, each
 * mapped to the TRU engagement types it serves (REALIGNMENT-PROMPT.md).
 *
 *   readiness          1, 2   short diagnostic before a unit, no teach-back
 *   preparation_check  3      after an assigned reading, no teach-back
 *   concept            4, 5   the original orient → explore → teach-back → wrap-up
 *   practice           6, 9   feedback on a draft or attempt, never a grade
 *   reflection         7      metacognition after a unit
 *   recall             8      retrieval of earlier learning, then connection
 *   assignment_start   4, 9   getting started on an assignment: unpack, connect
 *                             to the readings and activities, plan, first step
 *
 * Every kind is available in every delivery mode; only wording changes, and
 * that wording keys on the delivery booleans (never on the TRUFlex number).
 * Each kind owns its stage template, the kind-specific lines of the tutor
 * rules, its summary schema and the guidance the AI draft follows.
 */

import type { Delivery } from './delivery.js';

export const TUTORIAL_KINDS = ['readiness', 'preparation_check', 'concept', 'practice', 'reflection', 'recall', 'assignment_start'] as const;
export type TutorialKind = (typeof TUTORIAL_KINDS)[number];

export function isTutorialKind(v: unknown): v is TutorialKind {
  return typeof v === 'string' && (TUTORIAL_KINDS as readonly string[]).includes(v);
}

/** Pick wording by what the course has, never by the raw mode number. */
function timing(d: Delivery, live: string, dated: string, open: string): string {
  if (d.hasLiveSessions) return live;
  if (d.hasFixedDates) return dated;
  return open;
}

export interface StageDef {
  name: string;
  /** Fraction of the target exchange count this stage runs until; Infinity for the last. */
  until: number;
}

export interface KindSpec {
  kind: TutorialKind;
  /** Shown to learners and instructors, e.g. "Readiness check". */
  label: string;
  /** TRU engagement types served (1–9). */
  engagement: number[];
  /** One line for the instructor's kind selector. */
  blurb: string;
  /** 4–8 exchanges and no teach-back. */
  short: boolean;
  stages: StageDef[];
  /** Upper bound on words per tutor reply. */
  replyWords: number;
  /** Kind-specific opening paragraph of the tutor rules. */
  purpose: (d: Delivery) => string;
  /** Kind-specific hard rules, appended after the shared ones. */
  rules: (d: Delivery) => string[];
  /** The "- STAGE: what to do" lines. */
  stageGuide: (d: Delivery) => string[];
  /** JSON key descriptions beyond the shared ones, for the summary prompt. */
  summaryExtras: string;
  /** How to judge `mastery` for this kind. */
  summaryGuidance: string;
  /** What each brief field should contain, for the AI draft. */
  draftGuide: string;
  /** How this kind uses the `practice_prompts` field, or null if it does not. */
  prompts: { label: string; hint: string } | null;
}

const WRAP_UP_FINISH = 'tell them they can click "Finish tutorial" to get their summary. Then stop asking questions.';

export const KINDS: Record<TutorialKind, KindSpec> = {
  readiness: {
    kind: 'readiness',
    label: 'Readiness check',
    engagement: [1, 2],
    blurb: 'Short diagnostic before a unit: what they already know and misunderstand, then what to watch for.',
    short: true,
    stages: [
      { name: 'ORIENT', until: 0 },
      { name: 'PROBE', until: 0.8 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 70,
    purpose: (d) =>
      `This is a short readiness check ${timing(d, 'before the next class', "before this week's material", 'before the student starts the next section')}. Your job is diagnostic, not instructional: find out what the student already knows, believes and misunderstands about the upcoming topic, activate what they can build on, and prime them for what is coming. Four to eight exchanges.`,
    rules: () => [
      'Do not teach the topic. When you hear a misconception, note it and move on; do not correct it now. The upcoming material will, and the instructor will see it in your summary.',
      'Ask about what they have met before: in earlier courses, at work, in everyday life. Prior knowledge counts even when it is informal.',
    ],
    stageGuide: (d) => [
      `- ORIENT (first reply only): greet the student by first name in one short sentence, say this is a quick check-in ${timing(d, 'before the next class', "before this week's material", 'before the next section')} and that there are no wrong answers, then ask the opening question. Nothing else.`,
      '- PROBE: two to four questions, one per turn, working through the probes in the brief. Listen for the misconceptions it lists. Build on what they say.',
      `- WRAP-UP: in three or four sentences, tell the student specifically what to pay attention to in the upcoming material given what they said (two or three concrete pointers, no answers), then ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "prior_knowledge": "none" | "some" | "solid",
  "misconceptions_found": [up to 6 short phrases: specific misconceptions the student voiced; empty if none],
  "watch_for": [up to 4 short pointers the tutor gave them for the upcoming material],`,
    summaryGuidance: 'Here "mastery" means readiness for the unit: "solid" = relevant prior knowledge and no serious misconceptions; "developing" = some footing; "needs_work" = little to build on or a misconception that will block the unit. Put the misconceptions in sticking_points too.',
    draftGuide: `This is a READINESS CHECK run before the unit. learning_goal = what we want to find out and activate before the unit (not what they should learn). opening_question = the first diagnostic question: concrete, about something they may already have met. ta_brief = three or four probes targeting the prior knowledge the unit builds on and the misconceptions listed, plus what to tell them to watch for at the end. misconceptions = the ones to listen for (do not correct them). success_criteria = what "ready for this unit" sounds like.`,
    prompts: null,
  },

  preparation_check: {
    kind: 'preparation_check',
    label: 'Preparation check',
    engagement: [3],
    blurb: 'After an assigned reading: did they do it, what stuck, what did not. Kind, not a quiz.',
    short: true,
    stages: [
      { name: 'ORIENT', until: 0 },
      { name: 'RECALL', until: 0.55 },
      { name: 'CONNECT', until: 0.85 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 70,
    purpose: (d) =>
      `This is a short preparation check after ${timing(d, "this week's assigned reading", "this week's assigned reading", 'the assigned reading for this section')}. Your job is to find out, kindly, whether the student did the preparation and which key ideas landed. It is accountability, not a gotcha quiz: four to eight exchanges.`,
    rules: () => [
      'Never quiz for trivia. Ask them to recount the key ideas in their own words; one gap at a time.',
      'If it becomes clear they have not done the reading, say so plainly and without judgment, ask what they can look at right now (a section, a summary), and carry on from there. Record it honestly in your wrap-up.',
    ],
    stageGuide: (d) => [
      `- ORIENT (first reply only): greet the student by first name in one short sentence, name the reading and say you want to hear what stood out ${timing(d, 'before class', 'this week', 'before they move on')}, then ask the opening question. Nothing else.`,
      '- RECALL: ask them to recount the key ideas from the brief in their own words. Probe one idea that is missing or garbled; do not list what they missed.',
      '- CONNECT: ask them to connect one idea from the reading to something they already know, have seen at work, or have experienced.',
      `- WRAP-UP: in three or four sentences, say what landed and name the one part worth re-reading, then ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "preparation_done": "yes" | "partly" | "no",
  "ideas_missed": [up to 6 short phrases: key ideas from the reading that did not land or were absent],`,
    summaryGuidance: 'Here "mastery" means how well the preparation landed: "solid" = they did the reading and can recount the key ideas; "needs_work" = little evidence of preparation. Put ideas_missed in sticking_points too.',
    draftGuide: `This is a PREPARATION CHECK run after an assigned reading. learning_goal = which key ideas from the reading the student should be able to recount. opening_question = an open question about the reading that someone who did it can answer easily. ta_brief = the three to five key ideas to check recall of (each with what a good recount contains), how to handle a student who has not done the reading, and the connect prompt. misconceptions = ideas commonly garbled on a first reading. success_criteria = what shows they did the reading and understood it.`,
    prompts: null,
  },

  concept: {
    kind: 'concept',
    label: 'Tutorial',
    engagement: [4, 5],
    blurb: 'The core Socratic tutorial: orient, explore, teach it back, wrap up.',
    short: false,
    stages: [
      { name: 'ORIENT', until: 0 },
      { name: 'EXPLORE', until: 0.6 },
      { name: 'TEACH-BACK', until: 1 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 80,
    purpose: () => '',
    rules: () => [],
    stageGuide: (d) => {
      const orient = d.hasLiveSessions
        ? 'greet the student by first name in one short sentence, state the goal of this tutorial in one sentence, then ask the opening question. Nothing else.'
        : 'greet the student by first name in one short sentence, state the goal of this tutorial in one sentence, then ask the opening question. Nothing else. Do not assume they have just been taught this or finished a reading — they may be arriving cold — so the opening question must stand on its own.';
      const audience = !d.hasCohort
        ? 'as if to someone who has never studied this'
        : d.hasLiveSessions
          ? 'as if teaching a classmate who missed the lecture'
          : 'as if teaching a classmate in the course who has not reached this topic yet';
      return [
        `- ORIENT (first reply only): ${orient}`,
        "- EXPLORE: work through the brief's probes. Build on what they say. Keep them doing the thinking.",
        `- TEACH-BACK: ask one open question that has the student explain the core idea in their own words, ${audience}. Do not explain, summarise or play back the idea yourself before they have, and give no model answer or outline of one. If they reply only with agreement or thanks ("yes", "ok", "that's right", "thanks"), do not accept it as a teach-back: say in one short sentence that you want to hear it in their words, and ask again, more concretely. Once they have explained it, respond only to the gaps: name the one thing that is missing or wrong, as a question. Any recap of yours is at most two sentences and never restates the whole idea (Pask's conversation theory: understanding is confirmed when the student can re-explain it, not when they agree with yours).`,
        `- WRAP-UP: in three or four sentences, say what the student worked out in their own words (only what they actually said), name the one thing to review, and ${WRAP_UP_FINISH}`,
      ];
    },
    summaryExtras: `  "teachback": one sentence on how well they explained the core idea back in their own words, or "Teach-back not reached" if the tutorial ended before that stage,`,
    summaryGuidance: '"solid" means they could explain the idea unprompted and survived a counter-example. A short transcript with little from the student is "needs_work", not "developing".',
    draftGuide: `This is a CONCEPT TUTORIAL. learning_goal = what the student should be able to explain by the end. opening_question = open, concrete, answerable from the materials, not yes/no. ta_brief = how to open, the 3–5 probes to work through in order (each with what a good answer contains), what to do when the student is stuck, and when to move to the teach-back. misconceptions = 3–5 lines, each a misconception and the question that exposes it. success_criteria = what a student who "got it" can say or do.`,
    prompts: null,
  },

  practice: {
    kind: 'practice',
    label: 'Practice',
    engagement: [6, 9],
    blurb: 'The learner brings a draft or attempt; the tutor gives feedback against the criteria and offers more practice. Never a grade.',
    short: false,
    stages: [
      { name: 'SHARE', until: 0 },
      { name: 'FEEDBACK', until: 0.4 },
      { name: 'REVISE', until: 0.7 },
      { name: 'MORE-PRACTICE', until: 0.9 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 150,
    purpose: () =>
      "This is a practice session. The student brings a draft, a worked attempt or an answer to a practice scenario (pasted or spoken), and you give feedback against the brief's success criteria, help them improve it by asking questions, and offer one more practice question. It is a safe, unassessed setting: the real assessment happens elsewhere.",
    rules: () => [
      'Never assign a grade, mark, percentage, level or pass/fail, and never estimate what mark the work would get. If asked, say this is practice and the instructor assesses.',
      'Feedback names two specific strengths and the single most important thing to improve, framed as a question where possible ("what happens to your argument if…?"). One improvement at a time.',
      "If the student has nothing to share yet, offer one of the brief's practice prompts (or make one in the same spirit) and wait for their attempt.",
      'Do not rewrite their work for them. Point at the part to change and let them change it.',
    ],
    stageGuide: () => [
      "- SHARE (first reply only): greet the student by first name in one short sentence, say what kind of work this session gives feedback on and that nothing here is graded, and ask them to paste or say their draft or attempt — or to ask for a practice question if they don't have one yet. Nothing else.",
      "- FEEDBACK: respond to what they shared against the success criteria: two specific strengths, then the one most important thing to improve, as a question. You may run a little longer here, but stay under the word limit.",
      '- REVISE: ask them to revise that specific part. Respond to the revision: did it fix the problem? Probe once more if not.',
      "- MORE-PRACTICE: offer one more practice question or scenario from the brief's practice prompts (or in the same spirit). Respond to their attempt with one strength and one thing to improve.",
      `- WRAP-UP: in four or five sentences, summarise their strengths and the top one or two things to keep working on, and ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "strengths": [up to 5 short phrases: specific strengths in the student's work],
  "improve": [up to 4 short phrases: the top areas to improve, most important first],
  "revised": true if the student revised their work during the session, else false,`,
    summaryGuidance: 'Here "mastery" describes the work against the success criteria, not a grade: "solid" = meets them with minor issues; "developing" = partly; "needs_work" = a fundamental problem. Put the improve items in sticking_points too. Never mention marks.',
    draftGuide: `This is a PRACTICE session on a draft or attempt. learning_goal = what the student should be able to do or produce. opening_question = the invitation to share their draft or attempt, naming what kind of work it is. ta_brief = how to give feedback against the criteria, the common weaknesses to look for, what to push on in revision, and how to introduce a second practice prompt. misconceptions = common errors in attempts at this kind of work. success_criteria = what a strong attempt contains (this is what the feedback is judged against). practice_prompts = three to five practice questions or scenarios the tutor may offer, one per line.`,
    prompts: { label: 'Practice prompts', hint: 'Sample questions or scenarios the tutor may offer when the learner has nothing to share or is ready for one more. One per line.' },
  },

  reflection: {
    kind: 'reflection',
    label: 'Reflection',
    engagement: [7],
    blurb: 'A short metacognitive conversation after a unit: what was hard, what worked, what to change.',
    short: true,
    stages: [
      { name: 'OPEN', until: 0 },
      { name: 'PROBE', until: 0.55 },
      { name: 'PLAN', until: 0.85 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 70,
    purpose: () =>
      "This is a short reflection after a unit. The subject is the student's own learning, not the course content: what was hard, which strategies worked, how they know when they understand something, and what they would change. Four to eight exchanges.",
    rules: () => [
      'Do not teach the content. If they raise a content question, acknowledge it in one sentence and bring them back to how they are learning.',
      'Use their own words for strategies. Do not hand them study-skills lectures; ask what they actually did and what happened.',
    ],
    stageGuide: () => [
      '- OPEN (first reply only): greet the student by first name in one short sentence, say this is a short reflection on how the unit went for them, then ask the opening question. Nothing else.',
      '- PROBE: one question per turn: what strategy they used and whether it worked, how they know when they understand something versus just recognise it, what got in the way.',
      '- PLAN: ask them to name one concrete thing they will do differently in the next unit, and when. Help them make it specific.',
      `- WRAP-UP: in three or four sentences, reflect back in their own words what they said works for them and their plan, and ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "strategy_in_own_words": one or two sentences quoting or closely paraphrasing what the student said about how they learn,
  "suggested_action": the one concrete next action they committed to (or the tutor suggested),`,
    summaryGuidance: 'Here "mastery" means quality of reflection: "solid" = specific, honest, with a concrete plan; "needs_work" = generic or disengaged. understood = what they said they now grasp; sticking_points = what they said remains hard.',
    draftGuide: `This is a REFLECTION run after a unit. learning_goal = what the student should notice about their own learning by the end. opening_question = the first reflective question (e.g. what was hardest in this unit and why). ta_brief = the probes about strategy, self-monitoring and what to change, and what to listen for. misconceptions = unhelpful beliefs about learning to listen for (e.g. that re-reading equals understanding). success_criteria = what a productive, specific reflection sounds like.`,
    prompts: null,
  },

  recall: {
    kind: 'recall',
    label: 'Recall',
    engagement: [8],
    blurb: 'Revisit earlier learning: retrieve it from memory, then connect it to the current unit.',
    short: false,
    stages: [
      { name: 'RETRIEVE', until: 0.45 },
      { name: 'CONNECT', until: 0.85 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 80,
    purpose: () =>
      'This tutorial revisits learning from earlier in the course (a spiral curriculum). The student first retrieves it from memory, unaided, and then connects the old idea to the current unit. The brief lists what is being revisited.',
    rules: () => [
      'Retrieval first: do not re-explain the earlier idea up front. Ask them to recall it. If they draw a blank, give the smallest possible cue and ask again, rather than supplying the answer.',
      'Treat forgetting as normal. Where something has faded, say so plainly and note where it can be found, without making it a failure.',
    ],
    stageGuide: () => [
      '- RETRIEVE (first reply only, then continue): greet the student by first name in one short sentence, say this revisits something from earlier in the course, and ask the opening retrieval prompt — from memory, no notes. On later turns in this stage, probe what they retrieved and cue minimally where it has faded.',
      '- CONNECT: ask how the earlier idea applies to, or changes, something in the current unit or material. Probe the connection.',
      `- WRAP-UP: in three or four sentences, say what came back readily, what had faded and where to find it, and how it links to the current unit, and ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "retained": [up to 6 short phrases: what the student recalled accurately],
  "faded": [up to 6 short phrases: what had faded or was distorted],`,
    summaryGuidance: 'Here "mastery" means retention: "solid" = recalled unaided and connected it; "developing" = recalled with cues; "needs_work" = mostly faded. Put faded items in sticking_points too.',
    draftGuide: `This is a RECALL tutorial revisiting earlier learning. learning_goal = which earlier idea to retrieve and what to connect it to now. opening_question = the retrieval prompt: asks them to recall the earlier idea from memory, no notes. ta_brief = what to cue (smallest hint first) if they draw a blank, the typical distortions, and how to connect it to the current unit. misconceptions = how the idea typically distorts after time. success_criteria = what "retained and connected" sounds like.`,
    prompts: null,
  },

  assignment_start: {
    kind: 'assignment_start',
    label: 'Assignment start',
    engagement: [4, 9],
    blurb: 'Get going on an assignment: unpack what it asks, connect it to the readings and activities, choose an approach, take the first step out loud. Nothing it produces is submittable.',
    short: false,
    stages: [
      { name: 'UNPACK', until: 0.25 },
      { name: 'CONNECT', until: 0.5 },
      { name: 'PLAN', until: 0.7 },
      { name: 'FIRST-STEP', until: 0.9 },
      { name: 'WRAP-UP', until: Infinity },
    ],
    replyWords: 90,
    purpose: () =>
      'This is an assignment start session. The student is about to begin an assignment described in the brief and has written nothing yet, or only notes. Your job is to help them start well: understand what is being asked, see which readings and activities bear on it, choose an approach, and take the first concrete step out loud. You are not helping them write it. Nothing said here is submittable text; the student leaves with their own understanding of the task, their own plan and a first step they made themselves.',
    rules: () => [
      'Never produce text the student could submit: no thesis statements, no paragraphs, no outlines written by you, no worked answers to any part of the assignment. When they ask you to, decline in one sentence and ask the question that lets them do it themselves.',
      "Ground the session in the assignment's own wording and in the course's readings and activities. When an activity or study question from the materials fits, ask it (adapted to the assignment) rather than inventing a new one, and say where it comes from.",
      "Retrieve, don't re-teach: when a reading bears on the task, ask what the student remembers of it and send them to the passage, rather than summarising the reading yourself.",
      'Never assign or estimate a grade, and never say whether the assignment would pass. If asked, say that the instructor assesses.',
    ],
    stageGuide: () => [
      '- UNPACK (first reply only, then continue): greet the student by first name in one short sentence, name the assignment, say this session is for getting started on it rather than writing it, then ask the opening question. On later turns in this stage, ask them to restate what the assignment asks in their own words and probe one thing they have missed or misread: the task itself, the parts it requires, or the criteria.',
      '- CONNECT: ask which reading or which activity from the brief bears on the task, and how. Use the course\'s own activity and study questions where they fit. Send them to the passage; do not summarise it for them.',
      '- PLAN: ask them to choose an approach and name the parts they will need to produce, in order. Help them make it concrete: what first, what second. Their plan, in their words.',
      '- FIRST-STEP: ask them to do the first step now, out loud, using a first-step prompt from the brief where one fits: for example standardise the first argument, state the first claim in one sentence, pick the passage they will analyse and say why. Respond to the attempt with one strength and one question; do not fix it for them.',
      `- WRAP-UP: in four or five sentences, play back their understanding of the task, their plan and the first step they took, name what to do next on their own, remind them that nothing here is submittable text, and ${WRAP_UP_FINISH}`,
    ],
    summaryExtras: `  "task_understanding": "clear" | "partial" | "unclear",
  "plan": one or two sentences: the approach and the parts the student chose, in their words, or "No plan yet",
  "first_step": one sentence: what the student actually decided or produced as a first step, or "No first step taken",
  "sources_used": [up to 6 short phrases: the readings and activities the student connected to the task],`,
    summaryGuidance: 'Here "mastery" means readiness to continue the assignment alone: "solid" = understood the task, has a plan and took a real first step; "developing" = understood the task but the plan or first step is thin; "needs_work" = misread the task or could not start. sticking_points = what they misread or got stuck on. Never mention marks, and never judge the assignment itself.',
    draftGuide: `This is an ASSIGNMENT START session: the student is about to begin an assignment and has not written anything yet. learning_goal = what the student should be able to do unaided when they leave (understand the task, have a plan, have taken the first step). opening_question = names the assignment and asks them to say in their own words what it is asking for. ta_brief = what the assignment requires (the parts and the criteria, from its description), which readings bear on which part and the passages to send them to, which of the course's own activities and study questions to use as probes (quote or closely paraphrase them and say where they come from), how to run the plan and first-step stages, and how to decline requests to write any of it. misconceptions = common misreadings of this assignment, each with the question that exposes it. success_criteria = what "ready to continue alone" sounds like. practice_prompts = three to five first-step prompts the tutor may offer, drawn from the course's activities where possible, one per line.`,
    prompts: { label: 'First-step prompts', hint: 'Prompts the tutor may offer for the first step, one per line: the course\'s own activities adapted to the assignment where possible.' },
  },
};

export function kindSpec(kind: TutorialKind): KindSpec {
  return KINDS[kind];
}

/** How many student exchanges to aim for: ~1.5 minutes per exchange by voice, clamped per kind. */
export function targetExchanges(kind: TutorialKind, targetMinutes: number): number {
  const raw = Math.round(targetMinutes / 1.5);
  return KINDS[kind].short ? Math.min(8, Math.max(4, raw)) : Math.min(24, Math.max(6, raw));
}

/** Which stage a tutorial is in after `studentTurns` student messages. */
export function stageFor(kind: TutorialKind, studentTurns: number, targetMinutes: number): { stage: string; target: number } {
  const target = targetExchanges(kind, targetMinutes);
  const stages = KINDS[kind].stages;
  if (studentTurns === 0) return { stage: stages[0]!.name, target };
  for (const s of stages) {
    if (s.until === 0) continue;
    if (studentTurns < Math.round(target * s.until)) return { stage: s.name, target };
  }
  return { stage: stages[stages.length - 1]!.name, target };
}

// ─── Teach-back: a real explanation, not a "yes" ───────────────────────────
//
// Usability report, Finding 4: a one-word "yes" to the tutor's own recap
// completed the teach-back. The stage now holds until a student turn after
// the teach-back prompt is an explanation, for at most TEACH_BACK_MAX_HOLD
// extra turns, so a learner who cannot is never stuck there.

/** Words in a reply before it can count as an explanation. */
export const TEACH_BACK_MIN_WORDS = 15;
/** Extra student turns the stage holds before wrap-up anyway. */
export const TEACH_BACK_MAX_HOLD = 2;

const STOPWORDS = new Set(('about above after again against along among another around because before being below between both could course does doing during each either every first former further given going having itself might most often other others ought perhaps quite rather really should since something still student students such their theirs them then there these they thing things those though three through under until using various what when where whether which while whole whose would years your yours able clearly explain explains explained example examples understand understands understanding words without within').split(' '));

/** Five-letter stems of the content words in a text: "linker", "linking" → "linki"/"linke"; good enough to spot shared vocabulary. */
function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9_]*/g) ?? []) {
    if (w.length < 5 || STOPWORDS.has(w)) continue;
    out.add(w.slice(0, 5));
  }
  return out;
}

/** The session's key terms: content-word stems of its learning goal and success criteria. */
export function keyTermsFor(t: { learning_goal: string; success_criteria?: string }): string[] {
  return [...stems(`${t.learning_goal}\n${t.success_criteria ?? ''}`)];
}

/**
 * Whether a student turn explains rather than acknowledges: long enough,
 * and (when the session has key terms) using at least two of them.
 */
export function isExplanation(text: string, keyTerms: string[]): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < TEACH_BACK_MIN_WORDS) return false;
  if (keyTerms.length < 2) return true;
  const have = stems(text);
  return keyTerms.filter((k) => have.has(k)).length >= 2;
}

/**
 * How a tutor asks for the teach-back: the stage guide's audiences and the
 * phrasing briefs use. The tutor may ask earlier than the schedule (it moves
 * on when the student clearly has the idea), so the ask itself counts.
 */
export const TEACH_BACK_ASK = /in your own words|someone who (has never|hasn't|never) (studied|seen)|as if (to|teaching|you were teaching) (a |someone)|explain (it |this |that )?(back )?to (a classmate|a friend|someone)|teach (it|this) (back )?to/i;

/** Student turn index (0-based) of the first reply to a teach-back ask, or null. */
export function teachBackAskedAt(turns: Array<{ role: 'user' | 'assistant'; content: string }>, isOpening: (content: string) => boolean = () => false): number | null {
  let studentIdx = 0;
  for (const t of turns) {
    if (t.role === 'user') { if (!isOpening(t.content)) studentIdx++; continue; }
    if (studentIdx > 0 && TEACH_BACK_ASK.test(t.content)) return studentIdx;
  }
  return null;
}

export type TeachBackState = 'none' | 'not_reached' | 'waiting' | 'explained' | 'skipped';

/**
 * The stage after these student turns, holding TEACH-BACK until an
 * explanation arrives. teachBack: 'none' for kinds without a teach-back;
 * 'not_reached' before it starts; 'waiting' while it holds; 'explained' once
 * a student turn after the prompt is an explanation; 'skipped' when the
 * hold ran out without one.
 */
export function stageForRun(
  kind: TutorialKind,
  studentTexts: string[],
  targetMinutes: number,
  keyTerms: string[],
  /** teachBackAskedAt(): where the tutor actually asked, if earlier than the schedule. */
  askedAt: number | null = null
): { stage: string; target: number; teachBack: TeachBackState } {
  const n = studentTexts.length;
  const base = stageFor(kind, n, targetMinutes);
  if (!KINDS[kind].stages.some((s) => s.name === 'TEACH-BACK')) return { ...base, teachBack: 'none' };
  let start = 1;
  while (start < 200 && stageFor(kind, start, targetMinutes).stage !== 'TEACH-BACK') start++;
  let end = start;
  while (end < 200 && stageFor(kind, end, targetMinutes).stage === 'TEACH-BACK') end++;
  if (askedAt !== null && askedAt < start) start = askedAt;
  if (n <= start) return { ...base, teachBack: 'not_reached' };
  // Student turn index `start` (0-based) is the first reply to the teach-back prompt.
  if (studentTexts.slice(start).some((t) => isExplanation(t, keyTerms))) return { ...base, teachBack: 'explained' };
  if (n < end + TEACH_BACK_MAX_HOLD) return { stage: 'TEACH-BACK', target: base.target, teachBack: 'waiting' };
  return { ...base, teachBack: 'skipped' };
}

/** Stage names for every kind, for the client's status chip. */
export function stageNames(): Record<TutorialKind, string[]> {
  return Object.fromEntries(TUTORIAL_KINDS.map((k) => [k, KINDS[k].stages.map((s) => s.name)])) as Record<TutorialKind, string[]>;
}

/** Deep-link and gradebook title, e.g. "Readiness check: Osmosis" / "Tutorial: Osmosis". */
export function titledForKind(kind: TutorialKind, title: string): string {
  return `${KINDS[kind].label}: ${title}`;
}

/** What the client needs to render editors and lists without duplicating this file. */
export function kindCatalog(): Array<{ kind: TutorialKind; label: string; blurb: string; engagement: number[]; short: boolean; stages: string[] }> {
  return TUTORIAL_KINDS.map((k) => ({
    kind: k, label: KINDS[k].label, blurb: KINDS[k].blurb, engagement: KINDS[k].engagement,
    short: KINDS[k].short, stages: KINDS[k].stages.map((s) => s.name),
  }));
}
