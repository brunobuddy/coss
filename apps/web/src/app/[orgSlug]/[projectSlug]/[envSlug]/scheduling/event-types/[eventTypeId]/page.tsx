import { getEventType, listHosts, listScheduleNames, SchedulingError } from "@coss/scheduling";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { PageHeader } from "@/components/page-header";
import { EVENT_TYPE_KIND_LABEL, EventTypeStatusDot } from "@/components/scheduling-badges";
import { EventTypeForm } from "../../event-type-form";
import { schedulingPageContext } from "../../page-context";
import { BookEventTypeButton, EventTypeStatusButton } from "../../scheduling-actions";

export const metadata: Metadata = { title: "Event type" };

/** Enough for any environment's host picker: a pool holds at most 500 by name. */
const MAX_HOST_PAGES = 10;
const HOST_PAGE_SIZE = 100;

async function allHosts(scope: { organizationId: string; environmentId: string }) {
  const hosts: { id: string; name: string }[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_HOST_PAGES; page += 1) {
    const result = await listHosts(scope, { limit: HOST_PAGE_SIZE, after });
    hosts.push(...result.data.map((host) => ({ id: host.id, name: host.name })));
    after = result.data.at(-1)?.id;
    if (!result.hasMore || !after) break;
  }
  return hosts;
}

export default async function EventTypePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/event-types/[eventTypeId]">) {
  const { eventTypeId, ...rest } = await params;
  const { scope, can, target } = await schedulingPageContext(rest);
  const eventType = await getEventType(scope, eventTypeId).catch((error: unknown) => {
    if (error instanceof SchedulingError && error.code === "not_found") notFound();
    throw error;
  });
  const hostOptions = await allHosts(scope);
  const scheduleOptions = await listScheduleNames(
    scope,
    hostOptions.map((host) => host.id),
  );
  const canEdit = can({ scheduling: ["update"] });
  const active = eventType.status === "active";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex gap-2">
            {canEdit ? (
              <EventTypeStatusButton
                {...target}
                eventTypeId={eventType.id}
                status={eventType.status}
              />
            ) : null}
            {active && can({ scheduling: ["create"] }) ? (
              <BookEventTypeButton {...target} eventTypeId={eventType.id} />
            ) : null}
          </div>
        }
        description={`${EVENT_TYPE_KIND_LABEL[eventType.kind]}. Changes apply to new bookings: existing ones keep their times and length.`}
        meta={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <EventTypeStatusDot status={eventType.status} />
            <CopyValue value={eventType.id} />
          </div>
        }
        title={eventType.title}
      />
      <EventTypeForm
        {...target}
        canEdit={canEdit}
        eventType={eventType}
        hostOptions={hostOptions}
        key={eventType.updated_at}
        scheduleOptions={scheduleOptions}
      />
    </div>
  );
}
