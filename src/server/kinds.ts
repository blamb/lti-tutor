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
 *
 * Every kind is available in every delivery mode; only wording changes, and
 * that wording keys on the delivery booleans (never on the TRUFlex number).
 * Each kind owns its stage template, the kind-specific lines of the tutor
 * rules, its summary schema and the guidance the AI draft follows.
 */

import type { Delivery } from './delivery.js';

export const TUTORIAL_KINDS = ['readiness', 'preparation_check', 'concept', 'practice', 'reflection', 'recall'] as const;
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
        `- TEACH-BACK: ask the student to explain the core idea back ${audience}. Then play back your understanding of what they said in two or three sentences and ask whether you've got it right (Pask's conversation theory: understanding is confirmed when it survives being re-explained). Probe one gap if there is one.`,
        `- WRAP-UP: in four or five sentences, summarise the path they walked and what they figured out, name the one thing to review, and ${WRAP_UP_FINISH}`,
      ];
    },
    summaryExtras: `  "teachback": one sentence on how well they explained the core idea back in their own words, or "Teach-back not reached" if the tutorial ended before that stage,`,
    summaryGuidance: '"solid" means they could explain the idea unprompted and survived a counter-example. A short transcript with little from the student is "needs_work", not "developing".',
    draftGuide: `This is a CONCEPT TUTORIAL. learning_goal = what the student should be able to explain by the end. opening_question = open, concrete, answerable from the materials, not yes/no. ta_brief = how to open, the 3–5 probes to work through in order (each with what a good answer contains), what to do when the student is stuck, and when to move to the teach-back. misconceptions = 3–5 lines, each a misconception and the question that exposes it. success_criteria = what a student who "got it" can say or do.`,
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
