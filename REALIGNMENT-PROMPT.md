> Historical: the brief the realignment was built from (October 2026). Paths below predate the split into `src/core`, `src/tutor` and `src/persona`; `src/server/x.ts` is now `src/tutor/server/x.ts` or `src/core/x.ts`, and `src/web/launch.html` is `src/tutor/web/launch.html`.

# Realign LTI Tutor for TRU: one tool across the TRUFlex delivery modes

You are working in the LTI Tutor repository (TypeScript, Node 20, Express via ltijs, Postgres, single-page frontend in `src/web/launch.html`, Anthropic SDK). Read `README.md`, `src/server/tutorials.ts`, `src/server/routes.ts`, `src/server/migrations/001_init.sql` and `src/web/launch.html` before changing anything.

## Why this work exists

LTI Tutor was built on the Paski pattern: live lecture, then a one-on-one AI tutorial, then a group debrief run by faculty with a cohort. That pattern stays, because most TRU courses are scheduled and instructor-led. But TRU's Open Learning division has set a second target that the tool must serve equally well: continuous-entry, self-paced courses. The tool therefore needs to know a course's **TRUFlex delivery mode** (TRU's own framework, https://www.tru.ca/current/enrolment-services/course-registration/flex.html) and adapt, sharing one codebase, one deployment and one set of tutorial kinds.

The ten TRUFlex modes collapse into three **pacing** categories for this tool:

| pacing | TRUFlex | what it means | cohort | fixed dates | live sessions |
|---|---|---|---|---|---|
| `scheduled` | 1 to 8 | Instructor-led at scheduled times: in person (1 to 3), blended (4 to 6), multi-access (7), fully online with web conferencing (8). | yes | yes | yes |
| `paced` | 10 | Fully online, independent learning, semester start and end dates, part of a cohort of online students, no set meeting times. | yes | yes | no |
| `self_paced` | 9 | Fully online, independent, flexible start date, up to 30 weeks to complete, no scheduled classes, no cohort. The former print mode was a Flex 9 variant with online resources removed. | no | no | no |

Two further distinctions inside `scheduled` matter to the tool: whether the course is **in person** (1 to 7, where a learner may launch a tutorial in a room full of people, so text input should be the default and voice opt-in) or **online** (8), and nothing else. Do not build ten behaviours; build three pacing behaviours plus the in-person voice default.

**Scheduled mode** is the current behaviour. Keep everything that serves it.

**Paced mode** is new and sits between the other two: there is a cohort and a weekly schedule, so weekly grouping, due dates and a cohort-wide debrief all make sense, but there is no live session, so the instructor's debrief reaches learners as a written note rather than being delivered in class.

**Self-paced mode** is the Open Learning target. The learner in this mode:

- is **self-paced and independent**: continuous entry, flexible start date, end date about 30 weeks later, no scheduled live sessions, no required dates;
- has **no student-to-student engagement** of any kind: no peers, no teamwork, no classmates;
- usually has reliable internet, but the design must **degrade to limited or no internet** (for example an incarcerated learner, or a remote learner with no connection at any point in the course);
- must experience learning as **discovery and uncovering content** rather than digesting pre-delivered content and answering questions about it;
- must get an experience that **needs few or no accommodations**, following the BCcampus Accessibility Toolkit;
- gets content from **open textbooks and OER only** (BC Open Collection, Pressbooks), never publisher resources;
- ranges from **Adult Basic Education** (high-school completion in English, math, biology, chemistry, physics) through undergraduate English (ENGL 1001/1101) to MBA courses. Reading level and tone must adapt.

TRU describes five orchestrated agents. This tool is the **Coaching/Tutoring and Adaptable Learning agent** (prompts and questions, never answers; voice and written input) and part of the **Personalized Learning agent** (personalized debriefs). It should also grow a **Practice and Feedback** capability (feedback on draft thinking and work, sample questions for practice). The Assessment agent and the Course Development agent are out of scope for this repository.

TRU names nine kinds of engagement that the course must create. Treat this list as the feature spec:

1. Uncover prior knowledge, skills and misconceptions before new learning.
2. Prepare for learning: activate existing knowledge, connect old to new, preview what is coming.
3. Accountability for preparatory work: did they do the reading, what did they get wrong.
4. Engagement with an AI tutor to unpack individual learning and explore perspectives.
5. Feedback after engaging with new content, including the learner telling the instructor how well it landed.
6. Apply learning in a safe, unassessed practice setting.
7. Reflect on learning: metacognition, learning strategies, self-regulation.
8. Revisit and recall learning from weeks or months earlier (spiral curriculum).
9. Demonstrate learning and get feedback on drafts and components of larger assessments.

## Ground rules

- Keep the LTI 1.3 architecture (ltijs, deep linking, AGS). Do not alter `src/server/lti.ts` registration behaviour except where a phase below says so.
- All existing features must keep working. Add migrations as new numbered files under `src/server/migrations/`; never edit `001_init.sql`.
- Keep the system prompt layering (rules, cached materials, cached brief and profile, progress note) and the cost recording in `api_call`.
- Typing must remain a full equivalent of voice everywhere. Never gate a feature on the microphone.
- Every course has a `truflex` number (1 to 10) and a derived `pacing` of `scheduled`, `paced` or `self_paced` (Phase 1). Gate behaviour on three derived booleans, `hasCohort`, `hasFixedDates` and `hasLiveSessions`, never on the raw number, so a future TRUFlex revision is a one-line change. In `self_paced` mode nothing may require a second learner, a scheduled time or a live session.
- Do not fork the code into separate tools. Mode differences live in prompt text, stage templates, the learner's home view and the instructor report, all keyed on the course setting.
- Run `npm run typecheck` (add the script if it is missing) after each phase. Commit after each phase with a message describing the phase.
- Update `README.md` as you go: keep the "Paski versus LTI Tutor" table under a Scheduled courses heading, add a "TRU engagement types versus LTI Tutor" table under a Self-paced courses heading, and a short Paced courses section explaining what it inherits from each, by the end.

Work through the phases in order. Finish one before starting the next. If a phase is blocked, say so and continue with the next.

## Phase 1: Make delivery mode explicit

1. Add a `course_settings` table keyed on `(lti_iss, lti_context_id)` with `truflex smallint not null default 3 check (truflex between 1 and 10)`, `course_level text` (`abe`, `undergraduate`, `graduate`), `pitch_default text`, and `ai_disclosure text`. Add a pure function `deliveryOf(truflex)` in a new `src/server/delivery.ts` returning `{ pacing, hasCohort, hasFixedDates, hasLiveSessions, inPerson }` per the table above, with unit tests for all ten values. Add an instructor **Course settings** panel in `launch.html` with a TRUFlex selector that shows the mode's one-line description from the TRU page, so instructors recognise their own course. Default new courses to Flex 3 (on campus, scheduled) so existing behaviour is unchanged. If the LTI launch carries a custom parameter `truflex`, use it as the initial value so Moodle course templates can set it.
2. Pass the delivery object into `CourseCtx` and make `TUTORIAL_RULES` a function of pacing. Where `hasLiveSessions` is false (paced and self-paced), remove every reference to lectures and live follow-up: ORIENT must not assume the learner just attended anything. Where `hasCohort` is false (self-paced only), also remove classmates: TEACH-BACK asks the learner to explain the idea "as if to someone who has never studied this". In `scheduled` mode keep the current wording. Keep the rules block cacheable: one string per pacing, not per learner.
3. Rename the "lecture debrief" to a **study debrief** where `hasLiveSessions` is false and keep "lecture debrief" otherwise. Use one implementation with mode-dependent labels and prompt wording.
4. Keep `generateGroupDebrief` where `hasCohort` is true. In `scheduled` mode it stays a brief for the live follow-up. In `paced` mode change its output shape: no discussion prompts for the room, instead a **cohort note** the instructor can post to the cohort (what the group found hard, one explanation worth reading, one thing to review) plus the instructor-only observations. Add a **course revision brief** where `hasCohort` is false: aggregate sticking points and misconceptions across all completed runs, rank them by frequency, and suggest which material or brief to revise. The report page shows whichever matches. Record them in `api_call` as `tutorial.group_debrief`, `tutorial.cohort_note` and `tutorial.revision_brief`.
5. Where `inPerson` is true, default the learner's input mode to typing and make voice opt-in with a one-line hint, since the learner may be in a classroom. Elsewhere keep the current voice-forward default. Remember the learner's choice in `localStorage`, wrapped in try/catch.
6. Add a `pitch` field to the tutorial brief (`tutorial.pitch`, text, default empty) with placeholder guidance such as "Adult Basic Education reading level, short sentences, everyday examples" or "upper-year undergraduate". Inject it into `tutorialBrief()`. The AI draft (`draftTutorialBrief`) must accept and honour a pitch, defaulting to `pitch_default` from course settings.

## Phase 2: Tutorial kinds

Add `tutorial.kind` with these values, each with its own stage template, its own summary schema and its own AI-draft system prompt. The existing behaviour becomes `concept`. All kinds are available in every mode; only the wording changes. Where `hasFixedDates` is true a `preparation_check` may refer to "this week's reading"; where `hasLiveSessions` is true a `readiness` check may say "before Thursday's class"; in `self_paced` mode neither.

| kind | engagement types served | shape |
|---|---|---|
| `readiness` | 1, 2 | Short diagnostic conversation before a unit. Probes prior knowledge and surfaces misconceptions. Ends by telling the learner what to pay attention to in the upcoming material. Summary records prior-knowledge level and specific misconceptions. |
| `preparation_check` | 3 | After an assigned reading. Checks recall of the key ideas without quizzing in a gotcha way, asks the learner to connect one idea to something they already know. Summary records whether the preparation was done and which ideas did not land. |
| `concept` | 4, 5 | The current orient, explore, teach-back, wrap-up tutorial. |
| `practice` | 6, 9 | The learner brings a draft, a worked attempt or an answer to a practice scenario (pasted text, or spoken). The tutor gives feedback against the brief's success criteria, asks questions to help them improve it, and offers one more practice question or scenario. Never assigns a grade. Summary records strengths, the top areas to improve, and whether the learner revised during the session. |
| `reflection` | 7 | A short metacognitive conversation after a unit: what was hard, what strategy worked, what they would change, how they know they understand. Summary records the learner's own words on strategy and a suggested next action. |
| `recall` | 8 | Revisits earlier learning. The brief lists which earlier tutorials or materials it draws on. The tutor opens with a retrieval prompt, then connects the old idea to the current unit. Summary records what was retained and what had faded. |

For each kind:

- `stageFor()` must become kind-aware. `readiness` and `preparation_check` are short (target 4 to 8 exchanges) and have no teach-back. `practice` has stages SHARE, FEEDBACK, REVISE, MORE-PRACTICE, WRAP-UP. `reflection` has stages OPEN, PROBE, PLAN, WRAP-UP. `recall` has stages RETRIEVE, CONNECT, WRAP-UP.
- The `TutorialSummary` zod schema becomes a discriminated union on `kind`; keep `mastery`, `understood`, `sticking_points`, `next_step` and `student_note` in every variant so the report and the learner model can treat them uniformly.
- The instructor's tutorial editor gets a kind selector that changes the field labels and placeholders. For `practice`, add a `practice_prompts` text field (sample questions or scenarios the tutor may offer). For `recall`, add `recall_tutorial_ids bigint[]` so the brief can point at earlier tutorials.
- Deep-link titles and the picker in `src/server/lti.ts` must show the kind, so an instructor placing activities in Moodle can tell them apart.
- The "Draft it with AI" flow must produce a draft appropriate to the kind.

## Phase 3: A learner model that spans tutorials

Add a `learner_model` table: `student_id`, `lti_iss`, `lti_context_id`, `concept text`, `status text check in ('secure', 'developing', 'fragile', 'misconception')`, `evidence text`, `source_tutorial_session_id`, `first_seen`, `last_seen`, unique on `(student_id, lti_iss, lti_context_id, concept)`.

- `completeTutorialSession()` must, after producing the summary, make one additional small model call that maps the summary onto concept entries (new or updated) and writes them. Record it in `api_call` with endpoint `tutorial.learner_model`.
- Build a `learnerModelBlock()` and inject it into the system prompt after the profile, so every tutorial knows what this learner has already shown. Keep it short (cap at about 40 concepts, most recent first) and inside the cached block.
- `recall` tutorials must pull candidate concepts from the learner model whose `last_seen` is oldest or whose status is `fragile` or `misconception`, and the tutor must be told which ones to prioritise.
- Add a learner-facing **My learning** panel in `launch.html`: what they have shown they understand, what is still developing, what the tutor suggests revisiting, and the date they last touched each. Plain language, no jargon such as "learner model". Learners can delete any entry.
- Add an instructor report view that aggregates concept statuses across the course without naming learners. Where `hasFixedDates` is true, also break it down by week of the course (derived from `started_at` and the course start date from the LTI context, if available) so an instructor can see what the class as a whole is carrying forward.

## Phase 4: Materials from open sources

- Add material import by **URL**. Fetch the page server-side, extract readable text (strip navigation and scripts), store the source URL and a `license` field. Detect Pressbooks sites (BCcampus open textbooks are Pressbooks) and use the Pressbooks REST API (`/wp-json/pressbooks/v2/`) to import a chapter or a whole book as separate materials with chapter titles.
- Add material import by **file upload**: `.txt`, `.md`, `.html`, `.docx`, `.pdf`. Extract text server-side. Respect `MATERIAL_MAX_CHARS` and tell the instructor when a file was truncated.
- Add `material.source_url`, `material.license`, `material.attribution` and show them in the instructor's materials list. In the tutor rules, instruct the model to cite the material title when it refers to course content, so learners can find the passage in the open textbook.
- Add a note in the instructor materials view that TRU Open Learning uses open educational resources only, and link to the BC Open Collection.

## Phase 5: Offline and low-bandwidth outputs

Nothing conversational works without a connection. What the tool can do is produce printable, self-contained artifacts from the same briefs, so that an offline learner gets the same learning design on paper. This phase is required for `self_paced` mode (Flex 9 is the mode the former print delivery grew out of) and is available in the other modes as a bonus (a printed script is also a useful in-class handout).

- For every published tutorial, generate a **paper tutor script**: a printable document that walks the learner through the same stages on their own. For `concept`: the opening question, the probes from the TA brief rewritten as questions with space to write, the misconceptions rewritten as "check yourself" prompts, a teach-back prompt ("explain this in writing to someone who has never studied it"), and the success criteria as a self-check list. Equivalent structures for the other kinds. Store it in a `tutorial_print` table and regenerate when the brief changes. Record the call in `api_call`.
- Study debriefs and their self-test questions must be printable and downloadable as a single HTML file with inline CSS and no JavaScript.
- Add an instructor action **Export course pack**: one zip containing every published tutorial's paper script, every material's study debrief template (non-personalised version), and a plain-text index. This is what Open Learning sends to the print shop or loads on an offline device.
- Add a print stylesheet to `launch.html` and make sure the tutorial transcript prints cleanly, so a learner on an intermittent connection can keep a record.
- Make the frontend work on a slow connection: no CDN dependency that blocks rendering, lazy-load marked and DOMPurify, show the transcript before the libraries arrive, and keep the page under 200 KB before fonts.

## Phase 6: Accessibility

Audit `launch.html` against WCAG 2.1 AA and the BCcampus Accessibility Toolkit, and fix what you find. At minimum:

- Streaming tutor replies must be announced through an `aria-live="polite"` region, and the Speak button must have an accessible name that reflects its state.
- Every control must be keyboard reachable with a visible focus ring, in a sensible tab order. Add a skip link.
- Text contrast at least 4.5:1 in both light and dark themes. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Spoken replies must have a visible transcript at all times. Voice input must have a visible text equivalent of what was recognised, editable before sending.
- Add a learner-adjustable text size and line spacing control that persists in `localStorage`, wrapped in try/catch.
- Headings must form a proper outline. Markdown rendered from the model must not produce skipped heading levels; post-process if needed.
- Document the audit in `docs/ACCESSIBILITY.md` with what was checked, what was fixed and what remains.

## Phase 7: Progression and instructor signals, per mode

Shared:

- Add an instructor **learner-feedback** signal: at the end of every tutorial, after the NPS question, ask one optional question, "How well did the course material prepare you for this?", with a 1 to 5 answer and an optional comment (engagement type 5). Show it in the report next to NPS.
- Add CSV export of the report (one row per run, no learner names, with kind, mastery, sticking points, NPS, preparedness).

Self-paced (Flex 9):

- Add an optional `tutorial.suggested_after_tutorial_id` so the learner's home view can show "suggested next" without enforcing order. Nothing in the tool may lock a tutorial behind another; Moodle's own restrict-access handles that if the instructor wants it.
- Add a **nudge** list in the learner's home view: readiness checks not yet done for the unit they are in, recall tutorials whose source concepts have gone stale (last_seen older than 21 days), and reflections not yet done after completed concept tutorials. Purely advisory, no dates.

Where `hasFixedDates` is true (Flex 1 to 8 and 10):

- Add an optional `tutorial.week` integer and an optional `tutorial.due_at` timestamp (informational, not enforced by the tool; AGS passback is unchanged). The learner's home view groups tutorials by week and shows "this week" first.
- Nudges are date-aware: "due this week", "the cohort moved on, recall this before next week".

Where `hasCohort` is true (Flex 1 to 8 and 10):

- The instructor can mark a group debrief or cohort note as "delivered", after which learners see a short **after-session** note in their home view generated from it (what the group found hard, one thing to review). In `paced` mode this note is the only way the debrief reaches learners, so make it readable on its own; in `scheduled` mode it recaps what was said live. Record the call in `api_call` as `tutorial.after_session_note`.

## Phase 8: Sovereignty and disclosure

- Read `ANTHROPIC_BASE_URL` from the environment and pass it to the SDK client in `src/server/anthropic.ts`, so the same build can point at an Anthropic-compatible sovereign endpoint. Document it in `.env.example` and the README.
- Use the per-course **AI disclosure** text from `course_settings` (added in Phase 1), with a sensible default explaining that the tutor is an AI, what it stores, that voice may be processed by the browser vendor's speech service, and that typing is always available. Show it the first time a learner launches and keep it one click away.
- Add a learner action to delete their own profile, learner model and transcripts for the course.
- Add a `data_retention_days` site setting from the environment, and a nightly job that deletes `tutor_turn` rows older than that while keeping summaries.

## When you are done

Produce a short `docs/ALIGNMENT.md` with three sections. **Self-paced (Flex 9):** map each of the nine engagement types to the feature that serves it, list what remains unserved, and state what the tool deliberately does not do in this mode: no student-to-student features, no live sessions, no dates. **Paced (Flex 10):** state what it inherits from each of the other two and how the cohort note replaces the live debrief. **Scheduled (Flex 1 to 8):** map the Paski sequence (live session, tutorial, group debrief) to the features that serve it and list what changed, including the in-person text default. In all three: no grading of assessments, no course generation.

Finish with a table of every behaviour that differs by `pacing`, `hasCohort`, `hasFixedDates`, `hasLiveSessions` or `inPerson`, and where in the code the switch happens, so a future developer can find all of them.
