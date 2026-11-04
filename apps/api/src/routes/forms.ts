/**
 * Forms over the public API: forms (`/v1/forms`) and their submissions. The endpoint people post
 * to is `routes/forms-public.ts`; these routes manage it.
 */
import type { UsageGate } from "@coss/billing/gate";
import { authorizeLiveSender } from "@coss/email";
import {
  createForm,
  deleteForm,
  deleteFormSubmission,
  type FormChecks,
  type FormFileStore,
  getForm,
  getFormSubmission,
  hostedPageScreening,
  listFormSubmissions,
  listForms,
  readFormSubmissionFile,
  releaseSubmission,
  updateForm,
} from "@coss/forms";
import {
  CreateFormRequest,
  DeletedForm,
  DeletedFormSubmission,
  FormList,
  FormObject,
  FormSubmissionList,
  FormSubmissionObject,
  ListFormSubmissionsQuery,
  ListFormsQuery,
  UpdateFormRequest,
} from "@coss/forms/schemas";
import type { RiskDeps } from "@coss/risk";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { attachmentDisposition } from "./received-emails.ts";

const TAG_FORMS = "Forms";
const TAG_SUBMISSIONS = "Form submissions";

const FormIdParams = z.object({
  id: z
    .string()
    .meta({ description: "The form's id.", examples: ["form_01kd2m8n3p4q5r6s7t8v9w0x1y"] }),
});
const SubmissionParams = FormIdParams.extend({
  submission_id: z.string().meta({
    description: "The submission's id.",
    examples: ["fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"],
  }),
});
const FileParams = SubmissionParams.extend({
  file_id: z.string().meta({
    description: "The file's id (`files[].id` of the submission).",
    examples: ["ffile_01kd2m9a0b1c2d3e4f5g6h7j8m"],
  }),
});

const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};
const queryError = errorDoc(
  "A query parameter failed validation (`validation_error`, see `issues`).",
);
const formNotFound = errorDoc(
  "No form with this id exists in the API key's environment (`not_found`).",
);
const submissionNotFound = errorDoc(
  "No such form, or no submission with this id in it (`not_found`).",
);
const unavailable = errorDoc("Forms isn't available in this deployment yet (`forms_unavailable`).");
const invalidForm = errorDoc(
  "The body failed validation (`validation_error`), or the form can't be saved: duplicate or " +
    "misplaced fields (`invalid_fields`), an origin or redirect that isn't https " +
    "(`invalid_origin`, `invalid_redirect`), a sender or recipient that isn't verified " +
    "(`invalid_sender`, `invalid_recipient`), an unknown audience, topic or property " +
    "(`invalid_contacts`), no captcha in the risk settings (`captcha_not_configured`), a hosted " +
    "page without fields or asking for credentials (`hosted_needs_fields`, " +
    "`hosted_content_refused`), a blocked file type or uploads turned off while a `file` field " +
    "remains (`invalid_files`), or too many forms (`form_limit_reached`).",
);

export const createFormRoute = createRoute({
  method: "post",
  path: "/forms",
  operationId: "createForm",
  tags: [TAG_FORMS],
  summary: "Create a form",
  description:
    "A hosted form endpoint: point an HTML `<form action>` (or `coss/forms`) at its `endpoint`. " +
    "Every submission is screened by Risk (the honeypot, captcha, email, IP, device, velocity " +
    "and content) and accepted ones go to webhooks (`form.submission.received`), notification " +
    "emails and contacts. Without `fields`, any field is accepted.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ form: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/forms"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: CreateFormRequest } } },
  },
  responses: {
    201: jsonDoc("The form.", FormObject),
    ...commonErrors,
    ...bodyErrors,
    422: invalidForm,
    503: unavailable,
  },
});

export const listFormsRoute = createRoute({
  method: "get",
  path: "/forms",
  operationId: "listForms",
  tags: [TAG_FORMS],
  summary: "List forms",
  description: "The environment's forms, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["read"] }), rateLimit("api.read")],
  request: { query: ListFormsQuery },
  responses: {
    200: jsonDoc("A page of forms.", FormList),
    ...commonErrors,
    422: queryError,
    503: unavailable,
  },
});

export const getFormRoute = createRoute({
  method: "get",
  path: "/forms/{id}",
  operationId: "getForm",
  tags: [TAG_FORMS],
  summary: "Get a form",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["read"] }), rateLimit("api.read")],
  request: { params: FormIdParams },
  responses: {
    200: jsonDoc("The form.", FormObject),
    ...commonErrors,
    404: formNotFound,
    503: unavailable,
  },
});

