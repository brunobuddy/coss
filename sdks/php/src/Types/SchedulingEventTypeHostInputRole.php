<?php

namespace Coss\Types;

enum SchedulingEventTypeHostInputRole: string
{
    case Required = "required";
    case Member = "member";
}
