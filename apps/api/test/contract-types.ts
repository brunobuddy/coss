/**
 * Compile-time contract between the API's zod schemas and the SDK's hand-written wire types.
 * Checked by `tsc --noEmit` (never executed): a mismatch is a type error in this file.
 */

import type {
  BillingObject,
  BillingWebhookEvent,
  CreditList,
  CreditObject,
  InvoiceList,
  InvoiceObject,
  InvoiceSummary,
  ListCreditsQuery,
  ListInvoicesQuery,
  UsageList,
  UsageObject,
  UsageQuery,
} from "@coss/billing/wire";
import type {
  Broadcast,
  BroadcastList,
  BroadcastTest,
  BroadcastWebhookEvent,
  CreateBroadcastRequest,
  DeletedBroadcast,
  ListBroadcastsQuery,
  SendBroadcastRequest,
  TestBroadcastRequest,
  UpdateBroadcastRequest,
} from "@coss/email/broadcast-schemas";
import type {
  AddAudienceContactsRequest,
  Audience,
  AudienceContactsAdded,
  AudienceList,
  Contact,
  ContactConfirmation,
  ContactImport,
  ContactList,
  ContactPropertyList,
  ContactPropertyObject,
  ContactTopics,
  ContactWebhookEvent,
  CreateAudienceRequest,
  CreateContactPropertyRequest,
  CreatePreferenceLinksRequest,
  CreateSegmentRequest,
  CreateTopicRequest,
  DeletedAudience,
  DeletedContact,
  DeletedContactProperty,
  DeletedSegment,
  DeletedTopic,
  ExportContactsQuery,
  ImportContactsRequest,
  ListContactsQuery,
  ListQuery,
  MarketingSettings,
  PreferenceLinksObject,
  Segment,
  SegmentList,
  Topic,
  TopicList,
  UpdateContactPropertyRequest,
  UpdateContactRequest,
  UpdateContactTopicsRequest,
  UpdateMarketingSettingsRequest,
  UpdateSegmentRequest,
  UpdateTopicRequest,
  UpsertContactRequest,
} from "@coss/email/contact-schemas";
import type { InboxMessageReceivedWebhookEvent } from "@coss/email/inbox-schemas";
import type {
  CheckSuppressionQuery,
  CreateDomainRequest,
  CreateEmailTemplateRequest,
  CreateReceivingDomainRequest,
  CreateSuppressionRequest,
  CreateTrackingDomainRequest,
  DedicatedIpPoolObject,
  DeletedDomain,
  DeletedEmailTemplate,
  DeletedReceivedEmail,
  DeletedSuppression,
  DeletedTrackingRule,
  DmarcReportList,
  DmarcReportObject,
  DmarcReportSummary,
  DomainBimiObject,
  DomainDmarc,
  DomainList,
  DomainObject,
  DomainRecordObject,
  DomainWebhookEvent,
  EmailBatchObject,
  EmailEvent,
  EmailEventList,
  EmailLink,
  EmailLinkList,
  EmailObject,
  EmailRecipient,
  EmailSummaryList,
  EmailTemplateList,
  EmailTemplateObject,
  EmailTemplateReference,
  EmailTemplateVersionList,
  EmailTemplateVersionObject,
  EmailWebhookEvent,
  ExportSuppressionsQuery,
  ImportSuppressionsRequest,
  InboundAddressObject,
  ListDmarcReportsQuery,
  ListDomainsQuery,
  ListEmailsQuery,
  ListEmailTemplatesQuery,
  ListEmailTemplateVersionsQuery,
  ListReceivedEmailsQuery,
  ListSuppressionsQuery,
  PublishEmailTemplateRequest,
  ReceivedEmailList,
  ReceivedEmailObject,
  ReceivedEmailSummary,
  ReceivedEmailWebhookEvent,
  ReceivingDomainObject,
  RenderEmailTemplateRequest,
  RenderedEmailTemplateObject,
  RescheduleEmailRequest,
  SendEmailBatchRequest,
  SendEmailRequest,
  StorageSettings,
  Suppression,
  SuppressionCheck,
  SuppressionImport,
  SuppressionList,
  TemplateContentObject,
  TemplateVariableObject,
  TrackingDomainObject,
  TrackingRule,
  TrackingSettings,
  UpdateDomainRequest,
  UpdateEmailTemplateDraftRequest,
  UpdateEmailTemplateRequest,
  UpdateStorageSettingsRequest,
  UpdateTrackingRuleRequest,
} from "@coss/email/schemas";
import type {
  CreateSubaccountRequest,
  ListSubaccountsQuery,
  Subaccount,
  SubaccountList,
  SubaccountStats,
  SubaccountStatsQuery,
  SubaccountWebhookEvent,
  UpdateSubaccountRequest,
} from "@coss/email/subaccount-schemas";
import type {
  CreateTestWebhookEventRequest,
  WebhookTestEventObject,
} from "@coss/email/test-event-schemas";
import type { FormSubmissionWebhookEvent } from "@coss/forms/schemas";
import type {
  LogDrainSource as ApiLogDrainSource,
  AuditEvent,
  AuditEventList,
  ListAuditEventsQuery,
  ListLogsQuery,
  LogEntry,
  LogList,
} from "@coss/logs/schemas";
import type {
  AccountWebhookEvent,
  ReputationCheckObject,
  ReputationObject,
} from "@coss/reputation/schemas";
import type {
  CheckRiskLimitRequest,
  CreateRiskAssessmentRequest,
  CreateRiskFeedbackRequest,
  CreateRiskLimitBucketRequest,
  CreateRiskListEntryRequest,
  CreateRiskRuleRequest,
  DeletedRiskLimitBucket,
  DeletedRiskListEntry,
  DeletedRiskRule,
  ForgottenRiskUser,
  ListRiskAssessmentsQuery,
  ListRiskListEntriesQuery,
  RiskAssessment,
  RiskAssessmentList,
  RiskCalibration,
  RiskContentClassification,
  RiskContentClassifyRequest,
  RiskEmailCheck,
  RiskEmailCheckRequest,
  RiskIpCheck,
  RiskIpCheckRequest,
  RiskLimit,
  RiskLimitBucket,
  RiskLimitBucketList,
  RiskListEntry,
  RiskListEntryList,
  RiskPhoneCheck,
  RiskPhoneCheckRequest,
  RiskRule,
  RiskRuleCondition,
  RiskRuleList,
  RiskSettings,
  RiskWebhookEvent,
  UpdateRiskLimitBucketRequest,
  UpdateRiskRuleRequest,
  UpdateRiskSettingsRequest,
} from "@coss/risk/schemas";
import type {
  AuthorizeCalendarRequest,
  AvailabilitySearchRequest,
  AvailabilitySearchResult,
  BookingObject,
  CalendarAuthorization,
  CalendarConnectionObject,
  CancelledSeries,
  CancelSeriesRequest,
  ConfirmHoldRequest,
  CreateBookingRequest,
  CreateCalendarConnectionRequest,
  CreateEventTypeRequest,
  CreateHoldRequest,
  CreateHostRequest,
  CreateSeriesRequest,
  ErasedAttendee,
  EventTypeObject,
  HostObject,
  RescheduleBookingRequest,
  ScheduleObject,
  SchedulingBookingWebhookEvent,
  SchedulingCalendarWebhookEvent,
  SeriesPreview,
  SeriesResult,
  SetSimulatedBusyRequest,
  SettingsObject,
  SlotList,
  SlotsQuery,
  UpdateBookingLocationRequest,
  UpdateCalendarRequest,
  UpdateEventTypeRequest,
  UpdateHostRequest,
  UpdateSettingsRequest,
  UpsertScheduleRequest,
} from "@coss/scheduling/schemas";
import type { SignRequestWebhookEvent } from "@coss/sign/schemas";
import type { ReceivedSmsWebhookEvent, SmsWebhookEvent } from "@coss/sms/schemas";
import type { VerificationWebhookEvent } from "@coss/verify/schemas";
import type { ApiVersion } from "@coss/versioning";
import type {
  LogDrainFormat as ApiLogDrainFormat,
  CreateLogDrainRequest,
  DeletedLogDrain,
  DeletedWebhookEndpoint,
  DeletedWebhookListener,
  HookEndpointWebhookEvent,
  ListLogDrainBatchesQuery,
  ListWebhookDeliveriesQuery,
  LogDrainAttemptObject,
  LogDrainBatchList,
  LogDrainBatchObject,
  LogDrainList,
  LogDrainObject,
  LogDrainWithSecret,
  PollWebhookListenerRequest,
  RecoverWebhookEndpointRequest,
  RecoverWebhookEndpointResult,
  RollWebhookEndpointSecretRequest,
  UpdateLogDrainRequest,
  WebhookAttemptObject,
  WebhookDeliveryList,
  WebhookDeliveryObject,
  WebhookEndpointList,
  WebhookEndpointObject,
  WebhookEndpointWithSecret,
  WebhookListenerObject,
  WebhookListenerPoll,
} from "@coss/webhooks/schemas";
import type {
  AddAudienceContactsParams,
  AssessRiskParams,
  AudienceParams,
  AuthorizeSchedulingCalendarParams,
  CancelSchedulingSeriesParams,
  CheckRiskLimitParams,
  CheckSuppressionParams,
  ConfirmSchedulingHoldParams,
  CossErrorIssue,
  CossErrorType,
  CreateBroadcastParams,
  CreateContactPropertyParams,
  CreateDomainParams,
  CreateEmailTemplateParams,
  CreateLogDrainParams,
  CreatePreferenceLinksParams,
  CreateReceivingDomainParams,
  CreateRiskLimitBucketParams,
  CreateRiskListEntryParams,
  CreateRiskRuleParams,
  CreateSchedulingBookingParams,
  CreateSchedulingCalendarConnectionParams,
  CreateSchedulingEventTypeParams,
  CreateSchedulingHoldParams,
  CreateSchedulingHostParams,
  CreateSchedulingSeriesParams,
  CreateSegmentParams,
  CreateSubaccountParams,
  CreateSuppressionParams,
  CreateTopicParams,
  CreateTrackingDomainParams,
  CreateWebhookEndpointParams,
  CreateWebhookListenerParams,
  Email,
  EmailBatch,
  EmailSummary,
  ExportContactsParams,
  ExportSuppressionsParams,
  ImportContactsParams,
  ImportSuppressionsParams,
  List,
  ListAuditEventsParams,
  ListBroadcastsParams,
  ListContactsParams,
  ListCreditsParams,
  ListDmarcReportsParams,
  ListDomainsParams,
  ListEmailsParams,
  ListEmailTemplatesParams,
  ListEmailTemplateVersionsParams,
  ListInvoicesParams,
  ListLogDrainBatchesParams,
  ListLogsParams,
  ListParams,
  ListReceivedEmailsParams,
  ListRiskAssessmentsParams,
  ListRiskListEntriesParams,
  ListSchedulingSlotsParams,
  ListSubaccountsParams,
  ListSuppressionsParams,
  ListUsageParams,
  ListWebhookDeliveriesParams,
  LogDrain,
  LogDrainAttempt,
  LogDrainBatch,
  LogDrainFormat,
  LogDrainLine,
  LogDrainSource,
  PollWebhookListenerParams,
  PublishEmailTemplateParams,
  RecoverWebhookEndpointParams,
  RenderEmailTemplateParams,
  RescheduleEmailParams,
  RescheduleSchedulingBookingParams,
  RiskFeedbackParams,
  RollWebhookEndpointSecretParams,
  SchedulingAttendeeErasure,
  SchedulingAvailabilitySearchResult,
  SchedulingBooking,
  SchedulingCalendarAuthorization,
  SchedulingCalendarConnection,
  SchedulingCancelledSeries,
  SchedulingEventType,
  SchedulingHost,
  SchedulingSchedule,
  SchedulingSeries,
  SchedulingSeriesPreview,
  SchedulingSettings,
  SchedulingSlotList,
  AccountWebhookEvent as SdkAccountWebhookEvent,
  ApiVersion as SdkApiVersion,
  Audience as SdkAudience,
  AudienceContactsAdded as SdkAudienceContactsAdded,
  AuditEvent as SdkAuditEvent,
  Billing as SdkBilling,
  BillingWebhookEvent as SdkBillingWebhookEvent,
  Broadcast as SdkBroadcast,
  BroadcastTest as SdkBroadcastTest,
  BroadcastWebhookEvent as SdkBroadcastWebhookEvent,
  Contact as SdkContact,
  ContactConfirmation as SdkContactConfirmation,
  ContactImport as SdkContactImport,
  ContactProperty as SdkContactProperty,
  ContactTopics as SdkContactTopics,
  ContactWebhookEvent as SdkContactWebhookEvent,
  Credit as SdkCredit,
  DedicatedIpPool as SdkDedicatedIpPool,
  DeletedApiKey as SdkDeletedApiKey,
  DeletedAudience as SdkDeletedAudience,
  DeletedBroadcast as SdkDeletedBroadcast,
  DeletedContact as SdkDeletedContact,
  DeletedContactProperty as SdkDeletedContactProperty,
  DeletedDomain as SdkDeletedDomain,
  DeletedEmailTemplate as SdkDeletedEmailTemplate,
  DeletedLogDrain as SdkDeletedLogDrain,
  DeletedReceivedEmail as SdkDeletedReceivedEmail,
  DeletedRiskLimitBucket as SdkDeletedRiskLimitBucket,
  DeletedRiskListEntry as SdkDeletedRiskListEntry,
  DeletedRiskRule as SdkDeletedRiskRule,
  DeletedSegment as SdkDeletedSegment,
  DeletedSuppression as SdkDeletedSuppression,
  DeletedTopic as SdkDeletedTopic,
  DeletedTrackingRule as SdkDeletedTrackingRule,
  DeletedWebhookEndpoint as SdkDeletedWebhookEndpoint,
  DeletedWebhookListener as SdkDeletedWebhookListener,
  DmarcReport as SdkDmarcReport,
  DmarcReportSummary as SdkDmarcReportSummary,
  Domain as SdkDomain,
  DomainBimi as SdkDomainBimi,
  DomainDmarc as SdkDomainDmarc,
  DomainRecord as SdkDomainRecord,
  DomainWebhookEvent as SdkDomainWebhookEvent,
  EmailContentStorage as SdkEmailContentStorage,
  EmailEvent as SdkEmailEvent,
  EmailLink as SdkEmailLink,
  EmailRecipient as SdkEmailRecipient,
  EmailTemplate as SdkEmailTemplate,
  EmailTemplateReference as SdkEmailTemplateReference,
  EmailTemplateVersion as SdkEmailTemplateVersion,
  EmailTracking as SdkEmailTracking,
  EmailWebhookEvent as SdkEmailWebhookEvent,
  WebhookEndpointWithSecret as SdkEndpointWithSecret,
  Environment as SdkEnvironment,
  ForgottenRiskUser as SdkForgottenRiskUser,
  HookEndpointWebhookEvent as SdkHookEndpointWebhookEvent,
  InboundAddress as SdkInboundAddress,
  Invoice as SdkInvoice,
  InvoiceSummary as SdkInvoiceSummary,
  List as SdkList,
  Log as SdkLog,
  LogDrainWithSecret as SdkLogDrainWithSecret,
  MarketingSettings as SdkMarketingSettings,
  PreferenceLinks as SdkPreferenceLinks,
  ReceivedEmail as SdkReceivedEmail,
  ReceivedEmailSummary as SdkReceivedEmailSummary,
  ReceivedEmailWebhookEvent as SdkReceivedEmailWebhookEvent,
  ReceivingDomain as SdkReceivingDomain,
  RenderedEmailTemplate as SdkRenderedEmailTemplate,
  Reputation as SdkReputation,
  ReputationCheck as SdkReputationCheck,
  RiskAssessment as SdkRiskAssessment,
  RiskCalibration as SdkRiskCalibration,
  RiskContentClassification as SdkRiskContentClassification,
  RiskEmailCheck as SdkRiskEmailCheck,
  RiskIpCheck as SdkRiskIpCheck,
  RiskLimit as SdkRiskLimit,
  RiskLimitBucket as SdkRiskLimitBucket,
  RiskListEntry as SdkRiskListEntry,
  RiskPhoneCheck as SdkRiskPhoneCheck,
  RiskRule as SdkRiskRule,
  RiskRuleCondition as SdkRiskRuleCondition,
  RiskSettings as SdkRiskSettings,
  RiskWebhookEvent as SdkRiskWebhookEvent,
  Segment as SdkSegment,
  StorageSettings as SdkStorageSettings,
  Subaccount as SdkSubaccount,
  SubaccountStats as SdkSubaccountStats,
  SubaccountWebhookEvent as SdkSubaccountWebhookEvent,
  Suppression as SdkSuppression,
  SuppressionCheck as SdkSuppressionCheck,
  SuppressionImport as SdkSuppressionImport,
  TemplateContent as SdkTemplateContent,
  TemplateVariable as SdkTemplateVariable,
  Topic as SdkTopic,
  TrackingDomain as SdkTrackingDomain,
  TrackingRule as SdkTrackingRule,
  TrackingSettings as SdkTrackingSettings,
  Usage as SdkUsage,
  WebhookAttempt as SdkWebhookAttempt,
  WebhookDelivery as SdkWebhookDelivery,
  WebhookListener as SdkWebhookListener,
  WebhookListenerPoll as SdkWebhookListenerPoll,
  SearchSchedulingAvailabilityParams,
  SendBroadcastParams,
  SendEmailContentParams,
  SendEmailTemplateParams,
  SendTestWebhookEventParams,
  SetSchedulingSimulatedBusyParams,
  SubaccountStatsParams,
  TestBroadcastParams,
  TrackingOptions,
  UpdateBroadcastParams,
  UpdateContactParams,
  UpdateContactPropertyParams,
  UpdateContactTopicsParams,
  UpdateDomainParams,
  UpdateEmailTemplateDraftParams,
  UpdateEmailTemplateParams,
  UpdateLogDrainParams,
  UpdateMarketingSettingsParams,
  UpdateRiskLimitBucketParams,
  UpdateRiskRuleParams,
  UpdateRiskSettingsParams,
  UpdateSchedulingBookingLocationParams,
  UpdateSchedulingCalendarParams,
  UpdateSchedulingEventTypeParams,
  UpdateSchedulingHostParams,
  UpdateSchedulingSettingsParams,
  UpdateSegmentParams,
  UpdateStorageSettingsParams,
  UpdateSubaccountParams,
  UpdateTopicParams,
  UpdateTrackingRuleParams,
  UpdateWebhookEndpointParams,
  UpsertContactParams,
  UpsertSchedulingScheduleParams,
  WebhookEndpoint,
  WebhookEndpointRecovery,
  WebhookEvent,
  WebhookTestEvent,
} from "coss";
import type { z } from "zod";
import type { ErrorEnvelopeBody } from "../src/errors.ts";
import type { DeletedApiKey, EnvironmentObject } from "../src/routes/environment.ts";
import type {
  CreateWebhookEndpointRequest,
  UpdateWebhookEndpointRequest,
} from "../src/routes/webhook-endpoints.ts";
import type { CreateWebhookListenerRequest } from "../src/routes/webhook-listeners.ts";

