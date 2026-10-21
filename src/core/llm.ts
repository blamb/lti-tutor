/**
 * Small helpers shared by every module that calls the model: pull the text
 * out of a response, strip code fences, and ask for JSON that must match a
 * zod schema (structured output, one correction retry). Every call is
 * recorded in api_call.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropic, GEN_MODEL } from './anthropic.js';
import { recordApiCall, type Attribution } from './costs.js';
import { requestOptions, type Effort } from './models.js';

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

/**
 * Ask for JSON that matches a zod schema. The request uses structured output
 * (`output_config.format`), so the model cannot return malformed JSON; the
 * SDK moves keywords the API does not enforce (lengths, enums, bounds) into
 * field descriptions, and the zod schema checks them here. A response that
 * still fails validation gets one correction retry with the error.
 *
 * `output` is the shape the model writes, when it differs from `schema`
 * (fields the caller fills in itself, such as a summary's `kind`); `schema`
 * validates the result after `preprocess`. Effort and thinking headroom come
 * from the model (models.ts).
 */
export async function jsonCall<T>(params: {
  schema: z.ZodType<T>;
  output?: z.ZodType;
  system: string | Anthropic.TextBlockParam[];
  userPrompt: string;
  maxTokens: number;
  effort?: Effort;
  attribution: Attribution;
  endpoint: string;
  /** Applied to the parsed JSON before schema validation. */
  preprocess?: (raw: unknown) => unknown;
  /** Defaults to GEN_MODEL. */
  model?: string;
}): Promise<T> {
  const client = getAnthropic();
  const model = params.model ?? GEN_MODEL;
  const pre = params.preprocess ?? ((x: unknown) => x);
  const opts = requestOptions(model, { maxTokens: params.maxTokens, effort: params.effort ?? 'medium' });
  const output_config = { ...opts.output_config, format: formatFor(params.output ?? params.schema) };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.userPrompt }];
  const call = async (msgs: Anthropic.MessageParam[], endpoint: string): Promise<Anthropic.Message> => {
    const t0 = Date.now();
    const res = await client.messages.create({ model, max_tokens: opts.max_tokens, system: params.system, messages: msgs, output_config } as Anthropic.MessageCreateParamsNonStreaming);
    void recordApiCall({ ...params.attribution, endpoint, model, usage: res.usage, durationMs: Date.now() - t0 });
    return res;
  };
  const parse = (res: Anthropic.Message): T => {
    if (res.stop_reason === 'max_tokens') throw new Error(`${params.endpoint}: the reply hit max_tokens (${opts.max_tokens}) before the JSON was complete`);
    if (res.stop_reason === 'refusal') throw new Error(`${params.endpoint}: the model declined the request`);
    return params.schema.parse(pre(JSON.parse(stripFences(textOf(res)))));
  };
  const res = await call(messages, params.endpoint);
  try {
    return parse(res);
  } catch (e) {
    if (res.stop_reason === 'refusal') throw e;
    const retry = await call([
      ...messages,
      { role: 'assistant', content: textOf(res) || '(empty)' },
      { role: 'user', content: `That did not pass validation (${(e as Error).message.slice(0, 600)}). Return the corrected JSON object.` },
    ], params.endpoint + '.retry');
    return parse(retry);
  }
}

/** The structured-output format for a schema; undefined when the SDK cannot express it, and the call then relies on the prompt. */
function formatFor(schema: z.ZodType): ReturnType<typeof zodOutputFormat> | undefined {
  try {
    return zodOutputFormat(schema);
  } catch (e) {
    console.warn('structured output: schema not expressible, falling back to prompt-only JSON:', (e as Error).message);
    return undefined;
  }
}
