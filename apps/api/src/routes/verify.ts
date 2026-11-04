import { authorizeLiveSender } from "@coss/email";
import {
  getVerification,
  getVerifySettings,
  listVerificationsPage,
  toVerifySettingsObject,
  updateVerifySettings,
  VerifyError,
  type VerifyService,
} from "@coss/verify";
import {
  CheckVerificationRequest,
  ListVerificationsQuery,
  StartVerificationRequest,
  UpdateVerifySettingsRequest,
  VerificationCheckObject,
  VerificationList,
  VerificationObject,
  VerifySettingsObject,
} from "@coss/verify/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import {
  billingErrorDoc,
  commonErrors,
  errorDoc,
  jsonDoc,
  requestIdHeader,
  retryAfterHeader,
} from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";

const StartHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "verification instead of sending another code, for 24 hours.",
);

const CheckHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated check with the same key returns the same answer without " +
    "spending another attempt.",
);

const VerificationIdParams = z.object({
  id: z.string().meta({
    description: "The verification's id.",
    examples: ["vrf_01k8e2m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const retryAfter = { "Retry-After": retryAfterHeader };

export const startVerificationRoute = createRoute({
  method: "post",
  path: "/verifications",
  operationId: "startVerification",
  tags: ["Verifications"],
  summary: "Start a verification",
  description:
    "Sends a one-time code to a phone number (SMS) or an email address and returns the " +
    "verification, `pending` until you check the code the end user typed " +
    "(`POST /v1/verifications/check`). Starting again for the same destination while it is " +
    "pending sends a new code (the earlier one stops working), up to 5 times. Before a new " +
    "verification costs anything, the fraud guard checks it (your Risk lists, premium-rate " +
    "numbers, Tor, and velocity per IP, user, number range and country, with how often their " +
    "codes are entered): a blocked one is stored with its `reasons` and nothing is sent. Pass " +
    "the end user's `ip` (and your `user_id`) so it can tell them apart. SMS codes come from " +
    "coss.com's shared numbers unless the environment's Verify settings name one of your own; " +
    "email codes from your sender, else coss.com's. Sandbox (`coss_test_…`) keys deliver nothing " +
    "and the code is always zeros.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ verify: ["send"] }),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/verifications"),
  ] as const,
  request: {
    headers: StartHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: StartVerificationRequest } },
    },
  },
  responses: {
    201: {
      description: "The verification, `pending`, with the send that just went out.",
      headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
      content: { "application/json": { schema: VerificationObject } },
    },
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    402: billingErrorDoc(
      "Live sending is paused for an overdue invoice or the spend limit (`billing_hold`) or a used-up budget (`budget_exceeded`), or the plan doesn't include Verify or the destination country isn't priced (`plan_feature_unavailable`)",
    ),
    ...commonErrors,
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing (`request_in_progress`).",
      retryAfter,
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`); `to` isn't a valid number " +
        "or address (`invalid_destination`) or its country isn't allowed " +
        "(`country_not_allowed`); the fraud guard blocked it (`verification_blocked`: the " +
        "verification is stored with its `reasons`); the code was already sent 5 times " +
        "(`too_many_sends`); the recipient opted out or is suppressed (`recipient_suppressed`); " +
        "the code couldn't be sent (`send_failed`, `sender_not_ready`…); or the " +
        "`Idempotency-Key` was already used with a different body (`idempotency_key_reused`).",
    ),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), or too many codes to this " +
        "destination or from coss.com's shared numbers today (`quota_exceeded`). Retry after " +
        "`Retry-After` seconds.",
      retryAfter,
    ),
    503: errorDoc(
      "coss.com's shared numbers aren't available for this destination " +
        "(`shared_sender_unavailable`): name your own number in Verify's settings.",
    ),
  },
});

export const checkVerificationRoute = createRoute({
  method: "post",
  path: "/verifications/check",
  operationId: "checkVerification",
  tags: ["Verifications"],
  summary: "Check a code",
  description:
    "Checks the code the end user typed, by the verification's id or by the destination (its " +
    "latest verification). `valid: true` approves it (`verification.approved`, billed once); a " +
    "wrong code spends an attempt, and the last one fails it. Checking an approved verification " +
    "again with its code stays valid until it expires, without being billed again.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ verify: ["check"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/verifications/check"),
  ] as const,
  request: {
    headers: CheckHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: CheckVerificationRequest } },
    },
  },
  responses: {
    200: jsonDoc(
      "Whether the code is right, and the verification after the check.",
      VerificationCheckObject,
    ),
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    404: errorDoc("No such verification in the API key's environment (`not_found`)."),
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), or too many checks for this " +
        "destination (`quota_exceeded`).",
      retryAfter,
    ),
  },
});

export const listVerificationsRoute = createRoute({
  method: "get",
  path: "/verifications",
  operationId: "listVerifications",
  tags: ["Verifications"],
  summary: "List verifications",
  description:
    "Verifications of the API key's environment, newest first. Pass the last `id` as `after` " +
    "to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ verify: ["read"] }), rateLimit("api.read")],
  request: { query: ListVerificationsQuery },
  responses: {
    200: jsonDoc("A page of verifications.", VerificationList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const getVerificationRoute = createRoute({
  method: "get",
  path: "/verifications/{id}",
  operationId: "getVerification",
  tags: ["Verifications"],
  summary: "Retrieve a verification",
  description: "A verification's status and destination. Its code is never returned.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ verify: ["read"] }), rateLimit("api.read")],
  request: { params: VerificationIdParams },
  responses: {
    200: jsonDoc("The verification.", VerificationObject),
    ...commonErrors,
    404: errorDoc("No such verification in the API key's environment (`not_found`)."),
  },
});

export const cancelVerificationRoute = createRoute({
  method: "post",
  path: "/verifications/{id}/cancel",
  operationId: "cancelVerification",
  tags: ["Verifications"],
  summary: "Cancel a verification",
  description:
    "Cancels a pending verification: its code stops working. Canceling it again returns it as is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ verify: ["send"] }), rateLimit("api.write")],
  request: { params: VerificationIdParams },
  responses: {
    200: jsonDoc("The canceled verification.", VerificationObject),
    ...commonErrors,
    404: errorDoc("No such verification in the API key's environment (`not_found`)."),
    422: errorDoc(
      "The verification isn't pending (`verification_not_cancelable`): approved, failed, " +
        "blocked or expired.",
    ),
  },
});

export const getVerifySettingsRoute = createRoute({
  method: "get",
  path: "/verify/settings",
  operationId: "getVerifySettings",
  tags: ["Verify settings"],
  summary: "Get the Verify settings",
  description:
    "The API key's environment's settings, with defaults filled in: the name codes are sent for, " +
    "code length, lifetime and attempts, the senders, and the countries SMS codes may go to.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ verify: ["read"] }), rateLimit("api.read")],
  responses: {
    200: jsonDoc("The settings.", VerifySettingsObject),
    ...commonErrors,
  },
});

export const updateVerifySettingsRoute = createRoute({
  method: "patch",
  path: "/verify/settings",
  operationId: "updateVerifySettings",
  tags: ["Verify settings"],
  summary: "Update the Verify settings",
  description:
    "Changes the fields given; the others keep their values. `sms_from` must be one of the " +
    "organization's numbers, and a live key's `email_from` must be on one of its verified domains.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ verify: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/verify/settings"),
  ],
  request: {
    body: {
      content: { "application/json": { schema: UpdateVerifySettingsRequest } },
      required: true,
    },
  },
  responses: {
    200: jsonDoc("The settings.", VerifySettingsObject),
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`), or a sender isn't the organization's " +
        "(`invalid_settings`).",
    ),
  },
});

