/**
 * Replay fixtures from the October 2026 usability report (COMP 2131,
 * Module 8, moodbox course 14). The hero session's brief is the one in the
 * COMP 2131 demo plan; the student lines the report quotes are verbatim and
 * the rest are reconstructed in the same shape. Used by the *.live.ts
 * replays, which call the real model; not part of the production build.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Material } from '../../../core/materials.js';
import type { Turn } from '../../../core/conversations.js';
import { defaultCourseSettings, courseCtxFromSettings, type CourseCtx } from '../courses.js';
import type { Tutorial } from '../tutorials.js';

/** Where the module's cleaned text lives on Brian's machine; replays run ungrounded without it. */
export const COMP2131_DIR = process.env.COMP2131_DIR || '/Users/blamb/Documents/COMP2131';

export const ctx: CourseCtx = courseCtxFromSettings(
  'https://moodbox.ca.reclaim.cloud', '14', 'COMP 2131 Computer Systems',
  { ...defaultCourseSettings('https://moodbox.ca.reclaim.cloud', '14', 9), course_level: 'undergraduate' },
);

export function materials(): Material[] {
  const files: Array<[string, Material['role']]> = [
    ['Module 8 - module text (for LTI Tutor).md', 'reading'],
    ['Module 8 - activities and study questions (for LTI Tutor).md', 'activities'],
  ];
  return files
    .filter(([f]) => existsSync(join(COMP2131_DIR, f)))
    .map(([f, role], i) => ({
      id: i + 1, lti_iss: ctx.iss, lti_context_id: ctx.contextId, title: f.replace(/ \(for LTI Tutor\)\.md$/, ''),
      body: readFileSync(join(COMP2131_DIR, f), 'utf8'), source_url: '', license: '', attribution: '', role,
      unit: 'Module 8: Linking', unit_order: 1, source_key: '', created_by: null, created_at: '', updated_at: '',
    }));
}

export const hero: Tutorial = {
  id: 1, lti_iss: ctx.iss, lti_context_id: ctx.contextId,
  title: 'Compiled clean, but it will not link',
  kind: 'concept',
  learning_goal: 'The student can explain, in their own words, why each source file compiles on its own but linking can still fail; can read an nm listing and say which symbols are defined, referenced or local; and can predict and fix the two linker errors (undefined reference, multiple definition) using the right tool for the intent (add the missing file, use extern for one shared variable, use static for separate private ones).',
  opening_question: 'In the coffee program, main.c calls price_with_tax and printf, but neither function is written in main.c. When you run gcc -c main.c and it succeeds with no errors, what does the compiler actually know about those two functions, and what does it leave for later?',
  ta_brief: `Open with the question above. Accept any answer that gets near "the compiler only needs the declaration; it leaves the connection for the linker." If they say the compiler finds the code in tax.c, ask how it could, since gcc -c main.c never reads tax.c.

Probes, in order. Use the module's own exercises and name them.
1. Every global name is a promise (Topic 3 key idea). Ask: when main.o uses price_with_tax without defining it, what is it promising? A good answer: that some other object file or library defines it, exactly once.
2. Reading nm (Topic 3, "Reading nm Output" fill-in-the-blanks). Give them the module's nm main.o listing (B items_rung_up, T main, D order, U price_with_tax, U printf) and ask them to read it line by line. Good answer: U means used here, defined elsewhere; T, D, B are definitions in .text, .data, .bss; uppercase is global. Then ask why total does not appear at all (a local variable is not a linker symbol).
3. Learning Activity 3, Scenario A: build library with main.c and books.c but leave out members.c. Ask them to predict the exact message and which program produces it. Good answer: undefined reference to add_member, from ld, after a successful compile; it appears twice because main calls add_member twice.
4. Learning Activity 3, Scenario B: remove static from log_count in both books.c and members.c. Predict. Good answer: multiple definition of log_count, because two files now define the same global. Then ask: what if you remove it in books.c only (Scenario C)? Good answer: it links, because the members.c copy is local and never takes part in cross-file resolution.
5. The fix depends on intent (Topic 3, "Problem 2"). Ask: two files both need a tax_percent. If it should be one shared variable, what do you write? If each file needs its own, what do you write? Good answer: one definition plus extern int tax_percent; in the other file, versus static in both.

When stuck: do not explain. Send them to the passage ("Topic 3, Symbol Resolution, Problem 1") or shrink the question (for Probe 3: "Which file defines add_member? Is that file in the build command?").

Move to teach-back after probe 4 or 5, or at about ten minutes. Teach-back prompt: "Explain to someone who has never studied this why a program can compile with no errors and still fail to link, using one example from the library program." Then play back their explanation and ask if you got it right. Probe once if they skip the role of the linker or confuse compile-time and link-time.

Do not drift into relocation (Topic 4) or shared libraries (Topic 6); if they ask, say those are the next sessions.`,
  misconceptions: `"If it compiled, my files are correct." Question: gcc -c main.c succeeded; did gcc ever look at tax.c while doing that?
"The compiler reports undefined reference." Question: read the error message from the inside out; which program's name is on the last line?
"static means the variable keeps its value" (confusing storage duration with linkage). Question: in Scenario C, why can two files each have a log_count without a clash?
"Local variables like total are symbols the linker resolves." Question: where does total live while the program runs, and does nm main.o list it?
"Multiple definition means the compiler saw the same name twice in one file." Question: each file compiled fine on its own; where were the two definitions seen together for the first time?
"extern creates a variable." Question: if both files write extern int tax_percent; and neither defines it, what will the linker say?`,
  success_criteria: `Names the linker (ld) as the program that fails, and compile-then-link as two separate steps with separate kinds of error.
Reads an nm listing: U versus T/D/B, and uppercase versus lowercase, in their own words.
Predicts Scenarios A, B and C correctly and gives the reason for each.
Chooses extern or static according to intent (one shared variable versus separate private ones), not by guessing.
In the teach-back, uses an example (add_member, log_count) rather than reciting definitions.`,
  pitch: '', practice_prompts: '', recall_tutorial_ids: [], suggested_after_tutorial_id: null, week: null, due_at: null,
  material_ids: [1, 2], concept_ids: [], target_minutes: 15, gradebook: true, status: 'published', created_by: null, created_at: '', updated_at: '',
};

