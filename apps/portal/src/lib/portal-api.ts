/**
 * The portal's JSON API (`/api/sessions/<session id>/…`), used by the portal page in the browser.
 * Every request carries the session's token as `Authorization: Bearer cossp_…` (never a cookie, so
 * there is nothing to forge cross-site) and is scoped to that session's one application. Unknown,
 * expired and wrong-token sessions all get the same 404. Kept free of Next so tests call it directly.
 */

import {
  authenticateHookPortalSession,
  createHookEndpoint,
  deleteHookEndpoint,
  getHookDelivery,
  getHookEndpoint,
  getHookEventType,
  getHookPortalSettings,
  HookError,
  type HookManagementDeps,
  listHookAttempts,
  listHookEndpoints,
  listHookEventTypes,
  type PortalAccess,
  pageHookDeliveries,
  pageHookMessages,
  recoverHookEndpoint,
  retryHookDelivery,
  revealHookEndpointSecret,
  rollHookEndpointSecret,
  sendHookMessage,
  toHookAttemptObject,
  toHookDeliveryObject,
  toHookEndpointObject,
  toHookEndpointRecoveryObject,
  toHookEventTypeObject,
  toHookMessageObject,
  updateHookEndpoint,
} from "@coss/hooks";
import { HOOK_DELIVERY_STATUSES } from "@coss/hooks/schemas";
import type { OrgAuditActor } from "@coss/logs";
import { recordOrgAuditEvent } from "@coss/logs";
import type { RateLimiter, RateLimitRequest } from "@coss/ratelimit";
import { z } from "zod";

export type PortalApiDeps = {
  hooks: HookManagementDeps;
  limiter: RateLimiter;
  /** The caller's address (`CLIENT_IP_HEADER`); `null` turns the per-IP limit off. */
  clientIp: string | null;
  now?: Date;
};

class PortalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = new PortalError(404, "not_found", "This portal link is invalid or has expired.");

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const EndpointInput = z.strictObject({
  url: z.string().max(2048),
  description: z.string().max(256).nullable().optional(),
  filter_types: z.array(z.string()).max(250).optional(),
});
const EndpointUpdate = EndpointInput.partial().extend({ enabled: z.boolean().optional() });
const RecoverInput = z.strictObject({ since: z.iso.datetime({ offset: true }) });
const TestInput = z.strictObject({ event_type: z.string().min(1).max(64) });
const Page = z.object({
  after: z.string().optional(),
  status: z.enum(HOOK_DELIVERY_STATUSES).optional(),
  event_type: z.string().optional(),
});

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new PortalError(400, "invalid_json", "The body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new PortalError(
      422,
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }
  return parsed.data;
}

/** Who made a change, for the organization's audit log: whoever minted the session. */
function portalActor(access: PortalAccess): OrgAuditActor {
  const label = `Portal · application ${access.application.uid ?? access.application.name}`;
  if (access.session.apiKeyId) return { type: "api_key", id: access.session.apiKeyId, label };
  if (access.session.createdByUserId) {
    return { type: "user", id: access.session.createdByUserId, label };
  }
  return { type: "system", id: null, label };
}

async function charge(deps: PortalApiDeps, requests: RateLimitRequest[]): Promise<void> {
  const charged: RateLimitRequest[] = [];
  for (const request of requests) {
    const decision = await deps.limiter.consume(request);
    if (!decision.allowed) {
      await Promise.all(charged.map((done) => deps.limiter.refund(done)));
      throw new PortalError(429, "rate_limited", "Too many requests. Try again in a moment.");
    }
    charged.push(request);
  }
}

/** Answers one portal API request. `path` is what follows `/api/sessions/<id>/`. */
export async function handlePortalRequest(
  request: Request,
  sessionId: string,
  path: readonly string[],
  deps: PortalApiDeps,
): Promise<Response> {
  try {
    return await route(request, sessionId, path, deps);
  } catch (error) {
    if (error instanceof PortalError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof HookError) {
      return json(
        { error: { code: error.code, message: error.message, param: error.param ?? null } },
        error.status === 402 || error.status === 403 || error.status === 404 ? error.status : 422,
      );
    }
    console.error(`[portal] ${request.method} ${path.join("/")} failed:`, error);
    return json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
  }
}

