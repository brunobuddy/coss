import { authorizeLiveSender } from "@coss/email";
import {
  cancelSignRequest,
  createSignSession,
  getSignDocument,
  getSignRequest,
  getSignSettings,
  listSignDocuments,
  listSignRequestEvents,
  listSignRequests,
  readSignedDocument,
  requestSignReminders,
  type SignActor,
  type SignService,
  sendSignRequest,
  toSignSettingsObject,
  updateSignSettings,
} from "@coss/sign";
import {
  CreateSignRequestRequest,
  CreateSignSessionRequest,
  DeletedSignDocument,
  DeletedSignRequest,
  ListSignDocumentsQuery,
  ListSignRequestsQuery,
  SignDocumentList,
  SignDocumentObject,
  SignEventList,
  SignRequestList,
  SignRequestObject,
  SignSessionObject,
  SignSettingsObject,
  UpdateSignSettingsRequest,
  UploadSignDocumentRequest,
} from "@coss/sign/schemas";
import { apiKeyHasPermissions } from "@coss/tenancy";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { limitBody, SEND_BODY_LIMIT_BYTES } from "../body-limit.ts";
import { ApiError } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";
import { attachmentDisposition } from "./received-emails.ts";

const TAG_DOCUMENTS = "Sign documents";
const TAG_REQUESTS = "Signature requests";
const TAG_SETTINGS = "Sign settings";

const DocumentIdParams = z.object({
  id: z.string().meta({
    description: "The document's id.",
    examples: ["sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const RequestIdParams = z.object({
  id: z.string().meta({
    description: "The signature request's id.",
    examples: ["sreq_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const SignerParams = RequestIdParams.extend({
  signer_id: z.string().meta({
    description: "The signer's id (`signers[].id` of the request).",
    examples: ["ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const CreateSignRequestHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "request (in its current state) instead of creating another, for 24 hours.",
);

const queryError = errorDoc(
  "A query parameter failed validation (`validation_error`, see `issues`).",
);
const uploadBodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 40 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};
const documentNotFound = errorDoc(
  "No document with this id exists in the API key's environment (`not_found`).",
);
const requestNotFound = errorDoc(
  "No signature request with this id exists in the API key's environment (`not_found`).",
);
const heldBilling = errorDoc(
  "In live environments: an overdue invoice or spend limit (`billing_hold`), or the project's budget " +
    "(`budget_exceeded`).",
);
const unavailable = errorDoc("Sign is temporarily unavailable (`sign_unavailable`).");

export const uploadSignDocumentRoute = createRoute({
  method: "post",
  path: "/sign/documents",
  operationId: "uploadSignDocument",
  tags: [TAG_DOCUMENTS],
  summary: "Upload a document",
  description:
    "Uploads a PDF (base64, at most 25 MB and 500 pages, not password-protected) for signature " +
    "requests to use. The response lists each page's size and the text anchors found in it " +
    "(`{{signature:signer_1}}`), which fields can be placed by. Requests can also take PDFs inline.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["create"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/documents"),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UploadSignDocumentRequest } },
    },
  },
  responses: {
    201: jsonDoc("The uploaded document.", SignDocumentObject),
    ...commonErrors,
    ...uploadBodyErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), or the file isn't a PDF " +
        "coss.com can read (`invalid_document`: damaged, encrypted or too many pages).",
    ),
    503: unavailable,
  },
});

export const listSignDocumentsRoute = createRoute({
  method: "get",
  path: "/sign/documents",
  operationId: "listSignDocuments",
  tags: [TAG_DOCUMENTS],
  summary: "List documents",
  description:
    "Documents uploaded to the API key's environment, newest first. Pass the last `id` as " +
    "`after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { query: ListSignDocumentsQuery },
  responses: {
    200: jsonDoc("A page of documents.", SignDocumentList),
    ...commonErrors,
    422: queryError,
  },
});

export const getSignDocumentRoute = createRoute({
  method: "get",
  path: "/sign/documents/{id}",
  operationId: "getSignDocument",
  tags: [TAG_DOCUMENTS],
  summary: "Retrieve a document",
  description:
    "An uploaded document's details: its hash, page sizes and text anchors. Its bytes are never returned here.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { params: DocumentIdParams },
  responses: {
    200: jsonDoc("The document.", SignDocumentObject),
    ...commonErrors,
    404: documentNotFound,
  },
});

export const deleteSignDocumentRoute = createRoute({
  method: "delete",
  path: "/sign/documents/{id}",
  operationId: "deleteSignDocument",
  tags: [TAG_DOCUMENTS],
  summary: "Delete a document",
  description:
    "Deletes an uploaded document and its file. Documents a request uses can't be deleted.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["delete"] }), rateLimit("api.write")],
  request: { params: DocumentIdParams },
  responses: {
    200: jsonDoc("The document was deleted.", DeletedSignDocument),
    ...commonErrors,
    404: documentNotFound,
    422: errorDoc("A signature request uses the document (`document_in_use`)."),
    503: unavailable,
  },
});

export const createSignRequestRoute = createRoute({
  method: "post",
  path: "/sign/requests",
  operationId: "createSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Create a signature request",
  description:
    "Asks one or more signers to sign one or more PDFs. Give documents by id (uploaded) or " +
    "inline, and each signer's fields by position (`page`, `x`, `y`, `width`, `height` in PDF " +
    "points from the page's top left) or by text anchor (`{{signature:signer_1}}`). Every signer " +
    "needs a `signature` field. Sent at once unless `send` is `false` (a `draft`). Each signer " +
    'signs by email (`delivery: "email"`, the default) or in your app (`"embedded"`).',
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["create"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/requests"),
  ] as const,
  request: {
    headers: CreateSignRequestHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: CreateSignRequestRequest } },
    },
  },
  responses: {
    402: heldBilling,
    201: {
      description:
        "The signature request (`sent`, or `draft`). A replay returns the original request in its current state.",
      headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
      content: { "application/json": { schema: SignRequestObject } },
    },
    ...commonErrors,
    ...uploadBodyErrors,
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing for an expired key (`request_in_progress`).",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), a document isn't a PDF " +
        "coss.com can read (`invalid_document`) or isn't in the environment (`not_found`), a field " +
        "doesn't fit on its page or names an anchor no document has (`invalid_fields`), a signer " +
        "is listed twice (`invalid_signers`), `expires_at` is out of range (`invalid_expiry`), or " +
        "the `Idempotency-Key` was already used with a different body (`idempotency_key_reused`).",
    ),
    503: unavailable,
  },
});

