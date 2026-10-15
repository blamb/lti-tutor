/**
 * The tutor's LTI surface: provider setup (core/lti-provider.ts), the launch
 * handler that renders launch.html, and the deep-linking picker.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IdToken } from 'ltijs';
import { env } from './env.js';
import { setupLti, launchHtmlLoader, escapeHtml, mintFullscreenNonce } from '../../core/lti-provider.js';
import { findOrCreateStudent } from '../../core/students.js';
import { isTeacher } from '../../core/auth.js';
import { listTutorials } from './tutorials.js';
import { courseCtxFromToken, defaultAiDisclosure } from './courses.js';
import { deliveryLabels } from './delivery.js';
import { KINDS } from './kinds.js';

export { escapeHtml, mintFullscreenNonce };

const HERE = dirname(fileURLToPath(import.meta.url));
const loadLaunchHtml = launchHtmlLoader(join(HERE, '..', 'web', 'launch.html'));

const lti = setupLti({
  name: env.TOOL_NAME,
  description: 'Instructor-designed one-on-one AI tutorials with voice, deep linking and debriefs',
});

/** Successful launch: ltijs validated the JWT and set the session cookie. */
lti.onConnect(async (token: IdToken, req, res) => {
  // Loads the course's delivery mode; a custom `truflex` launch parameter
  // seeds it on the course's first launch (courses.ts).
  const ctx = await courseCtxFromToken(token);
  const student = await findOrCreateStudent({
    sub: token.user,
    iss: token.iss,
    contextId: ctx.contextId,
    displayName:
      token.userInfo.name ||
      [token.userInfo.given_name, token.userInfo.family_name].filter(Boolean).join(' ') ||
      'Student',
  });
  const role = isTeacher(token) ? 'teacher' : 'student';
  const lp = token.platformContext.launchPresentation as Record<string, unknown> | undefined;
  const rawReturnUrl = typeof lp?.return_url === 'string' ? lp.return_url : '';
  const returnUrl = /^https?:\/\//i.test(rawReturnUrl) ? rawReturnUrl : '';
  // Deep-linked tutorial activity: Moodle passes the custom tutorial_id we set
  // when the instructor placed it; the client opens that tutorial directly.
  const rawTutorialId = String(token.platformContext.custom?.tutorial_id ?? '');
  const tutorialId = /^\d+$/.test(rawTutorialId) ? rawTutorialId : '';

  const html = loadLaunchHtml()
    .replaceAll('{{TUTORIAL_ID}}', tutorialId)
    .replaceAll('{{TOOL_NAME}}', escapeHtml(env.TOOL_NAME))
    .replaceAll('{{RETURN_URL}}', escapeHtml(returnUrl))
    .replaceAll('{{DISPLAY_NAME}}', escapeHtml(student.display_name))
    .replaceAll('{{CONTEXT_TITLE}}', escapeHtml(ctx.title ?? ''))
    .replaceAll('{{DELIVERY}}', escapeHtml(JSON.stringify(ctx.delivery)))
    .replaceAll('{{DISCLOSURE}}', escapeHtml(ctx.settings.ai_disclosure || defaultAiDisclosure(env.TOOL_NAME, ctx.delivery)))
    .replaceAll('{{ROLE}}', role);
  return res.send(html);
});

/**
 * Deep linking: Moodle's "Select content" on an External tool activity.
 * Instructors pick which tutorials to place in the course, each as its own
 * activity, so the tutorial sits in the sequence between lecture and debrief.
 */
lti.onDeepLinking(async (token: IdToken, req, res) => {
  if (!isTeacher(token)) {
    return res.status(403).type('html').send('<p>Only instructors can select content.</p>');
  }
  const ltik = String((res.locals as { ltik?: string }).ltik ?? '');
  const ctx = await courseCtxFromToken(token);
  const labels = deliveryLabels(ctx.delivery);
  const tutorials = await listTutorials(ctx, { publishedOnly: false });
  const rows = tutorials
    .map(
      (t) =>
        `<label class="row"><input type="checkbox" name="tutorial" value="${t.id}">` +
        `<span><strong>${escapeHtml(t.title)}</strong>` +
        `<span class="meta"> · ${escapeHtml(KINDS[t.kind].label)} · ${t.target_minutes} min${t.status !== 'published' ? ' · <em>' + t.status + '</em>' : ''}${t.gradebook ? ' · gradebook column' : ''}</span>` +
        `<div class="goal">${escapeHtml(t.learning_goal)}</div></span></label>`
    )
    .join('\n');
  const placement = ctx.delivery.hasLiveSessions
    ? 'so you can place it right after the lecture it follows'
    : 'so you can place it right after the material it goes with';
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Select content — ${escapeHtml(env.TOOL_NAME)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 1.5rem; color: #1a1a1a; max-width: 720px; }
  h1 { font-size: 1.2rem; margin: 0 0 .25rem; } p { color: #666; margin: .25rem 0 1rem; }
  .row { display: flex; gap: .6rem; align-items: flex-start; padding: .6rem .75rem; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: .5rem; cursor: pointer; }
  .row:hover { background: #f7f7f7; } .meta { color: #666; font-size: .85rem; } .goal { color: #444; font-size: .85rem; margin-top: .2rem; }
  .btn { padding: .5rem 1.1rem; border: none; border-radius: 6px; background: #0f6cbd; color: #fff; font: inherit; font-weight: 500; cursor: pointer; margin-top: .75rem; }
  .empty { color: #666; border: 1px dashed #ccc; border-radius: 8px; padding: .75rem; }
</style></head><body>
<h1>Add ${escapeHtml(env.TOOL_NAME)} content to this course</h1>
<p>Each selected item becomes its own activity on the course page, ${placement}. The activity's name shows its kind (readiness check, preparation check, tutorial, practice, reflection, recall). Draft items can be placed now and published later.</p>
<form method="post" action="/api/deeplink?ltik=${encodeURIComponent(ltik)}">
  <label class="row"><input type="checkbox" name="home" value="1"><span><strong>${escapeHtml(env.TOOL_NAME)} home</strong><span class="meta"> · all tutorials, ${labels.debriefPlural}, profile</span></span></label>
  <h2 style="font-size:1rem;margin:1rem 0 .5rem">Tutorials</h2>
  ${rows || '<div class="empty">No tutorials yet. Open the tool from the course, go to Instructor view, and create one first.</div>'}
  <button class="btn" type="submit">Add selected to course</button>
</form>
</body></html>`);
});

export { lti };
