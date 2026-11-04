/**
 * Email metering: a live email is billed once, for its recipients, when it becomes `sent` (once
 * more on `email.dedicated_ip` when it went through the organization's dedicated IPs, and on
 * `email.attachment_data` for attachments past its included size, per recipient).
 */
import { billableEmailMegabytes, recordUsage } from "@coss/billing/metering";
import { type Executor, schema } from "@coss/db";
import { and, count, eq, isNull, ne, type SQL, sql, sum } from "drizzle-orm";

const { email, emailAttachment, emailRecipient } = schema;

/**
 * The recipients a send is billed for: the ones handed to the provider (suppressed ones are left
 * out). Frozen when a dispatcher claims the email, so later status changes don't move it.
 */
export function billableRecipientsSql(target: { id: string; organizationId: string }): SQL<number> {
  return sql<number>`(select count(*)::int from ${emailRecipient} where ${emailRecipient.organizationId} = ${target.organizationId} and ${emailRecipient.emailId} = ${target.id} and ${emailRecipient.status} <> 'suppressed')`;
}

export async function freezeBillableRecipients(
  executor: Executor,
  target: { id: string; organizationId: string },
): Promise<void> {
  await executor
    .update(email)
    .set({ billableRecipients: billableRecipientsSql(target) })
    .where(and(eq(email.id, target.id), eq(email.organizationId, target.organizationId)));
}

/**
 * Meters a live email that just became `sent`, in that transaction. Every path to `sent` calls
 * it; the compare-and-set on `usage_recorded_at` makes it once-only.
 */
export async function recordEmailUsage(
  tx: Executor,
  target: { id: string; organizationId: string },
): Promise<void> {
  const [row] = await tx
    .update(email)
    .set({ usageRecordedAt: sql`transaction_timestamp()` })
    .where(
      and(
        eq(email.id, target.id),
        eq(email.organizationId, target.organizationId),
        isNull(email.usageRecordedAt),
      ),
    )
    .returning({
      environmentId: email.environmentId,
      projectId: email.projectId,
      apiKeyId: email.apiKeyId,
      apiKeyOwnerId: email.apiKeyOwnerId,
      billable: email.billableRecipients,
      dedicatedPool: email.dedicatedPool,
    });
  if (!row) return;
  let quantity = row.billable;
  if (quantity === null) {
    // Claimed before billable counts were frozen at claim time.
    const [counted] = await tx
      .select({ n: count() })
      .from(emailRecipient)
      .where(
        and(
          eq(emailRecipient.organizationId, target.organizationId),
          eq(emailRecipient.emailId, target.id),
          ne(emailRecipient.status, "suppressed"),
        ),
      );
    quantity = counted?.n ?? 0;
  }
  // Spend goes to the key that sent it and, for a personal key, its owner at acceptance.
  const source = {
    organizationId: target.organizationId,
    environmentId: row.environmentId,
    projectId: row.projectId,
    apiKeyId: row.apiKeyId,
    userId: row.apiKeyOwnerId,
  };
  await recordUsage(tx, { ...source, meter: "email.recipients", quantity });
  if (row.dedicatedPool) {
    await recordUsage(tx, { ...source, meter: "email.dedicated_ip", quantity });
  }
  // Sizes stay on the rows after the content is purged, so this reads the same on every path.
  const [attachments] = await tx
    .select({ bytes: sum(emailAttachment.size) })
    .from(emailAttachment)
    .where(
      and(
        eq(emailAttachment.organizationId, target.organizationId),
        eq(emailAttachment.emailId, target.id),
      ),
    );
  await recordUsage(tx, {
    ...source,
    meter: "email.attachment_data",
    quantity: billableEmailMegabytes(Number(attachments?.bytes ?? 0)) * quantity,
  });
}
