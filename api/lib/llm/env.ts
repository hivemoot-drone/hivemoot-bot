/**
 * Environment Variable Normalization — LLM module re-export
 *
 * `normalizeEnvString` now lives in `api/lib/env-validation.ts` (the general
 * env bootstrap module). It is re-exported here so that existing LLM callers
 * (`byok.ts`, `provider.ts`) continue to import from `./env.js` without change.
 */

export { normalizeEnvString } from "../env-validation.js";
