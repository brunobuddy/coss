<?php

namespace Coss\Types;

enum CreateSeriesRequestRecurrenceFrequency: string
{
    case Weekly = "weekly";
    case Monthly = "monthly";
}