/** Identical types (stricter than mutual assignability: also catches optionality drift). */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Each side assignable to the other, with exactly the same keys. */
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? Equals<keyof A, keyof B>
    : false
  : false;

type Assert<T extends true> = T;

/** `A` is assignable to `B` (one direction only). */
type Extends<A, B> = [A] extends [B] ? true : false;

type SendInput = z.input<typeof SendEmailRequest>;
// `react` never reaches the API: the SDK renders it into `html`/`text` first.
type SendContentBody = Omit<SendEmailContentParams, "react">;
type SendTemplateBody = Omit<SendEmailTemplateParams, "react">;
type SendEmailBody = SendContentBody | SendTemplateBody;
type EmailOutput = z.output<typeof EmailObject>;
type ApiError = ErrorEnvelopeBody["error"];

export type Contract = [
  // API versions: the SDK knows exactly the API's versions.
  Assert<MutuallyAssignable<ApiVersion, SdkApiVersion>>,
  // Request: a send has its own content or a template. Every SDK body is valid API input, and
  // each kind names every API field (the other kind's as `never`).
  Assert<Extends<SendEmailBody, SendInput>>,
  Assert<Equals<keyof SendInput, keyof SendContentBody>>,
  Assert<Equals<keyof SendInput, keyof SendTemplateBody>>,
  Assert<MutuallyAssignable<NonNullable<SendInput["subject"]>, SendContentBody["subject"]>>,
  Assert<MutuallyAssignable<NonNullable<SendInput["html"]>, NonNullable<SendContentBody["html"]>>>,
  Assert<MutuallyAssignable<NonNullable<SendInput["text"]>, NonNullable<SendContentBody["text"]>>>,
  Assert<
    MutuallyAssignable<NonNullable<SendInput["template_id"]>, SendTemplateBody["template_id"]>
  >,
  Assert<
    MutuallyAssignable<
      NonNullable<SendInput["template_version"]>,
      NonNullable<SendTemplateBody["template_version"]>
    >
  >,
  Assert<
    MutuallyAssignable<NonNullable<SendInput["locale"]>, NonNullable<SendTemplateBody["locale"]>>
  >,
  Assert<
    MutuallyAssignable<
      NonNullable<SendInput["variables"]>,
      NonNullable<SendTemplateBody["variables"]>
    >
  >,
  Assert<MutuallyAssignable<SendInput["to"], SendEmailBody["to"]>>,
  Assert<MutuallyAssignable<NonNullable<SendInput["tracking"]>, TrackingOptions>>,
  Assert<MutuallyAssignable<NonNullable<SendInput["tags"]>, NonNullable<SendEmailBody["tags"]>>>,
  Assert<
    MutuallyAssignable<
      NonNullable<SendInput["attachments"]>[number],
      NonNullable<SendEmailBody["attachments"]>[number]
    >
  >,
  // Response: what the API returns is exactly the SDK's `Email`.
  Assert<MutuallyAssignable<EmailOutput, Email>>,
  Assert<MutuallyAssignable<EmailOutput["status"], Email["status"]>>,
  Assert<MutuallyAssignable<EmailOutput["tags"], Email["tags"]>>,
  Assert<MutuallyAssignable<EmailOutput["attachments"][number], Email["attachments"][number]>>,
  Assert<MutuallyAssignable<EmailOutput["failure"], Email["failure"]>>,
  Assert<MutuallyAssignable<z.output<typeof EmailSummaryList>, List<EmailSummary>>>,
  Assert<Equals<keyof z.input<typeof ListEmailsQuery>, keyof ListEmailsParams>>,
  Assert<MutuallyAssignable<z.output<typeof EmailRecipient>, SdkEmailRecipient>>,
  Assert<
    MutuallyAssignable<z.output<typeof EmailRecipient>["status"], SdkEmailRecipient["status"]>
  >,
  Assert<MutuallyAssignable<z.output<typeof EmailEvent>["type"], SdkEmailEvent["type"]>>,
  Assert<MutuallyAssignable<z.output<typeof EmailEvent>, SdkEmailEvent>>,
  Assert<MutuallyAssignable<z.output<typeof EmailEvent>["data"], SdkEmailEvent["data"]>>,
  Assert<MutuallyAssignable<z.output<typeof EmailEventList>, List<SdkEmailEvent>>>,
  Assert<MutuallyAssignable<EmailOutput["tracking"], SdkEmailTracking>>,
  Assert<MutuallyAssignable<EmailOutput["content_storage"], SdkEmailContentStorage>>,
  Assert<MutuallyAssignable<z.output<typeof EmailLink>, SdkEmailLink>>,
  Assert<MutuallyAssignable<z.output<typeof EmailLinkList>, List<SdkEmailLink>>>,
  // Batch sends: `sendBatch(emails)` posts `{ emails }` and returns the batch.
  Assert<Extends<SendEmailBody, z.input<typeof SendEmailBatchRequest>["emails"][number]>>,
  Assert<Equals<z.input<typeof SendEmailBatchRequest>["emails"][number], SendInput>>,
  Assert<Equals<keyof z.input<typeof SendEmailBatchRequest>, "emails">>,
  Assert<MutuallyAssignable<z.output<typeof EmailBatchObject>, EmailBatch>>,
  // Email templates.
  Assert<
    MutuallyAssignable<z.output<typeof EmailObject>["template"], SdkEmailTemplateReference | null>
  >,
  Assert<MutuallyAssignable<z.output<typeof EmailTemplateReference>, SdkEmailTemplateReference>>,
  Assert<MutuallyAssignable<z.input<typeof CreateEmailTemplateRequest>, CreateEmailTemplateParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateEmailTemplateRequest>, UpdateEmailTemplateParams>>,
  Assert<
    MutuallyAssignable<
      z.input<typeof UpdateEmailTemplateDraftRequest>,
      UpdateEmailTemplateDraftParams
    >
  >,
  Assert<
    MutuallyAssignable<z.input<typeof PublishEmailTemplateRequest>, PublishEmailTemplateParams>
  >,
  // Query numbers are coerced from strings, so only the keys are compared.
  Assert<Equals<keyof z.input<typeof ListEmailTemplatesQuery>, keyof ListEmailTemplatesParams>>,
  Assert<
    Equals<
      keyof z.input<typeof ListEmailTemplateVersionsQuery>,
      keyof ListEmailTemplateVersionsParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof EmailTemplateObject>, SdkEmailTemplate>>,
  Assert<MutuallyAssignable<z.output<typeof EmailTemplateList>, List<SdkEmailTemplate>>>,
  Assert<MutuallyAssignable<z.output<typeof EmailTemplateVersionObject>, SdkEmailTemplateVersion>>,
  Assert<MutuallyAssignable<z.input<typeof RenderEmailTemplateRequest>, RenderEmailTemplateParams>>,
  Assert<
    MutuallyAssignable<z.output<typeof RenderedEmailTemplateObject>, SdkRenderedEmailTemplate>
  >,
  Assert<
    MutuallyAssignable<z.output<typeof EmailTemplateVersionList>, List<SdkEmailTemplateVersion>>
  >,
  Assert<MutuallyAssignable<z.output<typeof TemplateVariableObject>, SdkTemplateVariable>>,
  Assert<MutuallyAssignable<z.output<typeof TemplateContentObject>, SdkTemplateContent>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedEmailTemplate>, SdkDeletedEmailTemplate>>,
  // Rescheduling: `reschedule(id, params)` posts the params as they are.
  Assert<MutuallyAssignable<z.input<typeof RescheduleEmailRequest>, RescheduleEmailParams>>,
  Assert<Equals<keyof z.input<typeof RescheduleEmailRequest>, keyof RescheduleEmailParams>>,
  // Domains: request and response shapes match the SDK's hand-written types.
  Assert<MutuallyAssignable<z.input<typeof CreateDomainRequest>, CreateDomainParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateDomainRequest>, UpdateDomainParams>>,
  Assert<MutuallyAssignable<z.output<typeof ListDomainsQuery>, ListDomainsParams>>,
  Assert<MutuallyAssignable<z.output<typeof DomainObject>, SdkDomain>>,
  Assert<MutuallyAssignable<z.output<typeof DomainObject>["status"], SdkDomain["status"]>>,
  Assert<MutuallyAssignable<z.output<typeof DomainRecordObject>, SdkDomainRecord>>,
  Assert<MutuallyAssignable<z.output<typeof DomainBimiObject>, SdkDomainBimi>>,
  Assert<MutuallyAssignable<z.output<typeof DomainList>, List<SdkDomain>>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedDomain>, SdkDeletedDomain>>,
  Assert<
    MutuallyAssignable<z.input<typeof CreateTrackingDomainRequest>, CreateTrackingDomainParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof TrackingDomainObject>, SdkTrackingDomain>>,
  // Webhook endpoints: same, including the create-only `secret`.
  Assert<
    MutuallyAssignable<z.input<typeof CreateWebhookEndpointRequest>, CreateWebhookEndpointParams>
  >,
  Assert<
    MutuallyAssignable<z.input<typeof UpdateWebhookEndpointRequest>, UpdateWebhookEndpointParams>
  >,
  Assert<
    MutuallyAssignable<
      z.input<typeof RollWebhookEndpointSecretRequest>,
      RollWebhookEndpointSecretParams
    >
  >,
  // The SDK also accepts a `Date` for `since` and sends it as an ISO string.
  Assert<
    MutuallyAssignable<
      z.input<typeof RecoverWebhookEndpointRequest>,
      Omit<RecoverWebhookEndpointParams, "since"> & { since: string }
    >
  >,
  Assert<
    MutuallyAssignable<z.output<typeof RecoverWebhookEndpointResult>, WebhookEndpointRecovery>
  >,
  Assert<MutuallyAssignable<z.output<typeof WebhookEndpointObject>, WebhookEndpoint>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookEndpointWithSecret>, SdkEndpointWithSecret>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookEndpointList>, List<WebhookEndpoint>>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedWebhookEndpoint>, SdkDeletedWebhookEndpoint>>,
  // Webhook listeners (`coss listen`).
  Assert<
    MutuallyAssignable<z.input<typeof CreateWebhookListenerRequest>, CreateWebhookListenerParams>
  >,
  Assert<MutuallyAssignable<z.input<typeof PollWebhookListenerRequest>, PollWebhookListenerParams>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookListenerObject>, SdkWebhookListener>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookListenerPoll>, SdkWebhookListenerPoll>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedWebhookListener>, SdkDeletedWebhookListener>>,
  // Test events (`coss trigger`).
  Assert<
    MutuallyAssignable<z.input<typeof CreateTestWebhookEventRequest>, SendTestWebhookEventParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof WebhookTestEventObject>, WebhookTestEvent>>,
  // Delivery logs (the SDK sends `limit` as a number).
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListWebhookDeliveriesQuery>, "limit"> & { limit?: number },
      ListWebhookDeliveriesParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof WebhookAttemptObject>, SdkWebhookAttempt>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookDeliveryObject>, SdkWebhookDelivery>>,
  Assert<MutuallyAssignable<z.output<typeof WebhookDeliveryList>, List<SdkWebhookDelivery>>>,
  // Webhooks: every body coss.com sends is exactly one member of the SDK's `WebhookEvent`.
  Assert<MutuallyAssignable<z.output<typeof EmailWebhookEvent>, SdkEmailWebhookEvent>>,
  Assert<
    MutuallyAssignable<z.output<typeof EmailWebhookEvent>["data"], SdkEmailWebhookEvent["data"]>
  >,
  Assert<MutuallyAssignable<z.output<typeof AccountWebhookEvent>, SdkAccountWebhookEvent>>,
  Assert<MutuallyAssignable<z.output<typeof SubaccountWebhookEvent>, SdkSubaccountWebhookEvent>>,
  Assert<
    MutuallyAssignable<z.output<typeof AccountWebhookEvent>["data"], SdkAccountWebhookEvent["data"]>
  >,
  Assert<MutuallyAssignable<z.output<typeof RiskWebhookEvent>, SdkRiskWebhookEvent>>,
  Assert<
    MutuallyAssignable<z.output<typeof RiskWebhookEvent>["data"], SdkRiskWebhookEvent["data"]>
  >,
  Assert<
    MutuallyAssignable<z.output<typeof HookEndpointWebhookEvent>, SdkHookEndpointWebhookEvent>
  >,
  Assert<
    MutuallyAssignable<z.output<typeof ReceivedEmailWebhookEvent>, SdkReceivedEmailWebhookEvent>
  >,
  Assert<
    MutuallyAssignable<
      z.output<typeof ReceivedEmailWebhookEvent>["data"],
      SdkReceivedEmailWebhookEvent["data"]
    >
  >,
  Assert<
    MutuallyAssignable<
      | z.output<typeof EmailWebhookEvent>
      | z.output<typeof ReceivedEmailWebhookEvent>
      | z.output<typeof DomainWebhookEvent>
      | z.output<typeof AccountWebhookEvent>
      | z.output<typeof SubaccountWebhookEvent>
      | z.output<typeof HookEndpointWebhookEvent>
      | z.output<typeof BillingWebhookEvent>
      | z.output<typeof RiskWebhookEvent>
      | z.output<typeof ContactWebhookEvent>
      | z.output<typeof BroadcastWebhookEvent>
      | z.output<typeof InboxMessageReceivedWebhookEvent>
      | z.output<typeof SmsWebhookEvent>
      | z.output<typeof ReceivedSmsWebhookEvent>
      | z.output<typeof SignRequestWebhookEvent>
      | z.output<typeof VerificationWebhookEvent>
      | z.output<typeof FormSubmissionWebhookEvent>
      | z.output<typeof SchedulingBookingWebhookEvent>
      | z.output<typeof SchedulingCalendarWebhookEvent>,
      WebhookEvent
    >
  >,
  // DMARC: a domain's status and reports, and the `domain.*` webhook event.
  Assert<MutuallyAssignable<z.output<typeof DomainDmarc>, SdkDomainDmarc>>,
  Assert<MutuallyAssignable<z.output<typeof DmarcReportSummary>, SdkDmarcReportSummary>>,
  Assert<MutuallyAssignable<z.output<typeof DmarcReportObject>, SdkDmarcReport>>,
  Assert<MutuallyAssignable<z.output<typeof DmarcReportList>, List<SdkDmarcReportSummary>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListDmarcReportsQuery>, "limit"> & { limit?: number },
      ListDmarcReportsParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof DomainWebhookEvent>, SdkDomainWebhookEvent>>,
  Assert<
    MutuallyAssignable<z.output<typeof DomainWebhookEvent>["data"], SdkDomainWebhookEvent["data"]>
  >,
  // Receiving: received emails (the SDK sends `limit` as a number), the inbound address and
  // receiving domains.
  Assert<MutuallyAssignable<z.output<typeof ReceivedEmailSummary>, SdkReceivedEmailSummary>>,
  Assert<MutuallyAssignable<z.output<typeof ReceivedEmailObject>, SdkReceivedEmail>>,
  Assert<MutuallyAssignable<z.output<typeof ReceivedEmailList>, List<SdkReceivedEmailSummary>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListReceivedEmailsQuery>, "limit"> & { limit?: number },
      ListReceivedEmailsParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof DeletedReceivedEmail>, SdkDeletedReceivedEmail>>,
  Assert<MutuallyAssignable<z.output<typeof InboundAddressObject>, SdkInboundAddress>>,
  Assert<MutuallyAssignable<z.output<typeof ReceivingDomainObject>, SdkReceivingDomain>>,
  Assert<
    MutuallyAssignable<z.input<typeof CreateReceivingDomainRequest>, CreateReceivingDomainParams>
  >,
  // Billing: responses, queries (the SDK sends `limit` as a number) and webhook events.
  Assert<MutuallyAssignable<z.output<typeof BillingObject>, SdkBilling>>,
  Assert<MutuallyAssignable<z.output<typeof UsageObject>, SdkUsage>>,
  Assert<MutuallyAssignable<z.output<typeof UsageList>, SdkList<SdkUsage> & { has_more: false }>>,
  Assert<MutuallyAssignable<z.input<typeof UsageQuery>, ListUsageParams>>,
  Assert<MutuallyAssignable<z.output<typeof InvoiceSummary>, SdkInvoiceSummary>>,
  Assert<MutuallyAssignable<z.output<typeof InvoiceObject>, SdkInvoice>>,
  Assert<MutuallyAssignable<z.output<typeof InvoiceList>, SdkList<SdkInvoiceSummary>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListInvoicesQuery>, "limit"> & { limit?: number },
      ListInvoicesParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof CreditObject>, SdkCredit>>,
  Assert<MutuallyAssignable<z.output<typeof CreditList>, SdkList<SdkCredit>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListCreditsQuery>, "limit"> & { limit?: number },
      ListCreditsParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof BillingWebhookEvent>, SdkBillingWebhookEvent>>,
  // The API key's environment.
  Assert<MutuallyAssignable<z.output<typeof EnvironmentObject>, SdkEnvironment>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedApiKey>, SdkDeletedApiKey>>,
  // Dedicated IPs.
  Assert<MutuallyAssignable<z.output<typeof DedicatedIpPoolObject>, SdkDedicatedIpPool>>,
  // Reputation.
  Assert<MutuallyAssignable<z.output<typeof ReputationObject>, SdkReputation>>,
  Assert<MutuallyAssignable<z.output<typeof ReputationCheckObject>, SdkReputationCheck>>,
  // Suppressions: request bodies and queries (the SDK sends `limit` as a number), and responses.
  Assert<MutuallyAssignable<z.input<typeof CreateSuppressionRequest>, CreateSuppressionParams>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListSuppressionsQuery>, "limit"> & { limit?: number },
      ListSuppressionsParams
    >
  >,
  Assert<MutuallyAssignable<z.input<typeof CheckSuppressionQuery>, CheckSuppressionParams>>,
  Assert<MutuallyAssignable<z.output<typeof Suppression>, SdkSuppression>>,
  Assert<MutuallyAssignable<z.output<typeof SuppressionList>, List<SdkSuppression>>>,
  Assert<MutuallyAssignable<z.output<typeof SuppressionCheck>, SdkSuppressionCheck>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedSuppression>, SdkDeletedSuppression>>,
  Assert<MutuallyAssignable<z.input<typeof ImportSuppressionsRequest>, ImportSuppressionsParams>>,
  Assert<MutuallyAssignable<z.output<typeof SuppressionImport>, SdkSuppressionImport>>,
  Assert<MutuallyAssignable<z.input<typeof ExportSuppressionsQuery>, ExportSuppressionsParams>>,
  // Tracking settings.
  Assert<MutuallyAssignable<z.input<typeof UpdateTrackingRuleRequest>, UpdateTrackingRuleParams>>,
  Assert<MutuallyAssignable<z.output<typeof TrackingRule>, SdkTrackingRule>>,
  Assert<MutuallyAssignable<z.output<typeof TrackingSettings>, SdkTrackingSettings>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedTrackingRule>, SdkDeletedTrackingRule>>,
  // Storage settings.
  Assert<
    MutuallyAssignable<z.input<typeof UpdateStorageSettingsRequest>, UpdateStorageSettingsParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof StorageSettings>, SdkStorageSettings>>,
  // Logs: responses, and the query's parameter names (the SDK also accepts arrays and Dates).
  Assert<MutuallyAssignable<z.output<typeof LogEntry>, SdkLog>>,
  Assert<MutuallyAssignable<z.output<typeof LogList>, List<SdkLog>>>,
  Assert<Equals<keyof z.input<typeof ListLogsQuery>, keyof ListLogsParams>>,
  // Audit log: the same.
  Assert<MutuallyAssignable<z.output<typeof AuditEvent>, SdkAuditEvent>>,
  Assert<MutuallyAssignable<z.output<typeof AuditEventList>, List<SdkAuditEvent>>>,
  Assert<Equals<keyof z.input<typeof ListAuditEventsQuery>, keyof ListAuditEventsParams>>,
  // Log drains: management, batches, and the lines a batch carries.
  Assert<MutuallyAssignable<z.input<typeof CreateLogDrainRequest>, CreateLogDrainParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateLogDrainRequest>, UpdateLogDrainParams>>,
  Assert<MutuallyAssignable<z.output<typeof LogDrainObject>, LogDrain>>,
  Assert<MutuallyAssignable<z.output<typeof LogDrainWithSecret>, SdkLogDrainWithSecret>>,
  Assert<MutuallyAssignable<z.output<typeof LogDrainList>, List<LogDrain>>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedLogDrain>, SdkDeletedLogDrain>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListLogDrainBatchesQuery>, "limit"> & { limit?: number },
      ListLogDrainBatchesParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof LogDrainAttemptObject>, LogDrainAttempt>>,
  Assert<MutuallyAssignable<z.output<typeof LogDrainBatchObject>, LogDrainBatch>>,
  Assert<MutuallyAssignable<z.output<typeof LogDrainBatchList>, List<LogDrainBatch>>>,
  Assert<MutuallyAssignable<ApiLogDrainSource, LogDrainSource>>,
  Assert<MutuallyAssignable<ApiLogDrainFormat, LogDrainFormat>>,
  Assert<MutuallyAssignable<z.output<typeof LogEntry> | z.output<typeof AuditEvent>, LogDrainLine>>,
  // Risk: assessments, feedback, list entries (the SDK's `lists.add` builds the wire body).
  Assert<MutuallyAssignable<z.input<typeof CreateRiskAssessmentRequest>, AssessRiskParams>>,
  Assert<
    MutuallyAssignable<
      NonNullable<z.input<typeof CreateRiskAssessmentRequest>["user"]>,
      NonNullable<AssessRiskParams["user"]>
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof RiskAssessment>, SdkRiskAssessment>>,
  Assert<
    MutuallyAssignable<
      z.output<typeof RiskAssessment>["reasons"][number],
      SdkRiskAssessment["reasons"][number]
    >
  >,
  Assert<
    MutuallyAssignable<z.output<typeof RiskAssessment>["signals"], SdkRiskAssessment["signals"]>
  >,
  Assert<MutuallyAssignable<z.output<typeof RiskAssessmentList>, List<SdkRiskAssessment>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListRiskAssessmentsQuery>, "limit"> & { limit?: number },
      ListRiskAssessmentsParams
    >
  >,
  Assert<MutuallyAssignable<z.input<typeof CreateRiskFeedbackRequest>, RiskFeedbackParams>>,
  Assert<MutuallyAssignable<z.input<typeof CreateRiskListEntryRequest>, CreateRiskListEntryParams>>,
  Assert<MutuallyAssignable<z.output<typeof RiskListEntry>, SdkRiskListEntry>>,
  Assert<MutuallyAssignable<z.output<typeof RiskListEntryList>, List<SdkRiskListEntry>>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListRiskListEntriesQuery>, "limit"> & { limit?: number },
      ListRiskListEntriesParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof DeletedRiskListEntry>, SdkDeletedRiskListEntry>>,
  Assert<MutuallyAssignable<z.output<typeof ForgottenRiskUser>, SdkForgottenRiskUser>>,
  Assert<MutuallyAssignable<z.output<typeof RiskSettings>, SdkRiskSettings>>,
  Assert<MutuallyAssignable<z.output<typeof RiskCalibration>, SdkRiskCalibration>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateRiskSettingsRequest>, UpdateRiskSettingsParams>>,
  Assert<MutuallyAssignable<z.output<typeof RiskRuleCondition>, SdkRiskRuleCondition>>,
  Assert<MutuallyAssignable<z.output<typeof RiskRule>, SdkRiskRule>>,
  Assert<
    MutuallyAssignable<z.output<typeof RiskRuleList>, List<SdkRiskRule> & { has_more: false }>
  >,
  Assert<MutuallyAssignable<z.input<typeof CreateRiskRuleRequest>, CreateRiskRuleParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateRiskRuleRequest>, UpdateRiskRuleParams>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedRiskRule>, SdkDeletedRiskRule>>,
  // Risk building blocks (the SDK takes the email/IP/phone/text as arguments) and rate limits.
  Assert<MutuallyAssignable<z.input<typeof RiskEmailCheckRequest>, { email: string }>>,
  Assert<MutuallyAssignable<z.output<typeof RiskEmailCheck>, SdkRiskEmailCheck>>,
  Assert<MutuallyAssignable<z.input<typeof RiskIpCheckRequest>, { ip: string }>>,
  Assert<MutuallyAssignable<z.output<typeof RiskIpCheck>, SdkRiskIpCheck>>,
  Assert<MutuallyAssignable<z.input<typeof RiskPhoneCheckRequest>, { phone: string }>>,
  Assert<MutuallyAssignable<z.output<typeof RiskPhoneCheck>, SdkRiskPhoneCheck>>,
  Assert<MutuallyAssignable<z.input<typeof RiskContentClassifyRequest>, { text: string }>>,
  Assert<
    MutuallyAssignable<z.output<typeof RiskContentClassification>, SdkRiskContentClassification>
  >,
  Assert<MutuallyAssignable<z.input<typeof CheckRiskLimitRequest>, CheckRiskLimitParams>>,
  Assert<MutuallyAssignable<z.output<typeof RiskLimit>, SdkRiskLimit>>,
  Assert<MutuallyAssignable<z.output<typeof RiskLimitBucket>, SdkRiskLimitBucket>>,
  Assert<
    MutuallyAssignable<
      z.output<typeof RiskLimitBucketList>,
      List<SdkRiskLimitBucket> & { has_more: false }
    >
  >,
  Assert<
    MutuallyAssignable<z.input<typeof CreateRiskLimitBucketRequest>, CreateRiskLimitBucketParams>
  >,
  Assert<
    MutuallyAssignable<z.input<typeof UpdateRiskLimitBucketRequest>, UpdateRiskLimitBucketParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof DeletedRiskLimitBucket>, SdkDeletedRiskLimitBucket>>,
  // Errors: every API error type is one the SDK knows, and issues have the same shape.
  Assert<ApiError["type"] extends CossErrorType ? true : false>,
  Assert<MutuallyAssignable<NonNullable<ApiError["issues"]>[number], CossErrorIssue>>,
];

