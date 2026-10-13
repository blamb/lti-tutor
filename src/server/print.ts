/**
 * Offline and low-bandwidth outputs. Nothing conversational works without a
 * connection; what the tool can do is turn the same briefs into printable,
 * self-contained artifacts so an offline learner gets the same learning
 * design on paper.
 *
 *   - paper tutor script: one per tutorial (tutorial_print), regenerated when
 *     the brief changes, recorded as tutorial.print_script
 *   - debrief template: a non-personalised study/lecture debrief per material
 *     (material_debrief_template), recorded as tutorial.debrief_template
 *   - standalone HTML renderers: inline CSS, no JavaScript
 *   - the course pack: one zip of every published script, every debrief
 *     template and a plain-text index
 */

import { createHash } from 'node:crypto';
import { marked } from 'marked';
import { zipSync, strToU8 } from 'fflate';
import { query } from './db.js';
import { getAnthropic, GEN_MODEL } from './anthropic.js';
import { recordApiCall, type Attribution } from './costs.js';
import { textOf } from './llm.js';
import { KINDS, type TutorialKind } from './kinds.js';
import { briefFor, listTutorials, listMaterials, effectivePitch, type Tutorial, type Material, type CourseCtx } from './tutorials.js';
import { deliveryLabels } from './delivery.js';

// ─── Paper tutor script ─────────────────────────────────────────────────────

export interface PrintScript {
  tutorial_id: number;
  brief_hash: string;
  markdown: string;
  generated_at: string;
}

/** Everything the script depends on; a change here means regenerate. */
export function briefHash(t: Tutorial, ctx: CourseCtx): string {
  const h = createHash('sha256');
  h.update(JSON.stringify([
    t.kind, t.title, t.learning_goal, t.opening_question, t.ta_brief, t.misconceptions,
    t.success_criteria, effectivePitch(t, ctx), t.practice_prompts, t.target_minutes, ctx.settings.course_level,
  ]));
  return h.digest('hex');
}

export async function getPrintScript(tutorialId: number): Promise<PrintScript | null> {
  const rows = await query<PrintScript>(
    `select tutorial_id, brief_hash, markdown, generated_at::text from tutorial_print where tutorial_id = $1`,
    [tutorialId]
  );
  return rows[0] ?? null;
}

const SCRIPT_STRUCTURE: Record<TutorialKind, string> = {
  concept: `1. "The question to start with" — the opening question, then [write].
2. "Working through it" — each probe from the instructor's notes rewritten as a question the learner answers in writing, in the instructor's order, each followed by [write]. Where the notes say what a good answer contains, turn that into a follow-up question, not a hint.
3. "Check yourself" — each misconception rewritten as "Some people think … Is that right? Explain why or why not." followed by [write].
4. "Teach it back" — "Explain the main idea in writing to someone who has never studied it", then [write], then one line telling them to re-read what they wrote and underline anything they are not sure of.
5. "Self-check" — the success criteria as a checklist of lines starting with ☐, then "The one thing I will go back to:" and [write].`,
  readiness: `1. "Before you start" — the opening question, then [write].
2. "What you already know" — the probes from the instructor's notes as questions, each followed by [write]. Say that informal knowledge counts: earlier courses, work, everyday life.
3. "Check yourself" — each misconception as "Some people think … Do you? Why?" followed by [write]. Do not say which are wrong.
4. "What to watch for" — tell the learner that as they read the upcoming material they should note two things that surprised them or contradicted what they wrote above, then [write].
5. "Ready?" — the success criteria as ☐ lines.`,
  preparation_check: `1. "From memory" — for each key idea in the instructor's notes, one question asking the learner to recount it in their own words without looking, each followed by [write].
2. "Connect it" — ask them to connect one idea from the reading to something they already know, have seen at work or have experienced, then [write].
3. "Check yourself" — each commonly garbled idea as "Some people read this as … Is that what it says?" followed by [write].
4. "Worth re-reading" — ask them to open the reading, compare, and list what they would re-read, then [write].
5. "Self-check" — the success criteria as ☐ lines.`,
  practice: `1. "Your attempt" — the invitation from the brief (what kind of work this is), then [write] twice for a long answer.
2. "Feedback checklist" — the success criteria turned into questions about their own work ("Does my work …?"), each as a ☐ line.
3. "Common slips" — the common errors as "Check that you haven't …" ☐ lines.
4. "Revise" — "Pick the first item above you could not tick and redo that part here", then [write] twice.
5. "One more" — the practice prompts from the brief (or one in the same spirit if there are none), each followed by [write].
6. "What to keep working on" — "Two things that went well:" [write] and "The one thing to work on next:" [write].
Never include a mark, grade or score anywhere.`,
  reflection: `1. "What was hard" — the opening question, then [write].
2. "What you did" — the probes about strategy: what they tried, whether it worked, each followed by [write].
3. "How you know" — how they can tell the difference between understanding something and just recognising it, then [write].
4. "Your plan" — one concrete thing to do differently in the next section, and when, then [write].
5. "In one line" — "What works for me:" then [write].`,
  recall: `1. "From memory, no notes" — the retrieval prompt, then [write]. Tell them not to open any notes yet.
2. "Cue yourself" — the smallest cue from the instructor's notes (never the answer), then "Try again:" and [write].
3. "Now check" — tell them to open the material and note what came back and what had faded, then [write].
4. "Connect" — how the earlier idea applies to the current section, then [write].
5. "What faded, and where to find it" — a line for each, then [write].`,
};

