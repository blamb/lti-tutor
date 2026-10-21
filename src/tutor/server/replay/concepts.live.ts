/**
 * Live replay for Finding 13: the real model maps the two test students' 37
 * real concept wordings onto the proposed key concepts, and the learner-model
 * update records misconceptions and leaves thin reflections alone. Run with
 * `npm run test:live` (needs ANTHROPIC_API_KEY). Checks behaviour, not wording.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchConcepts, aggregateConcepts, type CourseConcept } from '../concepts.js';
import { proposeLearnerEntries } from '../learner.js';
import type { TutorialSummary } from '../tutorials.js';
import { hero } from './fixtures.js';
import { KEY_CONCEPTS, ROWS, SHARED, B } from './comp2131-concepts.js';

const live = !!process.env.ANTHROPIC_API_KEY;
const attribution = { endpoint: 'replay' };
const CANON: CourseConcept[] = KEY_CONCEPTS.map((label, i) => ({ id: i + 1, label }));
const labelOf = (id: number | null) => (id === null ? null : CANON.find((c) => c.id === id)!.label);

test('Finding 13: the model maps both students\' wordings so every shared concept reads Learners = 2', { skip: !live }, async () => {
  const matches = await matchConcepts(ROWS.map((r) => r.concept), CANON, attribution);
  const disagreements = ROWS.map((r, i) => [r.concept, r.expected, labelOf(matches[i]!.concept_id), matches[i]!.confidence] as const)
    .filter(([, want, got]) => want !== got);
  console.log(`\n${ROWS.length - disagreements.length}/${ROWS.length} mapped as expected; differences:`);
  for (const [w, want, got, c] of disagreements) console.log(`  "${w}": expected ${want ?? 'unmapped'}, got ${got ?? 'unmapped'} (${c})`);
  const { concepts, unmapped } = aggregateConcepts(
    ROWS.map((r, i) => ({ student_id: r.student, concept: r.concept, status: r.status, last_seen: r.at, concept_id: matches[i]!.concept_id })), CANON);
  const learners = new Map(concepts.map((c) => [c.concept, c.learners]));
  console.log('Learners by concept:', Object.fromEntries(learners), '\nunmapped:', unmapped.map((u) => u.concept));
  for (const k of SHARED) assert.equal(learners.get(k), 2, k);
  assert.ok(unmapped.length <= 3, 'almost everything finds a key concept');
});

const base = { understood: [], sticking_points: [], told: [], next_step: '', student_note: '' };
const B_BEFORE = ROWS.filter((r) => r.student === B && r.at < '2026-10-21 02:28').map((r) => ({ concept: r.concept, status: r.status, concept_id: CANON.find((c) => c.label === r.expected)?.id ?? null }));

test('Finding 13, item 5: a terse reflection does not mark concepts fragile', { skip: !live }, async () => {
  const studentTexts = ['idk', 'not really. i just want to finish this', 'look for a typo in my code probably'];
  // The report's summary, after Finding 2's grounding kept the sticking points that quote the student.
  const summary = {
    ...base, kind: 'reflection', mastery: 'needs_work',
    sticking_points: ['No strategy for diagnosing build errors beyond looking for typos', 'Wants to finish rather than reflect'],
    strategy_in_own_words: 'look for a typo in my code probably', suggested_action: 'Use nm on the object files before editing code',
  } as unknown as TutorialSummary;
  const { entries, dropped } = await proposeLearnerEntries({
    tutorial: { ...hero, kind: 'reflection', title: 'Looking back on Module 8', misconceptions: '' }, summary, existing: B_BEFORE, canon: CANON, attribution,
    studentTexts, evidence: { understood: [], sticking: [
      { text: 'No strategy for diagnosing build errors beyond looking for typos', quote: 'look for a typo in my code probably' },
      { text: 'Wants to finish rather than reflect', quote: 'i just want to finish this' },
    ] },
  });
  console.log('\nreflection entries:', entries, '\nkept back:', dropped);
  assert.ok(!entries.some((e) => e.status === 'fragile' || e.status === 'misconception'), 'no fragile or misconception from three terse replies');
});

test('Finding 13, item 4: a stated wrong claim becomes a misconception entry', { skip: !live }, async () => {
  const studentTexts = [
    'Part B asks which linking choice fits each situation and to back it with terminal evidence.',
    'For the second I\'d show that static binaries are smaller and faster to start because nothing needs resolving at load time, using ls -l and time.',
    'My first prediction: shop_a will be noticeably smaller than shop_so on disk.',
  ];
  const summary = {
    ...base, kind: 'assignment_start', mastery: 'developing',
    understood: ['Part B needs terminal evidence for each claim'],
    sticking_points: ['Claimed static binaries are smaller than dynamic ones (they are larger)'],
    task_understanding: 'partial', plan: 'Compare the binaries', first_step: 'Run ls -l on both', sources_used: [],
  } as unknown as TutorialSummary;
  const { entries } = await proposeLearnerEntries({
    tutorial: { ...hero, kind: 'assignment_start', title: 'Getting started on Assignment 3 Part B', misconceptions: '"Static binaries are smaller." Question: what does the linker copy into a static binary?' },
    summary, existing: [], canon: CANON, attribution, studentTexts,
    evidence: {
      understood: [{ text: 'Part B needs terminal evidence for each claim', quote: 'back it with terminal evidence' }],
      sticking: [{ text: 'Claimed static binaries are smaller than dynamic ones (they are larger)', quote: 'static binaries are smaller and faster to start' }],
    },
  });
  console.log('\nassignment start entries:', entries);
  const mis = entries.filter((e) => e.status === 'misconception');
  assert.ok(mis.length >= 1, 'a misconception entry');
  assert.ok(mis.some((e) => /smaller|size/i.test(`${e.concept} ${e.evidence}`)));
  assert.ok(!entries.some((e) => e.status === 'secure' && /smaller|size/i.test(e.concept)), 'the false claim is never secure');
});
