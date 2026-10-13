# LTI Tutor

> An LTI 1.3 tool for Moodle (and other LTI Advantage platforms) that runs instructor-designed one-on-one AI tutorials, the "Paski" pattern: faculty-written briefs, a staged Socratic conversation held by voice or text, placement in the course sequence via deep linking, gradebook passback, and debriefs for both the student and the instructor. One deployment serves scheduled, paced and self-paced courses, following TRU's TRUFlex delivery modes.

Subject-agnostic: instructors paste their own course materials (lecture notes, transcripts, readings, open textbook chapters) and the tutor grounds itself in those.

---

## The idea

Sam Paddock's write-up of [Paski](http://www.sampaddock.com/blog/2025/10/27/1-week-five-faculty-130-students-ai-tutor-paski-nps-78-live-faculty-meets-generative-ai), Next Gen Learning's AI tutor, argues that most AI tutors fail because they're bolted on: they sit outside the learning sequence and know nothing about the student. Paski's answer: faculty co-design each tutorial as they'd brief their best TA, the tutorial sits in the core sequence (live lecture → 1-on-1 AI tutorial → group debrief), students hold it by voice, it's personalised from a profile, and results feed back to faculty. Half of students' learning time went to it; NPS +78.

That sequence assumes a scheduled, instructor-led course. Thompson Rivers University also runs paced and self-paced online courses through Open Learning, so the tool knows each course's **TRUFlex delivery mode** and adapts its wording, its debriefs and its report without forking into separate tools. See [Delivery modes](#delivery-modes).

### Scheduled courses (TRUFlex 1 to 8)

The Paski sequence as built. Lecture, then the tutorial, then a group debrief run live by the instructor.

| Paski | LTI Tutor |
|---|---|
| Faculty co-design each tutorial "as they'd guide their best TA" | **Instructor view → Tutorials.** A brief: learning goal, opening question, TA notes (probes in order, what to do when stuck), misconceptions to listen for, success criteria, target length, and a **pitch** (reading level and tone). **Draft it with AI** writes a first pass grounded in your materials, at the pitch you set and shaped for the session's **kind** (see [Kinds of session](#kinds-of-session)). |
| Grounded in course materials | **Course materials.** Paste lecture notes, transcripts or readings, import a web page or open-textbook chapter by URL, or upload .txt, .md, .html, .docx or .pdf (up to ~200k characters each) and attach them to tutorials. Each carries its source URL, licence and attribution, and the tutor names the material it draws on. They're prompt-cached, so repeated turns cost a fraction. |
| Built into the core sequence | **Deep linking.** In Moodle, add an *External tool* activity, pick this tool, click **Select content**: each tutorial becomes its own activity you place right after its lecture. Launching it opens that tutorial directly. |
| Voice, student decides when to speak | **Push-to-talk** via the browser's Web Speech API (Chrome, Edge, Safari), replies read aloud via speech synthesis. No extra service, no extra cost. In person (Flex 1 to 7) typing is the default and voice is opt-in, since the learner may be in a classroom; typing is always a full equivalent. |
| Student profile personalises 5–10% | **About you** (optional, invisible to the instructor) feeds the tutorial prompt and the lecture debrief's "Consider this in your context, *name*" section. The **learner model** (what they have shown in earlier sessions) follows it into every prompt. |
| Pask's conversation theory: understanding confirmed by teaching it back | Staged dialogue: **orient → explore → teach-back → wrap-up**. In teach-back the student explains the idea as if to a classmate who missed the lecture; the tutor plays it back and checks. |
| Personalised lecture debriefs | **Lecture debriefs.** Per material, a short written recap: shared big ideas, common slips, a personal section, three self-test questions. Read-aloud button. |
| Group debrief with faculty | Each run ends in a structured summary (mastery, understood, sticking points, teach-back quality). The instructor's **report** aggregates them; **Generate debrief brief** turns them into discussion prompts and a one-minute re-teach for the live follow-up. After the live debrief, **Mark as delivered** gives learners a short recap note on their home view. |
| NPS | Students rate each tutorial 0–10 after finishing, then say how well the course material prepared them (1–5); the report shows NPS, preparedness and comments, and exports as CSV with no names. |
| Gradebook | Optional completion passback (1/1) via LTI Assignment & Grade Services. |

