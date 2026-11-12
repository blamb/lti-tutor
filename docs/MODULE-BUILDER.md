# Module Builder

A third tool on the shared core (`APP=builder`). A course designer uploads a module draft written in Word, with the team's `[@Production: ...]` notes and H5P specifications left in, and downloads one Moodle restore file (`.mbz`). Restoring it gives a hidden Book with the pages, accordions, hints, callouts, code blocks, tables, images and H5P activities in place.

It is the Moodle counterpart to what D2L sells as Creator+ and Lumi for Brightspace, aimed at the part of the work that those tools leave to a person: acting on the production notes.

## What the designer does

1. **Upload** the `.docx` from the tool's home page (the tool is launched from a course as an external tool; only instructor and designer roles get in).
2. **Review the H5P activities.** Each specification is shown as the author wrote it, beside how it was read. Per activity: *Approve*, *Ask for a change* (in words; the spec is read again with that note), *Edit the details* (the structured form of the activity, as JSON), or *Leave out*.
3. **Check the pages** in the preview, and the **To do** list: things the draft asks for that it does not contain (a video link, a handout file, alt text), judgement calls the page rules made, and a box for dropping stray notes that were not marked as notes.
4. **Download** the restore file and the build report, then restore in Moodle: *More › Course reuse › Restore › Merge into this course*. The module arrives hidden.

## The two steps, and where AI is used

| Step | What does it | AI? |
|---|---|---|
| Read the Word file, act on the production notes, lay out the pages | Fixed rules in `src/builder/engine` (`draft.ts`, `pages.ts`) | No |
| Read each free-form H5P specification into a structured activity | `src/builder/server/interpret.ts`, model `BUILDER_MODEL` | Yes |
| Build the `.h5p` packages and the backup | Fixed code (`h5p.ts`, `mbz.ts`) | No |

The AI step is told to carry the author's wording across and add nothing of its own. Where a spec does not fit H5P as written (a "True/False" spec with four statements, feedback per blank), it picks the closest type and says so in a note the designer sees. Every reading is checked by code before it can be built (`checkActivity`), and the build report records, per activity, whether a person approved it, whether it was edited by hand, or whether it went into the file unreviewed.

Only the H5P specification text is sent to the model, one spec per call, with the chapter and heading it sits under. The rest of the draft is not sent.

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

Table `build` (migration `src/builder/migrations/001_builds.sql`): the uploaded Word file, the specs found, each reading with its review status, and the settings. Pages and restore files are rebuilt on request and never stored. Rows are scoped to the course the tool was launched from. Model calls are recorded in `api_call` like the other tools' (`/admin/costs`).

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

Not yet tested: a real LTI launch from Moodle (the launch and session code is the same as the other two tools'), a deployment, restoring an app-built file on moodbox or by merging into an existing course, and a second draft.

## Limits

- The page rules were written against one real draft (COMP 2131 Module 8). A second team's notes will use other wording; anything unrecognised is left visible on the page and listed in the report, and the fix is a new rule.
- The page preview is plain: no Moodle theme and no icons.
- Editing an activity's details means editing JSON. A form per activity type is the next step.
- One module per file. A whole course is several uploads and several restores.
- Not yet checked with a screen reader, or in the Moodle mobile app.
