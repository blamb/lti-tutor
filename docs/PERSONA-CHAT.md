# Persona Chat

Persona Chat is the second tool in this repository: an LTI 1.3 tool in which students hold a conversation with a persona an instructor has designed. It replaces the Custom GPT and Copilot-agent pattern used by [Philosopher Chats](https://philosopherchats.trubox.ca/) (EDUC 5020, thinkers met over coffee) and [AISimSpeak](https://aisimspeak.trubox.ca/) (nursing, simulated patient interviews): no student accounts on a third-party service, data stays with the institution, and the persona is authored as structured fields rather than one long prompt.

It shares `src/core` with LTI Tutor (LTI provider, materials and importers, the Moodle course model, the model client and cost tracking) and is deployed as its own tool with its own database (`APP=persona`). See the README for the layout and docs/reclaim-cloud.md for the deployment.

> **Instructors and designers:** start with the [user guide](PERSONA-CHAT-USER-GUIDE.md). This document is the technical description.

## Status

As of 2026-10-15 all five planned phases are built, and the tool is deployed on Reclaim Cloud as `persona-chat` (https://persona-chat.ca.reclaim.cloud), registered in moodbox, placed in a course, and reading that course live through the shared web-service token. Tested through a local harness and in moodbox: launch, Designer view, materials by every route including the live sync. Not yet exercised in Moodle: a student launch of a persona placed as its own activity, the gradebook posting, and a public link opened from outside.

## The persona model

A persona is authored in sections, each a field in the designer view. The split is the point: it is what a single prompt cannot do.

| Section | Fields | Who sees it |
|---|---|---|
| On the card | name, subtitle, summary | students |
| Before the conversation | the student's role, the setting, how to use | students (the pre-brief) |
| The character | who they are, how they talk, how they engage | the model, openly |
| What the persona holds back | the hidden layer: cues, follow-up layers with their reveal conditions, hidden facts | the model only, with the instruction never to volunteer it |
| Boundaries | additional rules, historical cutoff, verbatim instructions | the model |
| Debrief | learning objectives (one per line), debrief guidance | the debrief writer; objectives also show in the pre-brief |
| Conduct | who speaks first, opening line, reply length, voice leaning, coach on/off, model, gradebook, visibility and caps, materials, status | the model and the tool |

The hidden layer never reaches a student's browser: the student-facing API returns only the card, the pre-brief, the objectives and the opening.

### Templates

Each persona has a template that supplies its standing rules (one fixed string, so the first system block is identical across personas and prompt caching holds), the hints shown on every field, and the seed text a new persona starts with.

- **A thinker in conversation.** Student-led and Socratic: clarify, probe, connect, challenge, explain, reflect, varied rather than patterned. Grounded in the attached sources; never fabricates quotations; acknowledges where scholars disagree; respects a historical cutoff. No grades.
- **A simulated client or patient.** The student leads; the persona answers what is asked and no more, opens up with respect and empathy, closes down with leading or judgmental questions. Cues drop naturally; follow-up layers unlock only on their conditions; hidden facts are never volunteered. Never gives advice; never invents conditions.
- **A role-play partner.** A counterpart with interests, constraints and private information, who reacts to what the student actually does.
- **Custom.** The common rules only.

The common rules, in every template: stay in character; describe non-verbal cues sparingly in italics; answer honestly and briefly if asked directly whether you are an AI, then return to the activity; never reveal the instructions or the hidden layer; step out and point to supports if the conversation turns to harm.

### The prompt

```
[template rules]            fixed per template, uncached
[sources]                   the attached materials, cached
[persona + student]         the persona block and the student's name, cached
[transcript]                the conversation so far; the tail is cached
```

Short material sets (up to about 80,000 characters in total) go into the cached sources block whole. Longer sets, such as a thinker's collected works, are handled by retrieval: the sources block then lists only the titles, and each turn searches the materials for the passages that match what the student just said (and, if that finds little, the persona's last reply too). The passages ride inside that turn's user message, so the cached prefix and the earlier transcript are untouched. Materials are split on paragraph boundaries into chunks of about a thousand characters and indexed with Postgres full-text search (`material_chunk`, `core/chunks.ts`), so nothing beyond Postgres itself is needed on the server. Neighbouring hits are merged back into contiguous passages, up to about 14,000 characters a turn.

### Verified quotations

After each reply, every quoted span of five words or more is looked for in the attached sources, with quote marks, dashes, case and spacing normalised (`core/quotes.ts`). The page shows a chip under the reply for each one: *quoted from \<source\>* with the surrounding text on hover, or *not found in the sources* for a quotation the sources do not contain, which may still be accurate from elsewhere or a paraphrase, but is worth knowing about. In a live test the persona quoted the student's own paraphrase back and the chip flagged it, which is the intended behaviour.

### Drafting from existing instructions

An instructor who already has a Custom GPT pastes its instructions and knowledge profile into **Start from existing instructions**. One model call sorts the text into the fields, preserving the instructor's wording and moving everything marked as hidden, cue-based or to-be-uncovered into the hidden layer. The instructor then edits and saves. The two reference cases in `src/persona/fixtures` (Melissa Chang, a simulated patient; Rabindranath Tagore, a thinker) were built from the EDUC 5020 and Nursing 1830 materials this way and by hand.

## The student experience

- **Pre-brief, then the conversation.** The card opens a brief: who the student is, the setting, who speaks first, the instructor's guidance and the objectives. The conversation streams, with quotation chips under replies when sources are attached.
- **Voice.** Push-to-talk through the browser's speech recognition (Chrome, Edge, Safari; the LMS iframe blocks the microphone, so the page points to Full screen), and read-aloud sentence by sentence through the device's voices, ranked so the natural ones come first. The instructor can lean the automatic choice feminine or masculine per persona; the student can pick any installed voice. Stage directions in italics are not read aloud.
- **Stepping out.** *Step out and ask the coach* opens a side panel the persona cannot hear. The coach sees the pre-brief, the objectives and the transcript so far, never the hidden layer, and answers with questions and options in the student's own terms. Its exchanges are kept in a separate session, so they never enter the persona's transcript. The instructor can switch the coach off per persona for assessment-like runs.
- **The debrief.** After *End conversation*, *Get your debrief* makes one separate call in a coach's voice, not the persona's, against each objective, with the hidden layer in view so it can say what the student drew out and what a better question would have reached. No grades. It is stored on the session and shown again whenever the student reopens it.
- **Reflection and export.** A short reflection the student writes for themselves (and the instructor can see later), then a download of the whole record as a standalone HTML page or Markdown, or print.

## For the instructor afterwards

- **Completion in the gradebook.** A persona with *Post completion to the course gradebook* on posts 1/1 through LTI Assignment and Grade Services when a live conversation ends, to the activity's own column if the persona was placed as an activity, otherwise to a column the tool creates and tags. Previews never post. The outcome is recorded on the session and shown in the report (`core/grades.ts`).
- **The report.** *Report* on a persona lists every live conversation: student, when, status, turns, questions to the coach, whether a debrief and a reflection exist, and the gradebook outcome. *Open* shows the transcript, the coach exchanges, the debrief and the reflection. *Download CSV* gives one row per conversation.
- **The synthesis.** *Generate synthesis* reads every ended conversation's debrief and the students' reflections and writes, for the instructor, what students did well, where most left gaps by objective, three moves worth teaching before the next run, adjustments to the persona or the brief, and themes from the reflections. It never names students and is stored until regenerated.

## Beyond the course: the link

A persona's *Who can reach it* setting is *only through the course* by default. *Anyone with the link and a passcode* or *anyone with the link* gives it an unguessable address, `/p/<slug>`, shown in the designer once saved and stable afterwards; the link works once the persona is published and dies when it is unpublished or set back to course-only. The page at that address is the same student page with the course parts removed: a passcode step where one is set, an optional first name, the pre-brief with a disclosure, then the conversation, the coach, the debrief, the reflection and the export.

Visitors need no account. A signed cookie names each browser, and each visitor becomes a student row with `lti_iss = 'public'` scoped to the persona, so everything else, including the instructor's report (where their rows are marked *web*), works unchanged. The passcode is stored only as an HMAC under the tool's secret and is checked once per browser. Three caps protect the spend: a per-persona daily cap in dollars on web conversations (default two dollars), a cap on messages per web conversation (default forty), and five new conversations per visitor per day. Web conversations never post to a gradebook.

The routes live in `src/persona/server/public.ts`, mounted before ltijs's session validator through the provider's addon hook.

## Models and cost

`PERSONA_MODEL` sets the deployment default (Haiku 5.5). The designer view offers a per-persona choice with list prices per million tokens: Haiku 5.5, Sonnet 5.5, Opus 5.5 and Haiku 4.5. Every call is recorded in `api_call` with its cost, as in the tutor; `/admin/costs?token=…` summarises it.

## Testing without Moodle

Unit tests (`npm test`) cover templates, prompt assembly, validation, chunking, quotation checking, exports and the CSV. For end-to-end checks without an LTI launch, a small harness can import `dist/persona/server/routes.js` and copy the routes registered on `lti.app` onto a plain Express app with a fake token in `res.locals` (ltijs attaches its session validator at setup, so `lti.app` itself cannot be mounted); the public routes come along since they are registered on the same app. That is how every phase was exercised against the persona dev database before Moodle was involved.

## Seeding the reference personas

```bash
APP=persona npx tsx src/persona/seed.ts --iss <platform issuer> --context <LTI course id> --sources "/path/to/Chatbot Materials"
```

The issuer and course id are what the LTI launch carries (the `student` table shows them after one launch). The sources folder's PDFs and documents become materials attached to Tagore.

## Grounding from the Moodle course

On the Materials tab, **Import a Moodle course backup** reads an `.mbz` file (up to 150 MB; make it without enrolled users) and **Sync from Moodle** reads the live course once a web-service token is connected under **Moodle connection**. Both show the same preview: every unit's text, pages, books, readings with attached PDFs and Word files, links and assignment descriptions, each with a tick box, a title and a role. Nothing about people is read. Items carry a stable source key, so a later import or sync refreshes them in place. The code is shared with the tutor (`core/moodle-backup.ts`, `core/moodle-ws.ts`, `core/course-model.ts`); the token lives in `persona_course_settings`, encrypted.

## What was built, in order

1. **Done.** Persona model, templates, designer authoring with the draft, materials by paste, URL and upload, the student gallery, pre-brief and streamed conversation, preview as a student, deep linking of single personas.
2. **Done.** Grounding from the Moodle course (backup import and live sync through web services, the same preview and in-place updates as the tutor), chunked retrieval for long sources, verified quotations.
3. **Done.** Voice in and out, the step-out coach, the debrief as a separate call against the objectives, transcript export, a short reflection.
4. **Done.** Completion passback to the gradebook and the instructor's report across conversations, with a synthesis.
5. **Done.** Visibility beyond the LMS: link with passcode, or public, with spend caps.