Not replicated: a realtime voice model (browser speech APIs instead), faculty digital-twin videos, NotebookLM audio podcasts (debriefs are text with read-aloud).

### Paced courses (TRUFlex 10)

A semester with start and end dates and a cohort of online learners, but no scheduled classes. Paced courses inherit the cohort features of scheduled courses (the instructor sees where the cohort got stuck, and can speak to the whole cohort) and the independent-learning wording of self-paced courses (no tutorial assumes the learner just sat through a lecture; debriefs are **study debriefs**). Because there is no live session, **Generate cohort note** replaces the live debrief brief: a note the instructor posts to the cohort (what the group found hard, one explanation worth reading, one thing to review) plus instructor-only observations. **Post to the cohort** turns it into a short after-session note on every learner's home view, the only way the debrief reaches them. Sessions carry an optional week and due date; the home view groups them with "this week" first, and nudges are date-aware ("due Friday", "the cohort has moved on from week 5").

### Self-paced courses (TRUFlex 9)

Open Learning's continuous-entry courses: flexible start, up to 30 weeks, no cohort, no classes, no dates. TRU names nine kinds of engagement a course must create; this table tracks which the tool serves.

| TRU engagement type | LTI Tutor |
|---|---|
| 1. Uncover prior knowledge and misconceptions before new learning | **Readiness checks**: a 4–8 exchange diagnostic before a section. The tutor probes what they already know, notes misconceptions without correcting them, and ends with what to watch for. Summary records prior knowledge and the misconceptions voiced. |
| 2. Prepare for learning: activate, connect, preview | **Readiness checks** (same session: activating what they can build on and previewing what is coming). |
| 3. Accountability for preparatory work | **Preparation checks** after an assigned reading: recount the key ideas, connect one to something they know; a learner who has not done the reading is told so kindly and the summary records it. |
| 4. Engagement with an AI tutor to unpack individual learning | **Tutorials** (the concept kind), worded for a learner working alone: no lectures, no classmates; teach-back is "explain it as if to someone who has never studied this". |
| 5. Feedback after engaging with new content, including telling the instructor how it landed | **Study debriefs** per material; after every session, NPS and "how well did the course material prepare you for this?" (1–5, with a comment), shown in the report beside NPS. |
| 6. Apply learning in a safe, unassessed practice setting | **Practice** sessions: the learner pastes or speaks a draft or attempt, gets feedback against the brief's criteria (two strengths, one thing to improve, as a question), revises, and is offered one more practice prompt. Never a grade. |
| 7. Reflect on learning: metacognition, strategies | **Reflections**: a short conversation about what was hard, what strategy worked, and one concrete thing to do differently next. The summary keeps their strategy in their own words. |
| 8. Revisit and recall learning from weeks or months earlier | **Recall** sessions: retrieval first (smallest cue if blank), then connection to the current unit. The brief points at earlier sessions, and the **learner model** tells the tutor which of this learner's concepts are fragile, misconceived or longest unseen. The summary records what was retained and what faded. |
| 9. Demonstrate learning and get feedback on drafts | **Practice** sessions on components of larger assessments. |

With no cohort there is nothing to debrief, so the report's synthesis becomes a **course revision brief**: sticking points and misconceptions ranked by frequency across every completed run, with suggestions for which material or part of the brief to revise.

Nothing is locked: a session can carry a **suggested after** hint, shown as "suggested next" once the earlier one is done, and Moodle's own restrict-access handles anything stronger. A **Suggested for you** list on the home view nudges, without dates: a readiness check not yet done, a recall session whose source concepts have gone three weeks without a look, a reflection not yet done after completed sessions.

For learners with limited or no internet (the former print mode grew out of Flex 9), every session also exists as a **paper version** and every material as a printable debrief; the instructor's **Export course pack** bundles them for the print shop or an offline device. See [Offline and low-bandwidth](#offline-and-low-bandwidth).

---

## Kinds of session

Every tutorial has a **kind**, chosen in the editor. The kind sets the stage template, the tutor's rules, the summary's extra fields and how "Draft it with AI" fills the brief; the editor's field labels change with it. All kinds are available in every delivery mode, and only the wording changes with the mode (a preparation check may say "this week's reading" where the course has fixed dates; a readiness check may say "before the next class" only where it has live sessions). Deep-linked activities and gradebook columns are titled with the kind, e.g. "Readiness check: Osmosis".

