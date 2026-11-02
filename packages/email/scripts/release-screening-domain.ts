/** Operator-only recovery when a restricted domain changes hands or its source org was deleted. */

import { parseArgs } from "node:util";
import { closeDb } from "@coss/db";
import { clearScreeningDomainBlock } from "../src/screening.ts";

const { values } = parseArgs({
  options: {
    domain: { type: "string" },
    admin: { type: "string" },
    note: { type: "string" },
  },
});
try {
  if (!values.domain || !values.admin || !values.note) {
    throw new Error("Usage: --domain example.com --admin <admin user id> --note <review note>");
  }
  const released = await clearScreeningDomainBlock({
    domain: values.domain,
    adminUserId: values.admin,
    note: values.note,
  });
  console.log(JSON.stringify({ released }));
} finally {
  await closeDb();
}