/** Contacts, audiences, segments, topics and marketing settings. */
export type ContactContract = [
  Assert<MutuallyAssignable<z.input<typeof UpsertContactRequest>, UpsertContactParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateContactRequest>, UpdateContactParams>>,
  Assert<
    MutuallyAssignable<
      Omit<z.input<typeof ListContactsQuery>, "limit"> & { limit?: number },
      ListContactsParams
    >
  >,
  Assert<MutuallyAssignable<z.input<typeof ExportContactsQuery>, ExportContactsParams>>,
  Assert<MutuallyAssignable<z.input<typeof ImportContactsRequest>, ImportContactsParams>>,
  Assert<MutuallyAssignable<z.output<typeof Contact>, SdkContact>>,
  Assert<MutuallyAssignable<z.output<typeof ContactList>, List<SdkContact>>>,
  Assert<MutuallyAssignable<z.output<typeof ContactImport>, SdkContactImport>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedContact>, SdkDeletedContact>>,
  Assert<MutuallyAssignable<z.output<typeof ContactTopics>, SdkContactTopics>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateContactTopicsRequest>, UpdateContactTopicsParams>>,
  Assert<MutuallyAssignable<z.output<typeof ContactPropertyObject>, SdkContactProperty>>,
  Assert<MutuallyAssignable<z.output<typeof ContactPropertyList>, List<SdkContactProperty>>>,
  Assert<
    MutuallyAssignable<z.input<typeof CreateContactPropertyRequest>, CreateContactPropertyParams>
  >,
  Assert<
    MutuallyAssignable<z.input<typeof UpdateContactPropertyRequest>, UpdateContactPropertyParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof DeletedContactProperty>, SdkDeletedContactProperty>>,
  Assert<
    MutuallyAssignable<Omit<z.input<typeof ListQuery>, "limit"> & { limit?: number }, ListParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof Audience>, SdkAudience>>,
  Assert<MutuallyAssignable<z.output<typeof AudienceList>, List<SdkAudience>>>,
  Assert<MutuallyAssignable<z.input<typeof CreateAudienceRequest>, AudienceParams>>,
  Assert<MutuallyAssignable<z.input<typeof AddAudienceContactsRequest>, AddAudienceContactsParams>>,
  Assert<MutuallyAssignable<z.output<typeof AudienceContactsAdded>, SdkAudienceContactsAdded>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedAudience>, SdkDeletedAudience>>,
  Assert<MutuallyAssignable<z.output<typeof Segment>, SdkSegment>>,
  Assert<MutuallyAssignable<z.output<typeof SegmentList>, List<SdkSegment>>>,
  Assert<MutuallyAssignable<z.input<typeof CreateSegmentRequest>, CreateSegmentParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateSegmentRequest>, UpdateSegmentParams>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedSegment>, SdkDeletedSegment>>,
  Assert<MutuallyAssignable<z.output<typeof Topic>, SdkTopic>>,
  Assert<MutuallyAssignable<z.output<typeof TopicList>, List<SdkTopic>>>,
  Assert<MutuallyAssignable<z.input<typeof CreateTopicRequest>, CreateTopicParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateTopicRequest>, UpdateTopicParams>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedTopic>, SdkDeletedTopic>>,
  Assert<MutuallyAssignable<z.output<typeof MarketingSettings>, SdkMarketingSettings>>,
  Assert<
    MutuallyAssignable<
      z.input<typeof UpdateMarketingSettingsRequest>,
      UpdateMarketingSettingsParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof ContactWebhookEvent>, SdkContactWebhookEvent>>,
  Assert<MutuallyAssignable<z.output<typeof ContactConfirmation>, SdkContactConfirmation>>,
  Assert<
    MutuallyAssignable<z.input<typeof CreatePreferenceLinksRequest>, CreatePreferenceLinksParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof PreferenceLinksObject>, SdkPreferenceLinks>>,
];