export const listSignRequestsRoute = createRoute({
  method: "get",
  path: "/sign/requests",
  operationId: "listSignRequests",
  tags: [TAG_REQUESTS],
  summary: "List signature requests",
  description:
    "Signature requests of the API key's environment, newest first. Pass the last `id` as " +
    "`after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { query: ListSignRequestsQuery },
  responses: {
    200: jsonDoc("A page of signature requests.", SignRequestList),
    ...commonErrors,
    422: queryError,
  },
});

export const getSignRequestRoute = createRoute({
  method: "get",
  path: "/sign/requests/{id}",
  operationId: "getSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Retrieve a signature request",
  description:
    "A signature request with its documents, signers and fields, and `signed_document` once it's sealed.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { params: RequestIdParams },
  responses: {
    200: jsonDoc("The signature request.", SignRequestObject),
    ...commonErrors,
    404: requestNotFound,
  },
});

export const sendSignRequestRoute = createRoute({
  method: "post",
  path: "/sign/requests/{id}/send",
  operationId: "sendSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Send a draft signature request",
  description: "Sends a `draft`. An already sent request is returned as is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["send"] }), rateLimit("api.write")],
  request: { params: RequestIdParams },
  responses: {
    402: heldBilling,
    200: jsonDoc("The sent request.", SignRequestObject),
    ...commonErrors,
    404: requestNotFound,
    422: errorDoc("The request isn't a draft (`request_not_draft`)."),
  },
});

