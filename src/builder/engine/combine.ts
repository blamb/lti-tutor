/**
 * Joining modules. A module's builder (index.ts for a Word draft, reading.ts
 * for readings) hands back the parts it gave the backup writer: one Book and
 * whatever forums, quizzes, glossaries and assignments go with it. Two things
 * are built from those parts here:
 *
 *   - one module whose Book holds a Word draft's pages followed by pages
 *     made from readings (joinPages), and
 *   - one restore file that holds several modules, each in its own course
 *     section (buildCourseFile).
 *
 * Links between activities are written with the ids each module's parts get
 * when built alone (its Book is number 0, its forums count from 0, and so
 * on). Joining renumbers them, so every link is rewritten to match.
 */

import { buildMbz, bookCmid, chapterId, forumCmid, quizCmid, glossaryCmid, assignCmid,
  type MbzBook, type MbzForum, type MbzQuiz, type MbzGlossary, type MbzAssign, type MbzResult } from './mbz.js';

export interface ModuleParts {
  name: string;
  book: MbzBook;
  forums: MbzForum[];
  quizzes: MbzQuiz[];
  glossaries: MbzGlossary[];
  assignments: MbzAssign[];
}

interface Shift { book: number; pages: number; forum: number; quiz: number; glossary: number; assign: number }

/** Rewrite the links in one piece of HTML for a module whose activities have moved by `s`. */
export function shiftLinks(html: string, s: Shift): string {
  const by = (name: string, base: (i: number) => number, move: number) => (text: string): string =>
    text.replace(new RegExp(`\\$@${name}\\*(\\d+)@\\$`, 'g'), (_m, id: string) => `$@${name}*${base(parseInt(id, 10) - base(0) + move)}@$`);
  let out = html.replace(/\$@BOOKVIEWBYIDCH\*(\d+)\*(\d+)@\$/g, (_m, _cm: string, ch: string) => {
    const page = parseInt(ch, 10) - chapterId(0, 0) + s.pages;
    return `$@BOOKVIEWBYIDCH*${bookCmid(s.book)}*${chapterId(s.book, page)}@$`;
  });
  out = by('FORUMVIEWBYID', forumCmid, s.forum)(out);
  out = by('QUIZVIEWBYID', quizCmid, s.quiz)(out);
  out = by('GLOSSARYVIEWBYID', glossaryCmid, s.glossary)(out);
  return by('ASSIGNVIEWBYID', assignCmid, s.assign)(out);
}

function shifted(p: ModuleParts, s: Shift, section?: number): ModuleParts {
  const fix = (html: string): string => shiftLinks(html, s);
  return {
    name: p.name,
    book: { ...p.book, chapters: p.book.chapters.map((c) => ({ title: c.title, html: fix(c.html) })), section },
    forums: p.forums.map((f) => ({ ...f, intro: fix(f.intro), section })),
    quizzes: p.quizzes.map((q) => ({ ...q, intro: fix(q.intro), section })),
    glossaries: p.glossaries.map((g) => ({ ...g, intro: fix(g.intro), section })),
    assignments: p.assignments.map((a) => ({ ...a, intro: fix(a.intro), section })),
  };
}

/**
 * One module from two: `first`'s pages, then `second`'s, in one Book named
 * after `first`. `second`'s links to its own pages move down by the number
 * of pages ahead of them. `first` is expected to have a Book only (a Word
 * draft); anything else it carries is kept ahead of `second`'s.
 */
export function joinPages(first: ModuleParts, second: ModuleParts): ModuleParts {
  const s = shifted(second, { book: 0, pages: first.book.chapters.length, forum: first.forums.length, quiz: first.quizzes.length, glossary: first.glossaries.length, assign: first.assignments.length });
  for (const name of Object.keys(s.book.files)) {
    if (Object.prototype.hasOwnProperty.call(first.book.files, name)) throw new Error(`Both halves of the module carry a file called ${name}`);
  }
  return {
    name: first.name,
    book: { ...first.book, chapters: [...first.book.chapters, ...s.book.chapters], files: { ...first.book.files, ...s.book.files } },
    forums: [...first.forums, ...s.forums], quizzes: [...first.quizzes, ...s.quizzes],
    glossaries: [...first.glossaries, ...s.glossaries], assignments: [...first.assignments, ...s.assignments],
  };
}

export interface CourseFileOptions { fileName: string; course: { fullname: string; shortname: string }; hidden?: boolean; firstSection?: number; now?: number }

/** One restore file holding several modules, each in its own section, in the order given. */
export function buildCourseFile(modules: ModuleParts[], opts: CourseFileOptions): MbzResult {
  if (!modules.length) throw new Error('No modules to put in the file');
  const all: ModuleParts[] = [];
  const at = { forum: 0, quiz: 0, glossary: 0, assign: 0 };
  modules.forEach((m, k) => {
    all.push(shifted(m, { book: k, pages: 0, ...at }, k));
    at.forum += m.forums.length; at.quiz += m.quizzes.length; at.glossary += m.glossaries.length; at.assign += m.assignments.length;
  });
  return buildMbz(opts.fileName, opts.course, { name: all[0]!.name }, all.map((m) => m.book), {
    hidden: opts.hidden ?? true, sectionNumber: opts.firstSection ?? 1, now: opts.now,
    moreSections: all.slice(1).map((m) => ({ name: m.name })),
    forums: all.flatMap((m) => m.forums), quizzes: all.flatMap((m) => m.quizzes),
    glossaries: all.flatMap((m) => m.glossaries), assignments: all.flatMap((m) => m.assignments),
  });
}
