import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { logPgBossError } from "./boss-errors.ts";
import { aheadPartitionsSql, HOOK_PARTITIONS } from "./partition-specs.ts";

const useTestDatabase = process.argv.includes("--test");
const url = useTestDatabase ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  throw new Error(`${useTestDatabase ? "TEST_DATABASE_URL" : "DATABASE_URL"} is not set`);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  // Tables without a default partition reject rows outside their days: make sure this week's
  // exist even before a worker runs (local and test databases).
  for (const spec of HOOK_PARTITIONS) {
    for (const statement of aheadPartitionsSql(spec, new Date())) await pool.query(statement);
  }
  // pg-boss installs or upgrades its own schema (`pgboss`) on start; app processes only check it.
  const boss = new PgBoss({ connectionString: url, max: 1, supervise: false, schedule: false });
  boss.on("error", logPgBossError);
  await boss.start();
  await boss.stop({ graceful: false });
  console.info(`Migrated ${new URL(url).pathname.slice(1)}`);
} finally {
  await pool.end();
}
