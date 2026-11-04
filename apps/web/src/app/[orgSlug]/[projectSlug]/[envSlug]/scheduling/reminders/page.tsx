import {
  effectiveRemindersOf,
  getEventType,
  getSettings,
  listEventTypes,
  SchedulingError,
} from "@coss/scheduling";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { schedulingPageContext } from "../page-context";
import { RemindersEditor } from "./reminders-editor";

export const metadata: Metadata = { title: "Reminders" };

export default async function SchedulingRemindersPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/reminders">) {
  const { scope, can, target, schedulingPath } = await schedulingPageContext(await params);
  const query = await searchParams;
  const [settings, eventTypes] = await Promise.all([
    getSettings(scope),
    listEventTypes(scope, { limit: 100 }),
  ]);
  // Looked up on its own: past the selector's page, a save must still mean this event type, never
  // fall back to every event type's list.
  const wanted = typeof query.event_type === "string" ? query.event_type : null;
  const eventType = wanted
    ? await getEventType(scope, wanted).catch((error: unknown) => {
        if (error instanceof SchedulingError && error.code === "not_found") notFound();
        throw error;
      })
    : null;
  const options = eventTypes.data.some((found) => found.id === eventType?.id)
    ? eventTypes.data
    : [...eventTypes.data, ...(eventType ? [eventType] : [])];
  const { rules, source } = await effectiveRemindersOf(scope, eventType?.id ?? null);
  return (
    <RemindersEditor
      {...target}
      canEdit={can({ scheduling: ["update"] })}
      eventTypeId={eventType?.id ?? null}
      eventTypes={options.map((found) => ({
        id: found.id,
        title: found.title,
        own: found.reminders !== null,
      }))}
      hasEmailFrom={settings.email_from !== null}
      moreEventTypes={eventTypes.hasMore}
      hasSmsFrom={settings.sms_from !== null}
      key={eventType?.id ?? "environment"}
      rules={rules}
      schedulingPath={schedulingPath}
      source={source}
    />
  );
}
