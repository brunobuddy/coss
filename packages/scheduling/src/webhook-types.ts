export type { SchedulingWebhookEventType } from "./schemas.ts";

import type { SCHEDULING_CALENDAR_EVENT_TYPES } from "./schemas.ts";

export type SchedulingCalendarWebhookEventType = (typeof SCHEDULING_CALENDAR_EVENT_TYPES)[number];
