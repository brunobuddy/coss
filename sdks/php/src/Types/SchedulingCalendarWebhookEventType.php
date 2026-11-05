<?php

namespace Coss\Types;

enum SchedulingCalendarWebhookEventType: string
{
    case SchedulingCalendarConnected = "scheduling.calendar.connected";
    case SchedulingCalendarNeedsReauth = "scheduling.calendar.needs_reauth";
    case SchedulingCalendarDisconnected = "scheduling.calendar.disconnected";
}
