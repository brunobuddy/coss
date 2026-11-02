/** System-level, one-off upgrade of still-active historical screening suspensions. */
import { db, schema } from "@coss/db";
import { and, asc, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import { parseEmailAddress } from "./schemas.ts";
import { lockScreeningDomain, screeningDomainReleasedSince } from "./screening-domain-memory.ts";

export async function backfillScreeningDomainBlocks(
  options: {
    /** Without apply, only count candidates. */
    apply?: boolean;
    scope?: { organizationIds: string[] };
  } = {},
): Promise<{ candidates: number; inserted: number }> {
  const {
    contentScreening: screening,
    email,
    reputationStanding: standing,
    emailSenderDomainBlock: blocks,
  } = schema;
  let cursor = "";
  let candidates = 0;
  let inserted = 0;
  while (true) {
    const rows = await db
      .select({
        cursor: screening.id,
        organizationId: email.organizationId,
        subjectId: email.id,
        from: email.from,
        createdAt: screening.createdAt,
      })
      .from(screening)
      .innerJoin(
        email,
        and(eq(email.id, screening.subjectId), eq(email.organizationId, screening.organizationId)),
      )
      .innerJoin(standing, eq(standing.organizationId, email.organizationId))
      .where(
        and(
          eq(screening.product, "email"),
          eq(screening.verdict, "blocked"),
          eq(screening.enforced, true),
          isNull(screening.groupId),
          isNull(email.subaccountId),
          eq(standing.status, "suspended"),
          eq(standing.reason, "content_screening"),
          or(isNull(standing.reinstatedAt), gte(screening.createdAt, standing.reinstatedAt)),
          gt(screening.id, cursor),
          options.scope ? inArray(email.organizationId, options.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(screening.id))
      .limit(200);
    if (!rows.length) return { candidates, inserted };
    candidates += rows.length;
    if (options.apply) {
      for (const row of rows) {
        // These were verified live senders at screening time. The identity may now have moved
        // or been deleted, so preserve the actual From domain, not the current owner's domains.
        const address = parseEmailAddress(row.from).address.toLowerCase();
        const domain = address.slice(address.lastIndexOf("@") + 1);
        inserted += await db.transaction(async (tx) => {
          // A concurrent support reinstatement must not be followed by a stale backfill.
          const [current] = await tx
            .select()
            .from(standing)
            .where(eq(standing.organizationId, row.organizationId))
            .for("update");
          if (current?.status !== "suspended" || current.reason !== "content_screening") return 0;
          if (current.reinstatedAt && row.createdAt < current.reinstatedAt) return 0;
          await lockScreeningDomain(tx, domain);
          if (await screeningDomainReleasedSince(tx, domain, row.createdAt)) return 0;
          const created = await tx
            .insert(blocks)
            .values({
              domain,
              organizationId: row.organizationId,
              subjectId: row.subjectId,
              createdAt: row.createdAt,
            })
            .onConflictDoNothing()
            .returning({ domain: blocks.domain });
          return created.length;
        });
      }
    }
    cursor = rows[rows.length - 1]?.cursor ?? cursor;
  }
}
