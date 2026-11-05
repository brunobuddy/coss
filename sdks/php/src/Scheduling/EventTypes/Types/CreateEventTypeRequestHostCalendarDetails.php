<?php

namespace Coss\Scheduling\EventTypes\Types;

enum CreateEventTypeRequestHostCalendarDetails: string
{
    case Neutral = "neutral";
    case Full = "full";
}
