<?php

namespace Coss\Types;

enum InvoiceSummaryKind: string
{
    case Period = "period";
    case PlanChange = "plan_change";
    case OneOff = "one_off";
    case Final_ = "final";
    case Threshold = "threshold";
}
