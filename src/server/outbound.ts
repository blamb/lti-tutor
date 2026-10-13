/**
 * Outbound routing for platforms on the same private network.
 *
 * On some hosts (Reclaim Cloud / Virtuozzo) the LMS and this tool live in
 * the same private network, TLS is terminated at a shared load balancer the
 * containers cannot reach, and the LMS hostname resolves internally to a
 * node that only speaks plain HTTP. Every server-side call to the LMS
 * (OpenID configuration, dynamic registration, keyset, token and grade
 * endpoints) then fails with "connection refused" on port 443.
 *
 * PLATFORM_HTTP_HOSTS lists hostnames (comma-separated, optional :port) that
 * must be reached over plain HTTP instead of HTTPS. Requests keep the same
 * hostname (so the Host header and internal DNS stay right) and path; only
 * the scheme and port change. Nothing else is affected.
 *
 * Imported first by index.ts so the patch is in place before any client
 * (ltijs uses `got`, which picks `https.request` at call time) makes a call.
 */

import http from 'node:http';
import https from 'node:https';
import type { RequestOptions } from 'node:http';
import { env } from './env.js';

type Target = { port: number };

export function parsePlatformHttpHosts(value: string): Map<string, Target> {
  const out = new Map<string, Target>();
  for (const raw of value.split(',')) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const m = /^([^:/\s]+)(?::(\d{1,5}))?$/.exec(entry);
    if (!m) {
      console.warn(`[outbound] ignoring PLATFORM_HTTP_HOSTS entry "${raw.trim()}" (expected host or host:port)`);
      continue;
    }
    out.set(m[1]!, { port: m[2] ? Number(m[2]) : 80 });
  }
  return out;
}

type Args = [unknown, unknown?, unknown?];

/** Turn an https.request() argument list into http.request() arguments, or null if the host is not listed. */
export function rewriteRequestArgs(args: Args, hosts: Map<string, Target>): [RequestOptions, ((res: http.IncomingMessage) => void) | undefined] | null {
  const [a, b, c] = args;
  let url: URL | null = null;
  let options: RequestOptions = {};
  let cb: ((res: http.IncomingMessage) => void) | undefined;
  if (typeof a === 'string' || a instanceof URL) {
    url = new URL(String(a));
    if (typeof b === 'function') cb = b as typeof cb;
    else { options = (b as RequestOptions) ?? {}; cb = c as typeof cb; }
  } else {
    options = (a as RequestOptions) ?? {};
    cb = (typeof b === 'function' ? b : c) as typeof cb;
  }
  const rawHost = url?.hostname ?? (options.hostname ?? options.host) ?? '';
  const host = String(rawHost).toLowerCase().replace(/^\[|\]$/g, '').replace(/:\d+$/, '');
  const target = hosts.get(host);
  if (!target) return null;
  const path = url ? `${url.pathname}${url.search}` : (options.path ?? '/');
  const next: RequestOptions & { servername?: string } = {
    ...options,
    protocol: 'http:',
    hostname: host,
    host,
    port: target.port,
    path,
    headers: { ...(options.headers ?? {}) },
    // An https agent cannot carry a plain-HTTP socket; fall back to the default http agent.
    agent: undefined,
  };
  delete next.servername;
  return [next, cb];
}

export function installPlatformHttpRouting(hosts: Map<string, Target>): void {
  if (hosts.size === 0) return;
  const origRequest = https.request;
  const origGet = https.get;
  const patchedRequest = function (this: unknown, ...args: Args) {
    const r = rewriteRequestArgs(args, hosts);
    if (!r) return (origRequest as (...a: unknown[]) => http.ClientRequest).apply(https, args);
    return r[1] ? http.request(r[0], r[1]) : http.request(r[0]);
  };
  const patchedGet = function (this: unknown, ...args: Args) {
    const r = rewriteRequestArgs(args, hosts);
    if (!r) return (origGet as (...a: unknown[]) => http.ClientRequest).apply(https, args);
    const req = r[1] ? http.request(r[0], r[1]) : http.request(r[0]);
    req.end();
    return req;
  };
  (https as unknown as { request: unknown }).request = patchedRequest;
  (https as unknown as { get: unknown }).get = patchedGet;
  console.log(`[outbound] plain-HTTP routing for platform host(s): ${[...hosts.entries()].map(([h, t]) => `${h}:${t.port}`).join(', ')}`);
}

installPlatformHttpRouting(parsePlatformHttpHosts(env.PLATFORM_HTTP_HOSTS));
