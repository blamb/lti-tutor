import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateConcepts, labelKey, parseConceptLines, acceptMatch, MATCH_THRESHOLD, type ConceptRow, type CourseConcept } from './concepts.js';
import { guardEntries, listedClaims, type ProposedEntry } from './learner.js';
import { KEY_CONCEPTS, ROWS, SHARED, A, B } from './replay/comp2131-concepts.js';

// Usability report, Finding 13 (Brian's note on the Concepts tab).

const CANON: CourseConcept[] = KEY_CONCEPTS.map((label, i) => ({ id: i + 1, label }));
const idOf = (label: string | null) => (label === null ? null : CANON.find((c) => c.label === label)!.id);
const rows = (mapped: boolean): ConceptRow[] => ROWS.map((r) => ({
  student_id: r.student, concept: r.concept, status: r.status, last_seen: r.at, concept_id: mapped ? idOf(r.expected) : null,
}));

test('before: the 37 free-text rows of two students never share a row', () => {
  const { concepts, unmapped } = aggregateConcepts(rows(false), CANON);
  assert.equal(concepts.length, 0);
  // Exact-wording folding alone joins only the one pair that differs by a plural.
  const two = unmapped.filter((u) => u.learners === 2).map((u) => u.concept);
  assert.equal(unmapped.length, 36);
  assert.equal(two.length, 1);
  assert.match(two[0]!, /static versus dynamic trade-off/i);
});

test('after: every key concept both students showed reads Learners = 2', () => {
  const { concepts, unmapped } = aggregateConcepts(rows(true), CANON);
  const byLabel = new Map(concepts.map((c) => [c.concept, c]));
  for (const key of SHARED) assert.equal(byLabel.get(key)?.learners, 2, key);
  for (const c of concepts) {
    assert.ok(c.learners <= 2, c.concept);
    // Each learner is counted once, at their latest status.
    assert.equal(c.secure + c.developing + c.fragile + c.misconception, c.learners, c.concept);
  }
  // The one wording with no key concept waits in Unmapped, not as a concept row.
  assert.deepEqual(unmapped.map((u) => u.concept), ['how printf code reaches executable']);
});

test("a learner's latest status wins when several wordings map to one concept", () => {
  const { concepts } = aggregateConcepts(rows(true), CANON);
  const nm = concepts.find((c) => c.concept === 'Reading nm output')!;
  // Student A: secure at 02:05, then fragile and developing in the same 02:07 session; Student B: secure.
  assert.equal(nm.learners, 2);
  assert.deepEqual([nm.secure, nm.developing, nm.fragile], [1, 0, 1], 'a same-session tie shows the more concerning status');
  assert.equal(nm.wordings.length, 4);
  // Student B held the libc misconception and showed shared pages in the same session: the misconception stays visible.
  const shared = concepts.find((c) => c.concept === 'Shared libraries in memory')!;
  assert.deepEqual([shared.learners, shared.misconception], [1, 1]);
});

test('labels fold case, punctuation and plurals, not meaning', () => {
  assert.equal(labelKey('Static versus dynamic trade-offs'), labelKey('static versus dynamic trade-off'));
  assert.equal(labelKey("Symbol resolution and linker's role"), labelKey('symbol resolution and linkers role'));
  assert.notEqual(labelKey('using extern for shared variables'), labelKey('extern for shared variable'));
  assert.equal(labelKey('class'), 'class');
});

test('the editor list: bullets and numbering dropped, duplicates removed', () => {
  assert.deepEqual(parseConceptLines('- Reading nm output\n2. Undefined reference errors\n\n* reading NM output\n  extern for one shared variable  '), [
    'Reading nm output', 'Undefined reference errors', 'extern for one shared variable',
  ]);
});

test('a model match below the threshold, or to an unknown id, stays unmapped', () => {
  assert.deepEqual(acceptMatch({ concept_id: 3, confidence: MATCH_THRESHOLD - 0.01 }, CANON), { concept_id: null, confidence: MATCH_THRESHOLD - 0.01 });
  assert.equal(acceptMatch({ concept_id: 999, confidence: 0.95 }, CANON).concept_id, null);
  assert.equal(acceptMatch({ concept_id: 3, confidence: 0.95 }, CANON).concept_id, 3);
});

// ─── Items 4 and 5: misconceptions recorded, reflections cannot judge on thin evidence ───

const e = (concept: string, status: ProposedEntry['status'], quote = '', concept_id: number | null = null): ProposedEntry =>
  ({ concept, status, evidence: concept, quote, concept_id, confidence: concept_id ? 0.9 : 0 });

// Student B's reflection, from the report: three terse replies.
const B_REFLECTION = ['idk', 'not really. i just want to finish this', 'look for a typo in my code probably'];
const B_BEFORE = ROWS.filter((r) => r.student === B && r.at < '2026-10-21 02:28').map((r) => ({ concept: r.concept, status: r.status, concept_id: idOf(r.expected) }));

