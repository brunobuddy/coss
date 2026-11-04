/** The news about a host's calendar, for the customer. */
import { type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, eq } from "drizzle-orm";
import type { SchedulingCalendarWebhookEventType } from "../webhook-types.ts";

const { schedulingCalendarConnection, schedulingHost } = schema;

type ConnectionRow = typeof schedulingCalendarConnection.$inferSelect;

/** Records the news about a calendar: webhook, log line, and the host's email when it needs them. */
export async function recordCalendarEvent(
  tx: Executor,
  connection: Pick<
    ConnectionRow,
    "id" | "organizationId" | "environmentId" | "hostId" | "provider"
  >,
  type: SchedulingCalendarWebhookEventType,
  now: Date,
): Promise<void> {
  const [host] = await tx
    .select({ projectId: schedulingHost.projectId })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.id, connection.hostId),
        eq(schedulingHost.organizationId, connection.organizationId),
      ),
    );
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: connection.organizationId,
    environmentId: connection.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      data: {
        host_id: connection.hostId,
        connection_id: connection.id,
        provider: connection.provider,
        occurred_at: now.toISOString(),
      },
    },
  });
  if (host) {
    await appendLogEntries(tx, [
      {
        organizationId: connection.organizationId,
        projectId: host.projectId,
        environmentId: connection.environmentId,
        occurredAt: now,
        source: "scheduling",
        level: type === "scheduling.calendar.needs_reauth" ? "warning" : "info",
        type,
        message:
          type === "scheduling.calendar.needs_reauth"
            ? "A host's calendar needs reconnecting: they aren't offered until it's back"
            : type === "scheduling.calendar.connected"
              ? "Calendar connected"
              : "Calendar disconnected",
        resourceType: "scheduling_host",
        resourceId: connection.hostId,
        attributes: { connection_id: connection.id, provider: connection.provider },
      },
    ]);
  }
}
