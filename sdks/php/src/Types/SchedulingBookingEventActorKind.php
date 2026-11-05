<?php

namespace Coss\Types;

enum SchedulingBookingEventActorKind: string
{
    case ApiKey = "api_key";
    case User = "user";
    case HostSession = "host_session";
    case BookerSession = "booker_session";
    case ManageSession = "manage_session";
    case System = "system";
}
