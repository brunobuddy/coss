<?php

namespace Coss\Types;

enum SchedulingLimitScope: string
{
    case EventType = "event_type";
    case Host = "host";
}
