/**
 * The environment's risk configuration: settings (thresholds, disabled reasons, captcha, reason
 * weights), rules, and the calibration that feedback supports.
 */
import {
  createRiskRule,
  deleteRiskRule,
  getRiskCalibration,
  getRiskRule,
  getRiskSettings,
  listRiskRules,
  type RiskDeps,
  updateRiskRule,
  updateRiskSettings,
} from "@coss/risk";
import {
  CreateRiskRuleRequest,
  DeletedRiskRule,
  RiskCalibration,
  RiskRule,
  RiskRuleList,
  RiskSettings,
  UpdateRiskRuleRequest,
  UpdateRiskSettingsRequest,
} from "@coss/risk/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, requestIdHeader } from "./docs.ts";

const RuleIdParams = z.object({
  id: z
    .string()
    .meta({ description: "The rule's id.", examples: ["rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const ruleNotFound = errorDoc(
  "No rule with this id exists in the API key's environment (`not_found`).",
);

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
};

export const getRiskSettingsRoute = createRoute({
  method: "get",
  path: "/risk/settings",
  operationId: "getRiskSettings",
  tags: ["Risk"],
  summary: "Retrieve the risk settings",
  description:
    "The API key's environment's decision thresholds, disabled reasons and captcha provider (never its secret).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")],
  responses: {
    200: json("The settings.", RiskSettings),
    ...commonErrors,
  },
});

export const updateRiskSettingsRoute = createRoute({
  method: "patch",
  path: "/risk/settings",
  operationId: "updateRiskSettings",
  tags: ["Risk"],
  summary: "Update the risk settings",
  description:
    "Changes the fields given. `review_threshold` must not exceed `block_threshold`. Disabled reasons " +
    "never fire (rules still see the facts behind them). Setting a captcha provider makes " +
    "assessments verify their `captcha.token` with it; `required` adds `captcha.missing` to " +
    "assessments without one. `reason_weights` replaces reasons' default weights (for example with " +
    "calibration's `suggested_weight`); `null` restores a default.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/risk/settings"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateRiskSettingsRequest } },
    },
  },
  responses: {
    200: json("The settings, updated.", RiskSettings),
    ...jsonBodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), the thresholds are out of " +
        "order, or a new captcha provider has no secret (`invalid_settings`).",
    ),
  },
});

export const getRiskCalibrationRoute = createRoute({
  method: "get",
  path: "/risk/calibration",
  operationId: "getRiskCalibration",
  tags: ["Risk"],
  summary: "Retrieve the calibration",
  description:
    "How often each reason and rule was right over the last 90 days, by the outcomes you reported " +
    "with feedback, and the reason weights that supports. Nothing changes until you apply them " +
    "with `reason_weights` in the settings.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")],
  responses: {
    200: json("The calibration.", RiskCalibration),
    ...commonErrors,
  },
});

