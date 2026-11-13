/**
 * RhizMode: open-ended activities for a module built from readings.
 *
 * Where the practice route drafts questions with an answer key, this mode
 * drafts invitations to notice how a reading knows what it says. Nothing
 * here has a right answer and nothing is graded. Each activity is a section
 * of the reading's Book page and, when the designer wants the class to
 * answer together, a discussion forum whose first post is the prompt.
 *
 * Four kinds are drafted from one reading and share one shape: a few
 * passages of the reading, each with a line on what can be seen on the page
 * and some questions, then a "Your turn" prompt. A fifth, the Community
 * Contract, belongs to the module as a whole and has its own page at the
 * front of the Book.
 *
 * The quotation check of the practice route becomes an anchor check: every
 * prompt points at a passage copied from the reading, and code confirms the
 * passage is there (reading.ts, checkQuotes), so a reviewer can see what
 * each prompt is responding to.
 *
 * Method and ethos are drawn from the writings of Dave Cormier (rhizomatic
 * learning, "the community is the curriculum", Learning in a Time of
 * Abundance). The wording here is ours; his is never generated or
 * paraphrased as his on a student page. Where each kind comes from in the
 * book, and where we have extended him, is set out in docs/MODULE-BUILDER.md:
 * the contract as a device, and "who is missing from a text", are ours.
 * Nothing in this file calls a model.
 */

import type { Activity } from './index.js';

export interface RhizoKind {
  title: string;
  /** One line for the designer: what this kind asks of students. */
  asks: string;
  /** Fixed wording on the page, above the passages (or above the four questions of a contract). */
  how: string;
  /** Fixed wording in the discussion, under the prompt. */
  forum_how: string;
}

export const RHIZO_KINDS: Record<string, RhizoKind> = {
  breadcrumb: {
    title: 'Breadcrumb Trail',
    asks: 'Where do the reading’s claims come from? Then each student posts a claim of their own with its trail.',
    how: 'A reading rarely shows how it came to know what it says. Below are a few sentences from this one. '
      + 'For each, ask where the claim comes from and what trail the reading leaves for you to follow. '
      + 'None of these questions has a right answer, and “I don’t know” is a fair one.',
    forum_how: 'Say what you think, then show where you got it. “Here is the article that says so” tells the rest of us more than “I did my research”. '
      + 'A job, a relative, a video, something you have always assumed: all of these count if you name them. Nobody is checking your references. If you do not know, say that. '
      + 'Then read a few other posts, follow one person’s trail, and reply with what you found.',
  },
  trust: {
    title: 'Trust Audit',
    asks: 'Who or what does the reading ask you to trust, and do you know enough to weigh in?',
    how: 'Nobody can check everything, so every reading asks you to take some things on trust: a name, an institution, a method, the writer’s own experience. '
      + 'Below are a few sentences from this one. For each, ask who or what you are being asked to trust, and whether you know enough to weigh in. '
      + '“I don’t know enough to say” is a real answer, and often the honest one.',
    forum_how: 'Say whom or what you decided to trust here and how you decided: because you checked, because of who they are, because someone you trust relies on them. '
      + 'Say too where you chose not to have an opinion; “I don’t know enough, but here is how it affects me” is a full answer. Then read a few other posts and reply to someone who decided differently. '
      + 'You are comparing how each of you decides, not settling who is right.',
  },
  unsettled: {
    title: 'What’s Unsettled',
    asks: 'What does the reading present as finished, and which of its questions would more information not settle?',
    how: 'A reading is a finished product. The arguments, false starts and loose ends behind it have been tidied away. '
      + 'Below are a few sentences from this one. For each, ask how settled the matter is, and whether more information would settle it or whether it comes down to what people value. '
      + 'You are not asked to resolve anything. Open does not mean anything goes: some answers are better than others, and it is fine to say which you think they are for now.',
    forum_how: 'Name one question from this reading that you think is still open, and say what kind of open it is: something that could be found out, '
      + 'or something people will go on disagreeing about because they want different things. Say where you lean and what you cannot rule out. '
      + 'Then reply to someone who leans another way, with a question you would like to ask them.',
  },
  missing: {
    title: 'Who’s Missing',
    asks: 'Whose experience is not on the page, and what do students and the people they know have to add?',
    how: 'No reading can hold everyone. Below are a few sentences from this one. For each, ask whose experience it speaks from, who is not in the picture, '
      + 'and what you or people you know could add. This is not a hunt for blame: every page leaves people out, and the work is learning to see who.',
    forum_how: 'Tell us about someone this reading does not see: who they are, what you know about them, and how you know it. '
      + 'Speak from what you have lived or heard first-hand where you can, and say so when you are guessing about people you do not know. You do not have to speak for any group you belong to. '
      + 'Then read a few other posts and reply to one that showed you someone you had not thought of.',
  },
  contract: {
    title: 'Community Contract',
    asks: 'Before the readings, each student tells the group what they bring, what they need, what they will have challenged and where they draw a line.',
    how: 'What you learn in this module depends partly on who you learn it with. Before the readings, tell the group what you are bringing and what you need from them. '
      + 'There is no right way to answer. Be specific: one real example is worth more than a general statement.',
    forum_how: 'Answer each of the four questions in a few sentences. Then read what others wrote and reply to one person: '
      + 'something they bring that you could use, or something they need that you can offer. Share only what you are comfortable sharing, and be fair to people you disagree with. Come back to your post at the end of the module and see what has changed.',
  },
};
export const RHIZO_TYPES: string[] = Object.keys(RHIZO_KINDS);
/** The kinds drafted from one reading. The contract belongs to the whole module. */
export const TRAIL_TYPES: string[] = RHIZO_TYPES.filter((t) => t !== 'contract');
export const isRhizo = (act: { type?: unknown }): boolean => typeof act.type === 'string' && Object.prototype.hasOwnProperty.call(RHIZO_KINDS, act.type);
export const isContract = (act: { type?: unknown }): boolean => act.type === 'contract';

