# Alignment with TRU's delivery modes

How LTI Tutor serves the three pacing categories that TRU's ten TRUFlex modes collapse into (`src/tutor/server/delivery.ts`). In all three: the tool never grades an assessment (practice sessions give feedback and refuse marks; gradebook passback is completion only, 1/1) and never generates a course (materials come from the instructor; the AI drafts a brief the instructor edits).

## Self-paced (TRUFlex 9)

Open Learning's continuous-entry courses: flexible start, up to 30 weeks, no cohort, no classes, no dates. TRU names nine kinds of engagement; this is how each is served.

| TRU engagement type | What serves it | Where |
|---|---|---|
| 1. Uncover prior knowledge, skills and misconceptions before new learning | **Readiness check** sessions: 4–8 exchanges, diagnostic not instructional, misconceptions noted without correction, summary records prior knowledge and misconceptions voiced. Nudged when not yet done and whatever it follows is done. | `kinds.ts` (readiness), `progress.ts` |
| 2. Prepare for learning: activate, connect, preview | The same readiness check: informal prior knowledge counts; the wrap-up tells the learner what to watch for in the material. Paper version ends with "note two things that surprised you". | `kinds.ts`, `print.ts` |
| 3. Accountability for preparatory work | **Preparation check** sessions after a reading: recount the key ideas, connect one to something known; a learner who has not read is told so kindly and the summary records `preparation_done`. | `kinds.ts` (preparation_check) |
| 4. Engagement with an AI tutor to unpack individual learning and explore perspectives | **Tutorial** (concept) sessions worded for a learner alone: discovery framing, no lecture or classmates assumed, teach-back "as if to someone who has never studied this". The learner model tells the tutor what this learner has already shown. | `tutorials.ts` `buildTutorialRules`, `kinds.ts` concept, `learner.ts` |
| 5. Feedback after new content, including telling the instructor how it landed | **Study debriefs** per material (personalised, printable, downloadable); after every session the NPS rating and "how well did the course material prepare you for this?" (1–5, comment), both in the instructor's report and CSV. | `tutorials.ts` `generateDebrief`, `recordPrep`, `reportCsv` |
| 6. Apply learning in a safe, unassessed practice setting | **Practice** sessions: the learner pastes or speaks a draft or attempt; feedback against the brief's criteria (two strengths, one thing to improve as a question), a revision, one more prompt. Never a mark. | `kinds.ts` (practice) |
| 7. Reflect on learning: metacognition, strategies, self-regulation | **Reflection** sessions: what was hard, what strategy worked, how they know they understand, one concrete change. The summary keeps the learner's own words. Nudged after completed sessions. | `kinds.ts` (reflection), `progress.ts` |
| 8. Revisit and recall learning from weeks or months earlier | **Recall** sessions: retrieval first (smallest cue if blank), then connection to the current unit; the brief points at earlier sessions and the learner model supplies concepts that are fragile, misconceived or longest unseen. Nudged when source concepts have gone 21 days without a look. | `kinds.ts` (recall), `learner.ts` `recallCandidates`, `progress.ts` |
| 9. Demonstrate learning and get feedback on drafts and components of larger assessments | **Practice** sessions on components of an assessment, with `practice_prompts` for more. Feedback only; the assessment itself is elsewhere. **Assignment start** sessions for the moment before any draft exists: unpack the task, connect it to the readings and the unit's activities, plan, take the first step out loud. Nothing produced is submittable; the summary records the learner's understanding, plan and first step. | `kinds.ts` (practice, assignment_start) |

Also for this mode: the **course revision brief** replaces any group debrief (sticking points ranked by frequency across all runs, what to revise); **paper versions** of every session and **debrief templates** for every material, bundled by **Export course pack**, so a learner with limited or no connection gets the same design on paper; materials from **open sources** (URL and Pressbooks import, file upload, licence and attribution carried), each marked for what it is so the course's own **activities and study questions** become the tutor's probes before it invents any, and the **course import**, from a backup or live through Moodle web services, that brings a Moodle course in unit by unit with those marks already set; the **pitch** and **course level** so an ABE learner and an MBA learner get the right register; the accessibility work in `docs/ACCESSIBILITY.md`.

