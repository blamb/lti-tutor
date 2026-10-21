import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReferences } from './references.js';
import { tutorialRulesFor } from './tutorials.js';
import { TUTORIAL_KINDS } from './kinds.js';
import { deliveryOf } from './delivery.js';

// Usability report, Finding 6. A small module in the shape of COMP 2131's.
const MODULE = [{ title: 'Module 8: Linking', body: `Topic 3: Symbols and Symbol Resolution
Symbols and Symbol Tables
Symbol Resolution
Problem 1: no definition.
Learning Activity 3: Symbols and Symbol Resolution
Step 2: run nm main.o
Scenario A: build without members.c
\`gcc -o library main.c books.c\`
Learning Activity 5: Dynamic Linking and Shared Libraries
Step 4: shop_full is much larger than the other two programs.
Step 7 – Self-Check
Scenario 1. A small medical device runs one program for many years.` }];
const issues = (reply: string) => checkReferences(reply, MODULE).map((i) => `${i.kind}: ${i.text}`);

test('references that are in the materials pass, including a step inside its own activity', () => {
  assert.deepEqual(issues('Look at Learning Activity 5, Step 7, the medical device scenario, and Topic 3 Problem 1.'), []);
  assert.deepEqual(issues('Topic 3 has a section called "Symbol Resolution".'), []);
  assert.deepEqual(issues('Try `gcc -o library main.c books.c` first.'), []);
});

test('invented references, titles and code are flagged', () => {
  assert.deepEqual(issues('See Learning Activity 3 Step 7 and Topic 8.'), ['reference: Learning Activity 3 Step 7', 'reference: Topic 8']);
  assert.deepEqual(issues('Read the section called "Symbol Tables Explained".'), ['title: Symbol Tables Explained']);
  assert.deepEqual(issues('Run `gcc -o library main.c members.c` now.'), ['code: gcc -o library main.c members.c']);
});

test('a claim about what the student\'s VM will print is flagged; asking them to check is not', () => {
  assert.deepEqual(issues("GCC 10 defaults to -fno-common, so on your VM you'll get the multiple definition error."), [
    "vm_claim: on your VM you'll get",
  ]);
  assert.deepEqual(issues('The module says GCC 10 defaults to -fno-common; check on your VM which message you get.'), []);
});

test('every kind is told to cite only what the materials contain and never to predict the VM', () => {
  for (const kind of TUTORIAL_KINDS) {
    const rules = tutorialRulesFor(deliveryOf(9), kind);
    assert.match(rules, /only as it appears in the materials provided/, kind);
    assert.match(rules, /never reconstruct code from memory/, kind);
    assert.match(rules, /Never say what the student's own computer, VM or compiler will print or do/, kind);
  }
});
