<?php

namespace Coss\Types;

enum SchedulingBookingStatus: string
{
    case Held = "held";
    case PendingApproval = "pending_approval";
    case Confirmed = "confirmed";
    case Cancelled = "cancelled";
    case Declined = "declined";
}
