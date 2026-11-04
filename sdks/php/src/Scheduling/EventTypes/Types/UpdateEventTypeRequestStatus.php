<?php

namespace Coss\Scheduling\EventTypes\Types;

enum UpdateEventTypeRequestStatus: string
{
    case Active = "active";
    case Archived = "archived";
}
