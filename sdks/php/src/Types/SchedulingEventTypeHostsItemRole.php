<?php

namespace Coss\Types;

enum SchedulingEventTypeHostsItemRole: string
{
    case Required = "required";
    case Member = "member";
}
