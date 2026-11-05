<?php

namespace Coss\Types;

enum SchedulingBookingWebhookDataStatus: string
{
    case Held = "held";
    case PendingApproval = "pending_approval";
    case Confirmed = "confirmed";
    case Cancelled = "cancelled";
    case Declined = "declined";
}
