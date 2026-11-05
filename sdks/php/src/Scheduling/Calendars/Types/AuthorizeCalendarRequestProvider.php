<?php

namespace Coss\Scheduling\Calendars\Types;

enum AuthorizeCalendarRequestProvider: string
{
    case Google = "google";
    case Microsoft = "microsoft";
    case Zoom = "zoom";
}
