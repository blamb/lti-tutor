/**
 * LTI 1.3 provider setup shared by the apps: ltijs with the Sequelize-backed
 * Postgres plugin, cookies for a cross-site launch iframe, and the
 * out-of-band endpoints mounted before ltijs's session validator
 * (/healthz, /fullscreen, /vendor, /admin/costs). Each app calls `setupLti`
 * once, then registers its own launch, deep-linking and /api handlers on
 * the returned provider.
 *
 * Cookies are sameSite=None + secure because the launch iframe is on the
 * tool's HTTPS origin while the LMS is on another site.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { randomBytes } from 'node:crypto';
import ltijs, { type ProviderInstance } from 'ltijs';
import Database from 'ltijs-sequelize';
import { env, isProd } from './env.js';
import { getCostSummary } from './costs.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ─── Full-screen session handoff ─────────────────────────────────────────────
// Cookie-partitioning browsers (Firefox Total Cookie Protection) hide a
// cookie set inside a cross-site iframe from a later top-level navigation,
// so "Full screen" would 401. An in-iframe call mints a single-use nonce
// bound to the session cookies + ltik; GET /fullscreen redeems it, re-issues
// the cookies first-party, and redirects into the app. Voice input needs
// this too: the LMS iframe doesn't grant microphone access.
const FULLSCREEN_NONCE_TTL_MS = 10 * 60_000;
const fullscreenNonces = new Map<string, { cookieHeader: string; ltik: string; expires: number }>();

export function mintFullscreenNonce(cookieHeader: string, ltik: string): string {
  const now = Date.now();
  for (const [k, v] of fullscreenNonces) if (v.expires < now) fullscreenNonces.delete(k);
  const nonce = randomBytes(24).toString('base64url');
  fullscreenNonces.set(nonce, { cookieHeader, ltik, expires: now + FULLSCREEN_NONCE_TTL_MS });
  return nonce;
}

/** A launch page loader: hot-reloads in development, caches in production. */
export function launchHtmlLoader(path: string): () => string {
  let cache: string | null = null;
  return () => {
    if (!isProd) return readFileSync(path, 'utf8');
    if (!cache) cache = readFileSync(path, 'utf8');
    return cache;
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Browser libraries served from this origin (no CDN). */
const VENDOR: Record<string, string> = {
  'marked.umd.js': join(HERE, '..', '..', 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  'purify.min.js': join(HERE, '..', '..', 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
};

export interface LtiToolOptions {
  /** Shown in the LMS's tool registration. */
  name: string;
  description: string;
}

/**
 * Configure ltijs for this process. ltijs's Provider is a singleton, so this
 * runs once per app; the app registers onConnect / onDeepLinking afterwards.
 */
export function setupLti(opts: LtiToolOptions): ProviderInstance {
  const { Provider: lti } = ltijs;
  const dbUrl = new URL(env.DATABASE_URL);
  const ltiDb = new Database(
    decodeURIComponent(dbUrl.pathname.replace(/^\//, '')) || 'lti_tutor',
    decodeURIComponent(dbUrl.username || 'postgres'),
    decodeURIComponent(dbUrl.password || ''),
    {
      host: dbUrl.hostname || 'localhost',
      port: parseInt(dbUrl.port || '5432', 10),
      dialect: 'postgres',
      logging: false,
      dialectOptions: /sslmode=require/i.test(env.DATABASE_URL)
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : undefined,
    }
  );

  lti.setup(
    env.LTI_COOKIE_SECRET,
    { plugin: ltiDb },
    {
      cookies: { secure: true, sameSite: 'None' },
      devMode: false,
      dynReg: {
        url: env.LTI_TOOL_URL,
        name: opts.name,
        description: opts.description,
        redirectUris: [env.LTI_TOOL_URL],
        autoActivate: true,
      },
      serverAddon: (server) => {
        server.get('/healthz', (_req, res) => {
          const sha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown';
          res.json({ status: 'ok', app: env.APP, commit: sha, env: env.NODE_ENV, uptime_s: Math.round(process.uptime()) });
        });

        server.get('/fullscreen', (req, res) => {
          const nonce = String(req.query.n ?? '');
          const entry = fullscreenNonces.get(nonce);
          fullscreenNonces.delete(nonce);
          if (!entry || entry.expires < Date.now()) {
            return res.status(410).type('html').send(
              `<p>This full-screen link has expired. Go back to your course, open ${escapeHtml(opts.name)}, and click “Full screen” again.</p>`
            );
          }
          const cookies = entry.cookieHeader.split(';').map((c) => c.trim()).filter(Boolean);
          res.setHeader('Set-Cookie', cookies.map((c) => `${c}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`));
          res.redirect(`/?ltik=${encodeURIComponent(entry.ltik)}`);
        });

        server.get('/vendor/:file', (req, res) => {
          const path = VENDOR[String(req.params.file)];
          if (!path) return res.status(404).end();
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.sendFile(path);
        });

        // Operator-only cost summary (JSON). Not exposed inside the LMS.
        server.get('/admin/costs', async (req, res) => {
          if (!env.ADMIN_TOKEN) return res.status(503).type('text').send('Admin endpoints are disabled (set ADMIN_TOKEN).');
          const supplied = (req.query.token as string) || req.headers['x-admin-token'];
          if (supplied !== env.ADMIN_TOKEN) return res.status(401).type('text').send('Unauthorized');
          try {
            res.json(await getCostSummary());
          } catch (e) {
            res.status(500).type('text').send('Error: ' + (e as Error).message);
          }
        });
      },
    }
  );

  lti.onInvalidToken((req, res) => {
    return res.status(401).send('LTI launch failed: invalid or expired token. Try launching from the course again.');
  });

  return lti;
}

/** The lines every app prints once it is listening. */
export function startupBanner(toolName: string): string {
  return [
    `\n${toolName} is live (${env.APP})`,
    `  Local:     http://localhost:${env.PORT}`,
    `  Public:    ${env.LTI_TOOL_URL}`,
    `  Register:  ${env.LTI_TOOL_URL}/register   (Moodle: Manage tools → Dynamic registration)`,
    `  Keyset:    ${env.LTI_TOOL_URL}/keys\n`,
  ].join('\n');
}
