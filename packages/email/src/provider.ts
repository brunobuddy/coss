import type { EmailEventDataOutput, EmailEventType, EmailStream } from "./schemas.ts";

export { EMAIL_STREAMS, type EmailStream } from "./schemas.ts";

/** A message ready for a delivery provider (internal, camelCase). */
export type OutboundEmail = {
  emailId: string;
  organizationId: string;
  stream: EmailStream;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
  attachments: OutboundAttachment[];
  /** Send through the organization's dedicated IP pool (see `DedicatedIpProvider`). */
  dedicatedPool?: boolean;
  /** Drop the message rather than deliver it unencrypted (HIPAA mode). */
  requireTls?: boolean;
  /**
   * Send in this sub-account's own tenant (its From domain is the sub-account's); else the
   * organization's.
   */
  tenantSubaccountId?: string | null;
};

export type OutboundAttachment = {
  filename: string;
  contentType: string;
  /** Set for inline attachments, referenced from the HTML as `cid:<contentId>`. */
  contentId: string | null;
  content: Uint8Array;
};

/**
 * A delivery event normalized from a provider's own format. `recipients: null` means the event is
 * about the whole message (`email.sent`, `email.failed`); otherwise it is split per recipient.
 */
export type ProviderEvent = {
  provider: string;
  /** The provider's own event name, e.g. SES `Bounce`. */
  providerEventType: string;
  /** From the `coss_email_id` tag coss.com sets on every outbound message. */
  emailId: string | null;
  providerMessageId: string | null;
  type: EmailEventType;
  recipients: string[] | null;
  occurredAt: Date;
  /** Distinguishes two events of the same type for the same message (e.g. a bounce feedback id). */
  sourceId: string;
  data: EmailEventDataOutput;
  /** Only for `email.bounced`: the address was suppressed rather than attempted. */
  suppressed?: boolean;
  /** Only for `email.delivered`: the IP the message left from (SES `ses:outgoing-ip`). */
  sendingIp?: string;
};

export type SendResult = {
  providerMessageId: string;
  /** Events the provider already knows about synchronously (the fake provider). */
  events?: ProviderEvent[];
};

/**
 * Thrown by a provider when it can't tell whether the message was accepted (a timeout, a dropped
 * connection, a server error): the email must not be failed (the provider may be delivering it)
 * nor sent again. The service leaves it claimed; the provider's own `Send` event or the
 * stale-claim sweep settles it.
 */
export class UncertainSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UncertainSendError";
  }
}

/**
 * The provider refused the message for its sending rate (SES throttling, after its own retries):
 * certainly not sent. Marketing emails are handed back and dispatched again a little later.
 */
export class ThrottledSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ThrottledSendError";
  }
}

/**
 * Delivery seam (fake or SES). `send` resolves once the provider accepted the message and throws
 * when it did not (`UncertainSendError` when it can't tell); the service records the outcome on
 * the email row.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: OutboundEmail): Promise<SendResult>;
  /**
   * The `Message-ID` header the provider gave a message it accepted as `providerMessageId`, for
   * replies to reference it; absent when the provider doesn't say.
   */
  messageId?(providerMessageId: string): string;
}

/** What the provider needs published in DNS for a new domain identity. */
export type DomainIdentity = {
  dkimTokens: string[];
  /** DKIM CNAMEs point at `<token>.<dkimHostedZone>`. */
  dkimHostedZone: string;
  /** Region of the provider, for the MAIL FROM MX record (`feedback-smtp.<region>.amazonses.com`). */
  region: string;
};

export type DomainVerificationStatus = "pending" | "verified" | "temporary_failure" | "failed";
export type MailFromStatus = "pending" | "success" | "temporary_failure" | "failed";

/** The provider's current view of a domain identity. */
export type DomainIdentityState = DomainIdentity & {
  status: DomainVerificationStatus;
  /** The provider will accept mail from this domain. */
  canSend: boolean;
  mailFromStatus: MailFromStatus;
};

export type ProviderTenant = { tenantName: string; tenantArn: string | null };

/**
 * Provider-side domain and tenant management (fake or SES). Tenants isolate an organization's
 * reputation, one per stream; domains are verified identities associated with every tenant of
 * their organization (a shared assignment), so either stream can send from them.
 */
export interface IdentityProvider {
  readonly name: string;
  /**
   * Creates (or finds) the organization's tenant for one stream, or one of its email
   * sub-accounts' (`subaccountId`: their own reputation and pausing). Idempotent.
   */
  ensureTenant(input: {
    organizationId: string;
    stream: EmailStream;
    subaccountId?: string | null;
  }): Promise<ProviderTenant>;
  /**
   * Creates the domain identity with Easy DKIM and the custom MAIL FROM subdomain, associated with
   * the organization's tenants. Throws `IdentityTakenError` when a tenant outside `tenants`
   * already holds it.
   */
  createDomainIdentity(input: {
    tenants: ProviderTenant[];
    domain: string;
    mailFromDomain: string;
  }): Promise<DomainIdentity>;
  /**
   * Associates an existing identity with another of its organization's tenants (a stream added
   * after the domain). A missing identity is fine (nothing to send from).
   */
  associateDomainIdentity(input: { tenant: ProviderTenant; domain: string }): Promise<void>;
  /** `null` when the identity does not exist (any more). */
  getDomainIdentity(domain: string): Promise<DomainIdentityState | null>;
  /** Removes the identity (and its tenant associations). Missing identities are fine. */
  deleteDomainIdentity(input: { tenants: ProviderTenant[]; domain: string }): Promise<void>;
  /**
   * Removes one of the organization's tenants (when its organization is deleted, after its
   * domains). A missing tenant is fine.
   */
  deleteTenant(tenant: ProviderTenant): Promise<void>;
}

/** The provider already has this identity for another tenant; it is never adopted. */
export class IdentityTakenError extends Error {
  constructor(domain: string) {
    super(`The domain ${domain} is already in use.`);
    this.name = "IdentityTakenError";
  }
}

/**
 * Provider-managed dedicated IP pools (fake or SES managed dedicated IPs), one per organization,
 * warmed up by the provider. Every method is idempotent.
 */
export interface DedicatedIpProvider {
  readonly name: string;
  /**
   * Creates (or completes) the organization's pool and, for each stream in `tenants`, what sends
   * that stream's mail through it (an SES configuration set associated with the stream's
   * tenant). Throws `DedicatedIpTakenError` when a resource of that name exists but wasn't
   * created by coss.com.
   */
  ensurePool(input: {
    organizationId: string;
    tenants: Partial<Record<EmailStream, ProviderTenant>>;
  }): Promise<void>;
  /** The pool's IPs now (empty until the provider assigns the first; `[]` without a pool). */
  poolIps(organizationId: string): Promise<string[]>;
  /** Whether the pool's configuration sets of these streams refuse unencrypted delivery. */
  setRequireTls(input: {
    organizationId: string;
    streams: readonly EmailStream[];
    require: boolean;
  }): Promise<void>;
  /**
   * Removes the pool and what sends through it, for every stream (`tenants`: the organization's
   * tenants that still exist). Missing resources are fine.
   */
  releasePool(input: {
    organizationId: string;
    tenants: Partial<Record<EmailStream, ProviderTenant>>;
  }): Promise<void>;
}

/** A pool or configuration set of the organization's name exists, but COSS didn't create it. */
export class DedicatedIpTakenError extends Error {
  constructor(resource: string) {
    super(`${resource} already exists and isn't managed by COSS.`);
    this.name = "DedicatedIpTakenError";
  }
}
