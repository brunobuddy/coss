<?php

namespace Coss\Types;

enum SchedulingReminderAnchor: string
{
    case Start = "start";
    case End = "end";
    case Confirmed = "confirmed";
    case Rescheduled = "rescheduled";
    case Cancelled = "cancelled";
    case Declined = "declined";
    case PendingApproval = "pending_approval";
    case NoShow = "no_show";
}
