<?php

namespace Coss\Types;

enum SchedulingCalendarDelegationStatus: string
{
    case Pending = "pending";
    case Active = "active";
    case Failing = "failing";
    case Deleting = "deleting";
}
