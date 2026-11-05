<?php

namespace Coss\Types;

enum SchedulingEventTypeKind: string
{
    case OneOnOne = "one_on_one";
    case Pool = "pool";
    case Collective = "collective";
    case Group = "group";
}