let turnId = 0;
const at = '2026-10-20T12:00:00Z';
export function t(role: 'user' | 'assistant', content: string): Turn {
  return { id: ++turnId, role, content, ts: at };
}

/** Round 1 (Test Student1): tentative novice, through Scenario C, up to the tutor's recap. */
export const round1ToRecap: Turn[] = [
  t('assistant', "Hi Test, today we'll work out why a program can compile cleanly and still fail to link. In the coffee program, main.c calls price_with_tax and printf, but neither is written in main.c. When gcc -c main.c succeeds, what does the compiler actually know about those two functions, and what does it leave for later?"),
  t('user', 'um I think it knows they exist because of the prototype? and it leaves where the code is for later maybe'),
  t('assistant', 'That is the heart of it. When main.o uses price_with_tax without defining it, what is it promising about the rest of the program?'),
  t('user', 'that some other file has it?'),
  t('assistant', 'Right. Here is the nm main.o listing from Topic 3: B items_rung_up, T main, D order, U price_with_tax, U printf. What do you think the U lines mean?'),
  t('user', 'U is like undefined, used here but not made here'),
  t('assistant', 'Good. Learning Activity 3, Scenario A: build the library program with main.c and books.c but leave out members.c. What message do you expect, and from which program?'),
  t('user', 'undefined reference to add_member? it mentions add_member twice maybe because its called twice'),
  t('assistant', 'Very close. The error mentions the function name, not the number of call sites. However, you\'re right that the name appears twice. Scenario B: remove static from log_count in both books.c and members.c. What happens?'),
  t('user', 'I think B fails at the link step, multiple definition'),
  t('assistant', 'And Scenario C, where you remove static only in books.c?'),
  t('user', 'C maybe also fails? not sure'),
  t('assistant', "Here's what I heard: each .c file compiles on its own into an object file, and the compiler only needs the prototype. The linker then has to match every undefined symbol to exactly one definition, so a missing file gives undefined reference and two globals with the same name give multiple definition, all after a clean compile. Did I get that right?"),
];
export const ROUND_1_YES = "Yes, that's right. Thanks, that's a really clear summary";

/** Round 2 (Test Student2): confident, then a real teach-back. */
export const round2: Turn[] = [
  t('assistant', 'Hi Test, the goal today is to explain why a program can compile cleanly but fail to link. When gcc -c main.c succeeds, what does the compiler know about price_with_tax and printf, and what does it leave for later?'),
  t('user', 'It only knows the prototypes from the header, so it knows the signature and return type. It leaves the actual address for the linker to fill in later.'),
  t('assistant', 'Exactly. Read the nm main.o listing for me: B items_rung_up, T main, D order, U price_with_tax, U printf.'),
  t('user', 'T main is code defined here, D order is initialised data, B items_rung_up is uninitialised data in bss, and the U ones are used here but defined somewhere else.'),
  t('assistant', 'Scenario A leaves members.c out of the build. What do you expect?'),
  t('user', 'ld will say undefined reference to add_member, once per call site I think, even though every file compiled fine.'),
  t('assistant', 'Yes, the message shows up once per use of the symbol. Scenario B removes static from log_count in both books.c and members.c.'),
  t('user', 'Multiple definition of log_count. Is that what Learning Activity 3 uses, initialised or not? On older GCC with -fcommon uninitialised ones would be merged.'),
  t('assistant', 'Good point about -fcommon. And Scenario C, removing static only in books.c?'),
  t('user', 'It links, because the members.c copy is local to that file, so the linker never sees two globals.'),
  t('assistant', 'Explain to someone who has never studied this why a program can compile with no errors and still fail to link, using one example from the library program.'),
  t('user', 'Each .c file becomes an object file on its own, with promises and offers. The compiler trusts the prototype, so main.c compiles even if nobody defines add_member. Then the linker has to match every promise, every undefined symbol, to exactly one definition in some object file. Leave out members.c and nothing offers add_member, so ld reports an undefined reference even though everything compiled.'),
  t('assistant', 'That is a clear explanation, with the linker doing the matching and add_member as your example. You can click "Finish tutorial" to get your summary.'),
];