export type BroadcastContract = [
  Assert<MutuallyAssignable<z.output<typeof Broadcast>, SdkBroadcast>>,
  Assert<MutuallyAssignable<z.output<typeof BroadcastList>, List<SdkBroadcast>>>,
  Assert<MutuallyAssignable<z.input<typeof CreateBroadcastRequest>, CreateBroadcastParams>>,
  Assert<Equals<keyof z.input<typeof CreateBroadcastRequest>, keyof CreateBroadcastParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateBroadcastRequest>, UpdateBroadcastParams>>,
  Assert<MutuallyAssignable<z.input<typeof SendBroadcastRequest>, SendBroadcastParams>>,
  Assert<MutuallyAssignable<z.input<typeof TestBroadcastRequest>, TestBroadcastParams>>,
  // `limit` is coerced from the query string; the SDK sends a number.
  Assert<
    MutuallyAssignable<
      Omit<z.output<typeof ListBroadcastsQuery>, "limit">,
      Omit<ListBroadcastsParams, "limit">
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof BroadcastTest>, SdkBroadcastTest>>,
  Assert<MutuallyAssignable<z.output<typeof DeletedBroadcast>, SdkDeletedBroadcast>>,
  Assert<MutuallyAssignable<z.output<typeof BroadcastWebhookEvent>, SdkBroadcastWebhookEvent>>,
];

