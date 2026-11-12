/** Module Builder's environment: everything shared (core/env.ts) plus its own. */

import { coreEnv, optional } from '../../core/env.js';

export { isProd } from '../../core/env.js';

export const env = {
  ...coreEnv,
  TOOL_NAME: optional('TOOL_NAME', 'Module Builder'),
  // The model that reads each free-form H5P specification into a structured
  // activity. This is a judgement task done a handful of times per module,
  // so the default is the stronger model. Prices live in core/costs.ts.
  BUILDER_MODEL: optional('BUILDER_MODEL', 'claude-sonnet-5-5'),
} as const;
