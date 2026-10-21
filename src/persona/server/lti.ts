/**
 * Persona Chat's LTI surface: provider setup (core/lti-provider.ts), the
 * launch handler that renders launch.html, and the deep-linking picker that
 * places the tool's home or single personas as course activities.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IdToken } from 'ltijs';
import { env } from './env.js';
import { setupLti, launchHtmlLoader, escapeHtml, mintFullscreenNonce } from '../../core/lti-provider.js';
import { findOrCreateStudent } from '../../core/students.js';
import { isTeacher } from '../../core/auth.js';
import { contextIdOf } from '../../core/reqctx.js';
import { listPersonas } from './personas.js';
import { TEMPLATES } from './templates.js';
import { registerPublicRoutes } from './public.js';

export { escapeHtml, mintFullscreenNonce };

const HERE = dirname(fileURLToPath(import.meta.url));
const loadLaunchHtml = launchHtmlLoader(join(HERE, '..', 'web', 'launch.html'));

const lti = setupLti({
  name: env.TOOL_NAME,
  description: 'Persona-based conversations for learning: historical thinkers, simulated clients and role-play partners, grounded in course materials',
  addon: registerPublicRoutes,
});

/** Successful launch: ltijs validated the JWT and set the session cookie. */
lti.onConnect(async (token: IdToken, req, res) => {
  const student = await findOrCreateStudent({
    sub: token.user,
    iss: token.iss,
    contextId: contextIdOf(token),
    displayName:
      token.userInfo.name ||
      [token.userInfo.given_name, token.userInfo.family_name].filter(Boolean).join(' ') ||
      'Student',
  });
  const role = isTeacher(token) ? 'teacher' : 'student';
  const lp = token.platformContext.launchPresentation as Record<string, unknown> | undefined;
  const rawReturnUrl = typeof lp?.return_url === 'string' ? lp.return_url : '';
  const returnUrl = /^https?:\/\//i.test(rawReturnUrl) ? rawReturnUrl : '';
  const rawPersonaId = String(token.platformContext.custom?.persona_id ?? '');
  const personaId = /^\d+$/.test(rawPersonaId) ? rawPersonaId : '';

  const html = loadLaunchHtml()
    .replaceAll('{{PERSONA_ID}}', personaId)
    .replaceAll('{{PUBLIC_SLUG}}', '')
    .replaceAll('{{TOOL_NAME}}', escapeHtml(env.TOOL_NAME))
    .replaceAll('{{RETURN_URL}}', escapeHtml(returnUrl))
    .replaceAll('{{DISPLAY_NAME}}', escapeHtml(student.display_name))
    // The label names where this launch came from: the placed activity's own title, else the course.
    .replaceAll('{{CONTEXT_TITLE}}', escapeHtml((personaId && token.platformContext.resource?.title) || token.platformContext.context?.title || ''))
    .replaceAll('{{ROLE}}', role);
  return res.send(html);
});

lti.onDeepLinking(async (token: IdToken, req, res) => {
  if (!isTeacher(token)) {
    return res.status(403).type('html').send('<p>Only instructors can select content.</p>');
  }
  const ltik = String((res.locals as { ltik?: string }).ltik ?? '');
  const scope = { iss: token.iss, contextId: contextIdOf(token) };
  const personas = await listPersonas(scope, { publishedOnly: false });
  const rows = personas
    .map((p) =>
      `<label class="row"><input type="checkbox" name="persona" value="${p.id}">` +
      `<span><strong>${escapeHtml(p.title)}</strong>` +
      `<span class="meta"> · ${escapeHtml(TEMPLATES[p.template].label)}${p.subtitle ? ' · ' + escapeHtml(p.subtitle) : ''}${p.status !== 'published' ? ' · <em>' + p.status + '</em>' : ''}</span>` +
      (p.summary ? `<div class="goal">${escapeHtml(p.summary)}</div>` : '') + `</span></label>`
    )
    .join('\n');
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
<p>Each selected item becomes its own activity on the course page. A persona placed on its own opens straight into that conversation. Draft personas can be placed now and published later.</p>
<form method="post" action="/api/deeplink?ltik=${encodeURIComponent(ltik)}">
  <label class="row"><input type="checkbox" name="home" value="1"><span><strong>${escapeHtml(env.TOOL_NAME)} home</strong><span class="meta"> · every persona in this course</span></span></label>
  <h2 style="font-size:1rem;margin:1rem 0 .5rem">Personas</h2>
  ${rows || '<div class="empty">No personas yet. Open the tool from the course, go to the Designer view, and create one first.</div>'}
  <button class="btn" type="submit">Add selected to course</button>
</form>
</body></html>`);
});

export { lti };
