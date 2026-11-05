<?php

namespace Coss\Types;

enum CreateSeriesRequestOnConflict: string
{
    case Reject = "reject";
    case Skip = "skip";
}
