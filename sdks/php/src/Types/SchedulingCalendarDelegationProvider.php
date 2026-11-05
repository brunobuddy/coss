<?php

namespace Coss\Types;

enum SchedulingCalendarDelegationProvider: string
{
    case Google = "google";
    case Microsoft = "microsoft";
}
