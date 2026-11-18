# Module Builder

A third tool on the shared core (`APP=builder`). A course designer uploads a module draft written in Word, with the team's `[@Production: ...]` notes and H5P specifications left in, and downloads one Moodle restore file (`.mbz`). Restoring it gives a hidden Book with the pages, accordions, hints, callouts, code blocks, tables, images and H5P activities in place.

It is the Moodle counterpart to what D2L sells as Creator+ and Lumi for Brightspace, aimed at the part of the work that those tools leave to a person: acting on the production notes.

## What the designer does

1. **Upload** the `.docx` from the tool's home page (the tool is launched from a course as an external tool; only instructor and designer roles get in).
2. **Review the H5P activities.** Each specification is shown as the author wrote it, beside how it was read. Per activity: *Approve*, *Ask for a change* (in words; the spec is read again with that note), *Edit the details* (a form for that type of activity), or *Leave out*.
3. **Check the pages** in the preview, and the **To do** list: things the draft asks for that it does not contain (a video link, a handout file, alt text), judgement calls the page rules made, and a box for dropping stray notes that were not marked as notes.
4. **Download** the restore file and the build report, then restore in Moodle: *More › Course reuse › Restore › Merge into this course*. The module arrives hidden.

## Starting from readings instead (added 12 Nov 2026)

A module does not need a Word draft. From the home page a designer can name a module and add readings to it, one at a time:

| Kind of reading | How it is read |
|---|---|
| A web address | A Pressbooks chapter through the book's own interface, or any public page as readable text. A licence link on the page is detected. Sites that block automated access say so, and the designer uploads the file instead. |
| A file | PDF, Word, HTML or plain text. A scanned PDF has no text until it has been through OCR. |
| Pasted text | As typed, with a title. |

Each reading becomes one Book page. For each, the designer chooses what the page carries:

- **The full text, then the activities.** For open or self-owned material. This is the default only when an open licence was found; otherwise the build flags the page until someone confirms the right to reuse.
- **A link to the reading, then the activities.** For copyrighted readings such as library articles. The text is used to draft the activities and is not put on the page.