export const cancelSignRequestRoute = createRoute({
  method: "post",
  path: "/sign/requests/{id}/cancel",
  operationId: "cancelSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Cancel a signature request",
  description:
    "Cancels a `draft` or `sent` request: its signers can no longer sign. An already canceled " +
    "request is returned as is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["update"] }), rateLimit("api.write")],
  request: { params: RequestIdParams },
  responses: {
    200: jsonDoc("The canceled request.", SignRequestObject),
    ...commonErrors,
    404: requestNotFound,
    422: errorDoc(
      "The request is already completed, declined or expired (`request_not_cancelable`).",
    ),
  },
});

export const listSignRequestEventsRoute = createRoute({
  method: "get",
  path: "/sign/requests/{id}/audit_trail",
  operationId: "listSignRequestEvents",
  tags: [TAG_REQUESTS],
  summary: "List a signature request's audit trail",
  description:
    "Everything that happened to the request, oldest first: who did it, from which address, the " +
    "documents' SHA-256 when it mattered, and a hash chain (`previous_hash`, `hash`) that shows " +
    "the trail is complete and unchanged.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { params: RequestIdParams },
  responses: {
    200: jsonDoc("The audit trail.", SignEventList),
    ...commonErrors,
    404: requestNotFound,
  },
});

export const deleteSignRequestRoute = createRoute({
  method: "delete",
  path: "/sign/requests/{id}",
  operationId: "deleteSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Delete a signature request",
  description:
    "Deletes a request that isn't `sent` (cancel it first) with its signers, fields, audit " +
    "trail, signatures and signed document, for good. Its documents stay (delete them on " +
    "their own). Keep the signed document first if you need it: it is your record.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["delete"] }), rateLimit("api.write")],
  request: { params: RequestIdParams },
  responses: {
    200: jsonDoc("The deleted request.", DeletedSignRequest),
    ...commonErrors,
    404: requestNotFound,
    422: errorDoc("The request is `sent`: cancel it first (`request_not_deletable`)."),
    503: unavailable,
  },
});

export const remindSignRequestRoute = createRoute({
  method: "post",
  path: "/sign/requests/{id}/remind",
  operationId: "remindSignRequest",
  tags: [TAG_REQUESTS],
  summary: "Remind signers",
  description:
    "Emails a reminder, with a fresh link, to every email signer of a sent request who hasn't " +
    "signed and whose turn it is, unless they were emailed in the last hour. Embedded signers " +
    "are yours to remind. Sent within seconds; each is a `reminded` event in the audit trail.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["send"] }), rateLimit("api.write")],
  request: { params: RequestIdParams },
  responses: {
    200: jsonDoc("The request.", SignRequestObject),
    ...commonErrors,
    404: requestNotFound,
    422: errorDoc("The request isn't `sent`, or nobody can be reminded now (`reminder_not_due`)."),
  },
});

export const getSignedDocumentRoute = createRoute({
  method: "get",
  path: "/sign/requests/{id}/signed_document",
  operationId: "getSignedDocument",
  tags: [TAG_REQUESTS],
  summary: "Download the signed document",
  description:
    "The completed request's sealed PDF: every document with the signatures and values filled " +
    "in, then a certificate of completion (signers, how they were identified, what they agreed " +
    "to, the documents' SHA-256 and the audit trail). coss.com's seal makes any later change " +
    "visible in PDF viewers. Ready once `signed_document` is set, which the " +
    "`sign_request.completed` webhook announces.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { params: RequestIdParams },
  responses: {
    200: {
      description: "The sealed PDF.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/pdf": { schema: z.string().meta({ format: "binary" }) } },
    },
    ...commonErrors,
    404: requestNotFound,
    422: errorDoc(
      "The request isn't completed, or its document is still being sealed " +
        "(`signed_document_not_ready`).",
    ),
    503: unavailable,
  },
});

