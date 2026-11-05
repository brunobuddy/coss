<?php

namespace Coss\Types;

enum SchedulingBookingWebhookEventType: string
{
    case SchedulingBookingCreated = "scheduling.booking.created";
    case SchedulingBookingPendingApproval = "scheduling.booking.pending_approval";
    case SchedulingBookingConfirmed = "scheduling.booking.confirmed";
    case SchedulingBookingRescheduled = "scheduling.booking.rescheduled";
    case SchedulingBookingCancelled = "scheduling.booking.cancelled";
    case SchedulingBookingDeclined = "scheduling.booking.declined";
    case SchedulingBookingNoShow = "scheduling.booking.no_show";
    case SchedulingBookingExternalConflict = "scheduling.booking.external_conflict";
    case SchedulingBookingCalendarWriteFailed = "scheduling.booking.calendar_write_failed";
    case SchedulingBookingLocationReady = "scheduling.booking.location_ready";
    case SchedulingBookingStarted = "scheduling.booking.started";
    case SchedulingBookingEnded = "scheduling.booking.ended";
    case SchedulingBookingReminder = "scheduling.booking.reminder";
}
