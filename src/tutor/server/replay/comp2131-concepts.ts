/**
 * The learner-model entries of the two test students in COMP 2131 (moodbox
 * course 14), as the instructor's Concepts tab showed them on 2026-10-20:
 * 37 rows, every one at "Learners = 1". Read through the instructor API and
 * attributed by time: Student A's four sessions completed 01:58–02:07 UTC,
 * Student B's 02:20–02:28, and each entry's last_seen is its session's
 * completion. No names are kept.
 *
 * KEY_CONCEPTS is a proposed key-concept list for the Module 8 briefs, and
 * EXPECTED maps each row onto it (null = should stay unmapped). The unit test
 * checks the aggregation with EXPECTED; the live replay checks that the model
 * maps the same rows the same way where it matters.
 */

import type { ConceptStatus } from '../learner.js';

export const A = 1;
export const B = 2;

export const KEY_CONCEPTS = [
  'Compiling and linking are separate steps',
  'Undefined reference errors',
  'Multiple definition errors',
  'Reading nm output',
  'extern for one shared variable',
  'static for private symbols',
  'Local variables are not linker symbols',
  'Predicting before building',
  'Terminal output as evidence',
  'Static versus dynamic linking trade-offs',
  'Shared libraries in memory',
  'The gcc pipeline',
  'Diagnosing build errors with nm and ldd',
  'Relocatable object files',
  'Dynamic linking at run time',
  'Process address spaces',
] as const;
export type Key = (typeof KEY_CONCEPTS)[number];

export interface Row { student: number; concept: string; status: ConceptStatus; at: string; expected: Key | null }

const day = '2026-10-21 ';
export const ROWS: Row[] = [
  // Student A (round 1): readiness 01:58, concept 02:02, assignment start 02:05, reflection 02:07
  { student: A, concept: 'four gcc pipeline stages', status: 'fragile', at: '01:58:48', expected: 'The gcc pipeline' },
  { student: A, concept: 'how printf code reaches executable', status: 'fragile', at: '01:58:48', expected: null },
  { student: A, concept: 'gcc calls multiple tools sequentially', status: 'developing', at: '01:58:48', expected: 'The gcc pipeline' },
  { student: A, concept: 'linker combines object files and libraries', status: 'developing', at: '01:58:48', expected: 'Compiling and linking are separate steps' },
  { student: A, concept: 'compiler vs linker responsibilities', status: 'secure', at: '02:02:31', expected: 'Compiling and linking are separate steps' },
  { student: A, concept: 'multiple definition linker error', status: 'secure', at: '02:02:31', expected: 'Multiple definition errors' },
  { student: A, concept: 'undefined reference linker error', status: 'secure', at: '02:02:31', expected: 'Undefined reference errors' },
  { student: A, concept: 'using extern for shared variables', status: 'developing', at: '02:02:31', expected: 'extern for one shared variable' },
  { student: A, concept: 'using static for private symbols', status: 'secure', at: '02:02:31', expected: 'static for private symbols' },
  { student: A, concept: 'evidence means terminal output not descriptions', status: 'secure', at: '02:05:12', expected: 'Terminal output as evidence' },
  { student: A, concept: 'linker reports undefined references', status: 'secure', at: '02:05:12', expected: 'Undefined reference errors' },
  { student: A, concept: 'ordered workflow for linking diagnosis', status: 'secure', at: '02:05:12', expected: 'Diagnosing build errors with nm and ldd' },
  { student: A, concept: 'static versus dynamic trade-off', status: 'developing', at: '02:05:12', expected: 'Static versus dynamic linking trade-offs' },
  { student: A, concept: 'using nm to find undefined symbols', status: 'secure', at: '02:05:12', expected: 'Reading nm output' },
  { student: A, concept: 'nm letters distinguish symbol types', status: 'fragile', at: '02:07:39', expected: 'Reading nm output' },
  { student: A, concept: 'compiler vs linker error detection', status: 'developing', at: '02:07:39', expected: 'Compiling and linking are separate steps' },
  { student: A, concept: 'predicting before building', status: 'developing', at: '02:07:39', expected: 'Predicting before building' },
  { student: A, concept: 'reading nm output symbols', status: 'developing', at: '02:07:39', expected: 'Reading nm output' },
  // Student B (round 2): readiness 02:20, concept 02:24, assignment start 02:26, reflection 02:28
  { student: B, concept: 'Separate libc copies per process', status: 'misconception', at: '02:20:02', expected: 'Shared libraries in memory' },
  { student: B, concept: 'PLT and dynamic linking', status: 'developing', at: '02:20:02', expected: 'Dynamic linking at run time' },
  { student: B, concept: 'Relocatable object files structure', status: 'secure', at: '02:20:02', expected: 'Relocatable object files' },
  { student: B, concept: 'Shared read-only code pages', status: 'secure', at: '02:20:02', expected: 'Shared libraries in memory' },
  { student: B, concept: "Symbol resolution and linker's role", status: 'secure', at: '02:20:02', expected: 'Compiling and linking are separate steps' },
  { student: B, concept: 'Virtual address space isolation', status: 'secure', at: '02:20:02', expected: 'Process address spaces' },
  { student: B, concept: 'Compiler leaves symbol resolution to linker', status: 'secure', at: '02:24:10', expected: 'Compiling and linking are separate steps' },
  { student: B, concept: 'extern for shared variable', status: 'secure', at: '02:24:10', expected: 'extern for one shared variable' },
  { student: B, concept: 'Linker errors after compilation', status: 'secure', at: '02:24:10', expected: 'Compiling and linking are separate steps' },
  { student: B, concept: 'Local variables not in linker symbols', status: 'secure', at: '02:24:10', expected: 'Local variables are not linker symbols' },
  { student: B, concept: 'Reading nm output for symbol status', status: 'secure', at: '02:24:10', expected: 'Reading nm output' },
  { student: B, concept: 'static for separate private copies', status: 'secure', at: '02:24:10', expected: 'static for private symbols' },
  { student: B, concept: 'nm and ldd tools for linking diagnosis', status: 'secure', at: '02:26:20', expected: 'Diagnosing build errors with nm and ldd' },
  { student: B, concept: 'Shared library updates affect only dynamic binaries', status: 'secure', at: '02:26:20', expected: 'Static versus dynamic linking trade-offs' },
  { student: B, concept: 'Static versus dynamic trade-offs', status: 'developing', at: '02:26:20', expected: 'Static versus dynamic linking trade-offs' },
  { student: B, concept: 'Terminal evidence for linking claims', status: 'secure', at: '02:26:20', expected: 'Terminal output as evidence' },
  { student: B, concept: 'Predicting symbols before linking', status: 'fragile', at: '02:28:57', expected: 'Predicting before building' },
  { student: B, concept: 'Undefined reference as symbol resolution problem', status: 'fragile', at: '02:28:57', expected: 'Undefined reference errors' },
  { student: B, concept: 'Using nm to diagnose build errors', status: 'fragile', at: '02:28:57', expected: 'Diagnosing build errors with nm and ldd' },
].map((r) => ({ ...r, at: day + r.at }) as Row);

/** Key concepts both students showed, given EXPECTED: these must read Learners = 2. */
export const SHARED: Key[] = [
  'Compiling and linking are separate steps',
  'Undefined reference errors',
  'Reading nm output',
  'extern for one shared variable',
  'static for private symbols',
  'Predicting before building',
  'Terminal output as evidence',
  'Static versus dynamic linking trade-offs',
  'Diagnosing build errors with nm and ldd',
];