export const createSignSessionRoute = createRoute({
  method: "post",
  path: "/sign/requests/{id}/signers/{signer_id}/sessions",
  operationId: "createSignSession",
  tags: [TAG_REQUESTS],
  summary: "Create a signing session",
  description:
    "A short-lived link to the signing page for one `embedded` signer of a sent request. Your " +
    "app vouches for who the signer is (the audit trail records `customer_asserted`), so create " +
    "it only for that signed-in user, when they open the page that shows it. Embed the `url` " +
    "in an iframe from an origin in your Sign settings' `allowed_origins` (`mountSigning` from " +
    "`coss/sign` does it), or redirect to it. Each call creates a new session.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["send"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/requests/{id}/signers/{signer_id}/sessions"),
  ],
  request: {
    params: SignerParams,
    body: {
      content: { "application/json": { schema: CreateSignSessionRequest } },
      required: false,
    },
  },
  responses: {
    201: jsonDoc("The session, with its link.", SignSessionObject),
    ...commonErrors,
    404: errorDoc(
      "No such signer on a signature request in the API key's environment (`not_found`).",
    ),
    422: errorDoc(
      "The signer signs by email (`signer_not_embedded`), already signed or declined " +
        "(`signer_finished`), or the request isn't `sent` or has expired (`request_not_signable`).",
    ),
    503: unavailable,
  },
});

export const getSignSettingsRoute = createRoute({
  method: "get",
  path: "/sign/settings",
  operationId: "getSignSettings",
  tags: [TAG_SETTINGS],
  summary: "Get the Sign settings",
  description:
    "The API key's environment's settings: which sites may embed the signing page, how it " +
    "looks, and the consent text signers accept.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  responses: {
    200: jsonDoc("The settings.", SignSettingsObject),
    ...commonErrors,
  },
});

export const updateSignSettingsRoute = createRoute({
  method: "patch",
  path: "/sign/settings",
  operationId: "updateSignSettings",
  tags: [TAG_SETTINGS],
  summary: "Update the Sign settings",
  description: "Changes the fields given; the others keep their values.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/sign/settings"),
  ],
  request: {
    body: {
      content: { "application/json": { schema: UpdateSignSettingsRequest } },
      required: true,
    },
  },
  responses: {
    200: jsonDoc("The settings.", SignSettingsObject),
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`), or an origin isn't `https://host[:port]` " +
        "(`invalid_origin`).",
    ),
  },
});

/** The API caller, as the audit trail records it. */
function apiActor(c: Context<AppEnv>): SignActor {
  return {
    kind: "api_key",
    ipAddress: c.var.clientIp,
    userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
  };
}

export type SignRouteDeps = {
  /** `null` when Sign isn't available in this deployment: writes answer 503. */
  signService: SignService | null;
  /** Where signing session links point (`SIGN_PUBLIC_URL`); `null`: the signing app isn't deployed. */
  signUrl: string | null;
  /** The live email provider: `email_from` must be on a domain it verified. */
  liveProvider: string;
};

/**
 * Sending is its own permission (`POST …/send` needs it too): a create-only key makes drafts
 * (`send: false`), from scratch or from a template.
 */
export async function requireSendPermission(
  c: Context<AppEnv>,
  send: boolean | undefined,
): Promise<void> {
  if (send === false) return;
  if (await apiKeyHasPermissions(c.var.auth.apiKeyId, { sign: ["send"] })) return;
  throw new ApiError(403, {
    type: "permission_error",
    code: "insufficient_permissions",
    message:
      "Creating a request that is sent at once needs the sign:send permission; pass `send: false` for a draft.",
  });
}