Two activities are drafted by AI from each reading (a summary, a crossword and a timeline can be added on request; see "H5P types it can build"): a set of practice questions (multiple choice and true/false, with feedback on every answer) and a deck of key-term flashcards (the reading's own definitions; skipped when the reading defines fewer than three terms). Here the wording is the model's, so the safeguards are stronger than for a Word draft:

- Every question and card must quote the sentence of the reading it rests on. Code checks that the sentence is really there (`engine/reading.ts`). An item whose quotation is not found is sent back to the model once; if it still fails, the activity cannot be approved or built until a person fixes or removes the item.
- The review screen shows each item beside its supporting sentence. The model is told to use only what the reading says and to avoid sentences that look wrong, and it reports those to the designer.
- The build report lists every drafted item with its key and supporting sentence, for a subject reviewer. The quotation check confirms the source of an answer. It does not judge whether a question is a good one.
- Each page carries a line saying the activities were drafted with AI and are not graded, and a credit line for the reading.

Limits of this route: pages carry text only (headings, paragraphs, lists), so figures and tables in the reading are not carried over; a page read from an ordinary website keeps whatever the site puts in its main text, so it may need tidying in Moodle; a reading longer than about 30,000 words is cut for drafting, and the note on the activity says so; one page per reading.

## RhizMode: open prompts instead of practice questions (started 12 Nov 2026)

When a designer starts a module from readings they choose what is drafted from each one. **Practice** is the route above. **RhizMode** drafts invitations to notice how a reading knows what it says. These have no answer key and nothing is graded. Method and ethos are drawn with admiration from the writings of Dave Cormier (rhizomatic learning, "the community is the curriculum", *Learning in a Time of Abundance*); the wording of the prompts and pages is ours, and no AI-written sentence is presented as his.

Five activity kinds are built. Four are drafted from each reading and share one shape: two to four sentences of the reading, each with one line on what a reader can see on the page and two questions, then a "Your turn" prompt. The fifth belongs to the whole module.

| Kind | What students do | Where it comes from in the book | What is ours |
|---|---|---|---|
| Breadcrumb Trail | Ask where the reading's claims come from, then post a claim of their own and where they got it | Practice 2, "Leave bread crumbs" (ch. 7); "dishwasher research" (ch. 3); his own list of beliefs labelled by where each came from (ch. 3) | The page layout |
| Trust Audit | Ask who or what the reading asks them to trust, and whether they know enough to weigh in | Humility and informed trust (ch. 6); never asking people for an opinion on what they cannot know; "I don't know enough to have an opinion, but this is how it affects me" as a full answer | The examples of what a reading can lean on. The earlier Rhizo tool's "four kinds of trust" is not in the book and is not used |
| What's Unsettled | Ask how settled a matter is, and whether more information would settle it | "Finished products" and classroom versus real-life problems (ch. 6); dealing with uncertainty instead of solving it, and the two ways people escape it: picking a side, or giving up (ch. 4); not all grey areas are equal | The name |
| Who's Missing | Ask whose experience is not on the page and what they or people they know could add | Practice 5, "Learn to see who is left behind" (ch. 7), which is about digital exclusion; who gets to write textbooks (ch. 5); lived experience outranks having read about it (ch. 6) | Applying Practice 5 to a text is our extension |
| Community Contract | Before the readings, tell the group what they bring, what they need, what they will have challenged and where they draw a line | "The community is the curriculum"; making values explicit, the third literacy (ch. 6); being fair to people you disagree with (Practice 6) | The contract as a device is not in the book. It comes from the earlier Rhizo tool |

Rules every drafting prompt carries, taken from the book as a whole: no question with a right answer; no verdict the student is in no position to give; no teaching of distrust (relying on people who know more is reasonable; the point is to do it knowingly); "I don't know" is always acceptable; open does not mean anything goes; nobody is asked to speak for a group; the trail is honesty, not citation policing. Two Rhizo activities were left out, Wicked Council and Nomad's Entry, because both have the AI invent voices and stories.

**The pick list.** When a reading is added, one activity of each of the four kinds is drafted from it. The Activities tab groups them under their reading; the designer picks by approving, and anything not approved is left out of the file. The model may decline a kind when a reading gives it nothing honest to work with; that activity arrives as "Left out" with its reason. The Community Contract is optional and is drafted on request, once the readings are in.

What differs from the practice route:

- **In Moodle** each reading activity is a section of the reading's Book page (the contract has its own page, first in the Book) and, unless the designer chooses "on their own", a discussion forum of the "single simple discussion" type, ungraded. The backup holds no posts; on restore Moodle starts the discussion itself with the prompt as its first post, under the name of whoever restored the file. The page links to the forum and the forum back to the page.
- **Pages link to the reading by default**, even an openly licensed one, because the passages under discussion are quoted on the page. The designer can switch a page to the full text on the Readings tab.
- **The quotation check is an anchor check.** It no longer proves an answer key. Every prompt points at a passage copied from the reading, code confirms the passage is there (`checkQuotes` in `engine/reading.ts`), and the reviewer sees each prompt beside the passage it responds to. A passage is at most 420 characters, so a page that only links to a copyrighted reading carries short quotations only.
- **The model adds no facts.** It may say only what a reader can see on the page (a figure with no source, a study cited). Anything it thinks the designer should know from outside the reading goes in its note to the designer, not on the page.
- **Only approved activities are built.** The practice route puts unreviewed drafts in the file and says so in the report; RhizMode leaves them out, because its pages say the prompts were reviewed.
- **Editing is in plain text boxes** (title, each passage, what the page says about it, the questions, "Your turn", and where students answer), not JSON. A changed passage is checked again on saving.
- **Disclosure.** Each page and each forum's first post says the prompts were drafted with AI, names the model, says they were reviewed by the course team, that there is no answer key and nothing is graded, and carries the credit line. The build report lists every drafted prompt beside its passage, and the fixed wording that is the same on every page.

Code: `engine/rhizo.ts` (the kinds, checks, page and forum wording), the forum part of `engine/mbz.ts`, the prompts in `server/drafting.ts` (`KIND_BRIEF`, `trailSystem`, `CONTRACT_SYSTEM`), migration `003_rhizmode.sql` (`build.mode`).

Tested locally on 12 Nov 2026: a module from two Wikipedia articles. All nine activities (four per reading and the contract) were drafted and every one of the 32 passages passed the anchor check on the first pass; no kind was declined. An edited passage that was not in the reading blocked approval. With five approved, one of them set to "on their own", the file restored into the local Moodle 5.0.1 as a Book of three pages (the contract first) and four forums, all hidden, each discussion started, no grade item, and every link between page and forum working. Not yet tested: asking for a change to a RhizMode activity, a reading with no web address, a restore merged into an existing course, moodbox, and whether students find the prompts worth answering.

Known rough edges: a passage copied from a web page keeps that page's artefacts (Wikipedia's note numbers, for example), and the model once used a site's "needs updating" banner as a passage; the "what the page says about it" line occasionally reads slightly more into a sentence than is there, which is what the designer's review is for; the fixed "how to take part" wording is not yet editable in the tool.

