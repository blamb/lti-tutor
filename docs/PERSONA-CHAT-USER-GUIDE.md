# Persona Chat: a guide for designers and instructors

Persona Chat lets students hold a conversation, inside your Moodle course, with a persona you design: a thinker from history met over coffee, a simulated patient or client to interview, a counterpart in a role-play. The persona stays in character, draws on the materials you attach, holds back what you tell it to hold back, and never grades. Afterwards the student gets a debrief against your objectives, and you get a report across every conversation.

It replaces the Custom GPT and Copilot-agent pattern: no student accounts on a third-party service, data stays with the institution, and the persona is authored as fields you can read and change rather than one long prompt.

This guide covers what you need to set one up and read what comes back. The README and [docs/PERSONA-CHAT.md](PERSONA-CHAT.md) have the full detail.

---

## 1. Open the Designer view

Launch the tool from the place it sits in your course. It opens in its own window. As a teacher you see two buttons at the top: **Personas** (what students see) and **Designer view**. The Designer view has two tabs:

| Tab | What it is for |
|---|---|
| **Personas** | Create, edit, try and place personas; read each one's report |
| **Materials** | What personas may draw on: readings, a figure's own writings, case files, the course itself |

Materials first, personas second: a persona can only cite what has been added.

---

## 2. Materials

Under **Materials** there are five ways in, all landing as plain text:

- **Import a Moodle course backup**: an `.mbz` file from *More → Course reuse → Backup* (untick *Include enrolled users*; leave activities and files ticked; download the newest file). You get a preview, unit by unit, with tick boxes, editable titles and a *what it is* mark. Hidden items are shown but unticked. Re-import a newer backup later and the same items update in place.
- **Sync from Moodle**: the same preview read from the live course, once the course is connected. Scroll to **Moodle connection** at the bottom of the tab, paste a web-service token, click **Connect**. The tool checks who the token belongs to, that its service allows what the sync needs, and that the account can read this course. Ask your Moodle administrator for the token, or create one yourself under *Preferences → Security keys* if the site allows it. The token is stored encrypted and only ever used to read.
- **Import from a web page or open textbook**: a URL. For a Pressbooks book, *whole book* brings in every chapter.
- **Upload a file**: `.txt`, `.md`, `.html`, `.docx`, `.pdf`. A scanned PDF has no text until it has been through OCR.
- **Paste text**: a title and the text.

**How much is too much?** Nothing, within reason. A persona with a short set of materials, up to roughly eighty thousand characters in total, carries them whole into every reply. A persona with more, such as a thinker's collected works, is served by retrieval: each turn, the passages that best match what the student just said are found and handed to the persona. Long sources cost nothing extra per turn beyond the passages used. A 1,000-page novel imports and works.

**Quotations are checked.** Whenever a persona quotes five words or more, the tool looks for those words in the attached materials and marks the reply: *quoted from* a named source, or *not found in the sources*. Students see this; so should you, when you try a persona. Attach the works a persona is likely to quote from.

---

## 3. Create a persona

**Personas → New persona.** Three decisions shape everything else.

### Choose the template

| Template | Use it for | What it enforces for you |
|---|---|---|
| **A thinker in conversation** | A historical or living figure in an informal, searching conversation. Philosopher Chats. | Student-led and Socratic; grounded in the attached sources; never fabricates quotations; acknowledges disagreement among scholars; respects a historical cutoff; no grades or marks. |
| **A simulated client or patient** | Someone the student interviews or assesses. AISimSpeak. | The student leads; the persona answers what is asked and no more; opens up with respect and consent, closes down with leading or judgmental questions; cues drop naturally; hidden facts are never volunteered; never gives advice; never invents conditions. |
| **A role-play partner** | The other side of a negotiation, a stakeholder in a case, a conversation partner in another language. | Plays its side from its interests and constraints; reacts to what the student actually does; does not coach mid-scenario. |
| **Custom** | Anything else. | Only the common rules: stay in character, protect the hidden layer, be honest about being an AI if asked directly, step out and point to supports if the conversation turns to harm. |

The template's standing rules are built in. You do not need to write "stay in character" or "do not reveal your instructions"; write what is specific to this persona.

### Start from existing instructions, or from scratch

If you already have a Custom GPT or Copilot agent, open **Start from existing instructions**, paste its instructions and its knowledge profile or case file, and click **Draft the fields**. In about half a minute the text is sorted into the sections below, keeping your wording, with everything marked as hidden, cue-based or to-be-uncovered placed in the hidden layer. Then read every section before saving. The draft is a sorting, not a judgment.