/** The four parts of a Community Contract, in order. The labels are fixed; the question under each is drafted. */
export const CONTRACT_PARTS: string[] = ['What I bring', 'What I need from this group', 'What I am willing to have challenged', 'Where I draw a line'];

/** A passage is a short quotation, also on pages that only link to a copyrighted reading. */
export const PASSAGE_MAX_CHARS = 420;

export const CREDIT_TEXT = 'Method and ethos drawn with admiration from the writings of Dave Cormier.';
const CREDIT_HTML = 'Method and ethos drawn with admiration from the writings of <a href="https://davecormier.com/edblog/" target="_blank" rel="noopener">Dave Cormier</a>.';

/** The line every RhizMode page and discussion carries. It names the model, and is only true of approved activities, which is all this mode builds. */
export function rhizoDisclosure(model?: string, wholeModule = false): string {
  return `These prompts were drafted with AI${model ? ` (${model})` : ''} from the text of ${wholeModule ? 'this module’s readings' : 'this reading'} and reviewed by the course team. `
    + 'They are invitations, not assessments: there is no answer key and nothing is graded.';
}

export interface Trail { passage: string; notice: string; questions: string[] }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export const trailsOf = (act: Activity): Trail[] =>
  (Array.isArray(act.trails) ? act.trails : []).map((t) => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    return { passage: str(o.passage), notice: str(o.notice), questions: (Array.isArray(o.questions) ? o.questions : []).map(str).filter(Boolean) };
  });
/** A contract's four questions, in the fixed order, whatever labels the spec carries. */
export const partsOf = (act: Activity): { label: string; prompt: string }[] =>
  CONTRACT_PARTS.map((label, i) => ({ label, prompt: str(((Array.isArray(act.parts) ? act.parts : [])[i] as Record<string, unknown> | undefined)?.prompt) }));
/** Where students answer: together in a discussion, or on their own from the page. */
export const placeOf = (act: Activity): 'discussion' | 'page' => (act.place === 'page' ? 'page' : 'discussion');

