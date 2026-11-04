import type { Loop } from "./loop.ts";

/**
 * Stops the worker in order: abort (ends the SQS long poll and long runs between items), wait for
 * every loop's current run, then `close` (the database pool). Nothing is abandoned midway: a
 * claimed webhook delivery finishes its attempt (10 s timeout), received SQS messages are recorded
 * and deleted, or stay in the queue and become visible again. Idempotent.
 */
export function createShutdown(options: {
  controller: AbortController;
  loops: readonly Pick<Loop, "name" | "stop">[];
  close: () => Promise<void>;
}): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= (async () => {
      options.controller.abort();
      await Promise.all(options.loops.map((loop) => loop.stop()));
      await options.close();
    })();
    return stopping;
  };
}