test('a reflection cannot mark concepts fragile from "idk" and "look for a typo"', () => {
  const proposed = [
    e('Undefined reference as symbol resolution problem', 'fragile', 'look for a typo in my code probably', idOf('Undefined reference errors')),
    e('Using nm to diagnose build errors', 'fragile', 'look for a typo in my code probably', idOf('Diagnosing build errors with nm and ldd')),
    e('Predicting symbols before linking', 'fragile', 'idk', idOf('Predicting before building')),
    e('Reading nm output for symbol status', 'fragile', '', idOf('Reading nm output')),
  ];
  const { kept, added, dropped } = guardEntries(proposed, {
    kind: 'reflection', studentTexts: B_REFLECTION, canon: CANON, existing: B_BEFORE, sticking: [], misconceptions: '',
  });
  assert.deepEqual(kept, []);
  assert.deepEqual(added, []);
  assert.equal(dropped.length, 4);
});

test("a reflection may record a gap the student names in their own words", () => {
  const said = 'Honestly I still cannot read the nm output, the letters all blur together for me';
  const { kept } = guardEntries([e('Reading nm output', 'fragile', 'I still cannot read the nm output', idOf('Reading nm output'))], {
    kind: 'reflection', studentTexts: [said], canon: CANON, existing: B_BEFORE, sticking: [], misconceptions: '',
  });
  assert.equal(kept.length, 1);
});

test('any session lowering a status needs the student\'s own words about that concept', () => {
  const ctx = { kind: 'concept' as const, studentTexts: ['it was fine'], canon: CANON, existing: B_BEFORE, sticking: [], misconceptions: '' };
  assert.equal(guardEntries([e('extern for shared variable', 'developing', 'it was fine', idOf('extern for one shared variable'))], ctx).kept.length, 0);
  // Raising or confirming needs nothing extra.
  assert.equal(guardEntries([e('PLT and dynamic linking', 'secure', '', idOf('Dynamic linking at run time'))], ctx).kept.length, 1);
});

test('a corrected or believed claim in a grounded sticking point becomes a misconception entry', () => {
  const studentTexts = [
    'Every process gets its own copy of libc in RAM, I think.',
    'static binaries are smaller and faster to start because nothing needs resolving at load time',
  ];
  const { added } = guardEntries([], {
    kind: 'assignment_start', studentTexts, canon: CANON, existing: [], misconceptions: '',
    sticking: [
      { text: 'Believed each process gets its own copy of libc', quote: 'Every process gets its own copy of libc in RAM' },
      { text: 'Claimed static binaries are smaller', quote: 'static binaries are smaller and faster to start' },
      { text: 'Unsure how to start', quote: 'nothing needs resolving' },
      { text: 'Predicted static binaries are smaller, which contradicts Learning Activity 5 Step 4', quote: 'static binaries are smaller and faster' },
    ],
  });
  assert.deepEqual(added.map((a) => [a.concept, a.status]), [
    ['Believed each process gets its own copy of libc', 'misconception'],
    ['Claimed static binaries are smaller', 'misconception'],
  ]);
  // A second sticking point on the same words is not recorded twice.
});

test('a misconception the brief lists, stated by the student, is recorded once', () => {
  const brief = '"static means the variable keeps its value" (confusing storage duration with linkage). Question: in Scenario C, why can two files each have a log_count?\n"If it compiled, my files are correct." Question: did gcc look at tax.c?';
  assert.deepEqual(listedClaims(brief), ['static means the variable keeps its value', 'If it compiled, my files are correct.']);
  const said = ['I think static means the variable keeps its value between calls, like a counter'];
  const g = { kind: 'concept' as const, studentTexts: said, canon: CANON, existing: [], sticking: [], misconceptions: brief };
  const { added } = guardEntries([], g);
  assert.equal(added.length, 1);
  assert.equal(added[0]!.status, 'misconception');
  // When the model already wrote it, nothing is added.
  const already = guardEntries([e('static as storage duration', 'misconception', said[0]!)], g);
  assert.equal(already.added.length, 0);
});

test('the fixture is the real data: 18 rows from one student, 19 from the other', () => {
  assert.equal(ROWS.filter((r) => r.student === A).length, 18);
  assert.equal(ROWS.filter((r) => r.student === B).length, 19);
});

test('within one session the more concerning row shows, even when the timestamps differ by microseconds (as in production)', () => {
  const at = (t: string) => `2026-10-21 02:20:${t}+00`;
  const rows: ConceptRow[] = [
    { student_id: B, concept: 'Separate libc copies per process', status: 'misconception', last_seen: at('02.338100'), concept_id: 11, source_tutorial_session_id: 40 },
    { student_id: B, concept: 'Shared read-only code pages', status: 'secure', last_seen: at('02.341807'), concept_id: 11, source_tutorial_session_id: 40 },
  ];
  const canon = [{ id: 11, label: 'Shared libraries in memory' }];
  assert.deepEqual(pick(aggregateConcepts(rows, canon).concepts[0]!), [1, 0, 1]);
  // Without session ids, rows minutes apart are different sessions: the later one wins.
  const later = rows.map((r, i) => ({ ...r, source_tutorial_session_id: null, last_seen: i ? '2026-10-21 02:40:00.1+00' : r.last_seen }));
  assert.deepEqual(pick(aggregateConcepts(later, canon).concepts[0]!), [1, 1, 0]);
  // A later session that shows the idea secure replaces an earlier misconception.
  const next = [...rows, { ...rows[1]!, concept: 'shared pages', last_seen: '2026-10-22 10:00:00+00', source_tutorial_session_id: 41 }];
  assert.deepEqual(pick(aggregateConcepts(next, canon).concepts[0]!), [1, 1, 0]);
});
const pick = (c: { learners: number; secure: number; misconception: number }) => [c.learners, c.secure, c.misconception];