/** Problems that keep a RhizMode activity out of the file, apart from the anchor check. Empty = fine. */
export function checkRhizo(act: Activity): string[] {
  const problems: string[] = [];
  if (!isRhizo(act)) return [`Unknown activity type "${String(act.type)}".`];
  if (!str(act.title)) problems.push('The activity has no title.');
  if (act.place !== undefined && act.place !== 'page' && act.place !== 'discussion') problems.push('"place" must be "discussion" or "page".');
  if (isContract(act)) {
    if (!str(act.topic)) problems.push('The contract does not say what the module is about.');
    partsOf(act).forEach((p) => { if (!p.prompt) problems.push(`“${p.label}” has no question.`); });
    return problems;
  }
  const trails = trailsOf(act);
  if (!trails.length) problems.push('The activity has no passages.');
  if (trails.length > 6) problems.push('The activity has more than six passages; keep the few that matter most.');
  trails.forEach((t, i) => {
    if (t.passage.length > PASSAGE_MAX_CHARS) problems.push(`Passage ${i + 1}: too long for a short quotation (${t.passage.length} characters; the limit is ${PASSAGE_MAX_CHARS}).`);
    if (!t.notice) problems.push(`Passage ${i + 1}: nothing is said about it.`);
    if (!t.questions.length) problems.push(`Passage ${i + 1}: it has no question.`);
  });
  if (!str(act.your_turn)) problems.push('The “Your turn” prompt is empty.');
  return problems;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SMALL = 'font-size:.85rem;color:#495057';
const QUOTE = 'border-left:4px solid #6c757d;margin:1.25rem 0 .5rem;padding:.25rem 0 .25rem 1rem;font-style:italic';
const INFO = '<i class="fa fa-circle-info" aria-hidden="true"></i> ';

function ending(forumHref: string | undefined, alone: string): string {
  return (forumHref
    ? `\n<p><a href="${forumHref}"><strong>Post yours in the discussion</strong></a>, and read what others have left there.</p>`
    : `\n<p>${alone}</p>`) + `\n<p style="${SMALL}">${CREDIT_HTML}</p>`;
}

/** A reading's activity as a section of its page. `forumHref` is set when the answers go to a discussion. */
export function rhizoPageHtml(act: Activity, disclosure: string, forumHref?: string): string {
  const kind = RHIZO_KINDS[act.type]!;
  let html = `\n<h4>${esc(kind.title)}</h4>\n<p style="${SMALL}">${INFO}${esc(disclosure)}</p>\n<p>${esc(kind.how)}</p>`;
  for (const t of trailsOf(act)) {
    html += `\n<blockquote style="${QUOTE}">“${esc(t.passage)}”</blockquote>\n<p>${esc(t.notice)}</p>\n<ul>\n`
      + t.questions.map((q) => `<li>${esc(q)}</li>`).join('\n') + '\n</ul>';
  }
  html += `\n<h5>Your turn</h5>\n<p>${esc(str(act.your_turn))}</p>`;
  return html + ending(forumHref, 'Write your answer somewhere you will find it again. It is yours; it is not handed in.');
}

/** The first post of a reading activity's discussion. `pageHref` leads back to the passages. */
export function rhizoForumHtml(act: Activity, readingTitle: string, disclosure: string, pageHref: string): string {
  const kind = RHIZO_KINDS[act.type]!;
  return `<p>${esc(str(act.your_turn))}</p>\n<p>${esc(kind.forum_how)}</p>\n`
    + `<p>The passages this grew from are on the page <a href="${pageHref}">${esc(readingTitle)}</a>.</p>\n`
    + `<p style="${SMALL}">${esc(disclosure)} ${CREDIT_HTML}</p>`;
}

const partsHtml = (act: Activity): string =>
  '<ol>\n' + partsOf(act).map((p) => `<li><strong>${esc(p.label)}.</strong> ${esc(p.prompt)}</li>`).join('\n') + '\n</ol>';

/** The Community Contract's own page, the first in the Book. */
export function contractPageHtml(act: Activity, disclosure: string, forumHref?: string): string {
  const kind = RHIZO_KINDS.contract!;
  return `<p style="${SMALL}">${INFO}${esc(disclosure)}</p>\n<p>${esc(str(act.topic))}</p>\n<p>${esc(kind.how)}</p>\n${partsHtml(act)}`
    + ending(forumHref, 'Write your answers somewhere you will find them again, and come back to them at the end of the module. They are yours; they are not handed in.');
}

/** The first post of the Community Contract's discussion. */
export function contractForumHtml(act: Activity, disclosure: string): string {
  const kind = RHIZO_KINDS.contract!;
  return `<p>${esc(str(act.topic))}</p>\n${partsHtml(act)}\n<p>${esc(kind.forum_how)}</p>\n<p style="${SMALL}">${esc(disclosure)} ${CREDIT_HTML}</p>`;
}
