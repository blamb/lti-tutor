/**
 * Module Builder's server entry. Loads env, wires the LTI handlers and
 * routes, deploys ltijs (which owns the Express app). Migrations run via
 * `APP=builder npm run db:migrate` (and in src/start.ts before `npm start`).
 */

import '../../core/outbound.js'; // first: routes listed platform hosts over internal HTTP before any client loads
import { env } from './env.js';
import { lti } from './lti.js';
import { pool } from '../../core/db.js';
import { startupBanner } from '../../core/lti-provider.js';
import { resumeUnfinished } from './builds.js';
import './routes.js'; // side-effect: registers /api/* routes on lti.app

async function main(): Promise<void> {
  try {
    await pool.query('select 1');
  } catch (e) {
    console.error('FATAL: cannot reach Postgres at DATABASE_URL.');
    console.error(`       ${(e as Error).message}`);
    process.exit(1);
  }

  await lti.deploy({ port: env.PORT });

  console.log(
    `[env] ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'}` +
      `  ANTHROPIC_BASE_URL=${env.ANTHROPIC_BASE_URL || '(default)'}` +
      `  ADMIN_TOKEN=${env.ADMIN_TOKEN ? 'set' : 'MISSING'}  NODE_ENV=${env.NODE_ENV}` +
      `  BUILDER_MODEL=${env.BUILDER_MODEL}`
  );
  console.log(startupBanner(env.TOOL_NAME));
  // A restart in the middle of the AI step would leave a draft "reading" forever.
  void resumeUnfinished();
}

main().catch((e) => {
  console.error('Server crashed during startup:', e);
  process.exit(1);
});