**What remains unserved or partial.** Voice input and read-aloud need a connection and a supported browser; offline, the paper versions are the fallback and there is no spoken paper version. The learner model is per course, so a concept met in an earlier course does not carry over. "The unit they are in" is approximated by the session they last completed and the `suggested_after` chain, since self-paced courses have no unit structure in the tool. There is no human-in-the-loop escalation to an Open Learning Faculty Member from inside a session; the tutor points the learner to their instructor in words.

**What the tool deliberately does not do in this mode.** No student-to-student features of any kind: no peers, classmates, cohort, discussion prompts or group debrief, and the tutor is instructed never to mention them. No live sessions: no "before class", no lecture debriefs, no "mark as delivered". No dates: no weeks, due dates, "this week" grouping or date-aware nudges; the nudges that remain are advisory and undated. Nothing is locked behind anything else.

## Paced (TRUFlex 10)

A semester with start and end dates and a cohort of online learners, but no scheduled classes.

**From self-paced it inherits** the independent-learning wording (no tutorial assumes the learner just attended anything; the session is framed as discovery), study debriefs rather than lecture debriefs, the paper versions and course pack, and the undated readiness, recall and reflection nudges.

**From scheduled it inherits** the cohort: teach-back "as if to a classmate who has not reached this topic yet", a synthesis across the cohort's runs, the "cohort has moved on" nudge, and the fixed-dates machinery: a course start date, sessions with a week and a due date, the home view grouped by week with "this week" first, due-date nudges, and the concepts report broken down by week.

**How the cohort note replaces the live debrief.** With no live session, `generateGroupDebrief` produces a **cohort note** instead of a debrief brief: a note in the instructor's voice, ready to post, with what the group found hard, one explanation worth reading in full, and one thing to review, plus instructor-only observations (recorded as `tutorial.cohort_note`). **Post to the cohort** marks it delivered and writes a short **after-session note** (`tutorial.after_session_note`) that every learner sees in "From your instructor" on their home view. Because nothing is said live, that note is written to stand on its own.

## Scheduled (TRUFlex 1 to 8)

The Paski sequence as built: live lecture, one-on-one tutorial, group debrief run by faculty with the cohort.

| Paski step | What serves it | Where |
|---|---|---|
| Live lecture | **Course materials** (notes, transcripts, readings, imported chapters) ground every session; **lecture debriefs** recap a lecture for each student with one personal section; readiness and preparation checks can say "before the next class" and "this week's reading". | `tutorials.ts` materials and `generateDebrief`, `kinds.ts` `timing()` |
| One-on-one tutorial | **Tutorial** sessions in the original orient → explore → teach-back → wrap-up shape, voice or text, deep-linked into the course right after the lecture, with completion passback. Readiness, preparation, practice, reflection and recall sessions are available too. | `kinds.ts`, `lti.ts` deep linking, `grades.ts` |
| Group debrief with faculty | The instructor's **report** aggregates summaries; **Generate debrief brief** (`tutorial.group_debrief`) gives what landed, where they stuck, misconceptions, 3–5 discussion prompts and a one-minute re-teach for the room. After the live debrief, **Mark as delivered in class** gives learners a short recap note. | `tutorials.ts` `generateGroupDebrief`, `deliverDebrief` |

**What changed for scheduled courses in this realignment.** The in-person text default: in Flex 1 to 7 a learner may open a session in a classroom, so typing is the default, voice is opt-in with a one-line hint, and the learner's own choice is remembered. Sessions have kinds, a pitch, a week and a due date; the home view groups by week; the report shows preparedness and exports CSV; the learner model follows the profile into every prompt and the Concepts tab shows the class by week; every session has a paper version; the accessibility baseline applies; the AI disclosure is shown on first launch. The tutor rules are otherwise the original wording (classmate who missed the lecture, lecture debriefs, discussion prompts for the room).

