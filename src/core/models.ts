/**
 * What each model generation needs in a request, in one place for both apps.
 *
 * The 5.x models (Haiku 5.5, Sonnet 5.5, Opus 5.5 …) think before answering by
 * default, and that thinking counts against max_tokens; they take
 * `output_config.effort` to set how much. Haiku 4.5 and older models take no
 * effort parameter (sending one is an error) and do not think unless asked.
 * Every call states the output it needs; requestOptions() adds headroom for
 * thinking and the effort level only where the model uses them.
 */

export type Effort = 'low' | 'medium' | 'high';

/** Models that predate the effort parameter, or never took it. */
const NO_EFFORT = /^claude-(3|instant)|^claude-[a-z]+-4-[015](\b|-)|^claude-haiku-4-5/;

export function supportsEffort(model: string): boolean {
  return !NO_EFFORT.test(model);
}

/** Room for thinking on top of the visible output, on models that think by default. */
export const THINKING_HEADROOM = 3000;

/**
 * max_tokens and effort for one call. `maxTokens` is the visible output the
 * call needs; on a thinking model the cap grows by THINKING_HEADROOM so
 * thinking cannot crowd out the answer.
 */
export function requestOptions(model: string, o: { maxTokens: number; effort: Effort }): {
  max_tokens: number;
  output_config?: { effort: Effort };
} {
  return supportsEffort(model)
    ? { max_tokens: o.maxTokens + THINKING_HEADROOM, output_config: { effort: o.effort } }
    : { max_tokens: o.maxTokens };
}
