/** The tutor's environment: everything shared (core/env.ts) plus its own. */

import { coreEnv, optional, optionalInt } from '../../core/env.js';

export { isProd } from '../../core/env.js';

export const env = {
  ...coreEnv,
  TOOL_NAME: optional('TOOL_NAME', 'LTI Tutor'),
  // The tutorial conversation; see .env.example. Prices live in core/costs.ts.
  TUTOR_MODEL: optional('TUTOR_MODEL', 'claude-haiku-5-5'),
  // Transcripts (tutor_turn) older than this many days are deleted nightly;
  // summaries, the learner model and reports stay. 0 = keep indefinitely.
  DATA_RETENTION_DAYS: optionalInt('DATA_RETENTION_DAYS', 0),
} as const;
