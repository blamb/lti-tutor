# Accessibility audit: `src/tutor/web/launch.html`

Audited against WCAG 2.1 AA and the [BCcampus Accessibility Toolkit](https://opentextbc.ca/accessibilitytoolkit/) (2nd edition) in Phase 6 of the TRU realignment, October 2026. The goal set in the brief is an experience that needs few or no accommodations, because self-paced Open Learning learners may have no one to ask.

The audit was a code review of the page plus a check of every colour pair; it was not a session with assistive-technology users. That remains to be done (see "What remains").

## What was checked

| Area | WCAG 2.1 | Toolkit chapter |
|---|---|---|
| Text alternatives and decorative icons | 1.1.1 | Images |
| Structure: landmarks, headings, lists, tables | 1.3.1, 2.4.6 | Organizing content, Tables |
| Colour and contrast, light and dark | 1.4.1, 1.4.3, 1.4.11 | Colour contrast |
| Resize and reflow, text spacing | 1.4.4, 1.4.10, 1.4.12 | Formulas / Font size |
| Keyboard: reachability, order, traps, focus visible | 2.1.1, 2.1.2, 2.4.3, 2.4.7 | Links / Interactive |
| Skip link | 2.4.1 | Organizing content |
| Motion and animation | 2.3.3 | Multimedia |
| Labels, instructions, errors | 3.3.1, 3.3.2 | Forms |
| Name, role, value; status messages | 4.1.2, 4.1.3 | Interactive |
| Audio alternatives: spoken replies and voice input | 1.2.1, 1.2.2 (by analogy) | Multimedia |

## What was fixed

**Live announcements.** One `aria-live="polite"` region (`#sr-live`) serves the page. The tutor's streamed reply is announced once, complete, when the stream ends, rather than chunk by chunk, which would have re-read the whole bubble on every token. "The tutor is replying", stage changes, voice-input start and stop, and the end of the session are announced the same way. Status spans (`#profile-status`, `#course-status`, import and course-pack status, the stage chip) have `role="status"`; error containers have `role="alert"`.

**Speak button.** It now has `aria-pressed` and an `aria-label` that reflects its state ("Speak: start voice input" / "Done speaking: stop voice input and check the text"), and is described by the voice and mode hints. Emoji in button labels are `aria-hidden`.

**Voice input is reviewed before it is sent.** Previously "Done speaking" sent the recognised text immediately. Now it stops recognition, leaves the text in the message box (visible and editable all along, because interim results are written there as the learner speaks), moves focus to the box and says so. The learner sends with Enter or the Send button. Spoken replies always have the visible transcript bubble; read-aloud is an optional extra.

**Keyboard.** Clickable list items (sessions, debriefs) were `<li>` elements with click handlers and no keyboard access; each now contains a real `<button class="item-open">`. The instructor tabs were `<div>`s; they are now `<button role="tab">` inside a `role="tablist"`, with `aria-selected`, `aria-controls`, roving `tabindex`, and arrow, Home and End key navigation; the panes are `role="tabpanel"`. A visible focus ring (`:focus-visible`, 3 px, on the accent colour) applies to every control. A skip link is the first focusable element and targets `<main id="main">`. When a view or editor pane opens, focus moves to its heading (`tabindex="-1"`), so keyboard and screen-reader users land where the change happened. Buttons and the message box meet a 44 px minimum height.

**Colour and contrast.** All colours are tokens on `:root`, with a `prefers-color-scheme: dark` set, and `color-scheme: light dark` so native form controls follow. Every text/background pair in both themes is at least 4.5:1 (checked with the WCAG relative-luminance formula):

| Pair | Light | Dark |
|---|---|---|
| Body text on card | #1a1a1a / #ffffff 17.4:1 | #ececec / #1c1f24 14.0:1 |
| Muted text on card | #5b5f66 / #ffffff 6.4:1 | #b3b8c0 / #1c1f24 8.3:1 |
| Accent (links, ghost buttons) on card | #0b5fa8 / #ffffff 6.5:1 | #8ec2ff / #1c1f24 8.9:1 |
| Button text on accent | #ffffff / #0b5fa8 6.5:1 | #06192c / #8ec2ff 9.6:1 |
| Good chip | #1f6b31 / #e6f4e9 5.8:1 | #8ad69a / #16301d 8.3:1 |
| Warning chip | #7a4f00 / #fff3d6 6.5:1 | #ffd27a / #3a2c0c 9.5:1 |
| Bad chip and errors | #a42828 / #fbe9e9 6.2:1 | #ff9c9c / #3d1a1a 7.7:1 |
| Listening microphone button | #ffffff / #a42828 7.2:1 | #1c1f24 / #ff9c9c 8.3:1 |

The previous `--muted-2: #999` (2.8:1) and `--good: #2a8a3e` on its tint (4.1:1) failed and were replaced. Status is never conveyed by colour alone: chips carry words, and the NPS scale uses `aria-pressed`.

**Motion.** Under `prefers-reduced-motion: reduce` the microphone's pulse animation is replaced by a static outline, and transitions and smooth scrolling are off.

**Text size and spacing.** An "Aa" control in the header offers four text sizes (100–140 %) and three line spacings (1.5–2.0). The choice is applied to the root element and `--lh`, and stored in `localStorage` inside `try/catch`, so the page works where storage is blocked. The page also reflows at 320 px width with no horizontal scrolling (all layouts are flex or grid with wrapping), and browser zoom to 200 % works.

**Headings form an outline.** The page has one `h1` (the tool name), one `h2` per view, and `h3`/`h4` within. The instructor editor and report used `h4` directly under `h2`; those are now `h3`. Markdown from the model (tutor replies, debriefs, summaries, synthesis) is post-processed by `normalizeHeadings()` after rendering so the top level becomes `h3` under the view's `h2` and no level is skipped; the server does the same for printed documents (`normalizeMarkdownHeadings()` in `print.ts`).

**Labels and structure.** The message box, the draft-topic field, the import URL, the file input and the NPS comment have labels (visible or visually hidden). Tables have `scope="col"` headers and the empty action column has a hidden label. The header navigation is a `<nav aria-label="Main">`; content is inside `<main>`. Links that open a new tab say so to screen readers.

**Paper and standalone outputs** (Phase 5) are single HTML files with semantic headings, no JavaScript, a serif face at 12 pt, generous line height, and ruled writing space marked with an `aria-label`, so they print legibly and read well in a screen reader.

## What remains

- **Testing with people.** No session with screen-reader, switch, magnification or voice-control users has been run. Plan one with VoiceOver (Safari and Chrome) and NVDA (Firefox and Chrome), including the voice input flow and the instructor tabs.
- **Speech recognition itself** is the browser vendor's (Chrome: Google; Safari: Apple). Its accuracy for accented or disordered speech is outside the tool's control; typing is always a full equivalent and is said so on screen.
- **Read-aloud** uses the browser's speech synthesis, which has no per-word highlighting. Learners who need synchronised highlighting should use their own screen reader on the visible transcript.
- **Native `confirm()` dialogs** (start over, finish early, delete) are accessible but unstyled and not localisable; replacing them with an in-page dialog would allow better wording.
- **Language.** The page is `lang="en"` and the tutor's language follows the materials; there is no interface translation.
- **Mathematics.** Formulas in materials arrive as text (from a PDF or page) and are read as the model wrote them; there is no MathML. ABE mathematics courses should be checked specifically.
- **Moodle's frame.** Inside the LMS the tool runs in an iframe whose size is reported to Moodle; the Full screen hand-off remains the recommended way to use voice, and is explained on screen.
- **The instructor view** was brought to the same baseline (tabs, labels, headings, contrast) but has had less attention than the learner views, which are the priority for Open Learning.