## Course pages: an overview, reading guides and key takeaways (added 17 Nov 2026)

A module started from readings, in either mode, can also carry page content drafted from those readings. It is reviewed on its own tab, **Course content** (first named Course pages).

| Page | Where it goes | What is drafted | What is not drafted |
|---|---|---|---|
| Reading guide | The top of a reading's page, above the reading or the link to it | Why this reading; three to six key ideas, each with a short explanation and the passage where it comes up (click to open); two to four questions the reading answers | The headings |
| Module overview | The first page of the Book | An introduction; three to six topics the readings cover | Learning outcomes, which are copied from the course outline. The "What you will do" list, which code builds from the module's contents with a link to each reading and a reading time (200 words a minute, rounded up to five minutes) |
| Key takeaways | The last page of the Book | Four to eight main points, each with its passage under "Where this comes from" | The name of the reading under each point, which code finds by locating the passage |

A guide is drafted for each reading when it is added. The overview and the takeaways are drafted on request, once the readings are in, because they draw on all of them. A reading added before this feature existed gets a "Draft a reading guide" button.

**The course outline.** The designer may paste or upload the course outline or syllabus (PDF, Word, HTML, text). The drafts use it to see what matters in the course. It is also the only source of learning outcomes: the model may copy an outcome from the outline and may not write one. With no outline, or an outline with no outcomes, the overview has none and says so in its note. The model is told to copy only the outcomes the module's readings serve, and in testing it left one out and said why (see below).

The safeguards, which are those of the other drafted material with one addition:

- **Passage check.** Every key idea, topic and takeaway carries a passage copied from a reading. Code confirms it is there (`checkQuotes` in `engine/reading.ts`); a miss is sent back to the model once, and a page with a passage still missing cannot be approved or built. A passage is at most 420 characters, so a page that links to a copyrighted reading quotes it only briefly.
- **Outcome check.** Every learning outcome must be in the outline word for word, checked the same way against the outline alone. A reworded or invented outcome blocks the page. Changing the outline re-checks an overview already drafted.
- **Only approved pages are built**, in practice mode as well as RhizMode, because the page says it was reviewed.
- **The model adds no facts** and does not judge the reading. Things it thinks the designer should know go in its note.
- **Editing is in plain text boxes**, and a changed passage or outcome is checked again on saving.
- **Disclosure.** Each drafted section ends with a line saying it was drafted with AI, naming the model, and reviewed by the course team. The build report lists every drafted statement beside its passage, and says which parts of the pages are fixed wording or built by code.

The checks show where a statement comes from. They do not show that the statement is a fair account of the reading: the introduction, the "why this reading" line and each explanation are the model's own words, and reading them against the source is the designer's job.