export const createRiskRuleRoute = createRoute({
  method: "post",
  path: "/risk/rules",
  operationId: "createRiskRule",
  tags: ["Risk"],
  summary: "Create a rule",
  description:
    "Rules decide after the allow and block lists and before the score thresholds: the first " +
    "enabled rule (lowest `position`, then oldest) whose conditions match the event sets the " +
    "decision to its `action`. Conditions test the fields listed in the docs; a field without a " +
    "value (no IP, no email) never matches. At most 50 rules per environment.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ riskRule: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/risk/rules"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: CreateRiskRuleRequest } } },
  },
  responses: {
    201: json("The new rule.", RiskRule),
    ...jsonBodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`) or the environment already " +
        "has 50 rules (`too_many_rules`).",
    ),
  },
});

export const listRiskRulesRoute = createRoute({
  method: "get",
  path: "/risk/rules",
  operationId: "listRiskRules",
  tags: ["Risk"],
  summary: "List rules",
  description: "Every rule of the API key's environment, in evaluation order.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskRule: ["read"] }), rateLimit("api.read")],
  responses: {
    200: json("The rules.", RiskRuleList),
    ...commonErrors,
  },
});

export const getRiskRuleRoute = createRoute({
  method: "get",
  path: "/risk/rules/{id}",
  operationId: "getRiskRule",
  tags: ["Risk"],
  summary: "Retrieve a rule",
  description: "One rule of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskRule: ["read"] }), rateLimit("api.read")],
  request: { params: RuleIdParams },
  responses: {
    200: json("The rule.", RiskRule),
    ...commonErrors,
    404: ruleNotFound,
  },
});

export const updateRiskRuleRoute = createRoute({
  method: "patch",
  path: "/risk/rules/{id}",
  operationId: "updateRiskRule",
  tags: ["Risk"],
  summary: "Update a rule",
  description: "Changes the fields given; `conditions` replaces the whole list.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ riskRule: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/risk/rules/{id}"),
  ],
  request: {
    params: RuleIdParams,
    body: { required: true, content: { "application/json": { schema: UpdateRiskRuleRequest } } },
  },
  responses: {
    200: json("The rule, updated.", RiskRule),
    ...jsonBodyErrors,
    ...commonErrors,
    404: ruleNotFound,
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
  },
});

export const deleteRiskRuleRoute = createRoute({
  method: "delete",
  path: "/risk/rules/{id}",
  operationId: "deleteRiskRule",
  tags: ["Risk"],
  summary: "Delete a rule",
  description: "Deletes a rule. Later assessments no longer apply it.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskRule: ["delete"] }), rateLimit("api.write")],
  request: { params: RuleIdParams },
  responses: {
    200: json("The rule was deleted.", DeletedRiskRule),
    ...commonErrors,
    404: ruleNotFound,
  },
});

const RULE_NOT_FOUND = "No rule with this id exists in this API key's environment.";

export function createRiskConfigRoutes(deps: RiskDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(getRiskSettingsRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getRiskSettings({ organizationId, environmentId }), 200);
  });

  router.openapi(updateRiskSettingsRoute, async (c) => {
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const settings = await updateRiskSettings(
      { organizationId, environmentId },
      params,
      deps.secretsKeys,
    );
    // The key's environment always exists while the key authenticates.
    if (!settings) throw new Error(`Environment ${environmentId} not found.`);
    await recordApiAudit(c, {
      action: "risk_settings.updated",
      target: { type: "risk_settings", id: environmentId },
      // Never the captcha secret: only which fields changed.
      metadata: {
        fields: Object.keys(params),
        ...(params.captcha !== undefined
          ? { captcha: params.captcha ? params.captcha.provider : null }
          : {}),
      },
    });
    return c.json(settings, 200);
  });

  router.openapi(getRiskCalibrationRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getRiskCalibration({ organizationId, environmentId }), 200);
  });

  router.openapi(createRiskRuleRoute, async (c) => {
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const rule = await createRiskRule({ organizationId, environmentId }, params);
    if (!rule) throw new Error(`Environment ${environmentId} not found.`);
    await recordApiAudit(c, {
      action: "risk_rule.created",
      target: { type: "risk_rule", id: rule.id, label: rule.name },
      metadata: { action: rule.action },
    });
    return c.json(rule, 201);
  });

  router.openapi(listRiskRulesRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await listRiskRules({ organizationId, environmentId }), 200);
  });

  router.openapi(getRiskRuleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const rule = await getRiskRule({ organizationId, environmentId }, id);
    if (!rule) throw notFound(RULE_NOT_FOUND);
    return c.json(rule, 200);
  });

  router.openapi(updateRiskRuleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const rule = await updateRiskRule({ organizationId, environmentId }, id, params);
    if (!rule) throw notFound(RULE_NOT_FOUND);
    await recordApiAudit(c, {
      action: "risk_rule.updated",
      target: { type: "risk_rule", id: rule.id, label: rule.name },
      metadata: { fields: Object.keys(params) },
    });
    return c.json(rule, 200);
  });

  router.openapi(deleteRiskRuleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const rule = await deleteRiskRule({ organizationId, environmentId }, id);
    if (!rule) throw notFound(RULE_NOT_FOUND);
    await recordApiAudit(c, {
      action: "risk_rule.deleted",
      target: { type: "risk_rule", id: rule.id, label: rule.name },
    });
    return c.json({ object: "risk_rule" as const, id, deleted: true as const }, 200);
  });

  return router;
}
