import {
  type EmailService,
  getEmail,
  getEmailBatch,
  listEmailEvents,
  listEmailLinks,
  listEmailSummariesPage,
  requireSubaccount,
} from "@coss/email";
import {
  DEFAULT_EMAIL_LIST_LIMIT,
  EmailBatchObject,
  EmailEventList,
  EmailLinkList,
  EmailObject,
  EmailSummaryList,
  ListEmailsQuery,
  MAX_BATCH_EMAILS,
  RescheduleEmailRequest,
  SendEmailBatchRequest,
  SendEmailRequest,
} from "@coss/email/schemas";
import { consumeAll, refundAll } from "@coss/ratelimit";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { limitBody, SEND_BODY_LIMIT_BYTES } from "../body-limit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError } from "../middleware/rate-limit.ts";
import { markEmailContent } from "../middleware/request-log.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { sendQuotaRequests } from "./email-quota.ts";
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  idempotencyHeaders,
  idempotencyHook,
  idempotentReplayedHeader,
} from "./idempotency.ts";

export { IDEMPOTENCY_KEY_MAX_LENGTH };

const SendEmailHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "email (with its current status) instead of sending again, for 24 hours.",
);

const EmailIdParams = z.object({
  id: z.string().meta({
    description: "The email's id.",
    examples: ["email_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const BatchIdParams = z.object({
  id: z.string().meta({
    description: "The batch's id (`batch_id` of its emails).",
    examples: ["batch_01k8d0n6x5f3w2e1r9t7y4u6i8"],
  }),
});

export const sendEmailRoute = createRoute({
  method: "post",
  path: "/emails",
  operationId: "sendEmail",
  tags: ["Emails"],
  summary: "Send an email",
  description:
    'Queues an email from the API key\'s environment and returns it with `status: "queued"`; ' +
    "it is handed to the delivery provider moments later. Follow it with `GET /v1/emails/{id}` " +
    "or the `email.sent` / `email.failed` webhooks. Live (`coss_live_…`) keys must send from a " +
    "verified domain of the organization. Sandbox (`coss_test_…`) keys accept any `from` and " +
    "never deliver anything; the response has `sandbox: true`. Recipients on the environment's " +
    "suppression list (for every email, or for the email's `category`) are skipped and get " +
    "the status `suppressed`. With a future `scheduled_at` the email is stored with the status " +
    "`scheduled` and sent at that time; the domain and the suppression list are checked again " +
    "then. " +
    "Attachments are base64-encoded; only metadata is kept after sending. " +
    "Recipients count against the organization's send quota (per " +
    "second and per day; sandbox environments have their own daily quota). " +
    "With open or click tracking on (the environment's settings, or " +
    "`tracking`), the HTML body is delivered with a tracking pixel and/or links rewritten to " +
    "coss.com redirects; the stored `html` stays as sent.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ email: ["send"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/emails"),
  ] as const,
  request: {
    headers: SendEmailHeaders,
    body: { required: true, content: { "application/json": { schema: SendEmailRequest } } },
  },
  responses: {
    202: {
      description:
        "The email, accepted for delivery (`queued` or `scheduled`). A replay returns the original email with " +
        "its current status.",
      headers: {
        "X-Request-Id": requestIdHeader,
        "Idempotent-Replayed": idempotentReplayedHeader,
      },
      content: { "application/json": { schema: EmailObject } },
    },
    402: billingErrorDoc(
      "Live sending is paused for an overdue invoice or the spend limit (`billing_hold`), or the send would go past the plan's monthly allowance (`usage_limit_exceeded`)",
    ),
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing for an expired key " +
        "(`request_in_progress`). Retry after `Retry-After` seconds.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    413: errorDoc("The request body is larger than 40 MB (`payload_too_large`)."),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), or the email's recipients exceed " +
        "the send quota (`quota_exceeded`). Retry after `Retry-After` seconds; without " +
        "`Retry-After` the email has more recipients than the quota allows at once.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
    403: errorDoc(
      "The API key lacks the permission this endpoint needs (`insufficient_permissions`), its " +
        "organization is suspended (`organization_suspended`), live sending is suspended (`account_suspended`), or sending is paused for the " +
        "organization because of its sending reputation (`sending_paused`), or the `subaccount` is turned off " +
        "(`subaccount_disabled`) or paused (`subaccount_paused`).",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), the `from` domain is not a " +
        "verified domain of the organization (`domain_not_verified`, live keys only), the " +
        "`Idempotency-Key` was already used with a different body (`idempotency_key_reused`), " +
        "or the template can't be sent: it doesn't exist (`template_not_found`), has no " +
        "published version (`template_not_published`) or no such version " +
        "(`template_version_not_found`), the variables don't match it " +
        "(`invalid_template_variables`, see `issues`), or it renders an invalid subject or " +
        "empty body (`template_render_failed`).",
    ),
  },
});