export function createSignRoutes({
  signService,
  signUrl,
  liveProvider,
}: SignRouteDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  function available(): SignService {
    if (signService === null) {
      throw new ApiError(503, {
        type: "api_error",
        code: "sign_unavailable",
        message: "Sign is temporarily unavailable.",
      });
    }
    return signService;
  }

  router.openapi(uploadSignDocumentRoute, async (c) => {
    const service = available();
    const { filename, content } = c.req.valid("json");
    const { apiKeyId, organizationId, projectId, environmentId, mode } = c.var.auth;
    const document = await service.uploadDocument({
      environment: { organizationId, projectId, environmentId, mode },
      apiKeyId,
      filename,
      content,
    });
    return c.json(document, 201);
  });

  router.openapi(listSignDocumentsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listSignDocuments({ organizationId, environmentId, ...query });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getSignDocumentRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getSignDocument({ organizationId, environmentId, documentId: id }), 200);
  });

  router.openapi(deleteSignDocumentRoute, async (c) => {
    const service = available();
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    await service.deleteDocument({ organizationId, environmentId, documentId: id });
    await recordApiAudit(c, {
      action: "sign_document.deleted",
      target: { type: "sign_document", id },
    });
    return c.json({ object: "sign_document" as const, id, deleted: true as const }, 200);
  });

  router.openapi(
    createSignRequestRoute,
    async (c) => {
      const service = available();
      const params = c.req.valid("json");
      await requireSendPermission(c, params.send);
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { apiKeyId, organizationId, projectId, environmentId, mode } = c.var.auth;
      const result = await service.create({
        environment: { organizationId, projectId, environmentId, mode },
        apiKeyId,
        actor: apiActor(c),
        params,
        idempotencyKey,
      });
      if (result.replayed) c.header("Idempotent-Replayed", "true");
      return c.json(result.request, 201);
    },
    // A bad Idempotency-Key is a 400, not a 422.
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listSignRequestsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listSignRequests({ organizationId, environmentId, ...query });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getSignRequestRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getSignRequest({ organizationId, environmentId, requestId: id }), 200);
  });

  router.openapi(sendSignRequestRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const request = await sendSignRequest({
      organizationId,
      environmentId,
      requestId: id,
      actor: apiActor(c),
    });
    return c.json(request, 200);
  });

  router.openapi(cancelSignRequestRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const request = await cancelSignRequest({
      organizationId,
      environmentId,
      requestId: id,
      actor: apiActor(c),
    });
    await recordApiAudit(c, {
      action: "sign_request.canceled",
      target: { type: "sign_request", id, label: request.title },
    });
    return c.json(request, 200);
  });

  router.openapi(listSignRequestEventsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const data = await listSignRequestEvents({ organizationId, environmentId, requestId: id });
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(deleteSignRequestRoute, async (c) => {
    const service = available();
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    await service.deleteRequest({ organizationId, environmentId, requestId: id });
    await recordApiAudit(c, {
      action: "sign_request.deleted",
      target: { type: "sign_request", id },
    });
    return c.json({ object: "sign_request" as const, id, deleted: true as const }, 200);
  });

  router.openapi(remindSignRequestRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    await requestSignReminders({ organizationId, environmentId, requestId: id });
    return c.json(await getSignRequest({ organizationId, environmentId, requestId: id }), 200);
  });

  router.openapi(getSignedDocumentRoute, async (c) => {
    const service = available();
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const document = await readSignedDocument({
      organizationId,
      environmentId,
      requestId: id,
      store: service.store,
    });
    return c.body(document.content as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(document.filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
  });

  router.openapi(createSignSessionRoute, async (c) => {
    available();
    if (!signUrl) {
      throw new ApiError(503, {
        type: "api_error",
        code: "sign_unavailable",
        message: "Sign is temporarily unavailable.",
      });
    }
    const { id, signer_id } = c.req.valid("param");
    const body = c.req.valid("json") ?? {};
    const { apiKeyId, organizationId, environmentId } = c.var.auth;
    const session = await createSignSession({
      organizationId,
      environmentId,
      requestId: id,
      signerId: signer_id,
      signUrl,
      expiresIn: body.expires_in,
      apiKeyId,
    });
    return c.json(session, 201);
  });

  router.openapi(getSignSettingsRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(
      toSignSettingsObject(await getSignSettings({ organizationId, environmentId })),
      200,
    );
  });

  router.openapi(updateSignSettingsRoute, async (c) => {
    const update = c.req.valid("json");
    const { organizationId, environmentId, mode } = c.var.auth;
    // Live signing emails go out from it: it must be an address the organization may send from.
    if (update.email_from && mode === "live") {
      await authorizeLiveSender({
        organizationId,
        from: update.email_from,
        provider: liveProvider,
      });
    }
    const settings = await updateSignSettings({ organizationId, environmentId, update });
    await recordApiAudit(c, {
      action: "sign_settings.updated",
      target: { type: "sign_settings", id: environmentId },
      metadata: { fields: Object.keys(update) },
    });
    return c.json(toSignSettingsObject(settings), 200);
  });

  return router;
}
