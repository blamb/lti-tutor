/**
 * Migration runner. Applies every .sql file in each given directory in name
 * order, once; idempotent (files already recorded in _migration are skipped).
 *
 * Each app's schema is the core migrations (student, material, session,
 * turns, api_call) followed by its own. Core files are recorded with a
 * "core/" prefix so they never collide with an app's numbering.
 *
 * Run: `npm run db:migrate` (APP=persona for the persona app).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';
import type { AppName } from './env.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface MigrationDir {
  dir: string;
  /** Prepended to the recorded name; '' for an app's own files. */
  prefix: string;
}

/** The core directory and the app's own, in the order they apply. */
export function migrationDirsFor(app: AppName): MigrationDir[] {
  return [
    { dir: join(HERE, 'migrations'), prefix: 'core/' },
    { dir: join(HERE, '..', app, 'migrations'), prefix: '' },
  ];
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    create table if not exists _migration (
      name        text        primary key,
      applied_at  timestamptz not null default now()
    )
  `);
}

export async function runMigrations(dirs: MigrationDir[], log: (line: string) => void = console.log): Promise<{ applied: number; total: number }> {
  try {
    await ensureMigrationsTable();
  } catch (e) {
    throw new Error(`cannot reach DB — ${(e as Error).message}. Is Postgres running? (docker compose up -d postgres)`);
  }
  const rows = await query<{ name: string }>(`select name from _migration`);
  const applied = new Set(rows.map((r) => r.name));

  let n = 0;
  for (const { dir, prefix } of dirs) {
    log(`migrate: scanning ${dir}`);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const name = prefix + file;
      if (applied.has(name)) {
        log(`  skip  ${name}  (already applied)`);
        continue;
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      log(`  apply ${name}`);
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(`insert into _migration (name) values ($1)`, [name]);
        await client.query('commit');
        n++;
      } catch (e) {
        await client.query('rollback');
        throw new Error(`FAILED on ${name}: ${(e as Error).message}`);
      } finally {
        client.release();
      }
    }
  }
  log(`migrate: applied ${n} new migration(s); ${applied.size + n} total`);
  return { applied: n, total: applied.size + n };
}

export async function migrateApp(app: AppName): Promise<void> {
  await runMigrations(migrationDirsFor(app));
}