function printSystem(kind: TutorialKind): string {
  const spec = KINDS[kind];
  return `You turn an instructor's brief for a one-on-one AI ${spec.label.toLowerCase()} (${spec.blurb}) into a paper version that a learner works through alone, with a pen and no internet. It follows the same stages as the live session, but the learner does all the thinking in writing and there is no tutor to respond: so every question must stand on its own, and nothing may depend on an answer the learner has not written yet.

Rules:
- Second person, warm, concrete, at the reading level and tone the brief names (ABE means high-school completion: short sentences, everyday words).
- Markdown. A top-level heading with the title, one sentence on how to use the sheet, then the numbered sections below with their headings as given. Each section is a ## heading; no deeper headings.
- Wherever the learner should write, put a line containing only [write]. Every question gets a [write] after it.
- Never give answers, hints that give the answer away, or model solutions. Never mention the AI, the app, the internet, classmates, a class, a week or a date.
- Under 900 words of your own text (the [write] lines are free).

Sections:
${SCRIPT_STRUCTURE[kind]}`;
}

/** The current script, generated or regenerated when the brief has changed. */
export async function ensurePrintScript(tutorial: Tutorial, ctx: CourseCtx, attribution: Attribution, opts: { force?: boolean } = {}): Promise<PrintScript> {
  const hash = briefHash(tutorial, ctx);
  const existing = await getPrintScript(tutorial.id);
  if (existing && existing.brief_hash === hash && !opts.force) return existing;

  const client = getAnthropic();
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 2500,
    system: printSystem(tutorial.kind),
    messages: [{ role: 'user', content: `${await briefFor(tutorial, ctx)}\n\nWrite the paper version now.` }],
  });
  void recordApiCall({ ...attribution, endpoint: 'tutorial.print_script', model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0 });
  const markdown = textOf(res);
  const rows = await query<PrintScript>(
    `insert into tutorial_print (tutorial_id, brief_hash, markdown) values ($1, $2, $3)
     on conflict (tutorial_id) do update set brief_hash = excluded.brief_hash, markdown = excluded.markdown, generated_at = now()
     returning tutorial_id, brief_hash, markdown, generated_at::text`,
    [tutorial.id, hash, markdown]
  );
  return rows[0]!;
}

// ─── Debrief template (non-personalised) ────────────────────────────────────

export interface DebriefTemplate {
  material_id: number;
  body_hash: string;
  markdown: string;
  generated_at: string;
}

function templateSystem(live: boolean): string {
  const what = live ? 'post-lecture debrief' : 'study debrief';
  return `You write a short ${what} of one piece of course material (${live ? 'lecture notes, a transcript or a reading' : 'a reading, a chapter of an open textbook, notes or a transcript'}) for learners to read on paper. It is the same for every learner; one section leaves space for them to make it their own.

Format (markdown, at most 450 words, ## headings only):
## The big ideas
3–5 short paragraphs or a tight list: the ideas that matter, stated so they could be explained to someone who has never studied this.
## Where ${live ? 'students' : 'people'} usually slip
2–3 sentences on the common confusions.
## Make it yours
One sentence inviting the learner to write two or three sentences connecting one of the ideas to their own program, work or life, then a line containing only [write].
## Three questions to test yourself
Three questions, no answers, each followed by a line containing only [write].

Ground everything in the provided material.${live ? '' : ' Never refer to a lecture, a class, classmates or a schedule.'}`;
}