export const updateFormRoute = createRoute({
  method: "patch",
  path: "/forms/{id}",
  operationId: "updateForm",
  tags: [TAG_FORMS],
  summary: "Update a form",
  description: "Only the fields given change, within each group (`spam`, `contacts`, …) too.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ form: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/forms/{id}"),
  ] as const,
  request: {
    params: FormIdParams,
    body: { required: true, content: { "application/json": { schema: UpdateFormRequest } } },
  },
  responses: {
    200: jsonDoc("The form.", FormObject),
    ...commonErrors,
    ...bodyErrors,
    404: formNotFound,
    409: errorDoc(
      "Other updates of this form kept racing this one (`form_conflict`). Retry after " +
        "`Retry-After` seconds.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    422: invalidForm,
    503: unavailable,
  },
});

export const deleteFormRoute = createRoute({
  method: "delete",
  path: "/forms/{id}",
  operationId: "deleteForm",
  tags: [TAG_FORMS],
  summary: "Delete a form",
  description:
    "Deletes the form with every submission and uploaded file. Its endpoint answers 404 from then on.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["delete"] }), rateLimit("api.write")],
  request: { params: FormIdParams },
  responses: {
    200: jsonDoc("The form was deleted.", DeletedForm),
    ...commonErrors,
    404: formNotFound,
    503: unavailable,
  },
});

export const listFormSubmissionsRoute = createRoute({
  method: "get",
  path: "/forms/{id}/submissions",
  operationId: "listFormSubmissions",
  tags: [TAG_SUBMISSIONS],
  summary: "List a form's submissions",
  description:
    "Newest first. `status` narrows them: `accepted` (delivered), `held` (Risk asked for a " +
    "review), `spam` and `pending_confirmation` (waiting for the submitter's email link).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["read"] }), rateLimit("api.read")],
  request: { params: FormIdParams, query: ListFormSubmissionsQuery },
  responses: {
    200: jsonDoc("A page of submissions.", FormSubmissionList),
    ...commonErrors,
    404: formNotFound,
    422: queryError,
  },
});

export const getFormSubmissionRoute = createRoute({
  method: "get",
  path: "/forms/{id}/submissions/{submission_id}",
  operationId: "getFormSubmission",
  tags: [TAG_SUBMISSIONS],
  summary: "Get a submission",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["read"] }), rateLimit("api.read")],
  request: { params: SubmissionParams },
  responses: {
    200: jsonDoc("The submission.", FormSubmissionObject),
    ...commonErrors,
    404: submissionNotFound,
  },
});

export const deleteFormSubmissionRoute = createRoute({
  method: "delete",
  path: "/forms/{id}/submissions/{submission_id}",
  operationId: "deleteFormSubmission",
  tags: [TAG_SUBMISSIONS],
  summary: "Delete a submission",
  description: "Deletes the submission and its files.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["delete"] }), rateLimit("api.write")],
  request: { params: SubmissionParams },
  responses: {
    200: jsonDoc("The submission was deleted.", DeletedFormSubmission),
    ...commonErrors,
    404: submissionNotFound,
  },
});

export const releaseFormSubmissionRoute = createRoute({
  method: "post",
  path: "/forms/{id}/submissions/{submission_id}/release",
  operationId: "releaseFormSubmission",
  tags: [TAG_SUBMISSIONS],
  summary: "Release a submission",
  description:
    "Not spam: a `held` or `spam` submission becomes `accepted` and is delivered (webhooks, " +
    "notifications, contacts), and Risk records its assessment as `legitimate`. Releasing an " +
    "accepted submission returns it as is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["update"] }), rateLimit("api.write")],
  request: { params: SubmissionParams },
  responses: {
    200: jsonDoc("The released submission.", FormSubmissionObject),
    ...commonErrors,
    404: submissionNotFound,
    422: errorDoc("Only held and spam submissions can be released (`submission_not_releasable`)."),
  },
});

export const getFormSubmissionFileRoute = createRoute({
  method: "get",
  path: "/forms/{id}/submissions/{submission_id}/files/{file_id}",
  operationId: "getFormSubmissionFile",
  tags: [TAG_SUBMISSIONS],
  summary: "Download a file",
  description:
    "A file uploaded with the submission, as `application/octet-stream`: whatever its type, " +
    "treat it as untrusted (a submitter chose it).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ form: ["read"] }), rateLimit("api.read")],
  request: { params: FileParams },
  responses: {
    200: {
      description: "The file's bytes.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "application/octet-stream": { schema: z.string().meta({ format: "binary" }) } },
    },
    ...commonErrors,
    404: errorDoc("No such form, submission or file (`not_found`)."),
    503: unavailable,
  },
});

