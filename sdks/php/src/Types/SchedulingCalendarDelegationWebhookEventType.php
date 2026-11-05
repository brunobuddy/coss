<?php

namespace Coss\Types;

enum SchedulingCalendarDelegationWebhookEventType: string
{
    case SchedulingCalendarDelegationFailing = "scheduling.calendar_delegation.failing";
    case SchedulingCalendarDelegationRestored = "scheduling.calendar_delegation.restored";
}
