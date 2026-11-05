<?php

namespace Coss\Scheduling\Hosts\Types;

enum UpdateHostRequestStatus: string
{
    case Active = "active";
    case Disabled = "disabled";
}