Code: `engine/coursepage.ts` (the kinds, checks and page HTML), the page parts of `engine/reading.ts`, the prompts in `server/pagedraft.ts`, `addPage` and `setOutline` in `server/builds.ts`, migration `004_course_pages.sql` (`build.outline`).

Tested locally on 17 Nov 2026: a practice-mode module from two Wikipedia articles (Digital divide, Digital literacy) with a made-up outline listing four outcomes. Both guides, the overview and the takeaways were drafted; all 26 passages and all three copied outcomes passed their checks on the first pass. The model left out the fourth outcome (evaluating a Canadian policy response) and noted that neither reading covers it. An outcome typed in by hand that is not in the outline blocked approval. A request to drop one takeaway did that and left the rest. With the four pages approved, the file restored into the local Moodle 5.0.1 as a Book of four pages in the right order, with the overview's and the takeaways' links pointing at the right reading pages. Not yet tested: the pages seen in Moodle's own theme, a RhizMode module with course pages and a contract together, an uploaded outline file, a real course outline and real course readings, moodbox.

Limits: one outline per module (paste the whole course outline into each, or the part that applies); the outline does not yet lay out a whole course; a passage shown to students has a web page's note markers ("[12]") removed, and nothing else.

## Native Moodle activities: a Quiz and a Glossary (added 17 Nov 2026)

A practice-mode module built from readings can send what it has already drafted to Moodle's own activities, chosen on the Download tab. Nothing new is drafted for this: the Quiz uses the practice questions and the Glossary uses the key terms.

| Setting | Choices | Default |
|---|---|---|
| Where the practice questions go | On each reading's page as an H5P question set; in one Moodle Quiz for the module; both | On the pages |
| Where the key terms go | On each reading's page as H5P flashcards; in one Moodle Glossary for the module; both | On the pages |

**The Quiz.** One per module, placed after the Book and hidden like it. Its questions are in the quiz's own question bank (Moodle 5 keeps a quiz's questions with the quiz), one to a page, answers shuffled, each answer with its feedback. It is marked out of 10, allows unlimited attempts, keeps the highest grade and has a gradebook column; all of that is ordinary quiz settings the designer can change after restoring. Because it is graded:

- only question sets a person has **approved** go in, where the H5P route also builds unreviewed drafts;
- only questions Moodle can mark the same way go in: true/false, and multiple choice with exactly one correct answer. Anything else is listed under "Notes on the pages" and left out;
- the build report lists every quiz question with its key and supporting sentence.

A second restore of the same module adds a second quiz with its own copy of the questions. It does not update the first.

**The Glossary.** Moodle treats glossary entries as user data and restores them only for someone allowed to restore user data, which by default is a site manager, not a teacher. So the backup carries an empty Glossary, and the entries come as a second file for the Glossary's own **Import entries** page (a button on the Download tab; the To do list says so). A term defined in two readings is listed once, from the first. The Glossary links its terms automatically wherever they appear in the course, which is its advantage over flashcards.

When the module has an overview page, its "What you will do" list links to the Quiz and the Glossary.

Code: the quiz, question-bank and glossary writers and `glossaryImportXml` in `engine/mbz.ts` (field lists copied from a backup made by Moodle 5.0.1), the routing in `engine/reading.ts`, migration `005_native_activities.sql` (`build.questions_as`, `build.terms_as`), `GET /api/builds/:id/glossary.xml`.

Tested locally on 17 Nov 2026 with the same two-article module: with one of the two question sets approved, the file restored into Moodle 5.0.1 with a hidden Quiz of 7 questions (6 multiple choice, 1 true/false), 7 slots, a grade item out of 10 and an empty Glossary; the unapproved set was left out and reported. Loaded through Moodle's question engine, every question graded its keyed answer as correct, and every answer carried its feedback. The overview's links to the Quiz and Glossary pointed at the restored activities. The glossary file (22 terms) parsed with Moodle's own XML reader into the structure its importer reads. Not yet tested: the Import entries page itself, a student attempt in the browser, the Quiz in the gradebook view, moodbox (Moodle 5.2), and an older Moodle 4 site.