export async function ensureDebriefTemplate(material: Material, ctx: CourseCtx, attribution: Attribution): Promise<DebriefTemplate> {
  const live = ctx.delivery.hasLiveSessions;
  const hash = createHash('sha256').update(JSON.stringify([material.title, material.body, live])).digest('hex');
  const existing = await query<DebriefTemplate>(
    `select material_id, body_hash, markdown, generated_at::text from material_debrief_template where material_id = $1`,
    [material.id]
  );
  if (existing[0] && existing[0].body_hash === hash) return existing[0];

  const client = getAnthropic();
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1500,
    system: [
      { type: 'text', text: templateSystem(live) },
      { type: 'text', text: `# COURSE MATERIAL\n\n## ${material.title}\n${material.body}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: `Write the debrief for "${material.title}" now.` }],
  });
  void recordApiCall({ ...attribution, endpoint: 'tutorial.debrief_template', model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0 });
  const rows = await query<DebriefTemplate>(
    `insert into material_debrief_template (material_id, body_hash, markdown) values ($1, $2, $3)
     on conflict (material_id) do update set body_hash = excluded.body_hash, markdown = excluded.markdown, generated_at = now()
     returning material_id, body_hash, markdown, generated_at::text`,
    [material.id, hash, textOf(res)]
  );
  return rows[0]!;
}

// ─── Standalone HTML (inline CSS, no JavaScript) ────────────────────────────

const PRINT_CSS = `
  @page { margin: 2cm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; background: #fff; margin: 0; padding: 1.5rem; line-height: 1.55; font-size: 12pt; }
  main { max-width: 42em; margin: 0 auto; }
  h1 { font-size: 1.6em; margin: 0 0 .25em; line-height: 1.2; }
  h2 { font-size: 1.2em; margin: 1.5em 0 .4em; border-bottom: 1px solid #bbb; padding-bottom: .15em; page-break-after: avoid; }
  h3 { font-size: 1.05em; margin: 1.2em 0 .3em; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 1.4em; }
  .sub { color: #555; font-size: .95em; margin: 0 0 1.25em; }
  .write { margin: .5em 0 1.2em; page-break-inside: avoid; }
  .write div { border-bottom: 1px solid #999; height: 2em; }
  .foot { margin-top: 2.5em; padding-top: .75em; border-top: 1px solid #bbb; color: #555; font-size: .85em; }
  a { color: inherit; }
  @media screen { body { background: #f3f3f3; } main { background: #fff; padding: 2.5rem 3rem; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Re-level markdown headings so the top level is `base` and no heading is
 * more than one level deeper than the one before it (a proper outline).
 */
export function normalizeMarkdownHeadings(markdown: string, base = 2): string {
  const lines = markdown.split('\n');
  const levels = lines.map((l) => /^(#{1,6})\s/.exec(l)?.[1]?.length ?? 0).filter((n) => n > 0);
  if (levels.length === 0) return markdown;
  const top = Math.min(...levels);
  let prev = base - 1;
  return lines.map((l) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(l);
    if (!m) return l;
    let level = m[1]!.length - top + base;
    if (level > prev + 1) level = prev + 1;
    level = Math.min(6, Math.max(base, level));
    prev = level;
    return `${'#'.repeat(level)} ${m[2]}`;
  }).join('\n');
}

/** Model markdown → HTML with no raw HTML passthrough and [write] markers as ruled lines. */
export function markdownToPrintHtml(markdown: string): string {
  const safe = normalizeMarkdownHeadings(markdown, 1).replace(/</g, '&lt;');
  const html = marked.parse(safe, { gfm: true, breaks: false, async: false }) as string;
  const lines = '<div class="write" aria-label="Space to write">' + '<div></div>'.repeat(6) + '</div>';
  return html.replace(/<p>\s*\[write\]\s*<\/p>/g, lines).replace(/\[write\]/g, '');
}

export function standaloneHtml(opts: { title: string; subtitle?: string; markdown: string; footer?: string; lang?: string }): string {
  return `<!doctype html>
<html lang="${opts.lang ?? 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<main>
${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
${markdownToPrintHtml(opts.markdown)}
${opts.footer ? `<div class="foot">${escapeHtml(opts.footer)}</div>` : ''}
</main>
</body>
</html>
`;
}

export function printScriptHtml(tutorial: Tutorial, script: PrintScript, ctx: CourseCtx): string {
  const spec = KINDS[tutorial.kind];
  return standaloneHtml({
    title: `${spec.label}: ${tutorial.title}`,
    subtitle: `${ctx.title || 'Course'} · ${spec.label} · about ${tutorial.target_minutes} minutes · paper version`,
    markdown: script.markdown,
    footer: `Paper version of a ${spec.label.toLowerCase()} designed by your instructor. Work through it in writing; bring your sheet to your next session or keep it as a record.`,
  });
}

export function debriefTemplateHtml(material: Material, template: DebriefTemplate, ctx: CourseCtx): string {
  const labels = deliveryLabels(ctx.delivery);
  const credit = [material.attribution, material.license && !material.attribution.includes(material.license) ? material.license : '', material.source_url].filter(Boolean).join(' · ');
  return standaloneHtml({
    title: `${labels.debrief[0]!.toUpperCase() + labels.debrief.slice(1)}: ${material.title}`,
    subtitle: `${ctx.title || 'Course'} · ${labels.debrief}`,
    markdown: template.markdown,
    footer: credit ? `Based on: ${credit}` : undefined,
  });
}

/** A learner's own (personalised) debrief as a file. */
export function personalDebriefHtml(material: Material, markdown: string, ctx: CourseCtx, generatedAt: string): string {
  const labels = deliveryLabels(ctx.delivery);
  return standaloneHtml({
    title: `${labels.debrief[0]!.toUpperCase() + labels.debrief.slice(1)}: ${material.title}`,
    subtitle: `${ctx.title || 'Course'} · written for you on ${generatedAt.slice(0, 10)}`,
    markdown,
    footer: material.attribution ? `Based on: ${material.attribution}` : undefined,
  });
}

// ─── Course pack ────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

/**
 * Everything an offline learner needs, as one zip: every published session's
 * paper script, every material's debrief template, and a plain-text index.
 * Generates whatever is missing or stale (one model call per stale item).
 */
export async function buildCoursePack(ctx: CourseCtx, attribution: Attribution): Promise<{ zip: Uint8Array; tutorials: number; materials: number }> {
  const tutorials = (await listTutorials(ctx, { publishedOnly: true }));
  const materials = await listMaterials(ctx);
  const labels = deliveryLabels(ctx.delivery);
  const files: Record<string, Uint8Array> = {};
  const index: string[] = [
    `${ctx.title || 'Course'} — offline pack`,
    `Generated ${new Date().toISOString().slice(0, 10)} · ${labels.pacingName} course`,
    '',
    'Work through the sessions in writing, in any order your course suggests. Each file is a single page that prints on its own.',
    '',
    `SESSIONS (${tutorials.length})`,
  ];
  for (const [i, t] of tutorials.entries()) {
    const script = await ensurePrintScript(t, ctx, attribution);
    const base = `sessions/${String(i + 1).padStart(2, '0')}-${slug(t.title)}`;
    files[`${base}.html`] = strToU8(printScriptHtml(t, script, ctx));
    files[`${base}.md`] = strToU8(`# ${KINDS[t.kind].label}: ${t.title}\n\n${script.markdown.replace(/^\[write\]$/gm, '\n_____________________________\n_____________________________\n_____________________________\n')}`);
    index.push(`${String(i + 1).padStart(2, '0')}. ${KINDS[t.kind].label}: ${t.title} (about ${t.target_minutes} min) — ${base}.html`);
  }
  index.push('', `${labels.debriefPlural.toUpperCase()} (${materials.length})`);
  for (const [i, m] of materials.entries()) {
    const template = await ensureDebriefTemplate(m, ctx, attribution);
    const base = `debriefs/${String(i + 1).padStart(2, '0')}-${slug(m.title)}`;
    files[`${base}.html`] = strToU8(debriefTemplateHtml(m, template, ctx));
    files[`${base}.md`] = strToU8(`# ${m.title}\n\n${template.markdown.replace(/^\[write\]$/gm, '\n_____________________________\n_____________________________\n')}${m.attribution ? `\n\n---\nBased on: ${m.attribution}` : ''}`);
    index.push(`${String(i + 1).padStart(2, '0')}. ${m.title}${m.license ? ` (${m.license})` : ''} — ${base}.html`);
  }
  files['index.txt'] = strToU8(index.join('\n') + '\n');
  return { zip: zipSync(files, { level: 6 }), tutorials: tutorials.length, materials: materials.length };
}
