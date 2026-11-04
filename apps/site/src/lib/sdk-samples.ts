/**
 * TypeScript SDK samples for the API reference: each operation maps to the `coss` method that
 * calls it. `test/sdk-samples.test.ts` fails when an operation in apps/api/openapi.json has no
 * sample, or a sample names a method the SDK doesn't have.
 */
import type { RequestData } from "fumadocs-openapi/requests";

/** The example request of an operation, with path parameters filled in. */
export type SampleRequest = RequestData & { url: string };

export interface SdkSample {
  /** The `Coss` method, e.g. `email.send` or `email.suppressions.add`. */
  method: string;
  /** TypeScript source of each argument; trailing `undefined`s are dropped. */
  args: (request: SampleRequest) => (string | undefined)[];
}

/** Keyed by `METHOD /path`, exactly as in the OpenAPI document. */
export const SDK_SAMPLES: Record<string, SdkSample> = {
  "POST /v1/emails": {
    method: "email.send",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "POST /v1/emails/batch": {
    method: "email.sendBatch",
    args: (request) => [tsValue(batchEmails(request.body)), requestOptions(request)],
  },
  // Hooks.
  "POST /v1/hooks/event_types": {
    method: "hooks.eventTypes.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/hooks/event_types": {
    method: "hooks.eventTypes.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/hooks/event_types/{name}": {
    method: "hooks.eventTypes.get",
    args: (request) => [pathParam(request, "name")],
  },
  "PATCH /v1/hooks/event_types/{name}": {
    method: "hooks.eventTypes.update",
    args: (request) => [pathParam(request, "name"), tsValue(request.body ?? {})],
  },
  "DELETE /v1/hooks/event_types/{name}": {
    method: "hooks.eventTypes.archive",
    args: (request) => [pathParam(request, "name")],
  },
  "POST /v1/hooks/applications": {
    method: "hooks.applications.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/hooks/applications": {
    method: "hooks.applications.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/hooks/applications/{application}": {
    method: "hooks.applications.get",
    args: (request) => [application(request)],
  },
  "PATCH /v1/hooks/applications/{application}": {
    method: "hooks.applications.update",
    args: (request) => [application(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/hooks/applications/{application}": {
    method: "hooks.applications.delete",
    args: (request) => [application(request)],
  },
  "POST /v1/hooks/applications/{application}/endpoints": {
    method: "hooks.endpoints.create",
    args: (request) => [application(request), tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/hooks/applications/{application}/endpoints": {
    method: "hooks.endpoints.list",
    args: (request) => [application(request)],
  },
  "GET /v1/hooks/applications/{application}/endpoints/{endpoint_id}": {
    method: "hooks.endpoints.get",
    args: (request) => [application(request), pathParam(request, "endpoint_id")],
  },
  "PATCH /v1/hooks/applications/{application}/endpoints/{endpoint_id}": {
    method: "hooks.endpoints.update",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      tsValue(request.body ?? {}),
    ],
  },
  "DELETE /v1/hooks/applications/{application}/endpoints/{endpoint_id}": {
    method: "hooks.endpoints.delete",
    args: (request) => [application(request), pathParam(request, "endpoint_id")],
  },
  "GET /v1/hooks/applications/{application}/endpoints/{endpoint_id}/secret": {
    method: "hooks.endpoints.getSecret",
    args: (request) => [application(request), pathParam(request, "endpoint_id")],
  },
  "POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/roll_secret": {
    method: "hooks.endpoints.rollSecret",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      tsValue(request.body ?? {}),
    ],
  },
  "POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/recover": {
    method: "hooks.endpoints.recover",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      tsValue(request.body ?? {}),
    ],
  },
  "GET /v1/hooks/applications/{application}/endpoints/{endpoint_id}/recoveries/{recovery_id}": {
    method: "hooks.endpoints.getRecovery",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      pathParam(request, "recovery_id"),
    ],
  },
  "POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/test": {
    method: "hooks.endpoints.sendTest",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      tsValue(request.body ?? {}),
    ],
  },
  "GET /v1/hooks/applications/{application}/endpoints/{endpoint_id}/deliveries": {
    method: "hooks.endpoints.listDeliveries",
    args: (request) => [
      application(request),
      pathParam(request, "endpoint_id"),
      queryParams(request),
    ],
  },
  "POST /v1/hooks/applications/{application}/messages": {
    method: "hooks.messages.send",
    args: (request) => [withApplication(request), requestOptions(request)],
  },
  "GET /v1/hooks/applications/{application}/messages": {
    method: "hooks.messages.list",
    args: (request) => [application(request), queryParams(request)],
  },
  "GET /v1/hooks/applications/{application}/messages/{message_id}": {
    method: "hooks.messages.get",
    args: (request) => [application(request), pathParam(request, "message_id")],
  },
  "GET /v1/hooks/applications/{application}/messages/{message_id}/deliveries": {
    method: "hooks.messages.listDeliveries",
    args: (request) => [application(request), pathParam(request, "message_id")],
  },
  "GET /v1/hooks/applications/{application}/deliveries/{delivery_id}": {
    method: "hooks.deliveries.get",
    args: (request) => [application(request), pathParam(request, "delivery_id")],
  },
  "GET /v1/hooks/applications/{application}/deliveries/{delivery_id}/attempts": {
    method: "hooks.deliveries.listAttempts",
    args: (request) => [application(request), pathParam(request, "delivery_id")],
  },
  "POST /v1/hooks/applications/{application}/deliveries/{delivery_id}/retry": {
    method: "hooks.deliveries.retry",
    args: (request) => [application(request), pathParam(request, "delivery_id")],
  },
  "POST /v1/hooks/applications/{application}/portal_sessions": {
    method: "hooks.portal.createSession",
    args: (request) => [withApplication(request), requestOptions(request)],
  },
  "GET /v1/environment": { method: "environment.get", args: () => [] },
  "DELETE /v1/api_key": { method: "apiKey.revoke", args: () => [] },
  "GET /v1/reputation": { method: "reputation.get", args: () => [] },
  "GET /v1/billing": { method: "billing.get", args: () => [] },
  "GET /v1/billing/usage": { method: "billing.usage", args: (request) => [queryParams(request)] },
  "GET /v1/billing/invoices": {
    method: "billing.invoices.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/billing/invoices/{id}": {
    method: "billing.invoices.get",
    args: (request) => [pathId(request)],
  },
  "GET /v1/billing/credits": {
    method: "billing.credits.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/logs": { method: "logs.list", args: (request) => [queryParams(request)] },
  "GET /v1/logs/{id}": { method: "logs.get", args: (request) => [pathId(request)] },
  "GET /v1/audit_events": { method: "auditEvents.list", args: (request) => [queryParams(request)] },
  "GET /v1/audit_events/{id}": {
    method: "auditEvents.get",
    args: (request) => [pathId(request)],
  },
  "POST /v1/log_drains": {
    method: "logDrains.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/log_drains": { method: "logDrains.list", args: () => [] },
  "GET /v1/log_drains/{id}": { method: "logDrains.get", args: (r) => [pathId(r)] },
  "PATCH /v1/log_drains/{id}": {
    method: "logDrains.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/log_drains/{id}": { method: "logDrains.delete", args: (r) => [pathId(r)] },
  "GET /v1/log_drains/{id}/batches": {
    method: "logDrains.batches.list",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/log_drains/{id}/batches/{batch_id}": {
    method: "logDrains.batches.get",
    args: (request) => [pathId(request), pathParam(request, "batch_id")],
  },
  "GET /v1/emails": { method: "email.list", args: (request) => [queryParams(request)] },
  "GET /v1/emails/batch/{id}": { method: "email.getBatch", args: (r) => [pathId(r)] },
  "GET /v1/emails/{id}": {
    method: "email.get",
    args: (request) => [pathId(request)],
  },
  "POST /v1/emails/{id}/cancel": {
    method: "email.cancel",
    args: (request) => [pathId(request)],
  },
  "POST /v1/emails/{id}/reschedule": {
    method: "email.reschedule",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/emails/{id}/events": {
    method: "email.listEvents",
    args: (request) => [pathId(request)],
  },
  "GET /v1/emails/{id}/links": {
    method: "email.listLinks",
    args: (request) => [pathId(request)],
  },
  "POST /v1/subaccounts": {
    method: "email.subaccounts.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/subaccounts": {
    method: "email.subaccounts.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/subaccounts/{subaccount}": {
    method: "email.subaccounts.get",
    args: (request) => [pathParam(request, "subaccount")],
  },
  "PATCH /v1/subaccounts/{subaccount}": {
    method: "email.subaccounts.update",
    args: (request) => [pathParam(request, "subaccount"), tsValue(request.body ?? {})],
  },
  "DELETE /v1/subaccounts/{subaccount}": {
    method: "email.subaccounts.delete",
    args: (request) => [pathParam(request, "subaccount")],
  },
  "POST /v1/subaccounts/{subaccount}/reinstate": {
    method: "email.subaccounts.reinstate",
    args: (request) => [pathParam(request, "subaccount")],
  },
  "GET /v1/subaccounts/{subaccount}/stats": {
    method: "email.subaccounts.stats",
    args: (request) => [pathParam(request, "subaccount"), queryParams(request)],
  },
  "POST /v1/suppressions": {
    method: "email.suppressions.add",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/suppressions": {
    method: "email.suppressions.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/suppressions/check": {
    method: "email.suppressions.check",
    args: (request) => [queryParams(request) ?? "{}"],
  },
  // Before `/v1/suppressions/{id}`, which would also match these paths.
  "POST /v1/suppressions/import": {
    method: "email.suppressions.import",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/suppressions/export": {
    method: "email.suppressions.export",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/suppressions/{id}": { method: "email.suppressions.get", args: (r) => [pathId(r)] },
  "DELETE /v1/suppressions/{id}": { method: "email.suppressions.remove", args: (r) => [pathId(r)] },
  // SMS. Static paths before `/v1/sms/{id}`, which would also match them.
  "POST /v1/sms": {
    method: "sms.send",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/sms": { method: "sms.list", args: (request) => [queryParams(request)] },
  "POST /v1/sms/suppressions": {
    method: "sms.suppressions.add",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/sms/suppressions": {
    method: "sms.suppressions.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/sms/suppressions/check": {
    method: "sms.suppressions.check",
    args: (request) => [queryParams(request) ?? "{}"],
  },
  "GET /v1/sms/suppressions/{id}": { method: "sms.suppressions.get", args: (r) => [pathId(r)] },
  "DELETE /v1/sms/suppressions/{id}": {
    method: "sms.suppressions.remove",
    args: (r) => [pathId(r)],
  },
  "GET /v1/sms/received": { method: "sms.received.list", args: (r) => [queryParams(r)] },
  "GET /v1/sms/received/{id}": { method: "sms.received.get", args: (r) => [pathId(r)] },
  "GET /v1/sms/numbers": { method: "sms.numbers.list", args: () => [] },
  "POST /v1/scheduling/bookings/{id}/reassign": {
    method: "scheduling.bookings.reassign",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/bookings/{id}/reassign_candidates": {
    method: "scheduling.bookings.reassignCandidates",
    args: (r) => [pathId(r), queryParams(r)],
  },
  "POST /v1/scheduling/reassignments": {
    method: "scheduling.reassignments.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/reassignments/preview": {
    method: "scheduling.reassignments.preview",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/reassignments": {
    method: "scheduling.reassignments.list",
    args: (r) => [queryParams(r)],
  },
  "GET /v1/scheduling/reassignments/{id}": {
    method: "scheduling.reassignments.get",
    args: (r) => [pathId(r)],
  },
  "GET /v1/scheduling/reassignments/{id}/items": {
    method: "scheduling.reassignments.items",
    args: (r) => [pathId(r), queryParams(r)],
  },
  "POST /v1/scheduling/reassignments/{id}/cancel": {
    method: "scheduling.reassignments.cancel",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/reassignments/{id}/undo": {
    method: "scheduling.reassignments.undo",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/out_of_office": {
    method: "scheduling.outOfOffice.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/out_of_office": {
    method: "scheduling.outOfOffice.list",
    args: (r) => [queryParams(r)],
  },
  "GET /v1/scheduling/out_of_office/{id}": {
    method: "scheduling.outOfOffice.get",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/scheduling/out_of_office/{id}": {
    method: "scheduling.outOfOffice.update",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "PUT /v1/scheduling/out_of_office/by_external_id/{external_id}": {
    method: "scheduling.outOfOffice.put",
    args: (r) => [tsValue(r.path.external_id), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/out_of_office/{id}": {
    method: "scheduling.outOfOffice.remove",
    args: (r) => [pathId(r)],
  },
  "GET /v1/scheduling/out_of_office/{id}/conflicts": {
    method: "scheduling.outOfOffice.conflicts",
    args: (r) => [pathId(r), queryParams(r)],
  },
  "POST /v1/scheduling/hosts": {
    method: "scheduling.hosts.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/hosts": { method: "scheduling.hosts.list", args: (r) => [queryParams(r)] },
  "GET /v1/scheduling/hosts/{host}": {
    method: "scheduling.hosts.get",
    args: (r) => [tsValue(r.path.host)],
  },
  "PATCH /v1/scheduling/hosts/{host}": {
    method: "scheduling.hosts.update",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/hosts/{host}": {
    method: "scheduling.hosts.remove",
    args: (r) => [tsValue(r.path.host)],
  },
  "POST /v1/scheduling/hosts/{host}/schedules": {
    method: "scheduling.schedules.create",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/hosts/{host}/schedules": {
    method: "scheduling.schedules.list",
    args: (r) => [tsValue(r.path.host)],
  },
  "GET /v1/scheduling/hosts/{host}/schedules/{schedule_id}": {
    method: "scheduling.schedules.get",
    args: (r) => [tsValue(r.path.host), tsValue(r.path.schedule_id)],
  },
  "PUT /v1/scheduling/hosts/{host}/schedules/{schedule_id}": {
    method: "scheduling.schedules.update",
    args: (r) => [tsValue(r.path.host), tsValue(r.path.schedule_id), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/hosts/{host}/schedules/{schedule_id}": {
    method: "scheduling.schedules.remove",
    args: (r) => [tsValue(r.path.host), tsValue(r.path.schedule_id)],
  },
  "POST /v1/scheduling/event_types": {
    method: "scheduling.eventTypes.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/event_types": {
    method: "scheduling.eventTypes.list",
    args: (r) => [queryParams(r)],
  },
  "GET /v1/scheduling/event_types/{event_type}": {
    method: "scheduling.eventTypes.get",
    args: (r) => [tsValue(r.path.event_type)],
  },
  "PATCH /v1/scheduling/event_types/{event_type}": {
    method: "scheduling.eventTypes.update",
    args: (r) => [tsValue(r.path.event_type), tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/event_types/{event_type}/slots": {
    method: "scheduling.slots.list",
    args: (r) => [tsValue(r.path.event_type), queryParams(r)],
  },
  "GET /v1/scheduling/event_types/{event_type}/slots/explain": {
    method: "scheduling.slots.explain",
    args: (r) => [tsValue(r.path.event_type), queryParams(r)],
  },
  "POST /v1/scheduling/availability/search": {
    method: "scheduling.availability.search",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/bookings": {
    method: "scheduling.bookings.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/bookings": {
    method: "scheduling.bookings.list",
    args: (r) => [queryParams(r)],
  },
  "GET /v1/scheduling/bookings/{id}": {
    method: "scheduling.bookings.get",
    args: (r) => [pathId(r)],
  },
  "GET /v1/scheduling/bookings/{id}/events": {
    method: "scheduling.bookings.events",
    args: (r) => [pathId(r), queryParams(r)],
  },
  "POST /v1/scheduling/bookings/{id}/reschedule": {
    method: "scheduling.bookings.reschedule",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/bookings/{id}/cancel": {
    method: "scheduling.bookings.cancel",
    args: (r) => [pathId(r), ...(r.body ? [tsValue(r.body)] : [])],
  },
  "POST /v1/scheduling/bookings/{id}/approve": {
    method: "scheduling.bookings.approve",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/bookings/{id}/decline": {
    method: "scheduling.bookings.decline",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/bookings/{id}/no_show": {
    method: "scheduling.bookings.markNoShow",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/scheduling/bookings/{id}/location": {
    method: "scheduling.bookings.updateLocation",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/holds": {
    method: "scheduling.holds.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/holds/{id}/confirm": {
    method: "scheduling.holds.confirm",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/holds/{id}": {
    method: "scheduling.holds.release",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/series": {
    method: "scheduling.series.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/series/preview": {
    method: "scheduling.series.preview",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/series/{id}/cancel": {
    method: "scheduling.series.cancel",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/attendees/{uid}": {
    method: "scheduling.attendees.erase",
    args: (r) => [tsValue(r.path.uid)],
  },
  "POST /v1/scheduling/attendees/erase": {
    method: "scheduling.attendees.eraseByEmail",
    args: (r) => [tsValue((r.body as { email: string }).email)],
  },
  "POST /v1/scheduling/hosts/{host}/calendar_connections/authorize": {
    method: "scheduling.calendars.authorize",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/hosts/{host}/calendar_connections": {
    method: "scheduling.calendars.connect",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/hosts/{host}/calendar_connections": {
    method: "scheduling.calendars.list",
    args: (r) => [tsValue(r.path.host)],
  },
  "DELETE /v1/scheduling/hosts/{host}/calendar_connections/{id}": {
    method: "scheduling.calendars.disconnect",
    args: (r) => [tsValue(r.path.host), pathId(r)],
  },
  "PATCH /v1/scheduling/hosts/{host}/calendars/{calendar_id}": {
    method: "scheduling.calendars.update",
    args: (r) => [tsValue(r.path.host), tsValue(r.path.calendar_id), tsValue(r.body ?? {})],
  },
  "PUT /v1/scheduling/hosts/{host}/simulated_busy": {
    method: "scheduling.calendars.setSimulatedBusy",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/calendar_delegations": {
    method: "scheduling.calendarDelegations.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/calendar_delegations": {
    method: "scheduling.calendarDelegations.list",
    args: () => [],
  },
  "GET /v1/scheduling/calendar_delegations/{id}": {
    method: "scheduling.calendarDelegations.get",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/scheduling/calendar_delegations/{id}": {
    method: "scheduling.calendarDelegations.update",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/calendar_delegations/{id}/verify": {
    method: "scheduling.calendarDelegations.verify",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/calendar_delegations/{id}": {
    method: "scheduling.calendarDelegations.delete",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/hosts/{host}/sessions": {
    method: "scheduling.sessions.createForHost",
    args: (r) => [tsValue(r.path.host), tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/holiday_calendars": {
    method: "scheduling.holidayCalendars.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/scheduling/holiday_calendars": {
    method: "scheduling.holidayCalendars.list",
    args: () => [],
  },
  "GET /v1/scheduling/holiday_calendars/{id}": {
    method: "scheduling.holidayCalendars.get",
    args: (r) => [pathId(r)],
  },
  "GET /v1/scheduling/holiday_calendars/{id}/holidays": {
    method: "scheduling.holidayCalendars.holidays",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/scheduling/holiday_calendars/{id}": {
    method: "scheduling.holidayCalendars.update",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/scheduling/holiday_calendars/{id}": {
    method: "scheduling.holidayCalendars.remove",
    args: (r) => [pathId(r)],
  },
  "POST /v1/scheduling/manager_sessions": {
    method: "scheduling.sessions.createForManager",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/booker_sessions": {
    method: "scheduling.sessions.createForBooker",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/scheduling/bookings/{id}/manage_sessions": {
    method: "scheduling.sessions.createForBooking",
    args: (r) => [pathId(r)],
  },
  "GET /v1/scheduling/settings": { method: "scheduling.settings.get", args: () => [] },
  "PATCH /v1/scheduling/settings": {
    method: "scheduling.settings.update",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "POST /v1/forms": { method: "forms.create", args: (r) => [tsValue(r.body ?? {})] },
  "GET /v1/forms": { method: "forms.list", args: (r) => [queryParams(r)] },
  "GET /v1/forms/{id}": { method: "forms.get", args: (r) => [pathId(r)] },
  "PATCH /v1/forms/{id}": {
    method: "forms.update",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/forms/{id}": { method: "forms.remove", args: (r) => [pathId(r)] },
  "GET /v1/forms/{id}/submissions": {
    method: "forms.submissions.list",
    args: (r) => [pathId(r), queryParams(r)],
  },
  "GET /v1/forms/{id}/submissions/{submission_id}": {
    method: "forms.submissions.get",
    args: (r) => [pathId(r), pathParam(r, "submission_id")],
  },
  "DELETE /v1/forms/{id}/submissions/{submission_id}": {
    method: "forms.submissions.remove",
    args: (r) => [pathId(r), pathParam(r, "submission_id")],
  },
  "POST /v1/forms/{id}/submissions/{submission_id}/release": {
    method: "forms.submissions.release",
    args: (r) => [pathId(r), pathParam(r, "submission_id")],
  },
  "GET /v1/forms/{id}/submissions/{submission_id}/files/{file_id}": {
    method: "forms.submissions.file",
    args: (r) => [pathId(r), pathParam(r, "submission_id"), pathParam(r, "file_id")],
  },
  "POST /v1/sign/documents": {
    method: "sign.documents.upload",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/sign/documents": { method: "sign.documents.list", args: (r) => [queryParams(r)] },
  "GET /v1/sign/documents/{id}": { method: "sign.documents.get", args: (r) => [pathId(r)] },
  "DELETE /v1/sign/documents/{id}": { method: "sign.documents.remove", args: (r) => [pathId(r)] },
  "POST /v1/sign/requests": {
    method: "sign.requests.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/sign/requests": { method: "sign.requests.list", args: (r) => [queryParams(r)] },
  "GET /v1/sign/requests/{id}": { method: "sign.requests.get", args: (r) => [pathId(r)] },
  "POST /v1/sign/requests/{id}/send": { method: "sign.requests.send", args: (r) => [pathId(r)] },
  "POST /v1/sign/requests/{id}/cancel": {
    method: "sign.requests.cancel",
    args: (r) => [pathId(r)],
  },
  "GET /v1/sign/requests/{id}/audit_trail": {
    method: "sign.requests.auditTrail",
    args: (r) => [pathId(r)],
  },
  "DELETE /v1/sign/requests/{id}": { method: "sign.requests.remove", args: (r) => [pathId(r)] },
  "POST /v1/sign/requests/{id}/remind": {
    method: "sign.requests.remind",
    args: (r) => [pathId(r)],
  },
  "GET /v1/sign/requests/{id}/signed_document": {
    method: "sign.requests.signedDocument",
    args: (r) => [pathId(r)],
  },
  "POST /v1/sign/requests/{id}/signers/{signer_id}/sessions": {
    method: "sign.sessions.create",
    args: (r) => [pathId(r), pathParam(r, "signer_id"), tsValue(r.body ?? {})],
  },
  "POST /v1/sign/templates": {
    method: "sign.templates.create",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/sign/templates": { method: "sign.templates.list", args: () => [] },
  "GET /v1/sign/templates/{id}": { method: "sign.templates.get", args: (r) => [pathId(r)] },
  "PATCH /v1/sign/templates/{id}": {
    method: "sign.templates.update",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "DELETE /v1/sign/templates/{id}": { method: "sign.templates.remove", args: (r) => [pathId(r)] },
  "POST /v1/sign/templates/{id}/requests": {
    method: "sign.templates.createRequest",
    args: (r) => [pathId(r), tsValue(r.body ?? {}), requestOptions(r)],
  },
  "POST /v1/sign/templates/{id}/builder_sessions": {
    method: "sign.templates.createBuilderSession",
    args: (r) => [pathId(r), tsValue(r.body ?? {})],
  },
  "GET /v1/sign/settings": { method: "sign.settings.get", args: () => [] },
  "PATCH /v1/sign/settings": {
    method: "sign.settings.update",
    args: (r) => [tsValue(r.body ?? {})],
  },
  // Verify. Static paths before `/v1/verifications/{id}`.
  "POST /v1/verifications": {
    method: "verify.start",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "POST /v1/verifications/check": {
    method: "verify.check",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/verifications": { method: "verify.list", args: (r) => [queryParams(r)] },
  "GET /v1/verifications/{id}": { method: "verify.get", args: (r) => [pathId(r)] },
  "POST /v1/verifications/{id}/cancel": { method: "verify.cancel", args: (r) => [pathId(r)] },
  "GET /v1/verify/settings": { method: "verify.settings.get", args: () => [] },
  "PATCH /v1/verify/settings": {
    method: "verify.settings.update",
    args: (r) => [tsValue(r.body ?? {})],
  },
  "GET /v1/sms/{id}": { method: "sms.get", args: (r) => [pathId(r)] },
  "GET /v1/sms/{id}/events": { method: "sms.listEvents", args: (r) => [pathId(r)] },
  "POST /v1/sms/{id}/cancel": { method: "sms.cancel", args: (r) => [pathId(r)] },
  "POST /v1/email_templates": {
    method: "email.templates.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/email_templates": {
    method: "email.templates.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/email_templates/{id}": { method: "email.templates.get", args: (r) => [pathId(r)] },
  "PATCH /v1/email_templates/{id}": {
    method: "email.templates.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/email_templates/{id}": {
    method: "email.templates.delete",
    args: (request) => [pathId(request)],
  },
  "GET /v1/email_templates/{id}/draft": {
    method: "email.templates.getDraft",
    args: (request) => [pathId(request)],
  },
  "PUT /v1/email_templates/{id}/draft": {
    method: "email.templates.updateDraft",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "POST /v1/email_templates/{id}/publish": {
    method: "email.templates.publish",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "POST /v1/email_templates/{id}/render": {
    method: "email.templates.render",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/email_templates/{id}/versions": {
    method: "email.templates.versions.list",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/email_templates/{id}/versions/{version}": {
    method: "email.templates.versions.get",
    args: (request) => [pathId(request), numberParam(request, "version")],
  },
  "POST /v1/email_templates/{id}/versions/{version}/restore": {
    method: "email.templates.versions.restore",
    args: (request) => [pathId(request), numberParam(request, "version")],
  },
  "POST /v1/contacts": {
    method: "email.contacts.upsert",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/contacts": {
    method: "email.contacts.list",
    args: (request) => [queryParams(request)],
  },
  // Before `/v1/contacts/{id}`, which would also match these paths.
  "POST /v1/contacts/import": {
    method: "email.contacts.import",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/contacts/export": {
    method: "email.contacts.export",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/contacts/{id}": { method: "email.contacts.get", args: (r) => [pathId(r)] },
  "PATCH /v1/contacts/{id}": {
    method: "email.contacts.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/contacts/{id}": { method: "email.contacts.remove", args: (r) => [pathId(r)] },
  "POST /v1/contacts/{id}/confirmation": {
    method: "email.contacts.resendConfirmation",
    args: (r) => [pathId(r)],
  },
  "POST /v1/contacts/{id}/preference_links": {
    method: "email.contacts.createPreferenceLinks",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/contacts/{id}/topics": {
    method: "email.contacts.getTopics",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/contacts/{id}/topics": {
    method: "email.contacts.updateTopics",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/contact_properties": { method: "email.contacts.properties.list", args: () => [] },
  "POST /v1/contact_properties": {
    method: "email.contacts.properties.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/contact_properties/{id}": {
    method: "email.contacts.properties.get",
    args: (r) => [pathId(r)],
  },
  "PATCH /v1/contact_properties/{id}": {
    method: "email.contacts.properties.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/contact_properties/{id}": {
    method: "email.contacts.properties.remove",
    args: (r) => [pathId(r)],
  },
  "GET /v1/broadcasts": {
    method: "email.broadcasts.list",
    args: (request) => [queryParams(request)],
  },
  "POST /v1/broadcasts": {
    method: "email.broadcasts.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/broadcasts/{id}": { method: "email.broadcasts.get", args: (r) => [pathId(r)] },
  "PATCH /v1/broadcasts/{id}": {
    method: "email.broadcasts.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/broadcasts/{id}": { method: "email.broadcasts.remove", args: (r) => [pathId(r)] },
  "POST /v1/broadcasts/{id}/send": {
    method: "email.broadcasts.send",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "POST /v1/broadcasts/{id}/cancel": {
    method: "email.broadcasts.cancel",
    args: (r) => [pathId(r)],
  },
  "POST /v1/broadcasts/{id}/pause": { method: "email.broadcasts.pause", args: (r) => [pathId(r)] },
  "POST /v1/broadcasts/{id}/resume": {
    method: "email.broadcasts.resume",
    args: (r) => [pathId(r)],
  },
  "POST /v1/broadcasts/{id}/test": {
    method: "email.broadcasts.test",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/broadcasts/{id}/emails": {
    method: "email.broadcasts.listEmails",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/audiences": {
    method: "email.audiences.list",
    args: (request) => [queryParams(request)],
  },
  "POST /v1/audiences": {
    method: "email.audiences.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/audiences/{id}": { method: "email.audiences.get", args: (r) => [pathId(r)] },
  "PATCH /v1/audiences/{id}": {
    method: "email.audiences.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/audiences/{id}": { method: "email.audiences.remove", args: (r) => [pathId(r)] },
  "GET /v1/audiences/{id}/contacts": {
    method: "email.audiences.listContacts",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "POST /v1/audiences/{id}/contacts": {
    method: "email.audiences.addContacts",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/audiences/{id}/contacts/{contact_id}": {
    method: "email.audiences.removeContact",
    args: (request) => [pathId(request), pathParam(request, "contact_id")],
  },
  "GET /v1/segments": {
    method: "email.segments.list",
    args: (request) => [queryParams(request)],
  },
  "POST /v1/segments": {
    method: "email.segments.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/segments/{id}": { method: "email.segments.get", args: (r) => [pathId(r)] },
  "PATCH /v1/segments/{id}": {
    method: "email.segments.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/segments/{id}": { method: "email.segments.remove", args: (r) => [pathId(r)] },
  "GET /v1/segments/{id}/contacts": {
    method: "email.segments.listContacts",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/topics": { method: "email.topics.list", args: (request) => [queryParams(request)] },
  "POST /v1/topics": {
    method: "email.topics.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/topics/{id}": { method: "email.topics.get", args: (r) => [pathId(r)] },
  "PATCH /v1/topics/{id}": {
    method: "email.topics.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/topics/{id}": { method: "email.topics.remove", args: (r) => [pathId(r)] },
  "GET /v1/marketing_settings": { method: "email.marketingSettings.get", args: () => [] },
  "PATCH /v1/marketing_settings": {
    method: "email.marketingSettings.update",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/storage_settings": { method: "email.storage.get", args: () => [] },
  "PATCH /v1/storage_settings": {
    method: "email.storage.update",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/tracking_settings": { method: "email.tracking.get", args: () => [] },
  "PATCH /v1/tracking_settings/default": {
    method: "email.tracking.updateDefault",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "DELETE /v1/tracking_settings/default": {
    method: "email.tracking.removeDefault",
    args: () => [],
  },
  "PATCH /v1/tracking_settings/categories/{category}": {
    method: "email.tracking.updateCategory",
    args: (request) => [pathParam(request, "category"), tsValue(request.body ?? {})],
  },
  "DELETE /v1/tracking_settings/categories/{category}": {
    method: "email.tracking.removeCategory",
    args: (request) => [pathParam(request, "category")],
  },
  "POST /v1/domains": {
    method: "domains.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/domains": { method: "domains.list", args: (request) => [queryParams(request)] },
  "PATCH /v1/domains/{id}": {
    method: "domains.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/dedicated_ips": { method: "email.dedicatedIps.get", args: () => [] },
  "GET /v1/domains/{id}": { method: "domains.get", args: (r) => [pathId(r)] },
  "POST /v1/domains/{id}/verify": {
    method: "domains.verify",
    args: (request) => [pathId(request), requestOptions(request)],
  },
  "DELETE /v1/domains/{id}": { method: "domains.delete", args: (r) => [pathId(r)] },
  "POST /v1/domains/{id}/tracking": {
    method: "domains.tracking.create",
    args: (request) => [pathId(request), tsValue(request.body ?? {}), requestOptions(request)],
  },
  "DELETE /v1/domains/{id}/tracking": {
    method: "domains.tracking.delete",
    args: (r) => [pathId(r)],
  },
  "POST /v1/domains/{id}/receiving": {
    method: "domains.receiving.create",
    args: (request) => [pathId(request), tsValue(request.body ?? {}), requestOptions(request)],
  },
  "DELETE /v1/domains/{id}/receiving": {
    method: "domains.receiving.delete",
    args: (r) => [pathId(r)],
  },
  "GET /v1/domains/{id}/dmarc": { method: "domains.dmarc.get", args: (r) => [pathId(r)] },
  "GET /v1/domains/{id}/dmarc/reports": {
    method: "domains.dmarc.reports.list",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/domains/{id}/dmarc/reports/{report_id}": {
    method: "domains.dmarc.reports.get",
    args: (request) => [pathId(request), pathParam(request, "report_id")],
  },
  "GET /v1/received_emails": {
    method: "email.received.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/received_emails/address": { method: "email.received.address", args: () => [] },
  "GET /v1/received_emails/{id}": { method: "email.received.get", args: (r) => [pathId(r)] },
  "GET /v1/received_emails/{id}/raw": {
    method: "email.received.getRaw",
    args: (r) => [pathId(r)],
  },
  "GET /v1/received_emails/{id}/attachments/{attachment_id}": {
    method: "email.received.getAttachment",
    args: (request) => [pathId(request), pathParam(request, "attachment_id")],
  },
  "DELETE /v1/received_emails/{id}": {
    method: "email.received.delete",
    args: (r) => [pathId(r)],
  },
  "POST /v1/inboxes": {
    method: "inboxes.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/inboxes": { method: "inboxes.list", args: (request) => [queryParams(request)] },
  "GET /v1/inboxes/{inbox_id}": { method: "inboxes.get", args: (r) => [inboxId(r)] },
  "PATCH /v1/inboxes/{inbox_id}": {
    method: "inboxes.update",
    args: (request) => [inboxId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/inboxes/{inbox_id}": { method: "inboxes.delete", args: (r) => [inboxId(r)] },
  "GET /v1/inboxes/{inbox_id}/threads": {
    method: "inboxes.threads.list",
    args: (request) => [inboxId(request), queryParams(request)],
  },
  "GET /v1/inboxes/{inbox_id}/threads/{thread_id}": {
    method: "inboxes.threads.get",
    args: (request) => [inboxId(request), pathParam(request, "thread_id")],
  },
  "DELETE /v1/inboxes/{inbox_id}/threads/{thread_id}": {
    method: "inboxes.threads.delete",
    args: (request) => [inboxId(request), pathParam(request, "thread_id")],
  },
  "GET /v1/inboxes/{inbox_id}/messages": {
    method: "inboxes.messages.list",
    args: (request) => [inboxId(request), queryParams(request)],
  },
  "GET /v1/inboxes/{inbox_id}/messages/{message_id}": {
    method: "inboxes.messages.get",
    args: (request) => [inboxId(request), pathParam(request, "message_id")],
  },
  "POST /v1/inboxes/{inbox_id}/messages": {
    method: "inboxes.messages.send",
    args: (request) => [inboxId(request), tsValue(request.body ?? {}), requestOptions(request)],
  },
  "POST /v1/inboxes/{inbox_id}/messages/{message_id}/reply": {
    method: "inboxes.messages.reply",
    args: (request) => [
      inboxId(request),
      pathParam(request, "message_id"),
      tsValue(request.body ?? {}),
      requestOptions(request),
    ],
  },
  "GET /v1/inboxes/{inbox_id}/messages/{message_id}/attachments/{attachment_id}": {
    method: "inboxes.messages.getAttachment",
    args: (request) => [
      inboxId(request),
      pathParam(request, "message_id"),
      pathParam(request, "attachment_id"),
    ],
  },
  "POST /v1/webhook_endpoints": {
    method: "webhookEndpoints.create",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/webhook_endpoints": { method: "webhookEndpoints.list", args: () => [] },
  "GET /v1/webhook_endpoints/{id}": { method: "webhookEndpoints.get", args: (r) => [pathId(r)] },
  "PATCH /v1/webhook_endpoints/{id}": {
    method: "webhookEndpoints.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/webhook_endpoints/{id}": {
    method: "webhookEndpoints.delete",
    args: (r) => [pathId(r)],
  },
  "POST /v1/webhook_endpoints/{id}/roll_secret": {
    method: "webhookEndpoints.rollSecret",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "POST /v1/webhook_endpoints/{id}/recover": {
    method: "webhookEndpoints.recover",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "GET /v1/webhook_endpoints/{id}/deliveries": {
    method: "webhookEndpoints.deliveries.list",
    args: (request) => [pathId(request), queryParams(request)],
  },
  "GET /v1/webhook_endpoints/{id}/deliveries/{delivery_id}": {
    method: "webhookEndpoints.deliveries.get",
    args: (request) => [pathId(request), pathParam(request, "delivery_id")],
  },
  "POST /v1/webhook_endpoints/{id}/deliveries/{delivery_id}/retry": {
    method: "webhookEndpoints.deliveries.retry",
    args: (request) => [
      pathId(request),
      pathParam(request, "delivery_id"),
      requestOptions(request),
    ],
  },
  "POST /v1/webhook_listeners": {
    method: "webhookListeners.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "POST /v1/webhook_listeners/{id}/poll": {
    method: "webhookListeners.poll",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/webhook_listeners/{id}": {
    method: "webhookListeners.delete",
    args: (r) => [pathId(r)],
  },
  "POST /v1/webhook_events/test": {
    method: "webhookEvents.test",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "POST /v1/risk/assessments": {
    method: "risk.assess",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "GET /v1/risk/assessments": {
    method: "risk.assessments.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/risk/assessments/{id}": { method: "risk.assessments.get", args: (r) => [pathId(r)] },
  "POST /v1/risk/assessments/{id}/feedback": {
    method: "risk.feedback",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "POST /v1/risk/list_entries": {
    method: "risk.lists.add",
    args: (request) => listEntryArgs(request.body),
  },
  "GET /v1/risk/list_entries": {
    method: "risk.lists.list",
    args: (request) => [queryParams(request)],
  },
  "GET /v1/risk/list_entries/{id}": { method: "risk.lists.get", args: (r) => [pathId(r)] },
  "DELETE /v1/risk/list_entries/{id}": { method: "risk.lists.remove", args: (r) => [pathId(r)] },
  "GET /v1/risk/settings": { method: "risk.settings.get", args: () => [] },
  "GET /v1/risk/calibration": { method: "risk.calibration", args: () => [] },
  "PATCH /v1/risk/settings": {
    method: "risk.settings.update",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "POST /v1/risk/rules": {
    method: "risk.rules.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/risk/rules": { method: "risk.rules.list", args: () => [] },
  "GET /v1/risk/rules/{id}": { method: "risk.rules.get", args: (r) => [pathId(r)] },
  "PATCH /v1/risk/rules/{id}": {
    method: "risk.rules.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/risk/rules/{id}": { method: "risk.rules.delete", args: (r) => [pathId(r)] },
  "DELETE /v1/risk/users/{user_id}": {
    method: "risk.users.forget",
    args: (request) => [pathParam(request, "user_id")],
  },
  "POST /v1/risk/email/check": {
    method: "risk.checkEmail",
    args: (request) => [tsValue(bodyField(request.body, "email") ?? "")],
  },
  "POST /v1/risk/ip/check": {
    method: "risk.checkIp",
    args: (request) => [tsValue(bodyField(request.body, "ip") ?? "")],
  },
  "POST /v1/risk/phone/check": {
    method: "risk.checkPhone",
    args: (request) => [tsValue(bodyField(request.body, "phone") ?? "")],
  },
  "POST /v1/risk/content/classify": {
    method: "risk.classify",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "POST /v1/risk/limits": {
    method: "risk.limit",
    args: (request) => [tsValue(request.body ?? {}), requestOptions(request)],
  },
  "POST /v1/risk/limit_buckets": {
    method: "risk.limitBuckets.create",
    args: (request) => [tsValue(request.body ?? {})],
  },
  "GET /v1/risk/limit_buckets": { method: "risk.limitBuckets.list", args: () => [] },
  "GET /v1/risk/limit_buckets/{id}": { method: "risk.limitBuckets.get", args: (r) => [pathId(r)] },
  "PATCH /v1/risk/limit_buckets/{id}": {
    method: "risk.limitBuckets.update",
    args: (request) => [pathId(request), tsValue(request.body ?? {})],
  },
  "DELETE /v1/risk/limit_buckets/{id}": {
    method: "risk.limitBuckets.delete",
    args: (r) => [pathId(r)],
  },
};

const routes = Object.entries(SDK_SAMPLES).map(([key, sample]) => {
  const [method = "", path = ""] = key.split(" ");
  const pattern = new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`);
  return { method: method.toLowerCase(), pattern, sample };
});

/** The sample of the operation a request targets, matched by its method and URL path. */
export function findSdkSample(method: string, url: string): SdkSample | undefined {
  const { pathname } = new URL(url, "https://api.coss.com");
  return routes.find(
    (route) => route.method === method.toLowerCase() && route.pattern.test(pathname),
  )?.sample;
}

export function renderSdkSample(request: SampleRequest): string {
  const sample = findSdkSample(request.method, request.url);
  if (!sample) return "// This endpoint is not in the TypeScript SDK yet.";

  const args = sample.args(request);
  while (args.length > 0 && args.at(-1) === undefined) args.pop();
  const { origin } = new URL(request.url, "https://api.coss.com");
  return `import { Coss } from "coss";

const coss = new Coss({
  apiKey: process.env.COSS_API_KEY,
  baseUrl: ${tsValue(origin)},
});

const { data, error } = await coss.${sample.method}(${args.map((arg) => arg ?? "undefined").join(", ")});`;
}

/** One field of the example's body (for methods that take it as their own argument). */
function bodyField(body: unknown, name: string): unknown {
  return body !== null && typeof body === "object"
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

function pathId(request: SampleRequest): string {
  return pathParam(request, "id");
}

function inboxId(request: SampleRequest): string {
  return pathParam(request, "inbox_id");
}

function pathParam(request: SampleRequest, name: string): string {
  return tsValue(request.path[name]?.value ?? "");
}

/** A numeric path parameter, as the number the SDK method takes. */
function numberParam(request: SampleRequest, name: string): string {
  const value = request.path[name]?.value;
  return /^\d+$/.test(String(value ?? "")) ? String(value) : tsValue(value ?? "");
}

function application(request: SampleRequest): string {
  return pathParam(request, "application");
}

/** Hooks methods that take `{ application, ...body }` in one params object. */
function withApplication(request: SampleRequest): string {
  const body = request.body !== null && typeof request.body === "object" ? request.body : {};
  return tsValue({ application: request.path.application?.value ?? "", ...body });
}

/**
 * The example's query parameters as one params object, or nothing when there are none. They
 * arrive encoded as strings; integers (`limit`) become numbers again, as the SDK types them.
 */
function queryParams(request: SampleRequest): string | undefined {
  const entries = Object.entries(request.query)
    .map(([name, param]) => {
      const values = (param?.values ?? []).map((value) =>
        /^\d+$/.test(value)
          ? Number(value)
          : value === "true" || value === "false"
            ? value === "true"
            : value,
      );
      return [name, values.length > 1 ? values : values[0]] as const;
    })
    .filter(([, value]) => value !== undefined && value !== "");
  return entries.length > 0 ? tsValue(Object.fromEntries(entries)) : undefined;
}

/** `sendBatch` takes the body's `emails` array itself, not `{ emails }`. */
function batchEmails(body: unknown): unknown[] {
  const emails = body !== null && typeof body === "object" && "emails" in body ? body.emails : [];
  return Array.isArray(emails) ? emails : [];
}

/** `lists.add` takes the list, then `{ <type>: value, note? }` (not the wire body). */
function listEntryArgs(body: unknown): string[] {
  const entry = (body ?? {}) as { list?: string; type?: string; value?: string; note?: string };
  const { list = "block", type = "domain", value = "", note } = entry;
  return [tsValue(list), tsValue({ [type]: value, note })];
}

function requestOptions(request: SampleRequest): string | undefined {
  const idempotencyKey = Object.entries(request.header).find(
    ([name]) => name.toLowerCase() === "idempotency-key",
  )?.[1]?.value;
  return idempotencyKey ? tsValue({ idempotencyKey }) : undefined;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A value as a TypeScript literal: JSON with bare keys where possible and trailing commas. */
export function tsValue(value: unknown, indent = ""): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${inner}${tsValue(item, inner)},\n`).join("")}${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([key, item]) => {
      const name = IDENTIFIER.test(key) ? key : JSON.stringify(key);
      return `${inner}${name}: ${tsValue(item, inner)},\n`;
    });
    return `{\n${lines.join("")}${indent}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
