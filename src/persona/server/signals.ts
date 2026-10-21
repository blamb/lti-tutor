/**
 * Two signals in the text of a conversation that the app acts on itself
 * rather than leaving to the model.
 *
 * End intent: a student who types "end simulation" or "I'm finished" wants
 * the conversation over. The page catches it before the message is sent and
 * offers the same dialog as the End conversation button; the turn route
 * checks again so no client can slip one past to the persona. The page keeps
 * its own copy of the pattern (launch.html, END_INTENT): change both together.
 *
 * Out-of-character notes: when the persona must step out (declining to write
 * graded work, answering whether it is an AI), it wraps that part in
 * [[note]] … [[/note]]. The page shows it as a system note, not in the
 * persona's voice, and the export marks it the same way.
 */

export const END_INTENT = /\b(?:end(?:ing)?\s+(?:the\s+|this\s+|our\s+)?(?:simulation|session|conversation|interview|chat|role[\s-]?play)|i(?:['’]?m|\s+am|['’]?ve|\s+have)\s+(?:all\s+)?finished|that['’]?s\s+all\s+(?:of\s+)?my\s+questions)\b/i;

export function hasEndIntent(text: string): boolean {
  return END_INTENT.test(String(text ?? ''));
}

export const NOTE_OPEN = '[[note]]';
export const NOTE_CLOSE = '[[/note]]';

export interface ReplyPart { kind: 'persona' | 'note'; text: string }

/** Split a reply into the persona's words and out-of-character notes. An unclosed note runs to the end (a reply cut off mid-note). */
export function splitNotes(text: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  const re = /\[\[note\]\]([\s\S]*?)(?:\[\[\/note\]\]|$)/gi;
  let last = 0;
  for (const m of String(text ?? '').matchAll(re)) {
    const before = text.slice(last, m.index).trim();
    if (before) parts.push({ kind: 'persona', text: before });
    const note = (m[1] ?? '').trim();
    if (note) parts.push({ kind: 'note', text: note });
    last = m.index! + m[0].length;
  }
  const rest = String(text ?? '').slice(last).trim();
  if (rest) parts.push({ kind: 'persona', text: rest });
  return parts;
}

/** The persona's own words only: what quotations are checked in and what is read aloud. */
export function personaWords(text: string): string {
  return splitNotes(text).filter((p) => p.kind === 'persona').map((p) => p.text).join('\n\n');
}

/** Markdown for exports: notes become a marked blockquote. */
export function notesToMarkdown(text: string): string {
  return splitNotes(text).map((p) => (p.kind === 'note' ? `> **Note (out of character):** ${p.text.replace(/\n/g, '\n> ')}` : p.text)).join('\n\n');
}

export function wordCount(text: string): number {
  return (String(text ?? '').replace(/\*[^*\n]{1,200}\*/g, ' ').match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
}