export type FormRouteDeps = {
  /** Where forms are served (`FORMS_PUBLIC_URL`); `null`: Forms isn't available. */
  formsUrl: string | null;
  store: FormFileStore | null;
  riskDeps: RiskDeps;
  /** The live email provider: senders and recipients must be on domains it verified. */
  liveProvider: string;
  /** Capped plans' `forms.submissions`, reserved when a submission is released. */
  billing?: UsageGate | undefined;
};

export function createFormRoutes(deps: FormRouteDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const checks: FormChecks = {
    screenHostedPage: hostedPageScreening(deps.riskDeps),
    async verifiedAddress({ organizationId, address }) {
      try {
        await authorizeLiveSender({ organizationId, from: address, provider: deps.liveProvider });
        return true;
      } catch {
        return false;
      }
    },
  };

  function links(): { publicUrl: string } {
    if (!deps.formsUrl) {
      throw new ApiError(503, {
        type: "api_error",
        code: "forms_unavailable",
        message: "Forms isn't available in this deployment yet.",
      });
    }
    return { publicUrl: deps.formsUrl };
  }

  router.openapi(createFormRoute, async (c) => {
    const params = c.req.valid("json");
    const { apiKeyId, organizationId, projectId, environmentId, mode } = c.var.auth;
    const form = await createForm({ organizationId, projectId, environmentId, mode }, params, {
      links: links(),
      apiKeyId,
      checks,
    });
    await recordApiAudit(c, {
      action: "form.created",
      target: { type: "form", id: form.id, label: form.name },
    });
    return c.json(form, 201);
  });

  router.openapi(listFormsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listForms({ organizationId, environmentId, ...query }, links());
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getFormRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getForm({ organizationId, environmentId, formId: id }, links()), 200);
  });

  router.openapi(updateFormRoute, async (c) => {
    const { id } = c.req.valid("param");
    const params = c.req.valid("json");
    const { organizationId, projectId, environmentId, mode } = c.var.auth;
    const form = await updateForm({ organizationId, projectId, environmentId, mode }, id, params, {
      links: links(),
      checks,
    });
    await recordApiAudit(c, {
      action: "form.updated",
      target: { type: "form", id: form.id, label: form.name },
      metadata: { fields: Object.keys(params) },
    });
    return c.json(form, 200);
  });

  router.openapi(deleteFormRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    await deleteForm({ organizationId, environmentId, formId: id }, deps.store);
    await recordApiAudit(c, { action: "form.deleted", target: { type: "form", id } });
    return c.json({ object: "form" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listFormSubmissionsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listFormSubmissions({ organizationId, environmentId, formId: id, ...query });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getFormSubmissionRoute, async (c) => {
    const { id, submission_id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(
      await getFormSubmission({
        organizationId,
        environmentId,
        formId: id,
        submissionId: submission_id,
      }),
      200,
    );
  });

  router.openapi(deleteFormSubmissionRoute, async (c) => {
    const { id, submission_id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    await deleteFormSubmission(
      { organizationId, environmentId, formId: id, submissionId: submission_id },
      deps.store,
    );
    await recordApiAudit(c, {
      action: "form_submission.deleted",
      target: { type: "form_submission", id: submission_id },
      metadata: { form_id: id },
    });
    return c.json(
      { object: "form_submission" as const, id: submission_id, deleted: true as const },
      200,
    );
  });

  router.openapi(releaseFormSubmissionRoute, async (c) => {
    const { id, submission_id } = c.req.valid("param");
    const { organizationId, environmentId, apiKeyId } = c.var.auth;
    const scope = { organizationId, environmentId, formId: id, submissionId: submission_id };
    // The submission must be the form's (releasing goes by the environment only).
    await getFormSubmission(scope);
    await releaseSubmission(scope, {
      actor: { kind: "api_key", apiKeyId },
      riskHash: deps.riskDeps.hash,
      ...(deps.billing ? { billing: deps.billing } : {}),
    });
    await recordApiAudit(c, {
      action: "form_submission.released",
      target: { type: "form_submission", id: submission_id },
      metadata: { form_id: id },
    });
    return c.json(await getFormSubmission(scope), 200);
  });

  router.openapi(getFormSubmissionFileRoute, async (c) => {
    const { id, submission_id, file_id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const file = await readFormSubmissionFile(
      { organizationId, environmentId, formId: id, submissionId: submission_id, fileId: file_id },
      deps.store,
    );
    return c.body(file.content as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": attachmentDisposition(file.filename),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "no-store",
    });
  });

  return router;
}
