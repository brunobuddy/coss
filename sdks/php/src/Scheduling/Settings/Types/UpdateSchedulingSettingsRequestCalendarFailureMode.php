<?php

namespace Coss\Scheduling\Settings\Types;

enum UpdateSchedulingSettingsRequestCalendarFailureMode: string
{
    case Hide = "hide";
    case LastKnown = "last_known";
}
