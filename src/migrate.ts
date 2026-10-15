/** `npm run db:migrate` — apply the core migrations and the app's (APP=tutor | persona). */

import { APP } from './core/env.js';
import { migrateApp } from './core/migrate.js';
import { close } from './core/db.js';

try {
  await migrateApp(APP);
} catch (e) {
  console.error(`migrate: ${(e as Error).message}`);
  process.exit(1);
}
await close();
