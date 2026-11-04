<?php

namespace Coss\Scheduling\EventTypes\Types;

enum UpdateEventTypeRequestHostCalendarDetails: string
{
    case Neutral = "neutral";
    case Full = "full";
}
