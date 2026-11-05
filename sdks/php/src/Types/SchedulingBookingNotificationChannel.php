<?php

namespace Coss\Types;

enum SchedulingBookingNotificationChannel: string
{
    case Email = "email";
    case Sms = "sms";
    case Webhook = "webhook";
}