export type VerifyRouteDeps = {
  verifyService: VerifyService;
  /** The live email provider: `email_from` must be on a domain it verified. */
  liveProvider: string;
};

export function createVerifyRoutes({
  verifyService,
  liveProvider,
}: VerifyRouteDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    startVerificationRoute,
    async (c) => {
      const { apiKeyId, ownerUserId, organizationId, projectId, environmentId, mode } = c.var.auth;
      const { verification, replayed } = await verifyService.start({
        // Tenancy always comes from the authenticated key, never from the request.
        environment: { organizationId, projectId, environmentId, mode },
        apiKeyId,
        apiKeyOwnerId: ownerUserId,
        params: c.req.valid("json"),
        idempotencyKey: c.req.valid("header")["Idempotency-Key"],
      });
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(verification, 201);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  // Static paths before `/verifications/{id}`.
  router.openapi(
    checkVerificationRoute,
    async (c) => {
      const { organizationId, projectId, environmentId, mode } = c.var.auth;
      const result = await verifyService.check({
        environment: { organizationId, projectId, environmentId, mode },
        params: c.req.valid("json"),
        idempotencyKey: c.req.valid("header")["Idempotency-Key"],
      });
      return c.json(result, 200);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listVerificationsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listVerificationsPage({
      organizationId,
      environmentId,
      to: query.to?.includes("@") ? query.to.toLowerCase() : query.to,
      status: query.status,
      limit: query.limit,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getVerificationRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(
      await getVerification({
        organizationId,
        environmentId,
        verificationId: c.req.valid("param").id,
      }),
      200,
    );
  });

  router.openapi(cancelVerificationRoute, async (c) => {
    const { organizationId, projectId, environmentId, mode } = c.var.auth;
    return c.json(
      await verifyService.cancel({
        environment: { organizationId, projectId, environmentId, mode },
        verificationId: c.req.valid("param").id,
      }),
      200,
    );
  });

  router.openapi(getVerifySettingsRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    const settings = await getVerifySettings({ organizationId, environmentId });
    if (!settings) throw new VerifyError("not_found", "Environment not found.");
    return c.json(toVerifySettingsObject(settings), 200);
  });

  router.openapi(updateVerifySettingsRoute, async (c) => {
    const update = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const settings = await updateVerifySettings({ organizationId, environmentId }, update, {
      checkEmailFrom: (organization, address) =>
        authorizeLiveSender({
          organizationId: organization,
          from: address,
          provider: liveProvider,
        }).then(
          () => true,
          () => false,
        ),
    });
    await recordApiAudit(c, {
      action: "verify_settings.updated",
      target: { type: "environment", id: environmentId },
      metadata: {
        fields: Object.keys(update),
        sms_from: settings.smsFrom,
        email_from: settings.emailFrom,
        allowed_countries: settings.allowedCountries,
      },
    });
    return c.json(toVerifySettingsObject(settings), 200);
  });

  return router;
}
