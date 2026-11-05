/**
 * Logs an error pg-boss emitted. Some of them are plain copies (`{ ...error, message, stack }`),
 * which the console capture can't recognize as errors: Sentry would report `[object Object]`.
 * Imports nothing, so `migrate.ts` can use it before any pool exists.
 */
export function logPgBossError(error: Error): void {
  const real = error instanceof Error ? error : Object.assign(new Error(), error as object);
  console.error("[jobs] pg-boss error:", real);
}