async function route(
  request: Request,
  sessionId: string,
  path: readonly string[],
  deps: PortalApiDeps,
): Promise<Response> {
  // Limits first, so a guessed session id or token costs the guesser, not the database.
  await charge(deps, [
    { buckets: ["portal.session"], subject: sessionId },
    ...(deps.clientIp ? [{ buckets: ["portal.ip"], subject: deps.clientIp } as const] : []),
  ]);
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw NOT_FOUND;
  const access = await authenticateHookPortalSession({ id: sessionId, token, now: deps.now });
  if (!access) throw NOT_FOUND;
  const { application } = access;
  const organizationId = application.organizationId;
  const method = request.method;
  const url = new URL(request.url);
  const mutate = () => {
    if (access.readOnly) {
      throw new PortalError(403, "read_only", "This portal session can't make changes.");
    }
  };
  const audit = (action: string, target: { id: string; label: string }, metadata = {}) =>
    recordOrgAuditEvent({
      organizationId,
      projectId: application.projectId,
      environmentId: application.environmentId,
      actor: portalActor(access),
      action,
      target: { type: "hook_endpoint", ...target },
      metadata: {
        application_id: application.id,
        portal_session_id: access.session.id,
        ...metadata,
      },
    }).catch((error: unknown) => console.error(`[portal] audit ${action} not recorded:`, error));
  const requireEndpoint = async (id: string | undefined) => {
    const endpoint = id
      ? await getHookEndpoint({ organizationId, applicationId: application.id, id })
      : null;
    if (!endpoint) throw new PortalError(404, "not_found", "Endpoint not found.");
    return endpoint;
  };
  const [head, id, action] = path;

  // GET / : everything the page needs to start.
  if (head === undefined && method === "GET") {
    const scope = { organizationId, environmentId: application.environmentId };
    const [eventTypes, endpoints, settings] = await Promise.all([
      listHookEventTypes(scope),
      listHookEndpoints({ organizationId, applicationId: application.id }),
      getHookPortalSettings(scope),
    ]);
    return json({
      application: { id: application.id, uid: application.uid, name: application.name },
      read_only: access.readOnly,
      expires_at: access.session.expiresAt.toISOString(),
      branding: {
        display_name: settings.displayName,
        accent_color: settings.accentColor,
        theme: settings.theme,
      },
      event_types: eventTypes.map(toHookEventTypeObject),
      endpoints: endpoints.map(toHookEndpointObject),
    });
  }

  if (head === "endpoints") {
    if (id === undefined && method === "POST") {
      mutate();
      const input = await body(request, EndpointInput);
      const { endpoint, secret } = await createHookEndpoint(
        {
          organizationId,
          environmentId: application.environmentId,
          applicationId: application.id,
          url: input.url,
          description: input.description,
          filterTypes: input.filter_types,
        },
        deps.hooks,
      );
      await audit("hook_endpoint.created", { id: endpoint.id, label: endpoint.url });
      return json({ ...toHookEndpointObject(endpoint), secret });
    }
    const endpoint = await requireEndpoint(id);
    if (action === undefined && method === "GET") return json(toHookEndpointObject(endpoint));
    if (action === undefined && method === "PATCH") {
      mutate();
      const input = await body(request, EndpointUpdate);
      const updated = await updateHookEndpoint(
        {
          organizationId,
          environmentId: application.environmentId,
          applicationId: application.id,
          id: endpoint.id,
          url: input.url,
          description: input.description,
          filterTypes: input.filter_types,
          enabled: input.enabled,
        },
        deps.hooks,
      );
      await audit(
        "hook_endpoint.updated",
        { id: endpoint.id, label: updated.url },
        {
          fields: Object.keys(input),
        },
      );
      return json(toHookEndpointObject(updated));
    }
    if (action === undefined && method === "DELETE") {
      mutate();
      await deleteHookEndpoint({ organizationId, applicationId: application.id, id: endpoint.id });
      await audit("hook_endpoint.deleted", { id: endpoint.id, label: endpoint.url });
      return json({ object: "hook_endpoint", id: endpoint.id, deleted: true });
    }
    if (action === "secret" && method === "GET") {
      return json({
        object: "hook_endpoint_secret",
        secret: revealHookEndpointSecret(endpoint, deps.hooks),
      });
    }
    if (action === "roll_secret" && method === "POST") {
      mutate();
      const rolled = await rollHookEndpointSecret(
        { organizationId, applicationId: application.id, id: endpoint.id },
        deps.hooks,
      );
      await audit("hook_endpoint.secret_rolled", { id: endpoint.id, label: endpoint.url });
      return json({ ...toHookEndpointObject(rolled.endpoint), secret: rolled.secret });
    }
    if (action === "recover" && method === "POST") {
      mutate();
      const input = await body(request, RecoverInput);
      const recovery = await recoverHookEndpoint({ endpoint, since: new Date(input.since) });
      await audit(
        "hook_endpoint.recovered",
        { id: endpoint.id, label: endpoint.url },
        {
          since: input.since,
          recovery_id: recovery.id,
        },
      );
      return json(toHookEndpointRecoveryObject(recovery));
    }
    if (action === "test" && method === "POST") {
      mutate();
      const input = await body(request, TestInput);
      // Test sends count against the customer's own send quota, and are slower to repeat.
      await charge(deps, [
        { buckets: ["portal.session"], subject: sessionId, cost: 10 },
        access.mode === "sandbox"
          ? {
              buckets: ["hooks.sandbox_deliveries.day"],
              subject: application.environmentId,
              organizationId,
            }
          : { buckets: ["hooks.deliveries.day"], subject: organizationId, organizationId },
      ]);
      const type = await getHookEventType({
        organizationId,
        environmentId: application.environmentId,
        name: input.event_type,
      });
      const { message } = await sendHookMessage({
        application,
        eventType: input.event_type,
        payload: (type?.examples[0] as Record<string, unknown> | undefined) ?? {},
        onlyEndpointId: endpoint.id,
      });
      return json(toHookMessageObject(message));
    }
    if (action === "deliveries" && method === "GET") {
      const query = Page.parse(Object.fromEntries(url.searchParams));
      const page = await pageHookDeliveries({
        organizationId,
        applicationId: application.id,
        endpointId: endpoint.id,
        status: query.status,
        after: query.after,
        limit: 50,
      });
      return json({
        object: "list",
        data: page.deliveries.map(toHookDeliveryObject),
        has_more: page.hasMore,
      });
    }
  }

  if (head === "messages" && id === undefined && method === "GET") {
    const query = Page.parse(Object.fromEntries(url.searchParams));
    const page = await pageHookMessages({
      organizationId,
      applicationId: application.id,
      eventType: query.event_type,
      after: query.after,
      limit: 50,
    });
    return json({
      object: "list",
      data: page.messages.map(toHookMessageObject),
      has_more: page.hasMore,
    });
  }

  if (head === "deliveries" && id !== undefined) {
    const delivery = await getHookDelivery({ organizationId, applicationId: application.id, id });
    if (!delivery) throw new PortalError(404, "not_found", "Delivery not found.");
    if (action === "attempts" && method === "GET") {
      const attempts = await listHookAttempts(delivery);
      return json({ object: "list", data: attempts.map(toHookAttemptObject), has_more: false });
    }
    if (action === "retry" && method === "POST") {
      mutate();
      const retried = await retryHookDelivery({
        organizationId,
        applicationId: application.id,
        id: delivery.id,
      });
      return json(toHookDeliveryObject(retried ?? delivery));
    }
  }

  throw new PortalError(404, "not_found", "No such portal route.");
}
