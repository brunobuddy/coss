import {
  getApiKeyEnvironmentSummary,
  permissionStrings,
  revokeEnvironmentApiKey,
} from "@coss/tenancy";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, jsonDoc } from "./docs.ts";

const Named = (what: string) =>
  z.strictObject({
    id: z.string().meta({ description: `The ${what}'s id.` }),
    name: z.string().meta({ description: `The ${what}'s name.` }),
    slug: z.string().meta({ description: `The ${what}'s slug, as in dashboard URLs.` }),
  });

export const EnvironmentObject = z
  .strictObject({
    object: z.literal("environment"),
    id: z.string().meta({ description: "The environment's id." }),
    name: z.string(),
    slug: z.string(),
    mode: z.enum(["live", "sandbox"]).meta({
      description: "`live` delivers email; `sandbox` (`coss_test_` keys) never does.",
    }),
    project: Named("project"),
    organization: Named("organization").extend({
      api_version: z.string().meta({
        description:
          "The organization's pinned API version: what requests without a `Coss-Version` header " +
          "and new webhook endpoints get.",
      }),
      hipaa_mode: z.boolean().meta({
        description:
          "Whether the organization is in HIPAA mode, which refuses some requests with " +
          "`hipaa_mode_restriction`. Its compliance settings page lists what the mode changes.",
      }),
    }),
    api_key: z
      .strictObject({
        id: z.string().meta({ description: "The key's id." }),
        name: z.string().nullable(),
        start: z
          .string()
          .nullable()
          .meta({ description: "The key's first characters, as shown in the dashboard." }),
        access: z.enum(["full", "restricted"]).meta({
          description:
            "`full`: every permission, including ones new products add later. `restricted`: " +
            "only `permissions`, chosen when the key was created.",
        }),
        permissions: z.array(z.string()).meta({
          description:
            "What the key may do now, as `resource:action` (the names `insufficient_permissions` " +
            "errors use), e.g. `email:send`.",
        }),
      })
      .meta({ description: "The API key making this request." }),
  })
  .meta({
    id: "Environment",
    description: "The environment an API key belongs to, with its project and organization.",
    examples: [
      {
        object: "environment",
        id: "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
        name: "Development",
        slug: "development",
        mode: "sandbox",
        project: { id: "proj_01k7c8m4q2f3e9v6t5r1n0p8yz", name: "Default", slug: "default" },
        organization: {
          id: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
          name: "Acme",
          slug: "acme",
          api_version: LATEST_API_VERSION,
        },
        api_key: {
          id: "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
          name: "Backend",
          start: "coss_test_Ab",
          access: "restricted",
          permissions: ["email:send", "email:read"],
        },
      },
    ],
  });

export const getEnvironmentRoute = createRoute({
  method: "get",
  path: "/environment",
  operationId: "getEnvironment",
  tags: ["Environment"],
  summary: "Retrieve the API key's environment",
  description:
    "Which environment, project and organization the API key belongs to, and the key itself. " +
    "Any valid key can read its own environment (no permission needed): use it to check a key, " +
    "show where it sends and what it may do.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({}), rateLimit("api.read")],
  responses: {
    200: jsonDoc("The API key's environment.", EnvironmentObject),
    ...commonErrors,
  },
});

export const DeletedApiKey = z
  .strictObject({
    object: z.literal("api_key"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedApiKey",
    examples: [{ object: "api_key", id: "key_01k7c8m4q2f3e9v6t5r1n0p8yz", deleted: true }],
  });

export const revokeApiKeyRoute = createRoute({
  method: "delete",
  path: "/api_key",
  operationId: "revokeApiKey",
  tags: ["Environment"],
  summary: "Revoke the API key",
  description:
    "Revokes the API key making this request, at once: every later request with it fails with " +
    "`invalid_api_key`. `coss logout --revoke` uses it. Other keys are revoked in the dashboard.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({}), rateLimit("api.write")],
  responses: {
    200: jsonDoc("The key was revoked.", DeletedApiKey),
    ...commonErrors,
  },
});

export function createEnvironmentRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(getEnvironmentRoute, async (c) => {
    const { auth } = c.var;
    const summary = await getApiKeyEnvironmentSummary(auth);
    // The key authenticated a moment ago: only a revocation in between gets here.
    if (!summary) {
      throw new ApiError(401, {
        type: "authentication_error",
        code: "invalid_api_key",
        message: "The API key is invalid, revoked or expired.",
      });
    }
    const { environment, project, organization, apiKey } = summary;
    return c.json(
      {
        object: "environment" as const,
        id: environment.id,
        name: environment.name,
        slug: environment.slug,
        mode: environment.mode,
        project,
        // The pin, not this request's version (the SDK always sends its own).
        organization: {
          ...organization,
          api_version: auth.apiVersion,
          hipaa_mode: auth.hipaaMode,
        },
        api_key: {
          id: apiKey.id,
          name: apiKey.name,
          start: apiKey.start,
          access: apiKey.access,
          permissions: permissionStrings(apiKey.permissions),
        },
      },
      200,
    );
  });

  router.openapi(revokeApiKeyRoute, async (c) => {
    const { organizationId, apiKeyId } = c.var.auth;
    const revoked = await revokeEnvironmentApiKey({ organizationId, apiKeyId });
    if (!revoked) {
      throw new ApiError(401, {
        type: "authentication_error",
        code: "invalid_api_key",
        message: "The API key is invalid, revoked or expired.",
      });
    }
    await recordApiAudit(c, {
      action: "api_key.revoked",
      target: { type: "api_key", id: revoked.id, label: revoked.name },
    });
    return c.json({ object: "api_key" as const, id: revoked.id, deleted: true as const }, 200);
  });

  return router;
}