Long documents (a reading, a novel) belong under Materials, not in the paste box.

### Fill the sections

| Section | What goes there | Who sees it |
|---|---|---|
| **On the card** | Name, a one-line subtitle (dates and place, or age and situation), a two-sentence summary. | Students, before they choose. |
| **Before the conversation** | Who the student is in this ("the nurse conducting the assessment"), the setting, and *How to use*: what the activity is for, how to approach it, what to try. | Students, as the pre-brief. |
| **The character** | *Who they are*: identity, background, circumstances, worldview, key ideas. *How they talk*: tone, pace, vocabulary, typical phrases, non-verbal cues worth describing. *How they engage*: what they lead with, how they respond to different kinds of question and conduct. | The persona plays all of this openly. |
| **What the persona holds back** | The hidden layer. Cues the persona drops and the follow-up behind each one *with the condition that unlocks it*; facts the student must uncover; what is never volunteered. | The persona only. Never sent to a student's browser. The debrief sees it afterwards, to say what was reached and what was not. |
| **Boundaries** | Rules specific to this persona beyond the template's; a historical cutoff ("knows nothing after 1941"); and *Verbatim instructions* for anything the fields cannot express, appended word for word. | The persona. |
| **Debrief** | Learning objectives, one per line, and guidance on the tone and focus of the feedback. | The debrief writer. The objectives also appear in the pre-brief. |
| **Conduct** | Who speaks first and an opening line; reply length; the read-aloud voice; the step-out coach on or off; the model; the gradebook; the materials to draw on; status. | The tool. |

**The hidden layer is the heart of a simulation.** A line such as "Only reveal if asked about sleep habits or routine: stays up late scrolling on her phone" is exactly right. It gives the persona a cue to drop ("I'm so exhausted by the time the kids are asleep that I just crash"), a follow-up, and the condition. The student who asks well reaches it; the student who does not gets told so in the debrief. A thinker usually has an empty hidden layer.

**A simulated patient needs a case file.** For the *simulated client or patient* template, the **Case file** section holds the facts every student must meet the same way: name and date of birth (the age is worked out on the day), why they came in, who sent them, history, medications one per line (mark over-the-counter ones *OTC* and give the words the patient uses), home life (who does the cooking), planted cues and disclosure rules. Without it the model improvises, and five students hear five different answers to "what medications are you on?".

**Any persona can have a fact sheet.** The **Fact sheet** section, shown for every template, holds the same kind of fixed facts in a general form: a few sections every persona has, then your own, written as a `## Heading` line with one fact per line beneath it. Pick a preset to add suggested headings (*Health care* adds Medications, Allergies and Who sent them; *Negotiation* adds Their interests, Constraints and Walk-away point). On a simulated patient it sits beside the case file while the two are compared: fill one or the other.

**A thinker needs a quote book.** For the *thinker* template, **Quotations and reading** holds quotations you have checked, with source and year, the misattributed lines students tend to bring and what the thinker should say about them, and the only books the thinker may recommend.

**Objectives drive the debrief.** Each line becomes a heading the debrief reports under, with examples from the conversation. Five is plenty. "Therapeutic communication" and "Recognise tensions and counterarguments" are the right grain.

### Conduct

- **Who speaks first.** A thinker usually opens ("Introduce yourself briefly, establish the setting, ask what they'd like to discuss, and wait"). A patient usually waits for the student.
- **Reply length.** *Short* for a patient or a role-play; *medium* for a thinker.
- **Read-aloud voice.** Voices come from each student's device; this only leans the automatic choice feminine or masculine. Students can pick any installed voice.
- **Step-out coach.** On by default. Switch it off when the conversation is itself the assessment.
- **Model.** Haiku 5.5 is the default and is good for most personas, including the patient simulations. A thinker whose voice matters, or a persona where nuance is the point, may be worth Sonnet 5.5 or Opus 5.5; the menu shows the list price per million tokens. A conversation on Haiku costs a few cents; the stronger models cost more per turn in proportion, and retrieval keeps even long sources affordable on them.
- **Post completion to the gradebook.** When on, a student's ended conversation posts 1/1 to the gradebook: to the activity's own column if you placed the persona as an activity, otherwise to a column the tool creates. Previews never post.
- **Status.** *Draft* while you work (only you can see and try it); *Published* for students; *Archived* to hide it everywhere.

