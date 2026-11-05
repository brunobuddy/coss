<?php

namespace Coss\Types;

enum SchedulingBookingNotificationRecipient: string
{
    case Attendee = "attendee";
    case Host = "host";
    case Endpoint = "endpoint";
    case Address = "address";
}
