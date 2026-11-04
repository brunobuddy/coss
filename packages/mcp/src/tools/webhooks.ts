import type { WebhookDelivery, WebhookEndpoint, WebhookEventType } from "coss";
import { z } from "zod";
import { saveWebhookSecret } from "../project-env.ts";
import { ok, respond, run, truncate, unwrap } from "../result.ts";
import {
  compact,
  cursorSchema,
  limitSchema,
  nextCursor,
  READ_ONLY,
  type ToolContext,
  WRITE,
} from "./shared.ts";

/** An endpoint without fields an agent does not need to register a URL. */
function endpointSummary(endpoint: WebhookEndpoint): object {
  return compact({
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    event_types: endpoint.event_types,
    enabled: endpoint.enabled,
  });
}

/** A delivery without its payload and with only its latest attempt. */
function deliverySummary(delivery: WebhookDelivery): object {
  const last = delivery.attempts.at(-1);
  return compact({
    id: delivery.id,
    event_type: delivery.event_type,
    event_id: delivery.event_id,
    status: delivery.status,
    attempt_count: delivery.attempt_count,
    last_status_code: delivery.last_status_code,
    last_error: delivery.last_error,
    last_response_excerpt: last ? truncate(last.response_excerpt, 300) : null,
    next_attempt_at: delivery.next_attempt_at,
    created_at: delivery.created_at,
  });
}

const endpointId = z.string().describe("The webhook endpoint id.");

export function registerWebhookTools(ctx: ToolContext): void {
  const { server, coss, projectDir } = ctx;

  server.registerTool(
    "list_webhook_endpoints",
    {
      title: "List webhook endpoints",
      description:
        "The environment's webhook endpoints: URL, subscribed event types, whether each is enabled " +
        "(and why not), and since when it has been failing. Secrets are never returned.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () => respond(coss.webhookEndpoints.list(), (list) => ({ endpoints: list.data })),
  );

  server.registerTool(
    "list_webhook_deliveries",
    {
      title: "List webhook deliveries",
      description:
        "An endpoint's deliveries, newest first, with each one's status, HTTP status code, error " +
        "and response excerpt. Use it when a webhook handler doesn't receive or rejects events.",
      inputSchema: z.object({
        endpoint_id: endpointId,
        status: z.enum(["pending", "succeeded", "failed"]).optional(),
        event_id: z.string().optional().describe("Only deliveries of this event."),
        limit: limitSchema(10),
        cursor: cursorSchema,
      }),
      annotations: READ_ONLY,
    },
    ({ endpoint_id, cursor, ...params }) =>
      respond(
        coss.webhookEndpoints.deliveries.list(endpoint_id, { ...params, after: cursor }),
        (list) => ({ deliveries: list.data.map(deliverySummary), next_cursor: nextCursor(list) }),
      ),
  );

  server.registerTool(
    "get_webhook_delivery",
    {
      title: "Get a webhook delivery",
      description:
        "One delivery with its payload and every attempt (status code, duration, error, the " +
        "start of the response body): why a handler failed.",
      inputSchema: z.object({ endpoint_id: endpointId, delivery_id: z.string() }),
      annotations: READ_ONLY,
    },
    ({ endpoint_id, delivery_id }) =>
      respond(coss.webhookEndpoints.deliveries.get(endpoint_id, delivery_id)),
  );

  server.registerTool(
    "retry_webhook_delivery",
    {
      title: "Retry a webhook delivery",
      description:
        "Sends a finished delivery to the endpoint once more, within seconds (for example after " +
        "fixing the handler). A pending delivery is already scheduled and is returned as is.",
      inputSchema: z.object({ endpoint_id: endpointId, delivery_id: z.string() }),
      annotations: { ...WRITE, openWorldHint: true },
    },
    ({ endpoint_id, delivery_id }) =>
      run(async () =>
        ok({
          delivery: deliverySummary(
            unwrap(await coss.webhookEndpoints.deliveries.retry(endpoint_id, delivery_id)),
          ),
        }),
      ),
  );

  server.registerTool(
    "create_webhook_endpoint",
    {
      title: "Create a webhook endpoint",
      description:
        "Registers an https URL that receives signed events, once. The signing secret is " +
        "returned only now and " +
        (projectDir === null
          ? "must be stored as COSS_WEBHOOK_SECRET, which verifyWebhook reads (this server writes no files). "
          : "is written to the project env file as COSS_WEBHOOK_SECRET, which verifyWebhook and " +
            "`coss listen` both read (a previous value is replaced, so local forwarding and this " +
            "endpoint sign the same way). ") +
        "If this URL already has an " +
        "endpoint, that one is returned and nothing is created or overwritten — pass force " +
        "only to add another. Creation is not retried: a lost response should be checked with " +
        "list_webhook_endpoints before calling again.",
      inputSchema: z.object({
        url: z.string().min(1).describe("The https URL coss.com posts events to."),
        description: z.string().optional().describe("A note stored on the endpoint."),
        event_types: z
          .array(z.string())
          .optional()
          .describe(
            "Event types to subscribe to. Omit to receive every type, including later ones.",
          ),
        force: z
          .boolean()
          .optional()
          .describe("Create another endpoint when this URL already has one. Default false."),
      }),
      annotations: WRITE,
    },
    ({ url, description, event_types, force }) =>
      run(async () => {
        const existing = unwrap(await coss.webhookEndpoints.list()).data.filter(
          (endpoint) => endpoint.url === url,
        );
        if (existing.length > 0 && force !== true) {
          return ok({
            created: false,
            endpoints: existing.map(endpointSummary),
            secret: null,
            hint:
              "This URL already has an endpoint. Its signing secret was returned only when it " +
              "was created. Pass force only when you mean to create another" +
              (projectDir === null
                ? "."
                : " (that replaces COSS_WEBHOOK_SECRET with the new secret)."),
          });
        }
        const types = (event_types ?? []).filter((type) => type.length > 0);
        const created = unwrap(
          await coss.webhookEndpoints.create({
            url,
            ...(description !== undefined ? { description } : {}),
            ...(types.length > 0 ? { event_types: types as WebhookEventType[] } : {}),
          }),
        );
        if (projectDir === null) {
          return ok({
            created: true,
            endpoint: endpointSummary(created),
            secret: created.secret,
            hint: "Store this secret as COSS_WEBHOOK_SECRET now; the API will not show it again.",
          });
        }
        let saved: { file: string; replaced: boolean } | { error: string };
        try {
          const wrote = await saveWebhookSecret(projectDir, created.secret);
          saved = { file: wrote.file, replaced: wrote.replaced };
        } catch (error) {
          saved = {
            error: error instanceof Error ? error.message : "Could not write the env file.",
          };
        }
        return ok({
          created: true,
          endpoint: endpointSummary(created),
          secret: created.secret,
          env_file: "file" in saved ? saved.file : null,
          replaced_existing_secret: "replaced" in saved ? saved.replaced : false,
          ...("error" in saved
            ? {
                env_error: saved.error,
                hint: "The endpoint exists. Store this secret now; the API will not show it again.",
              }
            : {
                hint: "verifyWebhook reads COSS_WEBHOOK_SECRET from the env file. coss listen signs with it too.",
              }),
        });
      }),
  );
}
