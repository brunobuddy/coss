<?php

namespace Coss\Types;

enum SchedulingSettingsCalendarFailureMode: string
{
    case Hide = "hide";
    case LastKnown = "last_known";
}