export type SubaccountContract = [
  Assert<MutuallyAssignable<z.output<typeof SubaccountStats>, SdkSubaccountStats>>,
  Assert<MutuallyAssignable<z.output<typeof SubaccountStatsQuery>, SubaccountStatsParams>>,
  Assert<MutuallyAssignable<z.output<typeof Subaccount>, SdkSubaccount>>,
  Assert<MutuallyAssignable<z.output<typeof SubaccountList>, List<SdkSubaccount>>>,
  Assert<MutuallyAssignable<z.input<typeof CreateSubaccountRequest>, CreateSubaccountParams>>,
  Assert<Equals<keyof z.input<typeof CreateSubaccountRequest>, keyof CreateSubaccountParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateSubaccountRequest>, UpdateSubaccountParams>>,
  Assert<Equals<keyof z.input<typeof UpdateSubaccountRequest>, keyof UpdateSubaccountParams>>,
  // `limit` is coerced from the query string; the SDK sends a number.
  Assert<
    MutuallyAssignable<
      Omit<z.output<typeof ListSubaccountsQuery>, "limit">,
      Omit<ListSubaccountsParams, "limit">
    >
  >,
  // Scheduling.
  Assert<MutuallyAssignable<z.input<typeof CreateHostRequest>, CreateSchedulingHostParams>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateHostRequest>, UpdateSchedulingHostParams>>,
  Assert<MutuallyAssignable<z.output<typeof HostObject>, SchedulingHost>>,
  Assert<MutuallyAssignable<z.input<typeof UpsertScheduleRequest>, UpsertSchedulingScheduleParams>>,
  Assert<MutuallyAssignable<z.output<typeof ScheduleObject>, SchedulingSchedule>>,
  Assert<
    MutuallyAssignable<z.input<typeof CreateEventTypeRequest>, CreateSchedulingEventTypeParams>
  >,
  Assert<
    MutuallyAssignable<z.input<typeof UpdateEventTypeRequest>, UpdateSchedulingEventTypeParams>
  >,
  Assert<MutuallyAssignable<z.output<typeof EventTypeObject>, SchedulingEventType>>,
  // `duration_minutes` is coerced from the query string; the SDK sends a number.
  Assert<
    MutuallyAssignable<
      Omit<z.output<typeof SlotsQuery>, "duration_minutes">,
      Omit<ListSchedulingSlotsParams, "duration_minutes">
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof SlotList>, SchedulingSlotList>>,
  Assert<
    MutuallyAssignable<
      z.input<typeof AvailabilitySearchRequest>,
      SearchSchedulingAvailabilityParams
    >
  >,
  Assert<
    MutuallyAssignable<
      z.output<typeof AvailabilitySearchResult>,
      SchedulingAvailabilitySearchResult
    >
  >,
  Assert<MutuallyAssignable<z.input<typeof CreateBookingRequest>, CreateSchedulingBookingParams>>,
  Assert<MutuallyAssignable<z.input<typeof CreateHoldRequest>, CreateSchedulingHoldParams>>,
  Assert<MutuallyAssignable<z.input<typeof ConfirmHoldRequest>, ConfirmSchedulingHoldParams>>,
  Assert<
    MutuallyAssignable<z.input<typeof RescheduleBookingRequest>, RescheduleSchedulingBookingParams>
  >,
  Assert<
    MutuallyAssignable<
      z.input<typeof UpdateBookingLocationRequest>,
      UpdateSchedulingBookingLocationParams
    >
  >,
  Assert<MutuallyAssignable<z.output<typeof BookingObject>, SchedulingBooking>>,
  Assert<MutuallyAssignable<z.input<typeof CreateSeriesRequest>, CreateSchedulingSeriesParams>>,
  Assert<MutuallyAssignable<z.output<typeof SeriesResult>, SchedulingSeries>>,
  Assert<MutuallyAssignable<z.output<typeof SeriesPreview>, SchedulingSeriesPreview>>,
  Assert<MutuallyAssignable<z.input<typeof CancelSeriesRequest>, CancelSchedulingSeriesParams>>,
  Assert<MutuallyAssignable<z.output<typeof CancelledSeries>, SchedulingCancelledSeries>>,
  Assert<MutuallyAssignable<z.output<typeof ErasedAttendee>, SchedulingAttendeeErasure>>,
  Assert<MutuallyAssignable<z.output<typeof SettingsObject>, SchedulingSettings>>,
  Assert<MutuallyAssignable<z.input<typeof UpdateSettingsRequest>, UpdateSchedulingSettingsParams>>,
  Assert<
    MutuallyAssignable<z.input<typeof AuthorizeCalendarRequest>, AuthorizeSchedulingCalendarParams>
  >,
  Assert<
    MutuallyAssignable<z.output<typeof CalendarAuthorization>, SchedulingCalendarAuthorization>
  >,
  Assert<
    MutuallyAssignable<
      z.input<typeof CreateCalendarConnectionRequest>,
      CreateSchedulingCalendarConnectionParams
    >
  >,
  Assert<
    MutuallyAssignable<z.output<typeof CalendarConnectionObject>, SchedulingCalendarConnection>
  >,
  Assert<MutuallyAssignable<z.input<typeof UpdateCalendarRequest>, UpdateSchedulingCalendarParams>>,
  Assert<
    MutuallyAssignable<z.input<typeof SetSimulatedBusyRequest>, SetSchedulingSimulatedBusyParams>
  >,
];
