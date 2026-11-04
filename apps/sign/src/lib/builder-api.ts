/**
 * The builder's JSON API (`/api/builder/<session id>/…`), used by the builder page. Like the
 * signing API: `Authorization: Bearer cossb_…`, never a cookie; every bad session is the same 404;
 * rate limits first. A builder session reaches its one template only: uploads are added to it at
 * once, documents are served only when they are its, and a save can only keep or drop them.
 *
 *   GET  /                  the template
 *   GET  /documents/<id>    one of its documents' PDF
 *   POST /documents         { filename, content }: a PDF added to the template
 *   PUT  /                  { name, title, message, signing_order, documents, roles, fields }
 */

import type { RateLimiter, RateLimitRequest } from "@coss/ratelimit";
import {
  authenticateSignBuilderSession,
  type DocumentStore,
  getSignSettings,
  getSignTemplate,
  readSignTemplateDocument,
  type SignBuilderAccess,
  SignError,
  updateSignTemplate,
} from "@coss/sign";
import { SignTemplateRoleInput, UploadSignDocumentRequest } from "@coss/sign/schemas";
import { z } from "zod";
import { readBodyText } from "./sign-api.ts";

export type BuilderApiDeps = {
  store: DocumentStore | null;
  limiter: RateLimiter;
  clientIp: string | null;
  now?: Date;
};

class BuilderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = new BuilderApiError(
  404,
  "not_found",
  "This builder link is invalid or has expired.",
);
// A 25 MB PDF, base64.
const MAX_BODY_BYTES = 36 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const Field = z.strictObject({
  role: z.string(),
  type: z.enum(["signature", "initials", "date_signed", "name", "email", "text", "checkbox"]),
  document: z.number().int().min(0),
  page: z.number().int().min(1),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  required: z.boolean(),
  label: z.string().max(100).nullable(),
  merge_key: z.string().nullable(),
});
const SaveInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullable(),
  message: z.string().max(5000).nullable(),
  signing_order: z.enum(["parallel", "sequential"]),
  documents: z.array(z.string()).max(10),
  roles: z.array(SignTemplateRoleInput).max(20),
  fields: z.array(Field).max(500),
});

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await readBodyText(request, MAX_BODY_BYTES).catch((error: unknown) => {
    if ((error as { status?: number }).status === 413) {
      throw new BuilderApiError(
        413,
        "payload_too_large",
        "That file is too large (at most 25 MB).",
      );
    }
    throw error;
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BuilderApiError(400, "invalid_json", "The body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BuilderApiError(
      422,
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }
  return parsed.data;
}

async function charge(deps: BuilderApiDeps, requests: RateLimitRequest[]): Promise<void> {
  const charged: RateLimitRequest[] = [];
  for (const request of requests) {
    const decision = await deps.limiter.consume(request);
    if (!decision.allowed) {
      await Promise.all(charged.map((done) => deps.limiter.refund(done)));
      throw new BuilderApiError(429, "rate_limited", "Too many requests. Try again in a moment.");
    }
    charged.push(request);
  }
}

export async function handleBuilderRequest(
  request: Request,
  sessionId: string,
  path: readonly string[],
  deps: BuilderApiDeps,
): Promise<Response> {
  try {
    return await route(request, sessionId, path, deps);
  } catch (error) {
    if (error instanceof BuilderApiError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof SignError) {
      return json(
        { error: { code: error.code, message: error.message, param: error.param ?? null } },
        error.status,
      );
    }
    console.error(`[sign] builder ${request.method} ${path.join("/")} failed:`, error);
    return json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
  }
}

function environmentOf(access: SignBuilderAccess) {
  const { template } = access;
  return {
    organizationId: template.organizationId,
    projectId: template.projectId,
    environmentId: template.environmentId,
    mode: access.sandbox ? ("sandbox" as const) : ("live" as const),
  };
}

async function overview(access: SignBuilderAccess) {
  const { template } = access;
  const scope = { organizationId: template.organizationId, environmentId: template.environmentId };
  const [object, settings] = await Promise.all([
    getSignTemplate({ ...scope, templateId: template.id }),
    getSignSettings(scope),
  ]);
  return {
    template: object,
    read_only: access.readOnly,
    sandbox: access.sandbox,
    branding: { accent_color: settings.accentColor, theme: settings.theme },
  };
}

async function route(
  request: Request,
  sessionId: string,
  path: readonly string[],
  deps: BuilderApiDeps,
): Promise<Response> {
  await charge(deps, [
    { buckets: ["sign.session"], subject: sessionId },
    // Without a client IP, one aggregate subject still bounds guessing across session ids.
    { buckets: ["sign.ip"], subject: deps.clientIp ?? "unattributed" },
  ]);
  const store = deps.store;
  if (!store)
    throw new BuilderApiError(503, "sign_unavailable", "Sign is temporarily unavailable.");
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw NOT_FOUND;
  const access = await authenticateSignBuilderSession({ id: sessionId, token, now: deps.now });
  if (!access) throw NOT_FOUND;
  const { template } = access;
  const scope = {
    organizationId: template.organizationId,
    environmentId: template.environmentId,
    templateId: template.id,
  };
  const writable = () => {
    if (access.readOnly) {
      throw new BuilderApiError(403, "read_only", "This account can't make changes right now.");
    }
  };
  const [head, id] = path;
  const method = request.method;

  if (head === undefined && method === "GET") return json(await overview(access));

  if (head === "documents" && id !== undefined && method === "GET") {
    const content = await readSignTemplateDocument({ ...scope, documentId: id, store });
    return new Response(Buffer.from(content), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (head === "documents" && id === undefined && method === "POST") {
    writable();
    const upload = await body(request, UploadSignDocumentRequest);
    await updateSignTemplate(store, {
      ...scope,
      environment: environmentOf(access),
      apiKeyId: null,
      params: { documents: [{ filename: upload.filename, content: upload.content }] },
      append: true,
    });
    return json(await overview(access));
  }

  if (head === undefined && method === "PUT") {
    writable();
    const input = await body(request, SaveInput);
    const current = await getSignTemplate(scope);
    // Only the template's own documents (kept, dropped or reordered).
    for (const documentId of input.documents) {
      if (!current.documents.some((document) => document.id === documentId)) {
        throw new BuilderApiError(422, "validation_error", "That document isn't this template's.");
      }
    }
    await updateSignTemplate(store, {
      ...scope,
      environment: environmentOf(access),
      apiKeyId: null,
      params: {
        name: input.name,
        title: input.title || null,
        message: input.message || null,
        signing_order: input.signing_order,
        documents: input.documents.map((documentId) => ({ document_id: documentId })),
        roles: input.roles,
        fields: input.fields.map((field) => ({
          role: field.role,
          type: field.type,
          document: field.document,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          required: field.required,
          ...(field.label ? { label: field.label } : {}),
          ...(field.merge_key && field.type === "text" ? { merge_key: field.merge_key } : {}),
        })),
      },
    });
    return json(await overview(access));
  }

  throw new BuilderApiError(404, "not_found", "No such route.");
}