export const sendEmailBatchRoute = createRoute({
  method: "post",
  path: "/emails/batch",
  operationId: "sendEmailBatch",
  tags: ["Emails"],
  summary: "Send a batch of emails",
  description:
    `Queues up to ${MAX_BATCH_EMAILS} emails in one request. Each email is handled exactly as by ` +
    "`POST /v1/emails` (sender checks, suppressions, scheduling, attachments, tracking), but the " +
    "batch is all or nothing: if any email is invalid, or any `from` is not a verified domain " +
    "(live keys), nothing is stored and the error names the email (e.g. `emails.3.to`). One " +
    "`Idempotency-Key` covers the whole batch. The emails' recipients are charged against the " +
    "send quota together, so a batch with more recipients than the quota allows at once is " +
    "refused (`quota_exceeded` without `Retry-After`): split it. The request body shares the " +
    "40 MB limit of a single send.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ email: ["send"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/emails/batch"),
  ] as const,
  request: {
    headers: SendEmailHeaders,
    body: { required: true, content: { "application/json": { schema: SendEmailBatchRequest } } },
  },
  responses: {
    202: {
      description:
        "The batch, accepted for delivery, with its emails in request order. A replay returns the " +
        "original batch with the emails' current statuses.",
      headers: {
        "X-Request-Id": requestIdHeader,
        "Idempotent-Replayed": idempotentReplayedHeader,
      },
      content: { "application/json": { schema: EmailBatchObject } },
    },
    402: billingErrorDoc(
      "Live sending is paused for an overdue invoice or the spend limit (`billing_hold`), or the send would go past the plan's monthly allowance (`usage_limit_exceeded`)",
    ),
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing for an expired key " +
        "(`request_in_progress`). Retry after `Retry-After` seconds.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    413: errorDoc("The request body is larger than 40 MB (`payload_too_large`)."),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), or the batch's recipients exceed " +
        "the send quota (`quota_exceeded`). Retry after `Retry-After` seconds; without " +
        "`Retry-After` the batch has more recipients than the quota allows at once.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
    403: errorDoc(
      "The API key lacks the permission this endpoint needs (`insufficient_permissions`), its " +
        "organization is suspended (`organization_suspended`), live sending is suspended " +
        "(`account_suspended`), sending is paused for the organization because of its " +
        "sending reputation (`sending_paused`), or a `subaccount` is turned off " +
        "(`subaccount_disabled`) or paused (`subaccount_paused`).",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), a `from` domain is not a " +
        "verified domain of the organization (`domain_not_verified`, live keys only; `param` " +
        "names the email), the `Idempotency-Key` was already used with a different body " +
        "(`idempotency_key_reused`), or an email's template can't be sent (the `template_…` " +
        "codes of `POST /v1/emails`; `param` names the email).",
    ),
  },
});

