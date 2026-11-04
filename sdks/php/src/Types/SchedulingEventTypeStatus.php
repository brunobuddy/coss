<?php

namespace Coss\Types;

enum SchedulingEventTypeStatus: string
{
    case Active = "active";
    case Archived = "archived";
}
