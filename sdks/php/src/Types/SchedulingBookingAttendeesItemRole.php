<?php

namespace Coss\Types;

enum SchedulingBookingAttendeesItemRole: string
{
    case Attendee = "attendee";
    case Guest = "guest";
}
