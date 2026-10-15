/**
 * Environment shared by every app in this repository.
 *
 * Each app (tutor, persona) spreads `coreEnv` into its own `env` and adds
 * its own variables (tool name, chat model, retention). `APP` names the app
 * a process runs as, so `.env.<app>` can override `.env` when two apps run
 * side by side on one machine; deployments set plain variables and no APP.
 */

import { config as loadDotenv } from 'dotenv';

export const APP_NAMES = ['tutor', 'persona'] as const;
export type AppName = (typeof APP_NAMES)[number];

export function appNameOf(raw: string | undefined): AppName {
  const v = (raw ?? '').trim().toLowerCase();
  return (APP_NAMES as readonly string[]).includes(v) ? (v as AppName) : 'tutor';
}

export const APP: AppName = appNameOf(process.env.APP);

// Earlier files win, so `.env.<app>` overrides `.env`; neither overrides a
// variable already set in the process environment.
loadDotenv({ path: [`.env.${APP}`, '.env'], quiet: true } as Parameters<typeof loadDotenv>[0]);

export function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v;
}

export function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function optionalInt(name: string, fallback: number, min = 0): number {
  return Math.max(min, parseInt(optional(name, String(fallback)), 10) || fallback);
}

export const coreEnv = {
  APP,
  LTI_TOOL_URL: required('LTI_TOOL_URL'),
  PORT: parseInt(optional('PORT', '3000'), 10),
  DATABASE_URL: required('DATABASE_URL'),
  LTI_COOKIE_SECRET: required('LTI_COOKIE_SECRET'),
  // Encrypts per-course Moodle web-service tokens at rest (secrets.ts).
  // Empty = derive from LTI_COOKIE_SECRET.
  TOKEN_SECRET: optional('TOKEN_SECRET', ''),
  ANTHROPIC_API_KEY: optional('ANTHROPIC_API_KEY', ''),
  // An Anthropic-compatible endpoint (e.g. a sovereign or institutional
  // gateway). Empty = api.anthropic.com.
  ANTHROPIC_BASE_URL: optional('ANTHROPIC_BASE_URL', ''),
  // LMS hostnames (comma-separated, optional :port) the server must reach
  // over plain HTTP because they share a private network where TLS ends at a
  // load balancer the container cannot reach. See outbound.ts.
  PLATFORM_HTTP_HOSTS: optional('PLATFORM_HTTP_HOSTS', ''),
  NODE_ENV: optional('NODE_ENV', 'development'),
  // Out-of-band admin endpoints are disabled when empty.
  ADMIN_TOKEN: optional('ADMIN_TOKEN', ''),
  // The model for summaries, drafts and other structured calls (llm.ts).
  // Each app names its conversation model separately. Prices live in costs.ts.
  GEN_MODEL: optional('GEN_MODEL', 'claude-haiku-4-5'),
} as const;

/** Back-compat alias for core modules; apps import their own `env`. */
export const env = coreEnv;

export const isProd = coreEnv.NODE_ENV === 'production';