## A discussion and an assignment (added 17 Nov 2026)

Two more things can be drafted for a module built from readings, from the tab now called **Course content** (it was Course pages). Each is drafted on request from all the readings, reviewed like a course page, built only when approved, and becomes its own Moodle activity after the Book, hidden.

**Discussion.** One ungraded forum for the module (Moodle's "single simple discussion", the same type RhizMode uses). The model drafts an opening prompt with one main question and one to three passages of the readings, each with a question the passage raises and does not answer. The page adds the name of the reading each passage comes from, and fixed wording on how to take part. The passage check applies.

**A RhizMode discussion, as an option.** In a practice-mode module, under each reading, the designer can instead (or as well) ask for a RhizMode discussion of a chosen kind: Breadcrumb Trail, Trust Audit, What's Unsettled or Who's Missing. It is drafted, checked, edited and built exactly as in a RhizMode module: a section on the reading's page plus its own ungraded forum, no answer key, built only when approved, with the same disclosure and credit line. RhizMode is not offered for the assignment, because it is by design ungraded.

**Assignment.** One Moodle Assignment for the module. The model drafts the task, what to hand in, suggested steps, one to three passages to draw on, and a rubric. If the outline describes an assignment for the module, the model is told to draft that one.

- **The rubric rests on the outline.** Each criterion names the learning outcome it assesses, copied from the course outline word for word, and code checks it is there, as for the overview's outcomes. A criterion with a reworded or invented outcome blocks the assignment. With no outline, or one with no outcomes, no rubric is drafted and the Assignment is marked by direct grading.
- **Fixed shape.** Three to five criteria (six at most), four levels each: Excellent 3, Good 2, Developing 1, Beginning 0. The labels and scores are fixed and the description of each level is drafted. Moodle scales the rubric total to the Assignment's grade of 100.
- **In Moodle** the rubric is attached as advanced grading and marked ready, so it shows to students and in the grader. The Assignment takes online text or up to three files, one attempt, no due date, feedback comments on, and has a gradebook column. All of that is ordinary settings.
- The model is told to give no dates, marks, weighting or citation style unless the outline gives them.

This is the first thing the tool drafts that a person will be graded on by an instructor. The checks show that each criterion points at a real outcome and each passage at a real place in the readings. They do not show that the task is a good one or the level descriptions fair; that is for the designer and the instructor, and the Download tab says to check the rubric with the instructor before showing it.

Code: the two kinds, their checks and wording in `engine/coursepage.ts`; the Assignment and rubric writer in `engine/mbz.ts` (field lists copied from a Moodle 5.0.1 backup); the prompts in `server/pagedraft.ts`; `addPage` in `server/builds.ts`, which also adds a RhizMode kind to one reading of a practice module.

Tested locally on 17 Nov 2026 with the same module and outline. The discussion (3 passages), the assignment (4 criteria, 3 passages) and a Trust Audit on the first reading (4 passages) were drafted, and every passage and every criterion's outcome passed its check on the first pass. The model tied two criteria to the same outcome and left the outline's fourth outcome unassessed, saying the readings do not cover it. An outcome edited to one not in the outline blocked the assignment until it was put back. Restored into Moodle 5.0.1, the course held the Book, two forums with their discussions started and their links to the Book working, the Quiz, the Glossary, and the Assignment with rubric as its active grading method, the rubric ready, four criteria with levels scored 0 to 3, the right submission types and a grade item out of 100. Not yet tested: grading a submission with the rubric in the browser, moodbox, and an assignment drafted from an outline that itself describes one.

## The two steps, and where AI is used

| Step | What does it | AI? |
|---|---|---|
| Read the Word file, act on the production notes, lay out the pages | Fixed rules in `src/builder/engine` (`draft.ts`, `pages.ts`) | No |
| Read each free-form H5P specification into a structured activity | `src/builder/server/interpret.ts`, model `BUILDER_MODEL` | Yes |
| Build the `.h5p` packages and the backup | Fixed code (`h5p.ts`, `mbz.ts`) | No |
| Readings route: fetch or extract the text, lay out the pages, check every quotation | `core/importers.ts`, `engine/reading.ts` | No |
| Readings route: draft practice questions and flashcards from one reading | `src/builder/server/drafting.ts`, model `BUILDER_MODEL` | Yes |
| Course pages: draft a reading guide, a module overview and key takeaways | `src/builder/server/pagedraft.ts`, model `BUILDER_MODEL` | Yes |
| Course pages: check every passage and outcome, lay out the pages, build the "What you will do" list | `engine/coursepage.ts`, `engine/reading.ts` | No |

The AI step is told to carry the author's wording across and add nothing of its own. Where a spec does not fit H5P as written (a "True/False" spec with four statements, feedback per blank), it picks the closest type and says so in a note the designer sees. Every reading is checked by code before it can be built (`checkActivity`), and the build report records, per activity, whether a person approved it, whether it was edited by hand, or whether it went into the file unreviewed.

Only the H5P specification text is sent to the model, one spec per call, with the chapter and heading it sits under. The rest of the draft is not sent. On the readings route the whole text of the reading is sent, once for each of its two activities.

## Production notes the page rules understand

| In the draft | Becomes |
|---|---|
| A Heading 2 | A Book chapter |
| `make each step a drop-down accordion`, then Heading 5 steps | One click-to-open block per step |
| `format "Hint" as a pop-up tool tip with the text "..."` | A click-to-open hint |
| `Place the following ... in a collapsed, click-to-expand panel` | A click-to-open panel |
| `[fa-code] Show code` above a one-cell table | Code hidden behind "Show code" |
| `Insert H5P activity using the specification below` | The H5P activity, embedded in the page |
| One-cell table starting with `[fa-brain]`, `[fa-circle-info]`, `[fa-lightbulb]` | Callout: Key idea, Note, Tip |
| Any other one-cell table, the Code style, or an all-monospace paragraph | Code block with indentation kept |
| `[fa-...]` anywhere | Font Awesome icon (Moodle ships these) |
| `Table 8.1 ...` paragraph above a table | Table caption; first row becomes header cells |
| `Figure 8.1: ...` paragraph below an image | Figure caption |
| `Image Description: ...` or `alt text: ...` note | Long description under the image |
| `Can this be made into a button ...: 'Label'` | Button, linked to the address the draft uses for that name |
| `embed video` with no link | A "To do" box |
| Links to the team SharePoint | Unlinked and flagged "file needed" |

Accordions, hints and panels use the HTML `<details>` element with inline styles. They need no JavaScript, plugin or theme change on the Moodle site.

## H5P types it can build

Fourteen. The first eight: multiple choice (single and select-all), true/false, fill in the blanks, drag the words, drag and drop (text items onto labelled zones, laid out automatically), dialog cards, sort the paragraphs, and question set (multiple choice, true/false, blanks and drag-the-words questions).

Six added on 17 Nov 2026, none of which needs an image or other media:

| Type | What the learner does | Scored | Limits the builder enforces |
|---|---|---|---|
| Accordion | Opens panels of text | No | Each panel needs a title and text |
| Summary | Picks the true statement from each group; the correct ones build into a summary | Yes | At least one wrong statement per group |
| Mark the words | Clicks the words that fit a rule | Yes | Single words only: a marked phrase is refused, because the type cannot mark one |
| Single choice set | Answers quick questions with one tap each | Yes | At least one wrong answer per question |
| Crossword | Fills a grid from clues; the layout is made when the activity opens | Yes | At least two words, no answer twice. Spaces and hyphens are taken out of an answer ("Hydrogen bond" becomes HYDROGENBOND) and the clue then gives the word lengths, "(8, 4)" |
| Timeline | Scrolls through dated events | No | Every event needs a year, a year and month, or a full date; "the late 1990s" is refused |

**From a Word draft**, the AI step that reads a specification now knows all fourteen, with the same rule as before: carry the author's wording across and add nothing. It is told to use a single choice set only when the spec asks for one or for quick-fire questions, since ordinary multiple-choice questions belong in a question set.

**From readings**, in a practice-mode module, three of the new types can be drafted on request from any reading, from "Draft another practice activity" at the foot of the H5P activities tab: a **Summary**, a **Crossword** of the terms the reading defines, and a **Timeline** of the events it dates. Each statement group, word and event carries the sentence of the reading it rests on, checked by code like the practice questions, and listed in the build report. The model is told not to estimate dates and to return nothing when a reading defines fewer than four usable terms or dates fewer than four events; the activity then arrives as "Left out" with the reason. Like the other H5P drafts they are built unless left out, and the report says which were not reviewed.

The packages carry content only; the Moodle site must have the content types installed. The versions the file names are listed at the end of the build report, and a site with newer versions upgrades the content on first view (seen on moodbox, Moodle 5.2, for the first eight). Crossword is a community content type (version 0.5 here) and is the one most likely to be missing or at another version on a given site.

Tested locally on 17 Nov 2026. One hand-written activity of each of the six types was restored into Moodle 5.0.1 and opened in a browser as a guest: all six ran, after one fix (a timeline event with no media group stopped the player). From the Digital divide article a summary (6 groups), a crossword (8 words) and a timeline (10 events) were drafted, and a second timeline (7 events) from the Digital literacy article; all 31 supporting sentences passed the check on the first pass, and the model's notes named the dated claims it left out as doubtful. Restored with the module, the summary, crossword and timeline each initialised on the reading's page with their content. Not yet tested: the AI step reading a real Word spec for any of the six types, playing each activity through to a score, moodbox, and a reading with too few terms or dates.

Not built: interactive video, course presentation, branching scenario, interactive book, essay, image hotspots, or anything that needs media the draft does not contain. The AI step is told to say so rather than substitute a different task.

## Editing an activity (forms, 17 Nov 2026)

"Edit the details" on any H5P activity opens a form for its type, in place of the JSON box it used to show. All fourteen types have one. A list (answers, cards, drop zones, crossword words, timeline events) shows one block per item with an empty block at the end for adding another; clearing an item's first box removes it. A question set shows each question with the form of its own type, a tick box to remove it, and a control to add a question of a chosen type. In a module built from readings each item also shows its supporting sentence, which is checked again on saving. Anything the form does not show is kept as it was. "Edit as JSON instead" is still there for the rare case the form does not cover.

Checked locally: a question edited and another removed in a question set, and a crossword word removed and one added with its supporting sentence; both saved with no problems and the quotation check re-run. Not yet tried by hand: the drag-and-drop form, where removing a zone renumbers the zones after it and each item's zone needs checking.

The home page was rewritten the same day to say what the tool now builds, with readings first.

## Readings in a Word-draft module, and several modules in one file (17 Nov 2026)

**Readings in a Word-draft module.** A module that started from a Word draft now has the Readings and Course content tabs too. A reading added there gets a page of its own after the draft's pages, in the same Book, with practice questions, key terms and a reading guide drafted from it, and everything else a readings module can have: the overview, takeaways, a discussion, an assignment, a Quiz, a Glossary, a RhizMode discussion. The two halves keep their own rules. A specification read from the draft is shown beside the author's wording and built in the author's words; an activity drafted from a reading is shown beside the sentence it rests on and checked against it. The build report has the draft's report first and the readings' report after it.

How it is built: the draft and the readings are built separately, as before, and each hands back the parts it would have put in a backup (`BuildResult.parts`). `joinPages` in `engine/combine.ts` puts the readings' pages after the draft's and rewrites the readings' links to their own pages, which have moved down. A Word-draft module with no readings takes the old path unchanged.

**Several modules in one file.** On the home page, under the list of modules, the designer ticks two or more, gives a first section number, and gets one restore file. Each module goes into its own course section, named after the module, in the order ticked; one restore brings them all in, hidden. The file holds exactly what each module's own file would. Each module keeps its own build report and To do list, and a module with a Glossary still needs its entries imported from its own file (the list links to it).

How it is built: `buildCourseFile` in `engine/combine.ts` gives each module the next Book number and the next forum, quiz, glossary and assignment numbers, rewrites every link between activities to match, and writes one backup with several sections (`MbzOptions.moreSections`, and a `section` on each activity). The ids of quizzes, assignments and glossaries were renumbered to leave room for fifty of each in a file; a file holds at most 30 modules.

Restoring by "Merge into this course" puts section N of the file into section N of the course, alongside whatever is already there, and names the section only if it had no name. So the first section number should be the first free section, or the sections the modules are meant for.

Tested locally: a pasted reading added to the COMP 2131 Module 8 draft (16 specifications, 11 pages) gave a twelfth page with its three drafts, all 18 supporting sentences found, and the 16 Word activities unchanged. That module, a readings module with two forums, an assignment and a glossary, and a second readings module were built into one file starting at section 2 and restored into Moodle 5.0.1: three sections, each named after its module and holding its own activities, three Books of 12, 4 and 2 pages, no link left undecoded, and all ten links between pages pointing inside their own Book. The Word-plus-reading module's own file restored as one Book of 12 pages. Not yet tested: a merge into a course that already has content in those sections, a course file on moodbox, RhizMode in a Word-draft module, and a file of many modules.

## Why a restore file

LTI can add links to a course but not pages, Books or H5P activities, and Moodle's core web services cannot create activities. A backup file is the one route that works on a stock Moodle with no plugin and no administrator action: any editing teacher can restore it.

## Data kept

Table `build` (migrations `001_builds.sql`, `002_readings.sql`): the uploaded Word file or the text of each reading, the specs found, each activity with its review status, and the settings. Pages and restore files are rebuilt on request and never stored. Rows are scoped to the course the tool was launched from. Model calls are recorded in `api_call` like the other tools' (`/admin/costs`).

## Running it

```bash
npm run db:migrate:builder
npm run dev:builder
```

Environment: the shared variables in `.env.example`, plus `APP=builder`, `TOOL_NAME` (default "Module Builder") and `BUILDER_MODEL` (default `claude-sonnet-5-5`). It deploys like the other two tools, as its own environment with its own database and its own registration in Moodle (see [reclaim-cloud.md](reclaim-cloud.md)).

## Tests

`npm test` runs the engine's unit tests (each H5P type, the backup writer, the activity checker). A golden test compares the engine's whole output for a real draft against a reference build; it runs only when `BUILDER_GOLDEN_DIR` points at a folder holding that draft, because course drafts are not kept in this repository.

## What has been tested (12 Nov 2026)

- The engine is a TypeScript port of a Python proof. For the COMP 2131 Module 8 draft its output matches the proof's: the 11 pages and both reports character for character, the 16 H5P packages apart from their random ids, and the backup apart from timestamps.
- The AI step read all 16 Module 8 specifications into buildable activities. Compared with the version made by hand for the proof, all 16 have the same activity type and the same answer key.
- The whole flow was run locally with a stand-in for the LTI launch: upload, review screen, approve, ask for a change, page preview, to-do list, settings, download.
- The file the app produced restored into a local Moodle 5.0.1 as a new course, and all 16 activities loaded on their pages.

- Readings route, locally: a module from pasted text (an open textbook section) and a Wikipedia page. All 41 drafted items passed the quotation check on the first pass; the file restored into the local Moodle and its four activities loaded. A BCcampus chapter address was refused by the site's bot protection, with the message telling the designer to upload the file. A PDF upload was not tried.

Not yet tested: a real LTI launch from Moodle (the launch and session code is the same as the other two tools'), a deployment, restoring an app-built file on moodbox or by merging into an existing course, and a second draft.

## Limits

- The page rules were written against one real draft (COMP 2131 Module 8). A second team's notes will use other wording; anything unrecognised is left visible on the page and listed in the report, and the fix is a new rule.
- The page preview is plain: no Moodle theme and no icons.
- A course file joins modules that already exist; an outline does not yet lay out a whole course by itself.
- Not yet checked with a screen reader, or in the Moodle mobile app.
