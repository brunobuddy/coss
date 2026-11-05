<?php

namespace Coss\Scheduling\EventTypes\Types;

enum CreateEventTypeRequestKind: string
{
    case OneOnOne = "one_on_one";
    case Pool = "pool";
    case Collective = "collective";
    case Group = "group";
}