export const getEmailBatchRoute = createRoute({
  method: "get",
  path: "/emails/batch/{id}",
  operationId: "getEmailBatch",
  tags: ["Emails"],
  summary: "Retrieve a batch of emails",
  description:
    "A batch sent with `POST /v1/emails/batch`, with its emails' current statuses in the order " +
    "of the request. Emails past the data retention period are left out. Only batches sent " +
    "from the API key's own environment can be retrieved.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["read"] }), rateLimit("api.read")],
  request: { params: BatchIdParams },
  responses: {
    200: jsonDoc("The batch.", EmailBatchObject),
    ...commonErrors,
    404: errorDoc("No batch with this id exists in the API key's environment (`not_found`)."),
  },
});

export const getEmailRoute = createRoute({
  method: "get",
  path: "/emails/{id}",
  operationId: "getEmail",
  tags: ["Emails"],
  summary: "Retrieve an email",
  description: "Only emails sent from the API key's own environment can be retrieved.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["read"] }), rateLimit("api.read")],
  request: { params: EmailIdParams },
  responses: {
    200: {
      description: "The email.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/json": { schema: EmailObject } },
    },
    ...commonErrors,
    404: errorDoc("No email with this id exists in the API key's environment (`not_found`)."),
  },
});

export const listEmailsRoute = createRoute({
  method: "get",
  path: "/emails",
  operationId: "listEmails",
  tags: ["Emails"],
  summary: "List emails",
  description:
    "Emails sent from the API key's environment, newest first, without their content " +
    "(retrieve an email for `html`, `text`, `headers` and `attachments`). Filter by recipient " +
    "(`to`), by the email's or a recipient's status, by category, batch or creation time. Pass " +
    "the last `id` as `after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["read"] }), rateLimit("api.read")],
  request: { query: ListEmailsQuery },
  responses: {
    200: jsonDoc("A page of emails.", EmailSummaryList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const listEmailEventsRoute = createRoute({
  method: "get",
  path: "/emails/{id}/events",
  operationId: "listEmailEvents",
  tags: ["Emails"],
  summary: "List an email's delivery events",
  description:
    "Every delivery event of the email, oldest first: `email.scheduled`, `email.rescheduled`, " +
    "`email.canceled`, " +
    "`email.sent` and `email.failed` for the whole email, and `email.delivered`, `email.delivery_delayed`, `email.bounced`, " +
    "`email.complained` and `email.suppressed` (skipped because of the suppression list) per " +
    "recipient, plus `email.opened` and `email.clicked` when tracking is on (attributed to a " +
    "recipient only when the email had a single one) and `email.unsubscribed` after a one-click " +
    "unsubscribe.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["read"] }), rateLimit("api.read")],
  request: { params: EmailIdParams },
  responses: {
    200: {
      description: "The email's events.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/json": { schema: EmailEventList } },
    },
    ...commonErrors,
    404: errorDoc("No email with this id exists in the API key's environment (`not_found`)."),
  },
});

export const cancelEmailRoute = createRoute({
  method: "post",
  path: "/emails/{id}/cancel",
  operationId: "cancelEmail",
  tags: ["Emails"],
  summary: "Cancel a scheduled email",
  description:
    "Cancels an email sent with a future `scheduled_at` before it is sent. Canceling an already " +
    "canceled email returns it unchanged. To send it at another time, reschedule it instead.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["send"] }), rateLimit("api.write")],
  request: { params: EmailIdParams },
  responses: {
    200: {
      description: "The canceled email.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/json": { schema: EmailObject } },
    },
    ...commonErrors,
    404: errorDoc("No email with this id exists in the API key's environment (`not_found`)."),
    422: errorDoc(
      "The email is not scheduled (it is being sent, was sent or failed): `email_not_cancelable`.",
    ),
  },
});

export const rescheduleEmailRoute = createRoute({
  method: "post",
  path: "/emails/{id}/reschedule",
  operationId: "rescheduleEmail",
  tags: ["Emails"],
  summary: "Reschedule a scheduled email",
  description:
    "Moves an email sent with a future `scheduled_at` to a new time, at most 30 days from now, " +
    "and records an `email.rescheduled` event. A time that is not in the future sends it within " +
    "seconds. Rescheduling to the time it already has returns it unchanged. The domain and the " +
    "suppression list are still checked when it is sent.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ email: ["send"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/emails/{id}/reschedule"),
  ] as const,
  request: {
    params: EmailIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: RescheduleEmailRequest } },
    },
  },
  responses: {
    200: {
      description: "The rescheduled email.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/json": { schema: EmailObject } },
    },
    400: errorDoc("The body is not valid JSON (`invalid_json`)."),
    ...commonErrors,
    404: errorDoc("No email with this id exists in the API key's environment (`not_found`)."),
    415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), or the email is not " +
        "scheduled (it is being sent, was sent, failed or was canceled): " +
        "`email_not_reschedulable`.",
    ),
  },
});

