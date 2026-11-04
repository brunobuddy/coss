import { effectiveRemindersOf, getSettings, listEventTypes } from "@coss/scheduling";
import type { Metadata } from "next";
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
  const wanted = typeof query.event_type === "string" ? query.event_type : null;
  const eventType = eventTypes.data.find((found) => found.id === wanted) ?? null;
  const { rules, source } = await effectiveRemindersOf(scope, eventType?.id ?? null);
  return (
    <RemindersEditor
      {...target}
      canEdit={can({ scheduling: ["update"] })}
      eventTypeId={eventType?.id ?? null}
      eventTypes={eventTypes.data.map((found) => ({
        id: found.id,
        title: found.title,
        own: found.reminders !== null,
      }))}
      hasEmailFrom={settings.email_from !== null}
      hasSmsFrom={settings.sms_from !== null}
      key={eventType?.id ?? "environment"}
      rules={rules}
      schedulingPath={schedulingPath}
      source={source}
    />
  );
}
