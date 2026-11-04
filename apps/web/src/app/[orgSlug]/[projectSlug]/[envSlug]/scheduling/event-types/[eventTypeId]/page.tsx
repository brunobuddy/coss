import { hipaaModeApplies } from "@coss/compliance";
import { db } from "@coss/db";
import {
  getEventType,
  hostsByIds,
  listHosts,
  listScheduleNames,
  SchedulingError,
} from "@coss/scheduling";
import { Button } from "@coss/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { PageHeader } from "@/components/page-header";
import { EVENT_TYPE_KIND_LABEL, EventTypeStatusDot } from "@/components/scheduling-badges";
import { EventTypeForm } from "../../event-type-form";
import { schedulingPageContext } from "../../page-context";
import { BookEventTypeButton, EventTypeStatusButton } from "../../scheduling-actions";

export const metadata: Metadata = { title: "Event type" };

// A dropdown can't hold every host of an environment with one for each of its users. Past this,
// the form adds them by id or uid, and those already assigned are always listed.
const MAX_HOST_PAGES = 10;
const HOST_PAGE_SIZE = 100;

async function pickableHosts(
  scope: { organizationId: string; environmentId: string },
  assigned: readonly string[],
) {
  const hosts: { id: string; name: string }[] = [];
  let after: string | undefined;
  let more = false;
  for (let page = 0; page < MAX_HOST_PAGES; page += 1) {
    const result = await listHosts(scope, { limit: HOST_PAGE_SIZE, after });
    hosts.push(...result.data.map((host) => ({ id: host.id, name: host.name })));
    after = result.data.at(-1)?.id;
    more = result.hasMore;
    if (!more || !after) break;
  }
  const listed = new Set(hosts.map((host) => host.id));
  const missing = assigned.filter((id) => !listed.has(id));
  const others = missing.length > 0 ? await hostsByIds(db, scope, missing) : [];
  return {
    more,
    hosts: [...hosts, ...others.map((host) => ({ id: host.id, name: host.name }))],
  };
}

export default async function EventTypePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/event-types/[eventTypeId]">) {
  const { eventTypeId, ...rest } = await params;
  const { scope, can, target, schedulingPath } = await schedulingPageContext(rest);
  const eventType = await getEventType(scope, eventTypeId).catch((error: unknown) => {
    if (error instanceof SchedulingError && error.code === "not_found") notFound();
    throw error;
  });
  const { hosts: hostOptions, more: moreHosts } = await pickableHosts(
    scope,
    eventType.hosts.map((host) => host.host),
  );
  const scheduleOptions = await listScheduleNames(
    scope,
    hostOptions.map((host) => host.id),
  );
  const calendarDetailsLocked = await hipaaModeApplies(scope.environmentId);
  const canEdit = can({ scheduling: ["update"] });
  const active = eventType.status === "active";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button
              render={<Link href={`${schedulingPath}/reminders?event_type=${eventType.id}`} />}
              size="sm"
              variant="ghost"
            >
              Reminders
            </Button>
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
        calendarDetailsLocked={calendarDetailsLocked}
        canEdit={canEdit}
        eventType={eventType}
        hostOptions={hostOptions}
        key={eventType.updated_at}
        moreHosts={moreHosts}
        scheduleOptions={scheduleOptions}
      />
    </div>
  );
}