export const listEmailLinksRoute = createRoute({
  method: "get",
  path: "/emails/{id}/links",
  operationId: "listEmailLinks",
  tags: ["Emails"],
  summary: "List an email's tracked links",
  description:
    "The links coss.com rewrote for click tracking, in the order they appear in the HTML, with " +
    "their click counts. Empty unless the email was sent with click tracking.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ email: ["read"] }), rateLimit("api.read")],
  request: { params: EmailIdParams },
  responses: {
    200: {
      description: "The email's tracked links.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/json": { schema: EmailLinkList } },
    },
    ...commonErrors,
    404: errorDoc("No email with this id exists in the API key's environment (`not_found`)."),
  },
});

export function createEmailRoutes(emailService: EmailService): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    sendEmailRoute,
    async (c) => {
      const params = c.req.valid("json");
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { apiKeyId, ownerUserId, organizationId, projectId, environmentId, mode } = c.var.auth;
      // Tenancy always comes from the authenticated key, never from the request.
      const input = {
        environment: { organizationId, projectId, environmentId, mode },
        apiKeyId,
        apiKeyOwnerId: ownerUserId,
        params,
        idempotencyKey,
        traceparent: c.var.traceparent,
      };
      const quota = await sendQuotaRequests(c.var.auth, [params]);
      const decision = await consumeAll(c.var.rateLimiter, quota);
      if (decision) {
        // A matching replay (queued or completed) needs no quota. This lookup cannot create or dispatch a send.
        const replay = await emailService.replay(input);
        if (replay) {
          markEmailContent(c, [replay]);
          c.header("Idempotent-Replayed", "true");
          return c.json(replay, 202);
        }
        throw rateLimitError(decision, {
          code: "quota_exceeded",
          message:
            decision.retryAfterMs === null
              ? "This email has more recipients than the send quota allows at once."
              : `The send quota (${decision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
        });
      }
      let result: Awaited<ReturnType<EmailService["send"]>>;
      try {
        result = await emailService.send(input);
      } catch (error) {
        // Rejected before anything was sent (validation, domain, idempotency conflicts).
        await refundAll(c.var.rateLimiter, quota);
        throw error;
      }
      const { email, replayed } = result;
      markEmailContent(c, [email]);
      // A replay sent nothing new (an SDK retry reuses its Idempotency-Key).
      if (replayed) {
        await refundAll(c.var.rateLimiter, quota);
        c.header("Idempotent-Replayed", "true");
      }
      return c.json(email, 202);
    },
    // Replaces the default hook for this route: a bad Idempotency-Key is a 400, not a 422.
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(
    sendEmailBatchRoute,
    async (c) => {
      const { emails } = c.req.valid("json");
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { apiKeyId, ownerUserId, organizationId, projectId, environmentId, mode } = c.var.auth;
      const input = {
        environment: { organizationId, projectId, environmentId, mode },
        apiKeyId,
        apiKeyOwnerId: ownerUserId,
        emails,
        idempotencyKey,
        traceparent: c.var.traceparent,
      };
      // Charged as one: the batch is accepted or refused as a whole.
      const quota = await sendQuotaRequests(c.var.auth, emails);
      const decision = await consumeAll(c.var.rateLimiter, quota);
      if (decision) {
        const replay = await emailService.replayBatch(input);
        if (replay) {
          markEmailContent(c, replay.data);
          c.header("Idempotent-Replayed", "true");
          return c.json(replay, 202);
        }
        throw rateLimitError(decision, {
          code: "quota_exceeded",
          message:
            decision.retryAfterMs === null
              ? "This batch has more recipients than the send quota allows at once. Split it into smaller batches."
              : `The send quota (${decision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
        });
      }
      let result: Awaited<ReturnType<EmailService["sendBatch"]>>;
      try {
        result = await emailService.sendBatch(input);
      } catch (error) {
        await refundAll(c.var.rateLimiter, quota);
        throw error;
      }
      const { batch, replayed } = result;
      markEmailContent(c, batch.data);
      if (replayed) {
        await refundAll(c.var.rateLimiter, quota);
        c.header("Idempotent-Replayed", "true");
      }
      return c.json(batch, 202);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(getEmailBatchRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const batch = await getEmailBatch({ organizationId, environmentId, id });
    if (!batch) throw notFound("No batch with this id exists in this API key's environment.");
    markEmailContent(c, batch.data);
    return c.json(batch, 200);
  });

  router.openapi(getEmailRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    // Malformed, unknown, other-environment and other-organization ids are all `null`.
    const email = await getEmail({ organizationId, environmentId, id });
    if (!email) throw notFound("No email with this id exists in this API key's environment.");
    markEmailContent(c, [email]);
    return c.json(email, 200);
  });

  router.openapi(listEmailsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const subaccount =
      query.subaccount === undefined
        ? undefined
        : await requireSubaccount({
            organizationId,
            environmentId,
            ref: query.subaccount,
            param: "subaccount",
          });
    const page = await listEmailSummariesPage({
      organizationId,
      environmentId,
      limit: query.limit ?? DEFAULT_EMAIL_LIST_LIMIT,
      recipient: query.to,
      recipientStatus: query.recipient_status,
      status: query.status,
      query: query.q,
      category: query.category,
      batchId: query.batch_id,
      subaccountId: subaccount?.id,
      createdAfter: query.created_after ? new Date(query.created_after) : undefined,
      createdBefore: query.created_before ? new Date(query.created_before) : undefined,
      before: query.after,
    });
    markEmailContent(c, page.data);
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(cancelEmailRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const email = await emailService.cancel({ organizationId, environmentId, emailId: id });
    markEmailContent(c, [email]);
    await recordApiAudit(c, {
      action: "email.canceled",
      target: { type: "email", id: email.id },
    });
    return c.json(email, 200);
  });

  router.openapi(rescheduleEmailRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { scheduled_at } = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const email = await emailService.reschedule({
      organizationId,
      environmentId,
      emailId: id,
      scheduledAt: scheduled_at,
    });
    await recordApiAudit(c, {
      action: "email.rescheduled",
      target: { type: "email", id: email.id },
      metadata: { scheduled_at: email.scheduled_at },
    });
    markEmailContent(c, [email]);
    return c.json(email, 200);
  });

  router.openapi(listEmailEventsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const result = await listEmailEvents({ organizationId, environmentId, emailId: id });
    if (!result) throw notFound("No email with this id exists in this API key's environment.");
    return c.json({ object: "list" as const, data: result.events, has_more: result.hasMore }, 200);
  });

  router.openapi(listEmailLinksRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const result = await listEmailLinks({ organizationId, environmentId, emailId: id });
    if (!result) throw notFound("No email with this id exists in this API key's environment.");
    return c.json({ object: "list" as const, data: result.links, has_more: result.hasMore }, 200);
  });

  return router;
}