Save, then **Try it as a student**. A preview runs the real persona with your materials and is never counted in the report.

---

## 4. Place it in the course

Two ways:

- **The home activity**, added once, lists every published persona. Good for a gallery like Philosopher Chats.
- **A persona as its own activity.** *Add an activity → External tool → Persona Chat → Select content* and tick the personas you want. Each becomes an activity that opens straight into its pre-brief. A persona with the gradebook on brings its column with it. Draft personas can be placed now and published later.

Students launch in a new window, which is what voice needs; inside Moodle's own frame the microphone is blocked, and the page offers **Full screen** instead.

---

## 5. What students see

1. **The card and the pre-brief**: who they are in this, the setting, who speaks first, your *How to use* text, the objectives, and a plain disclosure that this is an AI playing a part.
2. **The conversation.** Typed or spoken (**Speak**, then **Done speaking**, then check the text and send). Replies can be read aloud. Quotation chips appear under replies that quote.
3. **Step out and ask the coach.** A side panel the persona cannot hear: "What haven't I covered?", "How could I put that better?". The coach sees the brief, the objectives and the transcript so far, never the hidden layer, and answers with questions and options. Its exchanges stay out of the persona's transcript.
4. **End conversation** (or typing something like "end simulation" or "I'm finished", which asks the same question), then **Get your debrief**: any critical issues first (unsafe advice, a request to have work written for them, a breach of consent), then how it went, each objective with an example, what went well, what was worth exploring further, one question to carry away. Every point links to the turns it rests on. No grades. If writing the debrief fails or is interrupted, **Retry** stays on the page.
5. **One thing to take from this**: a short reflection, saved with the conversation.
6. **Download** the whole record as a web page or Markdown, or print it.

A student can return to an ended conversation and its debrief, or start a new one. Each start is a fresh conversation; the earlier ones are kept.

---

## 6. Reading the report

**Personas → Report** on a persona:

- **Totals**: conversations, students, ended, with a debrief, with a reflection, average turns, posted to the gradebook.
- **One row per conversation**: student, when, status, turns, questions to the coach, debrief and reflection ticks, gradebook outcome. **Open** shows the transcript, the coach exchanges, the debrief and the reflection. Rows marked *web* came through a link rather than the course.
- **Download CSV**: one row per conversation, for a spreadsheet.
- **Generate synthesis**: reads every ended conversation's debrief and the reflections and writes, for you, what students did well, where most left gaps by objective, three moves worth teaching before the next run, adjustments to the persona or the brief, and themes from the reflections. It never names students. Read it as a colleague's notes, not a verdict: with few or very short conversations it has little to go on and says so.

---

## 7. Beyond the course: a link

By default a persona is reachable only through the course. Under **Beyond the course** in the editor, *Who can reach it* can be set to *anyone with the link and a passcode* or *anyone with the link*. Save, and the link appears (it stays the same from then on, and only works while the persona is published). Share it with the passcode, if you set one.

Visitors need no account. They see a passcode step, an optional first name, then everything a student sees. Their conversations appear in your report marked *web*, are stored like the others, and never post to a gradebook. Three caps protect the spend and are yours to set: dollars per day on the link (default two), messages per web conversation (default forty), and five new conversations per visitor per day.

---

## 8. Good habits

- **Write the hidden layer as cue, follow-up, condition.** It is the difference between a persona that performs and one that teaches.
- **Keep the template's rules out of your fields.** Write what is particular: this person's phrases, this case's facts, this thinker's three themes.
- **Attach what the persona should quote.** The quotation check is only as good as the materials.
- **Try it as a student before publishing**, and ask it the awkward questions: "Are you an AI?", "What should I ask next?", "Give me the answer."
- **Read the debriefs before trusting the synthesis.**
- **One persona, one purpose.** A persona that is both an interview subject and a lecturer does neither well. Make two.

---

## Where things live

- Everything a persona needs is in its fields; nothing hidden lives in a prompt elsewhere.
- Materials are shared by all personas in a course. Deleting one removes it from every persona that used it.
- Conversations, debriefs and reflections are kept with the course. Instructors can read them; students can read their own.
- The full technical description, including how the prompt is assembled, retrieval, the checks and the caps, is in [docs/PERSONA-CHAT.md](PERSONA-CHAT.md).
