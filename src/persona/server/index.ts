/**
 * Persona Chat's server entry. Loads env, wires LTI handlers and routes,
 * deploys ltijs (which owns the Express app). Migrations run via
 * `APP=persona npm run db:migrate` (and in src/start.ts before `npm start`).
 */

import '../../core/outbound.js'; // first: routes listed platform hosts over internal HTTP before any client loads
import { env } from './env.js';
import { lti } from './lti.js';
import { pool } from '../../core/db.js';
import { startupBanner } from '../../core/lti-provider.js';
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
      `  PERSONA_MODEL=${env.PERSONA_MODEL}  GEN_MODEL=${env.GEN_MODEL}  DATA_RETENTION_DAYS=${env.DATA_RETENTION_DAYS}`
  );
  console.log(startupBanner(env.TOOL_NAME));
}

main().catch((e) => {
  console.error('Server crashed during startup:', e);
  process.exit(1);
});
