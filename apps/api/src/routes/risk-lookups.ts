/**
 * Risk's building blocks: stateless lookups (email, IP, phone) and content classification. Nothing
 * about the person looked up is stored or counted; the text classified is never stored or logged.
 */
import {
  checkEmail,
  checkIp,
  checkPhone,
  classifyContentForCustomer,
  type RiskDeps,
} from "@coss/risk";
import {
  RiskContentClassification,
  RiskContentClassifyRequest,
  RiskEmailCheck,
  RiskEmailCheckRequest,
  RiskIpCheck,
  RiskIpCheckRequest,
  RiskPhoneCheck,
  RiskPhoneCheckRequest,
} from "@coss/risk/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { z } from "zod";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError, setRateLimitHeaders } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, requestIdHeader, retryAfterHeader } from "./docs.ts";

function json<T extends z.ZodType>(description: string, schema: T) {
  return {
    description,
    headers: { "X-Request-Id": requestIdHeader },
    content: { "application/json": { schema } },
  };
}

const jsonBodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
  422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
};

export const checkRiskEmailRoute = createRoute({
  method: "post",
  path: "/risk/email/check",
  operationId: "checkRiskEmail",
  tags: ["Risk"],
  summary: "Check an email address",
  description:
    "Email intelligence on its own: syntax, disposable domains, whether the domain can receive " +
    "mail (DNS), role accounts, free providers, the canonical mailbox, typo suggestions and the " +
    "domain's age (RDAP). Stateless: nothing is stored or counted, so it never flags an address " +
    "for having been seen before (assessments do). Failed lookups are listed in `degraded`. " +
    "Sandbox keys see the documented test domains (`@disposable.test`, `@undeliverable.test`, " +
    "`@new.test`).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.assess"),
    upgradeRequestBody("POST /v1/risk/email/check"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: RiskEmailCheckRequest } } },
  },
  responses: {
    200: json("What coss.com knows about the address.", RiskEmailCheck),
    ...jsonBodyErrors,
    ...commonErrors,
  },
});

export const checkRiskIpRoute = createRoute({
  method: "post",
  path: "/risk/ip/check",
  operationId: "checkRiskIp",
  tags: ["Risk"],
  summary: "Check an IP address",
  description:
    "IP intelligence on its own: Tor exit nodes, cloud and hosting networks, networks mostly " +
    "used by VPN and proxy services, the network (ASN) and its country. Stateless. Missing IP " +
    "data is reported in `degraded`. Sandbox keys see the documentation addresses " +
    "(`192.0.2.1` Tor, `.2` cloud, `.3` VPN, the rest residential).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.assess"),
    upgradeRequestBody("POST /v1/risk/ip/check"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: RiskIpCheckRequest } } },
  },
  responses: {
    200: json("What coss.com knows about the address.", RiskIpCheck),
    ...jsonBodyErrors,
    ...commonErrors,
  },
});

export const checkRiskPhoneRoute = createRoute({
  method: "post",
  path: "/risk/phone/check",
  operationId: "checkRiskPhone",
  tags: ["Risk"],
  summary: "Check a phone number",
  description:
    "Phone intelligence on its own: whether the number exists in its country's numbering plan, " +
    "its line type (mobile, landline, fixed or non-fixed VoIP, toll-free…) and carrier, and the " +
    "last SIM swap where carriers share it. Stateless. A failed lookup is reported in " +
    "`degraded`. Each live check that gets an answer is billed (`risk.phone_checks`; plans " +
    "include some every month, and Free stops at its allowance); invalid numbers, failed " +
    "lookups and sandbox checks are free. Limited per organization as well as per key. " +
    "Sandbox keys see the fictional " +
    "numbers `+1 202 555 01xx` (`0101` landline, `0102` non-fixed VoIP, `0103` fixed VoIP, " +
    "`0104` a recent SIM swap, `0199` invalid, the rest mobile).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.assess"),
    upgradeRequestBody("POST /v1/risk/phone/check"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: RiskPhoneCheckRequest } } },
  },
  responses: {
    200: json("What coss.com knows about the number.", RiskPhoneCheck),
    ...jsonBodyErrors,
    ...commonErrors,
    402: errorDoc(
      "The plan's included phone checks are used up (`usage_limit_exceeded`), or live checks " +
        "are paused by an overdue invoice or a spend limit (`billing_hold`).",
    ),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), too many phone checks for this " +
        "organization (`phone_check_rate_limited`), or too many requests with invalid keys from " +
        "this address (`too_many_failed_authentications`). Retry after `Retry-After` seconds.",
      { "Retry-After": retryAfterHeader },
    ),
    503: errorDoc(
      "Phone checks aren't available at the moment (`phone_lookup_unavailable`), or the API key " +
        "could not be verified right now (`service_unavailable`). Retry later.",
    ),
  },
});

