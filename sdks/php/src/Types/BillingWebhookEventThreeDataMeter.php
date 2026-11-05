<?php

namespace Coss\Types;

enum BillingWebhookEventThreeDataMeter: string
{
    case EmailRecipients = "email.recipients";
    case EmailDedicatedIp = "email.dedicated_ip";
    case EmailAttachmentData = "email.attachment_data";
    case EmailReceived = "email.received";
    case EmailReceivedData = "email.received_data";
    case EmailInboxes = "email.inboxes";
    case SmsSegments = "sms.segments";
    case SmsReceivedSegments = "sms.received_segments";
    case SmsNumbers = "sms.numbers";
    case SmsRegistrations = "sms.registrations";
    case SignCompletedRequests = "sign.completed_requests";
    case RiskPhoneChecks = "risk.phone_checks";
    case RiskAssessments = "risk.assessments";
    case RiskContentChecks = "risk.content_checks";
    case VerifyVerifications = "verify.verifications";
    case VerifySms = "verify.sms";
    case FormsSubmissions = "forms.submissions";
    case FormsFileUploads = "forms.file_uploads";
    case SchedulingBookings = "scheduling.bookings";
    case SchedulingHosts = "scheduling.hosts";
    case HooksMessages = "hooks.messages";
}
