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
| Faculty co-design each tutorial "as they'd guide their best TA" | **Instructor view → Tutorials.** A brief: learning goal, opening question, TA notes (probes in order, what to do when stuck), misconceptions to listen for, success criteria, target length, and a **pitch** (reading level and tone). **Draft it with AI** writes a first pass grounded in your materials, at the pitch you set. |
| Grounded in course materials | **Course materials.** Paste lecture notes, transcripts or readings (up to ~200k characters each) and attach them to tutorials. They're prompt-cached, so repeated turns cost a fraction. |
| Built into the core sequence | **Deep linking.** In Moodle, add an *External tool* activity, pick this tool, click **Select content**: each tutorial becomes its own activity you place right after its lecture. Launching it opens that tutorial directly. |
| Voice, student decides when to speak | **Push-to-talk** via the browser's Web Speech API (Chrome, Edge, Safari), replies read aloud via speech synthesis. No extra service, no extra cost. In person (Flex 1 to 7) typing is the default and voice is opt-in, since the learner may be in a classroom; typing is always a full equivalent. |
| Student profile personalises 5–10% | **About you** (optional, invisible to the instructor) feeds the tutorial prompt and the lecture debrief's "Consider this in your context, *name*" section. |
| Pask's conversation theory: understanding confirmed by teaching it back | Staged dialogue: **orient → explore → teach-back → wrap-up**. In teach-back the student explains the idea as if to a classmate who missed the lecture; the tutor plays it back and checks. |
| Personalised lecture debriefs | **Lecture debriefs.** Per material, a short written recap: shared big ideas, common slips, a personal section, three self-test questions. Read-aloud button. |
| Group debrief with faculty | Each run ends in a structured summary (mastery, understood, sticking points, teach-back quality). The instructor's **report** aggregates them; **Generate debrief brief** turns them into discussion prompts and a one-minute re-teach for the live follow-up. |
| NPS | Students rate each tutorial 0–10 after finishing; the report shows NPS and comments. |
| Gradebook | Optional completion passback (1/1) via LTI Assignment & Grade Services. |

Not replicated: a realtime voice model (browser speech APIs instead), faculty digital-twin videos, NotebookLM audio podcasts (debriefs are text with read-aloud).

### Paced courses (TRUFlex 10)

A semester with start and end dates and a cohort of online learners, but no scheduled classes. Paced courses inherit the cohort features of scheduled courses (the instructor sees where the cohort got stuck, and can speak to the whole cohort) and the independent-learning wording of self-paced courses (no tutorial assumes the learner just sat through a lecture; debriefs are **study debriefs**). Because there is no live session, **Generate cohort note** replaces the live debrief brief: a note the instructor posts to the cohort (what the group found hard, one explanation worth reading, one thing to review) plus instructor-only observations.

### Self-paced courses (TRUFlex 9)

Open Learning's continuous-entry courses: flexible start, up to 30 weeks, no cohort, no classes, no dates. TRU names nine kinds of engagement a course must create; this table tracks which the tool serves.

| TRU engagement type | LTI Tutor |
|---|---|
| 1. Uncover prior knowledge and misconceptions before new learning | (Phase 2: readiness tutorials) |
| 2. Prepare for learning: activate, connect, preview | (Phase 2: readiness tutorials) |
| 3. Accountability for preparatory work | (Phase 2: preparation checks) |
| 4. Engagement with an AI tutor to unpack individual learning | **Concept tutorials**, worded for a learner working alone: no lectures, no classmates; teach-back is "explain it as if to someone who has never studied this". |
| 5. Feedback after engaging with new content, including telling the instructor how it landed | **Study debriefs** per material; NPS and comments after every tutorial. |
| 6. Apply learning in a safe, unassessed practice setting | (Phase 2: practice tutorials) |
| 7. Reflect on learning: metacognition, strategies | (Phase 2: reflection tutorials) |
| 8. Revisit and recall learning from weeks or months earlier | (Phase 2 and 3: recall tutorials and the learner model) |
| 9. Demonstrate learning and get feedback on drafts | (Phase 2: practice tutorials) |

With no cohort there is nothing to debrief, so the report's synthesis becomes a **course revision brief**: sticking points and misconceptions ranked by frequency across every completed run, with suggestions for which material or part of the brief to revise.

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
- **hasCohort** — teach-back audience (classmate vs "someone who has never studied this"), the no-peers rule, group debrief / cohort note vs course revision brief.
- **inPerson** — typing-first input with voice opt-in; the learner's own choice is remembered in the browser.
- **hasFixedDates** — nothing yet (weekly grouping and due dates arrive in Phase 7).

Per-course settings also hold a course level (ABE, undergraduate, graduate), a default pitch and the AI disclosure text.

---

## Architecture

- **LTI 1.3** via [`ltijs`](https://github.com/Cvmcosta/ltijs) (Express-based), Postgres-backed. Dynamic registration, deep linking, Assignment & Grade Services.
- **Backend** TypeScript + Node 20+, Postgres for app data. Migrations in `src/server/migrations`.
- **Frontend** one HTML file served by the launch handler; no build step. Markdown via marked + DOMPurify from a CDN.
- **AI** Anthropic Claude through the official SDK. Models per function from env. System prompt order is rules (one fixed string per delivery variant) → materials (cached) → brief + profile (cached) → progress note, so a turn mid-tutorial re-reads the materials from cache.
- **Cost tracking** every call writes model, tokens and USD to `api_call`; `/admin/costs?token=…` returns a JSON summary.

```
src/server/
  index.ts        entry: env → LTI → routes → deploy
  lti.ts          ltijs setup, launch, deep-linking picker, /healthz, /fullscreen, /admin/costs
  routes.ts       /api/* (student + instructor + deep-link response)
  delivery.ts     TRUFlex → { pacing, hasCohort, hasFixedDates, hasLiveSessions, inPerson }; unit tests alongside
  courses.ts      course_settings CRUD and the per-request CourseCtx
  tutorials.ts    materials, briefs, profiles, the staged dialogue, summaries, debriefs, AI draft
  grades.ts       AGS completion passback
  reqctx.ts       token / student / attribution / instructor gate helpers
  auth.ts         role detection from LTI claims
  anthropic.ts    SDK client + model selection
  costs.ts        price table + api_call recording + summary
  db.ts, migrate.ts, students.ts
  migrations/001_init.sql, 002_course_settings.sql
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
2. **Course materials** → paste a lecture's notes, a transcript or a chapter.
3. **Tutorials → New tutorial** → tick the material → type the topic → **Draft** → edit → set status **Published** → **Save**. **Try it as a student** previews it.
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
- **Materials are text.** Paste from slides, notes or a transcript. File upload and URL import are the obvious next step.
- **One deployment, many courses.** Everything is scoped by platform issuer + course id. Instructors only see their own course's materials, tutorials and reports.

## License

To be decided.
