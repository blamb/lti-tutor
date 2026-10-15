/** Persona Chat's environment: everything shared (core/env.ts) plus its own. */

import { coreEnv, optional, optionalInt } from '../../core/env.js';

export { isProd } from '../../core/env.js';

export const env = {
  ...coreEnv,
  TOOL_NAME: optional('TOOL_NAME', 'Persona Chat'),
  // The deployment-wide default for persona conversations. Instructors pick
  // a model per persona in the designer view; this is what a new persona
  // starts with. Prices live in core/costs.ts.
  PERSONA_MODEL: optional('PERSONA_MODEL', 'claude-haiku-5-5'),
  // Transcripts older than this many days are deleted nightly; debriefs and
  // the instructor's report stay. 0 = keep indefinitely.
  DATA_RETENTION_DAYS: optionalInt('DATA_RETENTION_DAYS', 0),
} as const;
