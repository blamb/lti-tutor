# LTI Tutor: a guide for instructors

LTI Tutor runs short one-on-one conversations between a learner and an AI tutor, inside your Moodle course, following a brief you write. The tutor asks; the learner does the thinking. It never grades, never writes a learner's assignment, and never invents a course: everything it draws on comes from materials you put in.

This guide covers what you need to set one up and read what comes back. It is deliberately short. The README in the repository has the full detail.

---

## 1. Open the instructor view

Launch the tool from any place it sits in your course (or from the activity you used to register it). As a teacher you land on the **Instructor view**, with four tabs:

| Tab | What it is for |
|---|---|
| **Tutorials** | Create, edit and place sessions; read each one's report |
| **Course materials** | What the tutor is allowed to draw on |
| **Concepts** | What learners across the course have shown they understand and where they get stuck |
| **Course settings** | Delivery mode, reading level, course start, the disclosure learners see |

Set **Course settings** first, once. The delivery mode (TRUFlex) changes the tutor's wording everywhere: a self-paced course never hears "before class" or "your classmates". The **default pitch** sets reading level and tone for every session unless one overrides it.

---

## 2. Bring your course in

The best source of materials is the course itself. Under **Course materials** → **Import course backup**:

1. In Moodle, open the course, then **More → Course reuse → Backup**.
2. Untick **Include enrolled users** (the tool never uses user data, and the file is much smaller). Leave activities and files ticked.
3. Click **Jump to final step**, then **Continue**.
4. In the **Course backup area**, click **Download** on the newest file. It ends in `.mbz`.
5. Back in the tool, choose that file and click **Read the backup**.

You get a preview, unit by unit. Each unit's short labels have been merged into one *text* material and one *activities and study questions* material. Pages, readings (with the text of attached PDFs and Word files), links and assignments (with due date and rubric) are listed separately. Hidden items are shown but unticked. Fix any title, change what an item *is* if the guess is wrong, untick what you do not want, and click **Import selected**.

**Re-import any time.** Upload a newer backup after you change the course and the same materials are updated in place, not duplicated.

**What "what it is" means.** Every material carries one of four marks, and the tutor uses a material for what it is:

- **Reading, notes or transcript**: the tutor grounds its questions here and names the passage so learners can find it.
- **Activities and study questions**: the tutor reaches for these as its probes before inventing its own, and names them ("Exercise 1.2").
- **Assignment description and criteria**: treated as the task the learner must do, never as a source to teach from.
- **Other**: used lightly.

You can also **paste text**, **import a URL** (a web page or an open-textbook chapter from Pressbooks; "whole book" imports every chapter) or **upload a file** (.txt, .md, .html, .docx, .pdf). Each material holds up to about 200,000 characters.

Two limits worth knowing: a reading that exists in the course only as a link to a library database or a publisher site imports as a title and a link, not as text; and a scanned PDF has no text to read until it has been through OCR.

---

## 3. Create a session

**Tutorials → + New session.**

1. **Choose the kind.** This sets the shape of the conversation, the tutor's rules, and what the summary records. The field labels change to match.

| Kind | Use it when | Length |
|---|---|---|
| **Readiness check** | Before a unit: what do they already know or believe? Misconceptions are noted, not corrected. | 4–8 exchanges |
| **Preparation check** | After an assigned reading: did it land? Kind, not a quiz. | 4–8 |
| **Tutorial** | The core Socratic tutorial on one concept, ending with a teach-back. | 6–24 |
| **Practice** | They bring a draft or attempt; feedback against your criteria, a revision, one more prompt. Never a mark. | 6–24 |
| **Reflection** | After a unit: what was hard, what worked, what to change next time. | 4–8 |
| **Recall** | Revisit something from weeks ago: retrieve it from memory, then connect it to now. | 6–24 |
| **Assignment start** | They have opened an assignment and do not know where to begin. See section 4. | 6–24 |

2. **Tick the materials** this session may draw on. They are grouped by unit if they came from an import. The usual set is the unit's text and reading plus its activities and study questions.

3. **Click Draft.** Type the topic in a few words (rough notes are fine), and the tool writes the brief from your materials: learning goal, opening question, your notes to the tutor, misconceptions to listen for, what "got it" sounds like. It draws probes from the course's own activities first. Read it as you would a teaching assistant's draft and edit anything you would say differently. The brief is yours; the tutor follows it.

4. **Try it as a student** before you publish. Then **Save** with status *published*.

5. **Place it in the course.** In Moodle, add an **External tool** activity, pick LTI Tutor, and click **Select content**. Each published session appears as a choice; pick one and it becomes its own activity, titled with its kind ("Readiness check: Osmosis"). Put it where it belongs in the sequence: right after the lecture, under the reading, beneath the assignment.

6. **Gradebook, optionally.** Tick *gradebook* on the session and completion posts as 1/1. Only completion; never the content of the conversation.

Every session also has a **Paper version**: the same stages as a sheet the learner works through with a pen, for anyone offline. **Export course pack** bundles every paper version and every debrief template.

---

## 4. Helping a learner start an assignment

