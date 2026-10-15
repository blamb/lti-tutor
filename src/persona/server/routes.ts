/**
 * /api/* routes. All hang off lti.app, so ltijs's session validator guards
 * them and res.locals.token carries the validated launch claims.
 *
 *   POST /api/fullscreen-init   -> { url }   (full-screen handoff)
 *   GET  /api/me                -> { name, role, course }
 *   GET  /api/personas          -> { personas: [] }   (authoring arrives in the next phase)
 *   POST /api/deeplink          (form) -> auto-submitting deep-link form
 */

import express from 'express';
import type { Request, Response } from 'express';
import type { DeepLinkContentItem } from 'ltijs';
import { lti, mintFullscreenNonce } from './lti.js';
import { env } from './env.js';
import { tokenOf, studentFromToken, gateTeacher, contextIdOf } from '../../core/reqctx.js';
import { isTeacher } from '../../core/auth.js';

lti.app.use('/api', express.json({ limit: '2mb' }));

function fail(res: Response, e: unknown, where: string): void {
  console.error(`${where} failed:`, e);
  res.status(500).json({ error: (e as Error).message });
}

lti.app.post('/api/fullscreen-init', (req: Request, res: Response) => {
  const ltik = String(req.query.ltik ?? '');
  const nonce = mintFullscreenNonce(req.headers.cookie ?? '', ltik);
  res.json({ url: `${env.LTI_TOOL_URL}/fullscreen?n=${encodeURIComponent(nonce)}` });
});

lti.app.get('/api/me', async (req: Request, res: Response) => {
  try {
    const token = tokenOf(res);
    const me = await studentFromToken(token);
    res.json({
      name: me.display_name,
      role: isTeacher(token) ? 'teacher' : 'student',
      course: { id: contextIdOf(token), title: token.platformContext.context?.title ?? '' },
      model_default: env.PERSONA_MODEL,
    });
  } catch (e) {
    fail(res, e, 'GET /api/me');
  }
});

lti.app.get('/api/personas', async (_req: Request, res: Response) => {
  res.json({ personas: [] });
});

lti.app.post('/api/deeplink', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  const token = gateTeacher(res);
  if (!token) return;
  try {
    const items: DeepLinkContentItem[] = [];
    if (req.body?.home) {
      items.push({ type: 'ltiResourceLink', title: env.TOOL_NAME, text: 'Every persona in this course.', url: env.LTI_TOOL_URL });
    }
    if (items.length === 0) {
      res.status(400).type('html').send('<p>Nothing selected. Go back and tick at least one item.</p>');
      return;
    }
    const form = await lti.DeepLinking.createDeepLinkingForm(token, items, {
      message: `Added ${items.length} item${items.length === 1 ? '' : 's'} from ${env.TOOL_NAME}.`,
    });
    res.type('html').send(form);
  } catch (e) {
    fail(res, e, 'POST /api/deeplink');
  }
});
