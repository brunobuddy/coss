<?php

namespace Coss\Types;

enum CreditSource: string
{
    case Fee = "fee";
    case Commitment = "commitment";
    case Support = "support";
    case Promotion = "promotion";
    case Refund = "refund";
    case Sla = "sla";
    case Threshold = "threshold";
}
