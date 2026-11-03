export {
  logSupportMailer,
  PermanentSupportSendError,
  runDueSupportDeliveries,
  type SupportDeliveryDeps,
  type SupportEmail,
  type SupportEmailStatus,
  type SupportMailer,
  supportSubject,
  syncSupportDeliveries,
} from "./delivery.ts";
export { SupportError, type SupportErrorCode } from "./errors.ts";
export { ingestSupportEmails, SUPPORT_FLOOD_LIMIT, type SupportIntakeDeps } from "./intake.ts";
export {
  matchSender,
  type SenderMatch,
  type SupportPlan,
  type SupportPlanFor,
} from "./matching.ts";
export {
  addBusinessMinutes,
  formatSupportTime,
  responseDueAt,
  type SupportCalendar,
} from "./sla.ts";
export {
  FakeSupportFileStore,
  type SupportFileStore,
  supportFileKey,
  supportStoreFromEnv,
} from "./store.ts";
export {
  autoResolveQuietTickets,
  copySupportAttachments,
  enqueueSupportAlerts,
  purgeExpiredSupportTickets,
  purgeSupportLeftovers,
  SUPPORT_ALERT_KINDS,
  SUPPORT_AUTO_RESOLVE_MS,
  SUPPORT_NOTIFICATION_KINDS,
  wakeSnoozedTickets,
} from "./sweep.ts";
export {
  type CustomerMessage,
  type CustomerScope,
  type CustomerTicket,
  type CustomerTicketSummary,
  claimAttachments,
  countUnreadCustomerTickets,
  createDashboardTicket,
  getCustomerAttachment,
  getCustomerTicket,
  hasUrgentSupport,
  listCustomerTickets,
  markCustomerTicketRead,
  reopenAsCustomer,
  replyAsCustomer,
  resolveAsCustomer,
  type SupportAttachmentRow,
  type SupportAuthor,
  type SupportMessageRow,
  type SupportTicketRow,
  seesAllTickets,
  storeSupportUpload,
} from "./tickets.ts";