| kind | engagement types | stages | length |
|---|---|---|---|
| Readiness check | 1, 2 | orient → probe → wrap-up | 4–8 exchanges |
| Preparation check | 3 | orient → recall → connect → wrap-up | 4–8 exchanges |
| Tutorial (concept) | 4, 5 | orient → explore → teach-back → wrap-up | 6–24 exchanges |
| Practice | 6, 9 | share → feedback → revise → more practice → wrap-up | 6–24 exchanges |
| Reflection | 7 | open → probe → plan → wrap-up | 4–8 exchanges |
| Recall | 8 | retrieve → connect → wrap-up | 6–24 exchanges |

Every summary carries `mastery`, `understood`, `sticking_points`, `next_step` and `student_note`, so the report and the learner model treat all kinds alike; each kind adds its own fields (readiness: prior knowledge and misconceptions found; practice: strengths, what to improve, whether they revised; recall: retained and faded; and so on). The definitions live in `src/server/kinds.ts`.

---

## Materials from open sources

TRU Open Learning uses open educational resources only, so the materials view says so and links to the [BC Open Collection](https://collection.bccampus.ca/). Three ways in, all landing as plain text with `source_url`, `license` and `attribution` (`src/server/importers.ts`):

- **Paste text**, as before.
- **Import by URL.** The server fetches the page, strips navigation, headers, footers and scripts, keeps headings and lists, and reads a Creative Commons licence link if there is one. If the site is Pressbooks (BCcampus open textbooks are), the tool uses the Pressbooks REST API (`/wp-json/pressbooks/v2/`): a chapter URL imports that chapter with the book's title, authors and licence; ticking **whole book** imports every chapter as its own material (capped at 80). Only public http(s) URLs are fetched; private and local addresses are refused.
- **Upload a file**: `.txt`, `.md`, `.html`, `.docx` (via mammoth) or `.pdf` (via unpdf, text layer only; scanned PDFs need OCR first). Text over the material limit is cut and the instructor is told how long the original was.

The tutor's rules ask it to name the material it is drawing on (title and, where it can tell, the chapter or section) so learners can find the passage in the open textbook. Some Pressbooks hosts sit behind bot protection that refuses server-side requests; the importer reports that plainly and suggests the site's own PDF, EPUB or HTML export, which uploads fine.

---

## Offline and low-bandwidth

Nothing conversational works without a connection. What the tool can do is turn the same briefs into printable, self-contained artifacts so an offline learner gets the same learning design on paper (`src/server/print.ts`):

- **Paper version of every session.** One model call turns the brief into a sheet the learner works through alone with a pen, following the same stages: for a tutorial, the opening question, the probes rewritten as questions with ruled space, the misconceptions as "check yourself" prompts, a written teach-back, and the success criteria as a checklist; equivalent structures for readiness and preparation checks, practice (feedback checklist, revise, one more), reflection and recall. Stored in `tutorial_print`, keyed by a hash of the brief, so it regenerates when the brief changes (recorded as `tutorial.print_script`). Learners open it from the **📄 Paper** button on each session; instructors from the editor.
- **Debriefs as files.** A learner's own debrief downloads as a single HTML file with inline CSS and no JavaScript, and prints cleanly. For the course pack, each material also gets a non-personalised debrief template with space to "make it yours" (`material_debrief_template`, `tutorial.debrief_template`).
- **Export course pack.** One zip: every published session's paper script (HTML and Markdown), every material's debrief template, and `index.txt`.
- **Printing in the app.** A print stylesheet turns the tutorial transcript, the end-of-session summary and a debrief into a clean record, so a learner on an intermittent connection can keep one.
- **Slow connections.** The page carries no CDN dependency: marked and DOMPurify are served from the tool itself and loaded lazily after first paint, so the transcript shows as plain text immediately and re-renders once they arrive (or never, with nothing lost). The page is about 110 KB before fonts.

---

## Accessibility

The page is built to need few or no accommodations (WCAG 2.1 AA, BCcampus Accessibility Toolkit): one polite live region announces each complete tutor reply and every status change; the Speak button reports its state; recognised speech stays in the message box, editable, until the learner sends it; every control is keyboard-reachable with a visible focus ring, there is a skip link, and focus moves to the heading of each view as it opens; all colours are tokens with a dark theme and every text/background pair is at least 4.5:1; animation stops under `prefers-reduced-motion`; an "Aa" control sets text size and line spacing and remembers the choice; headings form a proper outline, including the model's markdown, which is re-levelled after rendering. The audit, with what was checked, fixed and remains, is in [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

---

## The learner model

After every completed session, one small model call maps the summary onto concept entries for that learner in that course: a short concept name, a status (`secure`, `developing`, `fragile`, `misconception`) and one sentence of evidence (`learner_model` table, `src/server/learner.ts`, recorded in `api_call` as `tutorial.learner_model`). The most recent 40 entries go into every tutorial's system prompt after the profile, inside the cached block, so the tutor knows what this learner has already shown; recall sessions are additionally told which concepts to prioritise (fragile or misconceived first, then longest unseen).

- **Learners** see it as **My learning**: what they have shown they understand, what is still developing, what is worth revisiting, and a mix-up the tutor noticed, each with the date. Plain language throughout, and any entry can be removed.
- **Instructors** see **Concepts**: counts per concept across the course, no names, with the most fragile or misconceived concepts first. Where the course has fixed dates and a start date (Course settings, or the launch custom parameter `course_start=$CourseSection.timeFrame.begin`), the same data is broken down by week of the course, so the instructor can see what the class is carrying forward.

---

## Delivery modes

Every course has a TRUFlex number (1 to 10) in `course_settings`, set by the instructor under **Instructor view → Course settings** (each option shows TRU's one-line description of the mode) or seeded on first launch by an LTI custom parameter `truflex=9` on the activity or course template. New courses default to Flex 3 (on campus, scheduled), which is the behaviour the tool had before modes existed.

The raw number is interpreted in exactly one place, `deliveryOf()` in `src/server/delivery.ts`, which returns three pacing categories and four booleans. Everything else in the codebase keys on the booleans, so a future TRUFlex revision is a one-line change.

| pacing | TRUFlex | hasCohort | hasFixedDates | hasLiveSessions | inPerson |
|---|---|---|---|---|---|
| `scheduled` | 1 to 8 | yes | yes | yes | 1 to 7 |
| `paced` | 10 | yes | yes | no | no |
| `self_paced` | 9 | no | no | no | no |

What each boolean switches today:

- **hasLiveSessions** — tutor rules (no lecture or follow-up assumed, discovery framing), teach-back audience, lecture vs study debrief wording and labels, the home-page blurbs, deep-link descriptions.
- **hasCohort** — teach-back audience (classmate vs "someone who has never studied this"), the no-peers rule, group debrief / cohort note vs course revision brief, "mark as delivered" with the after-session note learners see, the "cohort has moved on" nudge.
- **inPerson** — typing-first input with voice opt-in; the learner's own choice is remembered in the browser.
- **hasFixedDates** — the course start date, the concepts report by week, the session editor's week and due-date fields, the home view grouped by week with "this week" first, and date-aware nudges.

Per-course settings also hold a course level (ABE, undergraduate, graduate), a default pitch and the AI disclosure text.

---

## Architecture

- **LTI 1.3** via [`ltijs`](https://github.com/Cvmcosta/ltijs) (Express-based), Postgres-backed. Dynamic registration, deep linking, Assignment & Grade Services.
- **Backend** TypeScript + Node 20+, Postgres for app data. Migrations in `src/server/migrations`.
- **Frontend** one HTML file served by the launch handler; no build step. Markdown via marked + DOMPurify, served from the tool itself at `/vendor/…` and loaded lazily.
- **AI** Anthropic Claude through the official SDK. Models per function from env. System prompt order is rules (one fixed string per delivery variant) → materials (cached) → brief + profile (cached) → progress note, so a turn mid-tutorial re-reads the materials from cache.
- **Cost tracking** every call writes model, tokens and USD to `api_call`; `/admin/costs?token=…` returns a JSON summary.

```
src/server/
  index.ts        entry: env → LTI → routes → deploy
  lti.ts          ltijs setup, launch, deep-linking picker, /healthz, /fullscreen, /admin/costs
  routes.ts       /api/* (student + instructor + deep-link response)
  delivery.ts     TRUFlex → { pacing, hasCohort, hasFixedDates, hasLiveSessions, inPerson }; unit tests alongside
  kinds.ts        the six session kinds: stages, rules, summary fields, draft guidance; unit tests alongside
  courses.ts      course_settings CRUD and the per-request CourseCtx
  learner.ts      the learner model: update after each session, prompt block, recall candidates, course report
  progress.ts     the home view's grouping, "suggested next" and nudges, per mode; unit tests alongside
  importers.ts    materials by URL (readable text, Pressbooks API) and by file (.txt .md .html .docx .pdf); unit tests alongside
  print.ts        paper versions of sessions, debrief templates, standalone HTML, the course pack zip
  llm.ts          shared model-call helpers (JSON calls with schema + retry)
  tutorials.ts    materials, briefs, profiles, the staged dialogue, summaries, debriefs, AI draft
  grades.ts       AGS completion passback
  reqctx.ts       token / student / attribution / instructor gate helpers
  auth.ts         role detection from LTI claims
  anthropic.ts    SDK client + model selection
  costs.ts        price table + api_call recording + summary
  db.ts, migrate.ts, students.ts
  migrations/001_init.sql … 007_progression.sql
src/web/launch.html
```

---

## Getting started

### Local development

```bash
npm install
cp .env.example .env     # set LTI_COOKIE_SECRET (openssl rand -hex 32), ANTHROPIC_API_KEY, LTI_TOOL_URL
docker compose up -d     # Moodle (localhost:8080, user/bitnami) + Postgres
npm run db:migrate
npm run dev              # the tool, on PORT (default 3000)
ngrok http --domain=<your-static-domain> 3000   # or any HTTPS tunnel; LTI_TOOL_URL must match
```

`npm run typecheck` and `npm test` (unit tests, no database needed) should both pass before committing.

Register the tool in Moodle: *Site administration → Plugins → External tool → Manage tools → Dynamic registration* with URL `<LTI_TOOL_URL>/register`, then activate it. Check the tool's configuration has:

- **Supports Deep Linking (Content-Item Message)** enabled (ltijs requests it at registration).
- **IMS LTI Assignment and Grade Services**: "Use this service for grade sync and column management" if you want gradebook passback.
- **Default launch container**: "New window" or "Existing window" if you want voice to work without the Full screen step (Moodle's embed iframe doesn't grant microphone access).

### First run as an instructor

1. Launch the tool from the course → **Instructor view → Course settings** → pick the TRUFlex mode and, optionally, the course level and a default pitch.
2. **Course materials** → paste a lecture's notes, import an open-textbook chapter by URL, or upload a file.
3. **Tutorials → New tutorial** → choose the kind → tick the material → type the topic → **Draft** → edit → set status **Published** → **Save**. **Try it as a student** previews it.
4. Optionally place it in the course: *Add an activity → External tool → (this tool) → Select content*. To seed a course's mode from a template, add the custom parameter `truflex=<1–10>` to the activity.
5. After students run it: **Report** → generate the debrief brief, cohort note or revision brief, whichever the mode calls for.

### Deploying

Any Node host with Postgres works. A `railpack.json` is included for Railway. Set `LTI_TOOL_URL`, `DATABASE_URL`, `LTI_COOKIE_SECRET`, `ANTHROPIC_API_KEY`, `NODE_ENV=production` and optionally `ADMIN_TOKEN`, `TOOL_NAME`, `TUTOR_MODEL`, `GEN_MODEL`. `npm start` runs migrations then the server; `GET /healthz` is an unauthenticated liveness probe.

### Models and cost

Defaults are `claude-haiku-4-5` for both functions, the cheapest option that works well at class scale; set `TUTOR_MODEL=claude-sonnet-5-5` or `claude-opus-5-5` for a stronger tutor. Prices for current models are in `src/server/costs.ts`. Materials are prompt-cached, so the marginal cost of a turn is dominated by the transcript, not the course content.

---

## Notes and limits

- **Voice privacy.** Chrome's speech recognition sends audio to Google's speech service; Safari uses Apple's. Firefox has no speech recognition, so the Speak button is disabled there. Typing always works.
- **Voice in the LMS.** Inside Moodle's iframe the microphone is blocked; the page points students to **⛶ Full screen**, which re-issues the session first-party and opens the tool in the full window.
- **Materials are text.** Images, diagrams and equations rendered as images in a chapter or PDF are not carried into the material; the tutor only sees what the text says about them.
- **One deployment, many courses.** Everything is scoped by platform issuer + course id. Instructors only see their own course's materials, tutorials and reports.

## License

To be decided.
