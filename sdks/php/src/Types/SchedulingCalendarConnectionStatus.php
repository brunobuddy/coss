<?php

namespace Coss\Types;

enum SchedulingCalendarConnectionStatus: string
{
    case Active = "active";
    case NeedsReauth = "needs_reauth";
}
