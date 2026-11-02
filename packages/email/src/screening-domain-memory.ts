import { type Executor, schema } from "@coss/db";
import { and, eq, gte, sql } from "drizzle-orm";

/** Serialize blocks, support releases and historical backfills for the same domain. */
export async function lockScreeningDomain(tx: Executor, domain: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`screening-domain:${domain}`}, 0))`,
  );
}

/** The audit trail outlives the historical verdicts, so an approved release is not backfilled. */
export async function screeningDomainReleasedSince(
  tx: Executor,
  domain: string,
  blockedAt: Date,
): Promise<boolean> {
  const audit = schema.adminAuditEvent;
  const [release] = await tx
    .select({ id: audit.id })
    .from(audit)
    .where(
      and(
        eq(audit.action, "email.domain_screening_released"),
        eq(audit.targetType, "email_domain"),
        eq(audit.targetId, domain),
        gte(audit.createdAt, blockedAt),
      ),
    )
    .limit(1);
  return Boolean(release);
}
