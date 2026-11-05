/**
 * Background jobs on pg-boss, in the app database's `pgboss` schema. `bun run db:migrate` installs
 * and upgrades that schema (`src/migrate.ts`); processes only check it on start (`migrate: false`), so several
 * instances never race a pg-boss upgrade.
 */
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import { logPgBossError } from "./boss-errors.ts";
import type { Transaction } from "./client.ts";

export type { Job, SendOptions } from "pg-boss";
export { PgBoss } from "pg-boss";

export type JobBossOptions = {
  /**
   * Workers: run pg-boss maintenance (expiring, retrying and deleting jobs) and wake up on NOTIFY.
   * This opens a four-connection pg-boss pool and one LISTEN connection on `DATABASE_URL`.
   * Producers leave it off and use a separate one-connection pool for queue metadata.
   */
  worker?: boolean;
};

/** A started pg-boss instance. `stop()` it on shutdown to close its own pool. */
export async function startJobBoss(opts: JobBossOptions = {}): Promise<PgBoss> {
  const common = { migrate: false, schedule: false } as const;
  const boss = opts.worker
    ? new PgBoss({
        ...common,
        connectionString: process.env.DATABASE_URL,
        max: 4,
        supervise: true,
        useListenNotify: true,
        application_name: "coss-worker-jobs",
      })
    : new PgBoss({
        ...common,
        supervise: false,
        // send() reads uncached queue metadata outside the supplied transaction. Sharing the
        // app pool would deadlock when transactions occupy every connection (including max=1).
        connectionString: process.env.DATABASE_URL,
        max: 1,
        application_name: "coss-producer-jobs",
      });
  boss.on("error", logPgBossError);
  return boss.start();
}

/** Runs pg-boss statements (e.g. `send`) inside a Drizzle transaction: the job commits with it. */
export function inTransaction(tx: Transaction): { db: ReturnType<typeof fromDrizzle> } {
  return { db: fromDrizzle(tx, sql) };
}
