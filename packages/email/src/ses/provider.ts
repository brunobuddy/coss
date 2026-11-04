import type { Attachment, Body } from "@aws-sdk/client-sesv2";
import {
  type EmailProvider,
  type OutboundEmail,
  type SendResult,
  ThrottledSendError,
  UncertainSendError,
} from "../provider.ts";
import { parseEmailAddress } from "../schemas.ts";
import {
  isSesError,
  requiredTlsSetFor,
  type SesApi,
  type SesConfig,
  tenantNameFor,
} from "./api.ts";
import { encodeAddress } from "./mime.ts";

/** Only tag set on SES messages: maps delivery events back to the email (never customer tags). */
export const EMAIL_ID_TAG = "coss_email_id";
const THROTTLE_RETRIES = 2;

/** `SendEmail`'s documented errors: SES answered and refused the request, so nothing was sent. */
const REJECTIONS = new Set([
  "AccountSuspendedException",
  "BadRequestException",
  "LimitExceededException",
  "MailFromDomainNotVerifiedException",
  "MessageRejected",
  "NotFoundException",
  "SendingPausedException",
  "TooManyRequestsException",
]);

/**
 * Whether SES certainly refused the request: a documented rejection, or any answer below 500.
 * Anything else (a timeout, a reset connection, a 5xx) may have reached SES after all.
 */
function isRejection(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (typeof name === "string" && REJECTIONS.has(name)) return true;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } } | null)?.$metadata
    ?.httpStatusCode;
  return typeof status === "number" && status < 500;
}

/** Each address once across to → cc → bcc, as SES counts every listed address. */
function destination(message: OutboundEmail) {
  const seen = new Set<string>();
  const unique = (list: string[]) =>
    list.filter((value) => {
      const key = parseEmailAddress(value).address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    ToAddresses: unique(message.to).map(encodeAddress),
    CcAddresses: unique(message.cc).map(encodeAddress),
    BccAddresses: unique(message.bcc).map(encodeAddress),
  };
}

/** SES builds the MIME parts; inline attachments are the ones with a content id. */
function attachments(message: OutboundEmail): Attachment[] {
  return message.attachments.map((attachment) => ({
    RawContent: attachment.content,
    FileName: attachment.filename,
    ContentType: attachment.contentType,
    ContentTransferEncoding: "BASE64",
    ...(attachment.contentId === null
      ? { ContentDisposition: "ATTACHMENT" }
      : { ContentDisposition: "INLINE", ContentId: attachment.contentId }),
  }));
}

/**
 * Sends through SES v2 with the organization's tenant of the stream and the stream's shared
 * configuration set (or, for `dedicatedPool` messages, the organization's own one of the stream,
 * which sends through its dedicated IP pool).
 */
export class SesEmailProvider implements EmailProvider {
  readonly name = "ses";
  readonly #api: SesApi;
  readonly #config: SesConfig;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(
    api: SesApi,
    config: SesConfig,
    opts: { sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.#api = api;
    this.#config = config;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** SES's `Message-ID` is the message id at its region's host (`email.amazonses.com` in us-east-1). */
  messageId(providerMessageId: string): string {
    const host = this.#config.region === "us-east-1" ? "email" : this.#config.region;
    return `<${providerMessageId}@${host}.amazonses.com>`;
  }

  async send(message: OutboundEmail): Promise<SendResult> {
    const body: Body = {};
    if (message.html !== null) body.Html = { Data: message.html, Charset: "UTF-8" };
    if (message.text !== null) body.Text = { Data: message.text, Charset: "UTF-8" };
    const input = {
      FromEmailAddress: encodeAddress(message.from),
      Destination: destination(message),
      ReplyToAddresses: message.replyTo.map(encodeAddress),
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: body,
          Headers: Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value })),
          ...(message.attachments.length ? { Attachments: attachments(message) } : {}),
        },
      },
      // The organization's own configuration sets send through its dedicated IP pool.
      ConfigurationSetName: message.dedicatedPool
        ? tenantNameFor(this.#config.tenantPrefix, message.organizationId, message.stream)
        : message.requireTls
          ? requiredTlsSetFor(this.#config.configurationSets[message.stream])
          : this.#config.configurationSets[message.stream],
      // A sub-account's own tenant when the email goes out from its domain (never with a pool).
      TenantName: tenantNameFor(
        this.#config.tenantPrefix,
        message.tenantSubaccountId ?? message.organizationId,
        message.stream,
      ),
      EmailTags: [{ Name: EMAIL_ID_TAG, Value: message.emailId }],
    };
    for (let attempt = 0; ; attempt++) {
      let messageId: string | undefined;
      try {
        messageId = (await this.#api.sendEmail(input)).MessageId;
      } catch (error) {
        // Throttled requests were rejected before sending, so they are safe to retry.
        if (isSesError(error, "TooManyRequestsException") && attempt < THROTTLE_RETRIES) {
          await this.#sleep(200 * 2 ** attempt);
          continue;
        }
        if (isSesError(error, "TooManyRequestsException")) {
          throw new ThrottledSendError("SES is throttling sends.", { cause: error });
        }
        if (isRejection(error)) throw error;
        throw new UncertainSendError(
          `SES may have accepted the email: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      if (!messageId) throw new UncertainSendError("SES accepted the email without a message id.");
      return { providerMessageId: messageId };
    }
  }
}
