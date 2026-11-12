/**
 * Module Builder's LTI surface: provider setup (core/lti-provider.ts) and
 * the launch handler that renders launch.html. The tool is for course
 * designers and instructors only; a student launch gets a short notice. It
 * places nothing on the course page, so deep linking only explains that.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IdToken } from 'ltijs';
import { env } from './env.js';
import { setupLti, launchHtmlLoader, escapeHtml, mintFullscreenNonce } from '../../core/lti-provider.js';
import { isTeacher } from '../../core/auth.js';
import { studentFromToken } from '../../core/reqctx.js';

export { escapeHtml, mintFullscreenNonce };

const HERE = dirname(fileURLToPath(import.meta.url));
const loadLaunchHtml = launchHtmlLoader(join(HERE, '..', 'web', 'launch.html'));

const lti = setupLti({
  name: env.TOOL_NAME,
  description: 'Turns a Word course draft with production notes into a Moodle restore file: Book pages, accordions, hints, callouts and H5P activities',
});

lti.onConnect(async (token: IdToken, req, res) => {
  if (!isTeacher(token)) {
    return res.status(403).type('html').send(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(env.TOOL_NAME)}</title>` +
      `<body style="font-family:sans-serif;margin:2rem"><h1 style="font-size:1.2rem">${escapeHtml(env.TOOL_NAME)}</h1>` +
      `<p>This tool is for course designers and instructors. There is nothing here for students.</p></body></html>`
    );
  }
  const me = await studentFromToken(token);
  const html = loadLaunchHtml()
    .replaceAll('{{TOOL_NAME}}', escapeHtml(env.TOOL_NAME))
    .replaceAll('{{DISPLAY_NAME}}', escapeHtml(me.display_name))
    .replaceAll('{{CONTEXT_TITLE}}', escapeHtml(token.platformContext.context?.title || ''));
  return res.send(html);
});

lti.onDeepLinking(async (_token: IdToken, _req, res) => {
  res.type('html').send(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(env.TOOL_NAME)}</title>` +
    `<body style="font-family:sans-serif;margin:2rem"><p>${escapeHtml(env.TOOL_NAME)} has no content to place. ` +
    `Add it to the course as an external tool, open it, and restore the file it gives you.</p></body></html>`
  );
});

export { lti };
