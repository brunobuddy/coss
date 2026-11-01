/** Dashboard CSV imports (the server action's body limit in next.config.ts leaves room for these). */
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Skipped rows shown after an import; the rest are only counted. */
export const MAX_REPORTED_INVALID_ROWS = 20;
