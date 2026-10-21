/**
 * The fact sheet: a general model of a persona's fixed facts, for any
 * template, built beside the case file (casefile.ts) so the two can be
 * compared. The case file is shaped like a patient chart (medications with
 * an OTC flag, allergies, referral source); the fact sheet keeps only what
 * every persona has and lets the designer add the rest as named sections:
 * "Medications" for a patient, "The matter" for a legal client, "Walk-away
 * point" for a negotiation counterpart.
 *
 *   identity        name, preferred name, date of birth (age computed at
 *                   request time), pronouns, background
 *   why_here        why they are in this conversation today
 *   history         what came before
 *   circumstances   home, work, relationships, money: their situation now
 *   sections        designer-defined: a title and its facts, one per line
 *   cues            what they let slip, what lies behind it, when to disclose
 *   disclosure_rules
 *
 * Presets only seed section titles and hints in the designer; nothing on the
 * server depends on a preset, so any field of practice fits.
 */

import { z } from 'zod';
import { ageOn } from './casefile.js';

const str = (max: number) => z.string().trim().max(max).default('');

export const FactSection = z.object({ title: str(120), facts: z.array(z.string().trim().max(800)).max(40).default([]) });
export type FactSection = z.infer<typeof FactSection>;

export const FactSheet = z.object({
  preset: str(40),
  name: str(120),
  preferred_name: str(60),
  date_of_birth: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'date of birth must be YYYY-MM-DD').default(''),
  pronouns: str(40),
  background: str(1500),
  why_here: str(2000),
  history: str(4000),
  circumstances: str(4000),
  sections: z.array(FactSection).max(20).default([]),
  cues: z.array(z.object({ cue: str(600), follow_up: str(1200), condition: str(600) })).max(20).default([]),
  disclosure_rules: z.array(z.string().trim().max(600)).max(20).default([]),
});
export type FactSheet = z.infer<typeof FactSheet>;

export const EMPTY_FACT_SHEET: FactSheet = FactSheet.parse({});

export function factSheetOf(raw: unknown): FactSheet {
  const r = FactSheet.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_FACT_SHEET;
}

export function isEmptyFactSheet(f: FactSheet): boolean {
  const { preset: _p, sections, cues, disclosure_rules, ...text } = f;
  return Object.values(text).every((v) => !v) && sections.every((s) => !s.facts.length) && !cues.length && !disclosure_rules.length;
}

/** Section titles and hints the designer can start from. Advisory only. */
export const FACT_SHEET_PRESETS: { id: string; label: string; sections: { title: string; hint: string }[] }[] = [
  { id: 'general', label: 'General', sections: [] },
  { id: 'health', label: 'Health care', sections: [
    { title: 'Medications', hint: 'One per line, with dose, how taken and the words the person uses. Say "bought over the counter" where it applies.' },
    { title: 'Allergies', hint: '' },
    { title: 'Who sent them', hint: 'The referral, in the person\'s own terms.' },
  ] },
  { id: 'social', label: 'Social work or counselling', sections: [
    { title: 'Supports', hint: 'Family, friends, services; who helps and who does not.' },
    { title: 'Risks and safety', hint: 'What the student should screen for, and what the person will say if asked well.' },
    { title: 'What they want from this', hint: '' },
  ] },
  { id: 'legal', label: 'Legal or advisory client', sections: [
    { title: 'The matter', hint: 'What happened, with dates, as the client understands it.' },
    { title: 'Documents they have', hint: '' },
    { title: 'What they want', hint: 'The outcome they hope for, and what they would accept.' },
  ] },
  { id: 'negotiation', label: 'Negotiation or business counterpart', sections: [
    { title: 'Their interests', hint: 'What they need, in order of priority.' },
    { title: 'Constraints', hint: 'Budget, deadlines, who signs off.' },
    { title: 'Walk-away point', hint: 'The line they will not cross, and what they do then.' },
  ] },
  { id: 'thinker', label: 'Historical figure', sections: [
    { title: 'Life events', hint: 'Dates and places they can speak to.' },
    { title: 'Positions held', hint: 'Views they defended, with when they held them.' },
  ] },
];

function longDate(dob: string): string {
  const [y, m, d] = dob.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The fact sheet as prompt text, or '' when it is empty. */
export function factSheetBlock(f: FactSheet, now: Date = new Date()): string {
  if (isEmptyFactSheet(f)) return '';
  const age = ageOn(f.date_of_birth, now);
  const who = [
    f.name ? `- Name: ${f.name}${f.preferred_name ? ` (goes by ${f.preferred_name})` : ''}` : '',
    f.date_of_birth ? `- Date of birth: ${longDate(f.date_of_birth)}${age !== null ? `. Today you are ${age} years old; give this age if asked, never another.` : ''}` : '',
    f.pronouns ? `- Pronouns: ${f.pronouns}` : '',
    f.background ? `- Background: ${f.background}` : '',
  ].filter(Boolean).join('\n');
  const parts = [
    '\n## Fact sheet (canonical facts)',
    'These facts are fixed: every student in every session meets the same person in the same situation. Never contradict them, change them or offer alternatives. When a question reaches something the fact sheet covers, answer from it, in your own words and only to the depth the question earns (the disclosure rules below and your engagement rules still decide how much you say). Where it is silent, keep any improvisation small, ordinary and consistent with it; never add new people, events, numbers or conditions.',
    who ? `\n### Who you are\n${who}` : '',
    f.why_here ? `\n### Why you are here\n${f.why_here}` : '',
    f.history ? `\n### History\n${f.history}` : '',
    f.circumstances ? `\n### Your circumstances\n${f.circumstances}` : '',
    ...f.sections.filter((s) => s.title && s.facts.length).map((s) => `\n### ${s.title}\n${s.facts.map((x) => `- ${x}`).join('\n')}`),
    f.cues.length ? `\n### Cues\nDrop each cue naturally when the conversation comes near it; disclose what lies behind it only when its condition is met.\n${f.cues.map((c) => `- Cue: ${c.cue}${c.follow_up ? `\n  Behind it: ${c.follow_up}` : ''}${c.condition ? `\n  Disclose when: ${c.condition}` : ''}`).join('\n')}` : '',
    f.disclosure_rules.length ? `\n### Disclosure rules\n${f.disclosure_rules.map((r) => `- ${r}`).join('\n')}` : '',
  ];
  return parts.filter(Boolean).join('\n') + '\n';
}
