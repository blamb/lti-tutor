/**
 * Lazily constructed Anthropic client so the server can start without a key
 * (LTI-only smoke tests). The SDK retries 408/409/429/5xx (incl. 529 overload)
 * with backoff; the timeout is tightened so a hung request doesn't leave a
 * student waiting indefinitely.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env to use the model.');
  }
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Sovereignty: point the same build at an Anthropic-compatible endpoint.
      ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
      maxRetries: 5,
      timeout: 90_000,
    });
  }
  return client;
}

/** Summaries, drafts, debriefs and other structured calls. Conversation models are per app. */
export const GEN_MODEL = env.GEN_MODEL;
