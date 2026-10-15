/**
 * Production entry: `npm start` builds, then runs this. APP (tutor | persona,
 * default tutor) picks the app; its migrations run first, then its server.
 */

import { APP } from './core/env.js';
import { migrateApp } from './core/migrate.js';

await migrateApp(APP);
await import(`./${APP}/server/index.js`);
