/**
 * Reference check (usability report, Finding 6).
 *
 * The tester could not verify the tutor's references ("Learning Activity 5
 * Step 7", "Topic 3 … Symbol Resolution", code it quoted) because the Moodle
 * page did not show the module text. Checked against the materials the tutor
 * is actually given, they were real. This check makes that verifiable for any
 * transcript: it lists every numbered reference, quoted title and code line in
 * a tutor reply and says which are not in the materials, and it flags claims
 * about what the student's own VM or machine will output, which the tutor
 * cannot know. No model call; the server logs what it flags after each reply.
 */

import type { Material } from '../../core/materials.js';

export interface ReferenceIssue {
  kind: 'reference' | 'title' | 'code' | 'vm_claim';
  text: string;
}

const PARENT = '(?:Learning Activity|Activity|Topic|Chapter|Section|Module|Part)';
const CHILD = '(?:Step|Scenario|Problem|Section|Figure|Table|Exercise|Question|Part)';
const NUM = '(?:\\d+(?:\\.\\d+)*|[A-Z])\\b';
const REF = new RegExp(`\\b(${PARENT}|${CHILD})\\s+(${NUM})(?:,?\\s+(${CHILD})\\s+(${NUM}))?`, 'g');
const TITLE = /\b(?:section|heading|passage|part|titled|called)\s+(?:called\s+|titled\s+)?["“]([^"”]{4,80})["”]/gi;
const VM_CLAIM = /\b(?:on|in) your (?:vm|virtual machine|machine|computer|laptop|system|terminal)\b[^.?!]*?\b(?:you'?ll|you will|it'?ll|it will|will|would)\s+(?:get|see|print|show|output|give|report|produce|say|fail|succeed)\b|\byour (?:vm|machine|compiler|gcc|system)\b[^.?!]*?\b(?:will|is going to)\s+(?:print|show|output|give|report|produce|say|fail|succeed)\b/gi;

function flat(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ');
}

/**
 * The parts of the materials under a heading like "Learning Activity 5", up to
 * the next heading of the same kind. Headings start a line; a material with
 * none falls back to every mention, up to the next mention of another number.
 */
function scope(raw: string, kind: string, num: string): string | null {
  const esc = kind.replace(/\s+/g, '\\s+');
  const head = new RegExp(`^[ \\t#>*-]*${esc}\\s+${num}\\b`, 'gim');
  const nextHead = new RegExp(`^[ \\t#>*-]*${esc}\\s+(?!${num}\\b)\\d+\\b`, 'gim');
  const cut = (starts: number[], next: RegExp) => starts.map((at) => {
    next.lastIndex = at + 1;
    const n = next.exec(raw);
    return flat(raw.slice(at, n ? n.index : undefined));
  }).join(' \u2016 ');
  const heads = [...raw.matchAll(head)].map((m) => m.index!);
  if (heads.length) return cut(heads, nextHead);
  const any = [...raw.matchAll(new RegExp(`\\b${esc}\\s+${num}\\b`, 'gi'))].map((m) => m.index!);
  return any.length ? cut(any, new RegExp(`\\b${esc}\\s+(?!${num}\\b)\\d+\\b`, 'gi')) : null;
}

export function checkReferences(reply: string, materials: Pick<Material, 'body' | 'title'>[]): ReferenceIssue[] {
  const raw = materials.map((m) => `${m.title}\n${m.body}`).join('\n');
  const source = flat(raw);
  const issues: ReferenceIssue[] = [];
  const has = (hay: string, needle: string) => new RegExp(`\\b${flat(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);

  for (const m of reply.matchAll(REF)) {
    const [whole, kind, num, childKind, childNum] = m;
    if (!has(source, `${kind} ${num}`)) { issues.push({ kind: 'reference', text: whole! }); continue; }
    if (childKind && childNum) {
      const part = scope(raw, kind!, num!);
      if (!part || !has(part, `${childKind} ${childNum}`)) issues.push({ kind: 'reference', text: whole! });
    }
  }
  for (const m of reply.matchAll(TITLE)) {
    if (!source.includes(flat(m[1]!).trim())) issues.push({ kind: 'title', text: m[1]! });
  }
  const code: string[] = [];
  for (const m of reply.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) code.push(...m[1]!.split('\n'));
  for (const m of reply.matchAll(/(?<!`)`([^`\n]{6,})`(?!`)/g)) code.push(m[1]!);
  for (const line of code.map((l) => l.trim()).filter((l) => /[(){};=<>]|^(gcc|ld|nm|ldd|objdump|readelf|\.\/)/.test(l))) {
    if (!source.includes(flat(line).trim())) issues.push({ kind: 'code', text: line });
  }
  for (const m of reply.matchAll(VM_CLAIM)) issues.push({ kind: 'vm_claim', text: m[0] });
  return issues;
}
