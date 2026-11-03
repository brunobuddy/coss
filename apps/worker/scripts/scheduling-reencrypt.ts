// Step 3 of README.md, "Rotating SCHEDULING_DATA_KEYS". Exits 1 when anything is left over.
import { parseArgs } from "node:util";
import { closeDb } from "@coss/db";
import { reencryptSchedulingData } from "@coss/scheduling";
import { schedulingEnvShape } from "@coss/scheduling/env";
import { schedulingDataKeysFromEnv } from "@coss/scheduling/runtime";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "batch-size": { type: "string", default: "200" },
  },
});
const dryRun = values["dry-run"];
const batchSize = Number(values["batch-size"]);
if (!Number.isInteger(batchSize) || batchSize < 1) {
  throw new Error("--batch-size must be a positive whole number.");
}

// Never the development key `schedulingDataKeysFromEnv` falls back on.
const parsed = schedulingEnvShape.SCHEDULING_DATA_KEYS.safeParse(process.env.SCHEDULING_DATA_KEYS);
if (!process.env.SCHEDULING_DATA_KEYS || !parsed.success) {
  throw new Error("SCHEDULING_DATA_KEYS must be set to 32-byte base64 keys, newest first.");
}
const keys = schedulingDataKeysFromEnv({ SCHEDULING_DATA_KEYS: parsed.data });
if (!keys) throw new Error("SCHEDULING_DATA_KEYS is empty.");
console.info(
  `[scheduling] keys: ${keys.keys.map((key, index) => (index === 0 ? `${key.id} (encrypts)` : key.id)).join(", ")}`,
);

try {
  const result = await reencryptSchedulingData({ keys, dryRun, batchSize });
  console.info(
    `[scheduling] ${result.checked} attendees and booker sessions checked, ${result.reencrypted} ` +
      `${dryRun ? "to re-encrypt (dry run)" : "re-encrypted"}, ${result.conflicts} changed meanwhile, ` +
      `${result.unreadableCount} unreadable values.`,
  );
  for (const row of result.unreadable) {
    console.error(
      `[scheduling] unreadable: ${row.column} of ${row.id} (organization ${row.organizationId}): ${row.error}`,
    );
  }
  if (result.unreadableCount > result.unreadable.length) {
    console.error(
      `[scheduling] and ${result.unreadableCount - result.unreadable.length} more unreadable values.`,
    );
  }
  if (result.unreadableCount > 0 || result.conflicts > 0) {
    console.error(
      "[scheduling] Not done: keep every current key in SCHEDULING_DATA_KEYS and run this again.",
    );
    process.exitCode = 1;
  } else if (!dryRun) {
    console.info(`[scheduling] Done: only ${keys.primary.id} is needed now.`);
  }
} finally {
  await closeDb();
}
