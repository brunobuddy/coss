/** Run after db:migrate; dry-run by default. Uses the worker's existing database access. */
import { closeDb } from "@coss/db";
import { backfillScreeningDomainBlocks } from "../src/screening-domain-backfill.ts";

try {
  const apply = process.argv.includes("--apply");
  console.log(JSON.stringify({ apply, ...(await backfillScreeningDomainBlocks({ apply })) }));
} finally {
  await closeDb();
}
