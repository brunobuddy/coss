<?php

namespace Coss\Types;

enum SchedulingCalendarConnectionProvider: string
{
    case Google = "google";
    case Microsoft = "microsoft";
    case Caldav = "caldav";
    case Simulated = "simulated";
    case Zoom = "zoom";
}
