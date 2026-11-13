# Module Builder

A third tool on the shared core (`APP=builder`). A course designer uploads a module draft written in Word, with the team's `[@Production: ...]` notes and H5P specifications left in, and downloads one Moodle restore file (`.mbz`). Restoring it gives a hidden Book with the pages, accordions, hints, callouts, code blocks, tables, images and H5P activities in place.

It is the Moodle counterpart to what D2L sells as Creator+ and Lumi for Brightspace, aimed at the part of the work that those tools leave to a person: acting on the production notes.

## What the designer does

1. **Upload** the `.docx` from the tool's home page (the tool is launched from a course as an external tool; only instructor and designer roles get in).
2. **Review the H5P activities.** Each specification is shown as the author wrote it, beside how it was read. Per activity: *Approve*, *Ask for a change* (in words; the spec is read again with that note), *Edit the details* (the structured form of the activity, as JSON), or *Leave out*.
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

Two activities are drafted by AI from each reading: a set of practice questions (multiple choice and true/false, with feedback on every answer) and a deck of key-term flashcards (the reading's own definitions; skipped when the reading defines fewer than three terms). Here the wording is the model's, so the safeguards are stronger than for a Word draft:

- Every question and card must quote the sentence of the reading it rests on. Code checks that the sentence is really there (`engine/reading.ts`). An item whose quotation is not found is sent back to the model once; if it still fails, the activity cannot be approved or built until a person fixes or removes the item.
- The review screen shows each item beside its supporting sentence. The model is told to use only what the reading says and to avoid sentences that look wrong, and it reports those to the designer.
- The build report lists every drafted item with its key and supporting sentence, for a subject reviewer. The quotation check confirms the source of an answer. It does not judge whether a question is a good one.
- Each page carries a line saying the activities were drafted with AI and are not graded, and a credit line for the reading.

Limits of this route: pages carry text only (headings, paragraphs, lists), so figures and tables in the reading are not carried over; a page read from an ordinary website keeps whatever the site puts in its main text, so it may need tidying in Moodle; a reading longer than about 30,000 words is cut for drafting, and the note on the activity says so; one page per reading.

## The two steps, and where AI is used

| Step | What does it | AI? |
|---|---|---|
| Read the Word file, act on the production notes, lay out the pages | Fixed rules in `src/builder/engine` (`draft.ts`, `pages.ts`) | No |
| Read each free-form H5P specification into a structured activity | `src/builder/server/interpret.ts`, model `BUILDER_MODEL` | Yes |
| Build the `.h5p` packages and the backup | Fixed code (`h5p.ts`, `mbz.ts`) | No |
| Readings route: fetch or extract the text, lay out the pages, check every quotation | `core/importers.ts`, `engine/reading.ts` | No |
| Readings route: draft practice questions and flashcards from one reading | `src/builder/server/drafting.ts`, model `BUILDER_MODEL` | Yes |

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

Multiple choice (single and select-all), true/false, fill in the blanks, drag the words, drag and drop (text items onto labelled zones, laid out automatically), dialog cards, sort the paragraphs, and question set (multiple choice and true/false questions). The packages carry content only; the Moodle site must have the content types installed. The versions the file names are listed at the end of the build report, and a site with newer versions upgrades the content on first view (seen on moodbox, Moodle 5.2).

Not built: interactive video, course presentation, branching scenario, image hotspots, or anything that needs media the draft does not contain. The AI step is told to say so rather than substitute a different task.

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
- Editing an activity's details means editing JSON. A form per activity type is the next step.
- One module per file. A whole course is several uploads and several restores.
- A module is either a Word draft or a set of readings. Adding readings to a Word-draft module is not built yet.
- Not yet checked with a screen reader, or in the Moodle mobile app.