The **Assignment start** kind is for the moment a learner opens an assignment and freezes. The conversation runs:

1. **Unpack**: they restate what the assignment asks, in their own words; the tutor catches a misreading.
2. **Connect**: which reading and which activity bear on it? The tutor sends them to the passage rather than summarising it, and uses the unit's own exercises as prompts.
3. **Plan**: they choose an approach and name the parts, in order.
4. **First step**: they do the first step out loud, now: standardise the first argument, state the first claim, pick the passage they will analyse. The tutor responds with one strength and one question, and does not fix it.
5. **Wrap-up**: their plan and first step played back, and what to do next on their own.

**Nothing it produces is submittable.** The tutor's rules forbid writing any part of the assignment; the learner's screen says so; and if they ask it to, it declines and asks the question that lets them do it themselves. The summary you see records their understanding of the task, their plan, their first step and the sources they used, so you can see who is stuck before the due date.

To set one up: tick the unit's text and reading, its activities and study questions, and the assignment description (import marks it as such), choose **Assignment start**, and draft with a topic like "get started on Assignment 1". Place it under the assignment in Moodle. In a self-paced course the learner is also nudged toward it once the unit's earlier sessions are done.

---

## 5. What learners see

Learners launch a session from the course and talk to the tutor by typing or by voice; replies can be read aloud. When they click **Finish**, they get a short summary: what they figured out, where it got sticky, one next step. They can do a session again at any time.

Their home page shows every session, what is suggested next, and gentle nudges (a readiness check not done yet; a recall session whose concepts have gone a few weeks without a look). **My learning** shows what they have demonstrated across sessions, in their own terms, and is never shown to you. **About you** lets them tell the tutor their program, goals and interests so an example in ten can touch their world.

The first launch shows an **AI disclosure**: what the tutor is, what it keeps, who sees what, and a button to delete everything it holds about them. You can edit the wording in **Course settings**.

---

## 6. Reading the report

Open a session from **Tutorials** and click its report. For each learner you see when they ran it, how many exchanges, a mastery judgement in the kind's own terms (ready / partly ready / not yet; meets the criteria / getting there / needs work), what they showed they understood, where it got sticky, and their own rating of the session and of how well the course material prepared them for it. Download it as CSV.

**Generate debrief brief** turns every run of a session into one short note for you: the sticking points ranked by how often they came up, and what to revise. In a cohort course you can also write a short note back to the whole group and **deliver** it; learners see it under *From your instructor*. The **Concepts** tab does the same across the whole course.

---

## 7. Good habits

- **Draft, then edit.** The draft is a starting point written from your materials. The ten minutes you spend adjusting the probes and the "got it" criteria are the ten minutes that matter most.
- **Short sessions land better.** Fifteen minutes is the default and usually right. A readiness check is five.
- **One idea per session.** If the brief needs three learning goals, it is three sessions.
- **Re-import after changes.** When the course changes, make a new backup and import it; the materials follow.
- **Check the "what it is" marks** after an import. A study-questions label that the import read as plain text is the one thing most likely to need a fix, and it is a one-click change.

---

## 8. Coming next, and what it needs from your Moodle administrator

**Live sync with the course (needs web services).** Today the course comes in through a backup you make and upload. The next step is a live connection: the tool reads the course through Moodle's web services, so a **Sync** button refreshes materials and new assignments appear without a backup. This is the single most useful improvement still to make, and it cannot be done from the tool's side alone: **Moodle web services must be enabled by a site administrator**, and on moodbox they are currently off.

What to ask your administrator for, when you are ready:

1. Enable web services (*Site administration → Advanced features → Enable web services*; most institutional Moodles already have this on for the Moodle mobile app) and the REST protocol.
2. Create an external service named, say, **LTI Tutor course sync**, with only these read functions: `core_webservice_get_site_info`, `core_course_get_contents`, `mod_page_get_pages_by_courses`, `mod_book_get_books_by_courses`, `mod_label_get_labels_by_courses`, `mod_resource_get_resources_by_courses`, `mod_url_get_urls_by_courses`, `mod_assign_get_assignments`, `mod_forum_get_forums_by_courses`, `mod_lesson_get_lessons_by_courses`, `mod_glossary_get_glossaries_by_courses`. Nothing that touches users, grades or submissions, and nothing that writes.
3. Allow file download for the service (so attached PDFs can be read).
4. Issue a token for that service, either to each instructor who uses the tool or to one service account enrolled as a non-editing teacher in the relevant courses.

The instructor pastes the token into **Course settings** in the tool; it is stored encrypted and can be revoked in Moodle at any moment. If the administrator says no, the backup import keeps working exactly as it does now.

---

## Where things live

| Question | Where |
|---|---|
| The tool in Moodle | *Site administration → Plugins → External tool → Manage tools* |
| The tool's code and full documentation | `README.md`, `docs/` in the repository |
| Delivery modes and what changes with each | `docs/ALIGNMENT.md` |
| Accessibility notes | `docs/ACCESSIBILITY.md` |
| Hosting on Reclaim Cloud | `docs/reclaim-cloud.md` |
