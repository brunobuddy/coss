import { db, schema } from "@coss/db";

/** Turns HIPAA mode on directly, for tests of what it changes rather than how it's turned on. */
export async function enableTestHipaaMode(organizationId: string): Promise<void> {
  await db
    .insert(schema.organizationHipaaMode)
    .values({
      organizationId,
      baaSignedAt: new Date("2026-11-01T00:00:00Z"),
      baaReference: "BAA-TEST",
    })
    .onConflictDoNothing();
}
