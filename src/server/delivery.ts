/**
 * TRUFlex delivery modes → the behaviours this tool actually varies.
 *
 * TRU describes ten delivery modes (https://www.tru.ca/current/enrolment-services/course-registration/flex.html).
 * The tool does not implement ten behaviours. It collapses them into three
 * `pacing` categories and four booleans, and every mode-dependent switch in
 * the codebase keys on those booleans — never on the raw number — so a future
 * TRUFlex revision is a change to `deliveryOf()` alone.
 *
 *   pacing       TRUFlex   cohort  fixed dates  live sessions
 *   scheduled    1–8       yes     yes          yes
 *   paced        10        yes     yes          no
 *   self_paced   9         no      no           no
 *
 * `inPerson` (1–7) is the one extra distinction inside `scheduled`: a learner
 * may open a tutorial in a room full of people, so typing is the default and
 * voice is opt-in.
 */

export type Pacing = 'scheduled' | 'paced' | 'self_paced';

export interface Delivery {
  truflex: number;
  pacing: Pacing;
  /** Other learners move through the course at the same time. */
  hasCohort: boolean;
  /** The course has a start, an end and weeks in between. */
  hasFixedDates: boolean;
  /** Instructor and learners meet at scheduled times (in person or online). */
  hasLiveSessions: boolean;
  /** Learners may be physically together in a classroom when they launch. */
  inPerson: boolean;
}

export interface TruFlexMode {
  truflex: number;
  name: string;
  /** One line, close to TRU's own wording, so instructors recognise their course. */
  description: string;
}

/** TRU's ten modes, one line each, paraphrased from the TRU Flex page. */
export const TRUFLEX_MODES: readonly TruFlexMode[] = [
  { truflex: 1, name: 'In person, off campus', description: 'In person, exclusively off campus (including offshore), at regularly scheduled times. Instructor-led.' },
  { truflex: 2, name: 'In person, off and on campus', description: 'In person, both off campus and on campus, at regularly scheduled times. Instructor-led.' },
  { truflex: 3, name: 'In person, on campus', description: 'In person, exclusively on campus in a classroom, at regularly scheduled times. Instructor-led.' },
  { truflex: 4, name: 'Blended, mostly in person', description: 'Blended: most classes (about 70% or more) in person on campus, the rest online at the same scheduled times. Instructor-led.' },
  { truflex: 5, name: 'Blended, half and half', description: 'Blended: about half the classes in person on campus and half online, all at scheduled times. Instructor-led.' },
  { truflex: 6, name: 'Blended, mostly online', description: 'Blended: most classes (about 70% or more) online, the rest in person on campus, all at scheduled times. Instructor-led.' },
  { truflex: 7, name: 'Multi-access', description: 'The same scheduled class offered in person and online at the same time; students register for one section and cannot move between them. Instructor-led.' },
  { truflex: 8, name: 'Online, scheduled', description: 'Fully online at scheduled times by web conferencing, with the same academic schedule and contact hours as an in-person course. Instructor-led.' },
  { truflex: 9, name: 'Online, self-paced', description: 'Self-paced online: flexible start date, up to 30 weeks to complete, no scheduled classes, no cohort. Independent learning.' },
  { truflex: 10, name: 'Online, paced', description: 'Paced online: a regular semester with set start and end dates, no scheduled classes, learning independently as part of a cohort of online students.' },
];

/** On campus, scheduled: the mode the tool was built for, so existing courses behave as before. */
export const DEFAULT_TRUFLEX = 3;

export function isTruFlex(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10;
}

/** Parse a TRUFlex number from a string (e.g. an LTI custom parameter); null if not 1–10. */
export function parseTruFlex(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  return isTruFlex(n) ? n : null;
}

/**
 * The single place the raw TRUFlex number is interpreted. Pure.
 * Throws on anything outside 1–10 so a bad value never silently becomes a mode.
 */
export function deliveryOf(truflex: number): Delivery {
  if (!isTruFlex(truflex)) throw new RangeError(`TRUFlex must be an integer from 1 to 10, got ${String(truflex)}`);
  const pacing: Pacing = truflex === 9 ? 'self_paced' : truflex === 10 ? 'paced' : 'scheduled';
  const hasLiveSessions = pacing === 'scheduled';
  return {
    truflex,
    pacing,
    hasCohort: pacing !== 'self_paced',
    hasFixedDates: pacing !== 'self_paced',
    hasLiveSessions,
    inPerson: hasLiveSessions && truflex <= 7,
  };
}

export function truflexMode(truflex: number): TruFlexMode {
  return TRUFLEX_MODES.find((m) => m.truflex === truflex) ?? TRUFLEX_MODES[DEFAULT_TRUFLEX - 1]!;
}

/** Human labels that differ by mode, shared by server-rendered pages and prompts. */
export function deliveryLabels(d: Delivery): { debrief: string; debriefPlural: string; pacingName: string } {
  return {
    debrief: d.hasLiveSessions ? 'lecture debrief' : 'study debrief',
    debriefPlural: d.hasLiveSessions ? 'lecture debriefs' : 'study debriefs',
    pacingName: d.pacing === 'scheduled' ? 'scheduled' : d.pacing === 'paced' ? 'paced' : 'self-paced',
  };
}