export const classifyRiskContentRoute = createRoute({
  method: "post",
  path: "/risk/content/classify",
  operationId: "classifyRiskContent",
  tags: ["Risk"],
  summary: "Classify content",
  description:
    "Scores text people post on your platform (a profile bio, a comment, a listing) for spam, " +
    "phishing, malware and fraud with an AI model, with zero data retention. Returns scores " +
    "only: you decide what they mean. Neither the text nor the scores are stored, and request " +
    "logs keep no body for this endpoint. Takes up to 3 seconds; a failure is a 503 you can " +
    "retry or treat as unknown. Each live classification the model answered is billed " +
    "(`risk.content_checks`; plans include some every month, and Free stops at its allowance). " +
    "Limited per organization as well as per key. Sandbox keys use " +
    "markers instead of a model: `[coss-test:phishing]` scores 0.99, " +
    "`[coss-test:spam:0.4]` exactly 0.4, everything else 0.01.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.assess"),
    upgradeRequestBody("POST /v1/risk/content/classify"),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RiskContentClassifyRequest } },
    },
  },
  responses: {
    200: json("The scores.", RiskContentClassification),
    ...jsonBodyErrors,
    ...commonErrors,
    402: errorDoc(
      "The plan's included content checks are used up (`usage_limit_exceeded`), or live checks " +
        "are paused by an overdue invoice, a spend limit (`billing_hold`) or a budget " +
        "(`budget_exceeded`).",
    ),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), too many classifications for this " +
        "organization (`classification_rate_limited`), or too many requests with invalid keys " +
        "from this address (`too_many_failed_authentications`). Retry after `Retry-After` " +
        "seconds.",
      { "Retry-After": retryAfterHeader },
    ),
    503: errorDoc(
      "The model failed or took longer than 3 seconds (`classification_unavailable`), or the " +
        "API key could not be verified right now (`service_unavailable`). Retry later, or go " +
        "without the scores.",
    ),
  },
});

export function createRiskLookupRoutes(deps: RiskDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(checkRiskEmailRoute, async (c) => {
    const { email } = c.req.valid("json");
    const { organizationId, mode } = c.var.auth;
    return c.json(await checkEmail(deps, { organizationId, mode }, email), 200);
  });

  router.openapi(checkRiskIpRoute, async (c) => {
    const { ip } = c.req.valid("json");
    const { organizationId, mode } = c.var.auth;
    return c.json(await checkIp(deps, { organizationId, mode }, ip), 200);
  });

  router.openapi(checkRiskPhoneRoute, async (c) => {
    const { phone } = c.req.valid("json");
    const { organizationId, mode } = c.var.auth;
    // Every live check is a paid lookup: capped per organization. Sandbox ones are free.
    if (mode === "live") {
      const decision = await c.var.rateLimiter.consume({
        buckets: ["risk.phone", "risk.phone.day"],
        subject: organizationId,
        organizationId,
      });
      if (!decision.allowed) {
        setRateLimitHeaders(c, decision);
        throw rateLimitError(decision, {
          code: "phone_check_rate_limited",
          message:
            "Too many phone checks for this organization. Retry after `Retry-After` seconds.",
        });
      }
    }
    const { environmentId, projectId, apiKeyId, ownerUserId } = c.var.auth;
    const environment = {
      organizationId,
      mode,
      environmentId,
      projectId,
      apiKeyId,
      userId: ownerUserId,
    };
    return c.json(await checkPhone(deps, environment, phone), 200);
  });

  router.openapi(classifyRiskContentRoute, async (c) => {
    const { text } = c.req.valid("json");
    const { organizationId, environmentId, projectId, apiKeyId, ownerUserId, mode } = c.var.auth;
    // Every live classification asks a model: capped per organization. Sandbox ones are free.
    if (mode === "live") {
      const decision = await c.var.rateLimiter.consume({
        buckets: ["risk.classify", "risk.classify.day"],
        subject: organizationId,
        organizationId,
      });
      if (!decision.allowed) {
        setRateLimitHeaders(c, decision);
        throw rateLimitError(decision, {
          code: "classification_rate_limited",
          message:
            "Too many content classifications for this organization. Retry after `Retry-After` seconds.",
        });
      }
    }
    const environment = {
      organizationId,
      mode,
      environmentId,
      projectId,
      apiKeyId,
      userId: ownerUserId,
    };
    return c.json(await classifyContentForCustomer(deps, environment, text), 200);
  });

  return router;
}