## Every behaviour that differs by mode

The raw TRUFlex number is interpreted only in `deliveryOf()` (`src/tutor/server/delivery.ts:70`). Everything else keys on `pacing` or the four booleans. Line numbers are as of the Phase 8 commit.

| Switch | Behaviour | Where |
|---|---|---|
| `hasLiveSessions` | Tutor rules: without live sessions, rule 8 frames the session as discovery and forbids any mention of a lecture, class, live session or follow-up | `tutorials.ts:524` (`buildTutorialRules`) |
| `hasLiveSessions`, `hasCohort` | Rules cache key: one fixed string per (kind, variant), so prompts stay cacheable | `tutorials.ts:550` (`tutorialRulesFor`) |
| `hasLiveSessions` | Concept ORIENT assumes nothing was attended; TEACH-BACK audience: "classmate who missed the lecture" / "classmate who has not reached this topic" / "someone who has never studied this" | `kinds.ts:147–152` |
| `hasLiveSessions`, `hasFixedDates` | Kind wording: "before the next class" / "this week's reading" / "before the next section" | `kinds.ts:29–30` (`timing()`), used by readiness and preparation_check |
| `hasCohort` | Tutor rule 9: no classmates, peers, cohort or group work mentioned | `tutorials.ts:527` |
| `hasLiveSessions` | Lecture debrief vs study debrief: prompt and `api_call` endpoint | `tutorials.ts:1201` (`generateDebrief`) |
| `hasLiveSessions` | Labels "lecture debrief(s)" / "study debrief(s)" | `delivery.ts:94–95` (`deliveryLabels`), `lti.ts:189` (picker text), `launch.html:625` (`applyDeliveryLabels`) |
| `hasCohort`, `hasLiveSessions` | Synthesis kind: group debrief brief / cohort note / course revision brief, prompts and endpoints | `tutorials.ts:883` (`debriefKindFor`), `:948–954` (`generateGroupDebrief`); `routes.ts:100, 692`; `launch.html:618, 636` |
| `hasCohort` | "Mark as delivered" offered, after-session notes listed for learners; refused without a cohort | `routes.ts:182, 694, 722`; `launch.html:844` |
| `hasLiveSessions` | After-session note framing: recap of the live debrief vs standalone; button wording | `tutorials.ts:1040` (`deliverDebrief`); `launch.html:1784–1785` |
| `hasLiveSessions` | Debrief template wording for the course pack | `print.ts:156` (`ensureDebriefTemplate`) |
| `inPerson` | Typing-first input with voice opt-in and a one-line hint; learner's choice remembered | `launch.html:1244, 1251` (`inputMode`, `applyInputMode`) |
| `hasFixedDates` | Course start date field shown; editor's week and due date fields shown and sent | `launch.html:635, 1651, 1667–1668` |
| `hasFixedDates` | Concepts report broken down by week | `routes.ts:495–498`; `learner.ts` `courseConceptsByWeek` |
| `hasFixedDates` | Home view grouped by week with "this week" first; due-date chip on sessions | `progress.ts:91–93`; `launch.html:797` |
| `hasFixedDates` | Date-aware nudges: "due …", "was due … and is still open"; readiness nudge names the week | `progress.ts:111, 135` |
| `hasFixedDates`, `hasCohort` | "The cohort has moved on from week N" nudge; recall nudge mentions the cohort | `progress.ts:119, 151` |
| `hasCohort` | Default AI disclosure: who sees what | `courses.ts:108` (`defaultAiDisclosure`) |
| `pacing` | Human name in the course pack index | `delivery.ts:96` (`deliveryLabels`) |
| `pacing` (none) | Kinds themselves, the learner model, materials import, paper versions, accessibility, retention and deletion do not vary by mode; only their wording does, through the switches above | — |
