/**
 * Small helpers shared by every module that calls the model: pull the text
 * out of a response, strip code fences, and ask for JSON that must match a
 * zod schema (with one correction retry). Every call is recorded in api_call.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { getAnthropic, GEN_MODEL } from './anthropic.js';
import { recordApiCall, type Attribution } from './costs.js';

export function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

/** Ask for JSON, parse against a schema, retry once with a correction nudge. */
export async function jsonCall<T>(params: {
  schema: z.ZodType<T>;
  system: string | Anthropic.TextBlockParam[];
  userPrompt: string;
  maxTokens: number;
  attribution: Attribution;
  endpoint: string;
  /** Applied to the parsed JSON before schema validation. */
  preprocess?: (raw: unknown) => unknown;
}): Promise<T> {
  const client = getAnthropic();
  const pre = params.preprocess ?? ((x: unknown) => x);
  const t0 = Date.now();
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.userPrompt }],
  });
  void recordApiCall({ ...params.attribution, endpoint: params.endpoint, model: GEN_MODEL, usage: res.usage, durationMs: Date.now() - t0 });
  try {
    return params.schema.parse(pre(JSON.parse(stripFences(textOf(res)))));
  } catch {
    const t1 = Date.now();
    const retry = await client.messages.create({
      model: GEN_MODEL,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [
        { role: 'user', content: params.userPrompt },
        { role: 'assistant', content: textOf(res) || '(empty)' },
        { role: 'user', content: 'That was not valid JSON matching the schema. Return ONLY the JSON object.' },
      ],
    });
    void recordApiCall({ ...params.attribution, endpoint: params.endpoint + '.retry', model: GEN_MODEL, usage: retry.usage, durationMs: Date.now() - t1 });
    return params.schema.parse(pre(JSON.parse(stripFences(textOf(retry)))));
  }
}
