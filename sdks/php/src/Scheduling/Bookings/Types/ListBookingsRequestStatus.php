<?php

namespace Coss\Scheduling\Bookings\Types;

enum ListBookingsRequestStatus: string
{
    case Held = "held";
    case PendingApproval = "pending_approval";
    case Confirmed = "confirmed";
    case Cancelled = "cancelled";
    case Declined = "declined";
}
