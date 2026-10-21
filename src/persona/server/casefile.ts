/**
 * The case file: a simulated patient's or client's fixed facts, kept as a
 * structured record on the persona so every student meets the same person.
 * Without it the model improvises demographics, medications and who referred
 * them, and five sessions give five different answers.
 *
 * The record goes into the persona prompt as canonical facts (hidden from the
 * student, like the rest of the prompt). Age is never stored: it is computed
 * from the date of birth when the prompt is built.
 */

import { z } from 'zod';

const str = (max: number) => z.string().trim().max(max).default('');

export const Medication = z.object({
  /** Drug and strength, e.g. "furosemide 40 mg". */
  name: str(200),
  /** When and how much, e.g. "one each morning". */
  how_taken: str(300),
  purpose: str(300),
  /** How the persona refers to it, e.g. "the water tablet". */
  patient_words: str(300),
  /** Over the counter, bought without a prescription. */
  otc: z.boolean().default(false),
});
export type Medication = z.infer<typeof Medication>;

export const PlantedCue = z.object({
  /** What the persona says or does that a good listener notices. */
  cue: str(600),
  /** What lies behind it, disclosed only when the condition is met. */
  follow_up: str(1200),
  condition: str(600),
});

export const CaseRecord = z.object({
  name: str(120),
  preferred_name: str(60),
  /** ISO date, YYYY-MM-DD; '' when not set. */
  date_of_birth: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'date of birth must be YYYY-MM-DD').default(''),
  sex: str(60),
  pronouns: str(40),
  background: str(1000),
  presenting_complaint: str(2000),
  history: str(4000),
  medications: z.array(Medication).max(30).default([]),
  allergies: str(500),
  social_history: str(4000),
  referral_source: str(1000),
  planted_cues: z.array(PlantedCue).max(20).default([]),
  disclosure_rules: z.array(z.string().trim().max(600)).max(20).default([]),
});
export type CaseRecord = z.infer<typeof CaseRecord>;

export const EMPTY_CASE: CaseRecord = CaseRecord.parse({});

/** Tolerant read of a stored record: anything malformed becomes the empty record rather than breaking the prompt. */
export function caseRecordOf(raw: unknown): CaseRecord {
  const r = CaseRecord.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_CASE;
}

export function isEmptyCase(c: CaseRecord): boolean {
  return Object.entries(c).every(([, v]) => (Array.isArray(v) ? v.length === 0 : typeof v === 'boolean' ? true : !v));
}

/** Whole years from an ISO date of birth to `now`, or null for a missing or impossible date. */
export function ageOn(dob: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

function longDate(dob: string): string {
  const [y, m, d] = dob.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function medLine(m: Medication): string {
  const parts = [m.name, m.how_taken, m.purpose ? `for ${m.purpose}` : ''].filter(Boolean).join(', ');
  return `- ${parts}${m.patient_words ? `. In your words: "${m.patient_words}"` : ''}`;
}

/** The case file as prompt text, or '' when the record is empty. */
export function caseFileBlock(c: CaseRecord, now: Date = new Date()): string {
  if (isEmptyCase(c)) return '';
  const age = ageOn(c.date_of_birth, now);
  const who = [
    c.name ? `- Name: ${c.name}${c.preferred_name ? ` (goes by ${c.preferred_name})` : ''}` : '',
    c.date_of_birth ? `- Date of birth: ${longDate(c.date_of_birth)}${age !== null ? `. Today you are ${age} years old; give this age if asked, never another.` : ''}` : '',
    c.sex ? `- Sex: ${c.sex}` : '',
    c.pronouns ? `- Pronouns: ${c.pronouns}` : '',
    c.background ? `- Background: ${c.background}` : '',
  ].filter(Boolean).join('\n');
  const rx = c.medications.filter((m) => !m.otc);
  const otc = c.medications.filter((m) => m.otc);
  const parts = [
    '\n## Case file (canonical facts)',
    'These facts are fixed: every student in every session meets the same person. Never contradict them, change them or offer alternatives. When a question reaches something the case file covers, answer from it, in your own words and only to the depth the question earns (the disclosure rules below and your engagement rules still decide how much you say). Where the case file is silent, keep any improvisation small, ordinary and consistent with it; never add conditions, diagnoses, medications, people or events.',
    who ? `\n### Who you are\n${who}` : '',
    c.presenting_complaint ? `\n### Why you are here\n${c.presenting_complaint}` : '',
    c.referral_source ? `\n### Who sent you\n${c.referral_source}` : '',
    c.history ? `\n### Health history\n${c.history}` : '',
    rx.length ? `\n### Prescribed medications\n${rx.map(medLine).join('\n')}` : '',
    otc.length ? `\n### Over the counter (bought yourself, without a prescription)\n${otc.map(medLine).join('\n')}` : '',
    c.allergies ? `\n### Allergies\n${c.allergies}` : '',
    c.social_history ? `\n### Home and social life\n${c.social_history}` : '',
    c.planted_cues.length ? `\n### Planted cues\nDrop each cue naturally when the conversation comes near it; disclose what lies behind it only when its condition is met.\n${c.planted_cues.map((p) => `- Cue: ${p.cue}${p.follow_up ? `\n  Behind it: ${p.follow_up}` : ''}${p.condition ? `\n  Disclose when: ${p.condition}` : ''}`).join('\n')}` : '',
    c.disclosure_rules.length ? `\n### Disclosure rules\n${c.disclosure_rules.map((r) => `- ${r}`).join('\n')}` : '',
  ];
  return parts.filter(Boolean).join('\n') + '\n';
}
