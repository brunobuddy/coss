<?php

namespace Coss\Types;

enum SchedulingReminderInputSendItem: string
{
    case EmailAttendee = "email_attendee";
    case EmailHost = "email_host";
    case SmsAttendee = "sms_attendee";
    case SmsHost = "sms_host";
    case Webhook = "webhook";
}
