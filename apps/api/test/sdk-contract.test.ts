/**
 * Contract test: the published `coss` SDK (built dist) against the real app, in process.
 * Wire-level drift between the API and the SDK's hand-written types fails here or in
 * contract-types.ts (compile time).
 */

import { describe, expect, test } from "bun:test";
import { createCreditGrant, runDueBillingPeriods } from "@coss/billing";
import { createTestContract, recordTestUsage } from "@coss/billing/testing";
import { db } from "@coss/db";
import { newId } from "@coss/db/id";
import {
  buildTestMessage,
  dmarcReportAddress,
  ensureOrgTenant,
  FakeDedicatedIpProvider,
  FakeIdentityProvider,
  receiveFakeEmail,
  receiveSampleDmarcReport,
  reconcileDedicatedIpPools,
} from "@coss/email";
import { WEBHOOK_EVENT_TYPES } from "@coss/email/schemas";
import { TEST_WEBHOOK_EVENT_TYPES } from "@coss/email/test-event-schemas";
import { createVerifiedDomain, trackingUrls } from "@coss/email/testing";
import { createLogWriter } from "@coss/logs";
import { cachedOverrides, setRateLimitOverride } from "@coss/ratelimit";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { suspendOrganization } from "@coss/reputation";
import { runDueReassignments } from "@coss/scheduling";
import { testSchedulingDeps } from "@coss/scheduling/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { API_VERSIONS, LATEST_API_VERSION } from "@coss/versioning";
import {
  enqueueWebhookMessage,
  runDueLogDrainDeliveries,
  runDueWebhookDeliveries,
} from "@coss/webhooks";
import { TEST_SECRETS_KEYS, testSender, webhookReceiver } from "@coss/webhooks/testing";
import {
  API_VERSION,
  Coss,
  type CossOptions,
  API_VERSIONS as SDK_API_VERSIONS,
  TEST_WEBHOOK_EVENT_TYPES as SDK_TEST_WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_TYPES as SDK_WEBHOOK_EVENT_TYPES,
  verifyLogDrainBatch,
  verifyWebhook,
  WebhookVerificationError,
} from "coss";
import { collectDevice } from "coss/device";
import {
  createTestApp,
  domainFrom,
  REQUEST_ID,
  TEST_INBOUND_DOMAIN,
  type TestApp,
  TRACKING_BASE_URL,
  uniqueDomainName,
} from "./helpers.ts";

function toRequest(input: string | URL | Request, init?: RequestInit): Request {
  // bun-types has no `new Request(URL)` overload.
  return input instanceof Request ? new Request(input, init) : new Request(String(input), init);
}

/** The value, which the test expects to be there. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

function clientFor(app: TestApp, apiKey: string, options: Partial<CossOptions> = {}): Coss {
  return new Coss({
    apiKey,
    baseUrl: "http://api.test",
    // Straight into the app's fetch handler: no network, but real Request/Response objects.
    fetch: (input, init) => Promise.resolve(app.fetch(toRequest(input, init))),
    ...options,
  });
}

describe("API versions", () => {
  test("the SDK requests the latest API version, and knows every version", async () => {
    expect(API_VERSION).toBe(LATEST_API_VERSION);
    expect([...SDK_API_VERSIONS]).toEqual([...API_VERSIONS]);

    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const versions: (string | null)[] = [];
    const coss = clientFor(app, tenant.sandboxKey, {
      fetch: async (input, init) => {
        const res = await app.fetch(toRequest(input, init));
        versions.push(res.headers.get("coss-version"));
        return res;
      },
    });
    await coss.domains.list();
    expect(versions).toEqual([API_VERSION]);

    const created = await coss.webhookEndpoints.create({
      url: "https://example.com/hook",
      api_version: API_VERSION,
    });
    expect(created.data?.api_version).toBe(API_VERSION);
  });
});

describe("coss SDK against the API", () => {
  test("send then get round-trips the same email", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const sent = await coss.email.send({
      from: "Acme <hello@acme.com>",
      to: "user@example.com",
      cc: ["copy@example.com"],
      subject: "Welcome",
      html: "<p>Hello!</p>",
      headers: { "X-Campaign": "fall" },
      tags: [{ name: "category", value: "welcome" }],
      attachments: [{ filename: "notes.txt", content: btoa("hi") }],
    });

    expect(sent.error).toBeNull();
    expect(sent.data).toMatchObject({
      object: "email",
      to: ["user@example.com"],
      cc: ["copy@example.com"],
      headers: { "x-campaign": "fall" },
      tags: [{ name: "category", value: "welcome" }],
      attachments: [
        { filename: "notes.txt", content_type: "text/plain", content_id: null, size: 2 },
      ],
      status: "queued",
      sandbox: true,
    });
    if (!sent.data) throw new Error("send failed");

    const fetched = await coss.email.get(sent.data.id);
    expect(fetched).toEqual({ data: sent.data, error: null });

    await dispatch();
    const dispatched = await coss.email.get(sent.data.id);
    expect(dispatched.data).toMatchObject({ id: sent.data.id, status: "sent" });
    expect(sandboxProvider.sent).toHaveLength(1);
  });

  test("email templates: create, draft, publish, send by alias, versions and restore", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const created = await coss.email.templates.create({
      name: "Receipt",
      alias: "receipt",
      variables: [
        { name: "first_name", type: "string" },
        {
          name: "items",
          type: "list",
          fields: [
            { name: "name", type: "string" },
            { name: "price", type: "number" },
          ],
        },
      ],
      contents: [
        {
          locale: "en",
          subject: "Your receipt, {{first_name}}",
          html: "{{#each items}}<li>{{name}}: {{price}}</li>{{/each}}",
        },
      ],
    });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ alias: "receipt", published_version: null });

    const draft = await coss.email.templates.getDraft("receipt");
    expect(draft.data).toMatchObject({ version: null, revision: 1, problems: [] });
    const updated = await coss.email.templates.updateDraft("receipt", {
      revision: 1,
      variables: draft.data?.variables,
      contents: [
        ...(draft.data?.contents ?? []),
        { locale: "fr", subject: "Votre reçu, {{first_name}}", text: "Merci !" },
      ],
    });
    expect(updated.data?.revision).toBe(2);
    const published = await coss.email.templates.publish("receipt", { revision: 2 });
    expect(published.data).toMatchObject({ version: 1, revision: 2 });
    const rendered = await coss.email.templates.render("receipt", {
      version: 1,
      locale: "fr-CA",
      variables: { first_name: "Ada", items: [] },
    });
    expect(rendered.error).toBeNull();
    expect(rendered.data).toEqual({
      object: "email_template_render",
      template_id: created.data?.id ?? "",
      version: 1,
      locale: "fr",
      subject: "Votre reçu, Ada",
      html: null,
      text: "Merci !",
    });

    const sent = await coss.email.send({
      from: "Acme <billing@acme.com>",
      to: "user@example.com",
      template_id: "receipt",
      locale: "fr-CA",
      variables: { first_name: "Ada", items: [{ name: "Pro", price: 20 }] },
    });
    expect(sent.data).toMatchObject({
      subject: "Votre reçu, Ada",
      text: "Merci !",
      template: { id: created.data?.id, version: 1, locale: "fr" },
    });
    const english = await coss.email.send({
      from: "Acme <billing@acme.com>",
      to: "user@example.com",
      template_id: "receipt",
      variables: { first_name: "Ada", items: [{ name: "Pro", price: 20 }] },
    });
    expect(english.data?.html).toBe("<li>Pro: 20</li>");
    await dispatch();
    expect(sandboxProvider.sent.map((message) => message.subject)).toEqual([
      "Votre reçu, Ada",
      "Your receipt, Ada",
    ]);

    const invalid = await coss.email.send({
      from: "Acme <billing@acme.com>",
      to: "user@example.com",
      template_id: "receipt",
      variables: {},
    });
    expect(invalid.error).toMatchObject({
      type: "invalid_request_error",
      code: "invalid_template_variables",
    });

    const versions = await coss.email.templates.versions.list("receipt");
    expect(versions.data?.data.map((version) => version.version)).toEqual([1]);
    expect((await coss.email.templates.versions.get("receipt", 1)).data?.version).toBe(1);
    expect((await coss.email.templates.versions.restore("receipt", 1)).data?.revision).toBe(3);
    expect((await coss.email.templates.update("receipt", { alias: null })).data?.alias).toBeNull();
    if (!created.data) throw new Error("create failed");
    const list = await coss.email.templates.list({ limit: 10 });
    expect(list.data?.data.map((template) => template.id)).toEqual([created.data.id]);
    expect((await coss.email.templates.get(created.data.id)).data?.name).toBe("Receipt");
    expect((await coss.email.templates.delete(created.data.id)).data).toEqual({
      object: "email_template",
      id: created.data.id,
      deleted: true,
    });
  });

  test("recipients and events report simulated delivery outcomes", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const sent = await coss.email.send({
      from: "hello@acme.com",
      to: ["success@simulator.amazonses.com", "bounce@simulator.amazonses.com"],
      subject: "Hi",
      text: "Hi",
    });
    if (!sent.data) throw new Error("send failed");
    await dispatch();
    const fetched = await coss.email.get(sent.data.id);
    expect(fetched.data?.recipients.map((r) => [r.address, r.status])).toEqual([
      ["success@simulator.amazonses.com", "delivered"],
      ["bounce@simulator.amazonses.com", "bounced"],
    ]);

    const events = await coss.email.listEvents(sent.data.id);
    expect(events.error).toBeNull();
    expect(events.data?.data.map((e) => [e.type, e.recipient])).toEqual([
      ["email.sent", null],
      ["email.delivered", "success@simulator.amazonses.com"],
      ["email.bounced", "bounce@simulator.amazonses.com"],
    ]);
  });

  test("list finds emails by recipient and status, pages, and reports failures", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const delivered = await coss.email.send({
      from: "hello@acme.com",
      to: "Ada@Example.com",
      cc: ["copy@example.com"],
      subject: "Welcome",
      html: "<p>Hi</p>",
      category: "onboarding",
    });
    const bounced = await coss.email.send({
      from: "hello@acme.com",
      to: ["ada@example.com", "bounce@simulator.amazonses.com"],
      subject: "Second",
      text: "Hi",
    });
    await coss.email.suppressions.add({ address: "gone@example.com" });
    const suppressed = await coss.email.send({
      from: "hello@acme.com",
      to: "gone@example.com",
      subject: "Nobody",
      text: "Hi",
    });
    if (!delivered.data || !bounced.data || !suppressed.data) throw new Error("send failed");
    await dispatch();

    const byRecipient = await coss.email.list({ to: "ADA@example.com" });
    expect(byRecipient.error).toBeNull();
    expect(byRecipient.data?.data.map((e) => e.id)).toEqual([bounced.data.id, delivered.data.id]);
    expect(byRecipient.data?.has_more).toBe(false);
    const summary = byRecipient.data?.data[1];
    expect(summary).toMatchObject({
      object: "email",
      subject: "Welcome",
      category: "onboarding",
      status: "sent",
      failure: null,
      recipients: [
        { address: "ada@example.com", type: "to", status: "delivered" },
        { address: "copy@example.com", type: "cc", status: "delivered" },
      ],
    });
    // No content in lists.
    expect(summary && "html" in summary).toBe(false);
    expect((await coss.email.list({ to: "copy@example.com" })).data?.data.map((e) => e.id)).toEqual(
      [delivered.data.id],
    );

    const bounces = await coss.email.list({ recipient_status: ["bounced"] });
    expect(bounces.data?.data.map((e) => e.id)).toEqual([bounced.data.id]);
    // With `to`, the status is that recipient's.
    expect(
      (await coss.email.list({ to: "ada@example.com", recipient_status: ["bounced"] })).data?.data,
    ).toEqual([]);

    const failed = await coss.email.list({ status: ["failed"] });
    expect(failed.data?.data).toHaveLength(1);
    expect(failed.data?.data[0]).toMatchObject({
      id: suppressed.data.id,
      failure: {
        code: "all_recipients_suppressed",
        message: "Every recipient is on the suppression list or unsubscribed.",
      },
      recipients: [{ address: "gone@example.com", status: "suppressed" }],
    });
    expect((await coss.email.get(suppressed.data.id)).data?.failure).toEqual(
      failed.data?.data[0]?.failure ?? null,
    );

    const first = await coss.email.list({ limit: 2 });
    expect(first.data?.data.map((e) => e.id)).toEqual([suppressed.data.id, bounced.data.id]);
    expect(first.data?.has_more).toBe(true);
    const second = await coss.email.list({ limit: 2, after: bounced.data.id });
    expect(second.data).toEqual({
      object: "list",
      data: [expect.objectContaining({ id: delivered.data.id })],
      has_more: false,
    });
    expect(
      (await coss.email.list({ created_after: new Date(Date.now() + 60_000) })).data?.data,
    ).toEqual([]);
    expect((await coss.email.list({ q: "welc" })).data?.data.map((e) => e.id)).toEqual([
      delivered.data.id,
    ]);

    // Emails of the other environment are not listed.
    const live = clientFor(app, tenant.liveKey);
    expect((await live.email.list({ to: "ada@example.com" })).data?.data).toEqual([]);

    const invalid = await coss.email.list({ status: ["lost" as "sent"] });
    expect(invalid.error).toMatchObject({ type: "invalid_request_error", param: "status" });
  });

  test("tracking: send, hit the pixel and a link, then read engagement back", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const sent = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Hi",
      html: '<p><a href="https://acme.com/start">Start</a></p>',
      tracking: { opens: true, clicks: true },
    });
    if (!sent.data) throw new Error("send failed");
    expect(sent.data.tracking).toMatchObject({ opens: true, clicks: true, open_count: 0 });
    await dispatch();
    const { open, clicks } = trackingUrls(sandboxProvider.sent.at(-1)?.html ?? "");
    for (const url of [open ?? "", clicks[0] ?? ""]) {
      await app.request(url.slice(TRACKING_BASE_URL.length));
    }

    const fetched = await coss.email.get(sent.data.id);
    expect(fetched.data?.tracking).toMatchObject({ open_count: 1, click_count: 1 });
    const events = await coss.email.listEvents(sent.data.id);
    expect(events.data?.data.map((e) => e.type)).toEqual(
      expect.arrayContaining(["email.opened", "email.clicked"]),
    );
    const links = await coss.email.listLinks(sent.data.id);
    expect(links.error).toBeNull();
    expect(links.data?.data).toEqual([
      expect.objectContaining({
        object: "email_link",
        url: "https://acme.com/start",
        click_count: 1,
      }),
    ]);
  });

  test("an SDK retry with the same idempotency key does not send twice", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const params = { from: "hello@acme.com", to: "user@example.com", subject: "Hi", text: "Hi" };
    const idempotencyKey = crypto.randomUUID();

    const first = await coss.email.send(params, { idempotencyKey });
    const second = await coss.email.send(params, { idempotencyKey });

    expect(second.data?.id).toBe(first.data?.id ?? "missing");
    await dispatch();
    expect(sandboxProvider.sent).toHaveLength(1);
  });

  test("sendBatch sends every email once, even when retried with the same key", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const emails = [
      { from: "hello@acme.com", to: "a@example.com", subject: "Hi", text: "Hi" },
      { from: "hello@acme.com", to: "b@example.com", subject: "Hi", text: "Hi" },
    ];
    const idempotencyKey = crypto.randomUUID();

    const first = await coss.email.sendBatch(emails, { idempotencyKey });
    const second = await coss.email.sendBatch(emails, { idempotencyKey });

    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ object: "email_batch" });
    expect(first.data?.data.map((email) => [email.to, email.batch_id])).toEqual([
      [["a@example.com"], first.data?.id ?? "missing"],
      [["b@example.com"], first.data?.id ?? "missing"],
    ]);
    expect(second.data?.id).toBe(first.data?.id ?? "missing");
    await dispatch();
    expect(sandboxProvider.sent).toHaveLength(2);

    const invalid = await coss.email.sendBatch([
      { from: "hello@acme.com", to: "a@example.com", subject: "Hi", text: "Hi" },
      { from: "hello@acme.com", to: "nope", subject: "Hi", text: "Hi" },
    ]);
    expect(invalid.error).toMatchObject({
      type: "invalid_request_error",
      code: "validation_error",
    });
    expect(invalid.error?.issues?.map((issue) => issue.path)).toEqual(["emails.1.to"]);
  });

  test("getBatch reads a batch back with its emails' current statuses", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const batch = await coss.email.sendBatch([
      { from: "hello@acme.com", to: "a@example.com", subject: "One", text: "Hi" },
      { from: "hello@acme.com", to: "b@example.com", subject: "Two", text: "Hi" },
    ]);
    await dispatch();

    const read = await coss.email.getBatch(batch.data?.id ?? "");
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(batch.data?.id ?? "missing");
    expect(read.data?.data.map((email) => [email.subject, email.status])).toEqual([
      ["One", "sent"],
      ["Two", "sent"],
    ]);
    expect((await coss.email.getBatch("batch_01k8d0n6x5f3w2e1r9t7y4u6i8")).error).toMatchObject({
      type: "not_found_error",
      status: 404,
    });
  });

  test("an invalid key maps to authentication_error with the request id", async () => {
    const { app } = createTestApp();
    const coss = clientFor(app, `coss_test_${"z".repeat(64)}`, { maxRetries: 0 });

    const result = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Hi",
      text: "Hi",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      type: "authentication_error",
      code: "invalid_api_key",
      status: 401,
    });
    expect(result.error?.request_id).toMatch(REQUEST_ID);
  });

  test("a used-up send quota maps to rate_limit_error without waiting", async () => {
    const tenant = await createTestTenant();
    await setRateLimitOverride({
      organizationId: tenant.organization.id,
      bucket: "email.sandbox_recipients.day",
      rule: { limit: 1, periodMs: 86_400_000 },
    });
    const { app } = createTestApp({ rateLimiter: memoryLimiter({ overrides: cachedOverrides() }) });
    // Default retries: a Retry-After of hours is returned, not slept on.
    const coss = clientFor(app, tenant.sandboxKey);
    const email = { from: "hello@acme.com", to: "user@example.com", subject: "Hi", text: "Hi" };

    expect((await coss.email.send(email)).error).toBeNull();
    const result = await coss.email.send(email);
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      type: "rate_limit_error",
      code: "quota_exceeded",
      status: 429,
    });
  });

  test("validation errors map param and issues", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey, { maxRetries: 0 });

    const result = await coss.email.send({
      from: "hello@acme.com",
      to: ["user@example.com", "nope"],
      subject: "Hi",
      text: "Hi",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      type: "invalid_request_error",
      code: "validation_error",
      status: 422,
      param: "to.1",
    });
    expect(result.error?.issues).toEqual([{ path: "to.1", message: expect.any(String) }]);
  });

  test("an email from another environment maps to not_found_error", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const sandbox = clientFor(app, tenant.sandboxKey);
    const live = clientFor(app, tenant.liveKey, { maxRetries: 0 });

    const sent = await sandbox.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Hi",
      text: "Hi",
    });
    const result = await live.email.get(sent.data?.id ?? "missing");

    expect(result.error).toMatchObject({ type: "not_found_error", status: 404 });
  });

  test("suppressions: add, check, list, get, remove, and a category send skips the address", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const added = await coss.email.suppressions.add({
      address: "Jane <Jane@Example.com>",
      scope: "marketing",
    });
    expect(added.error).toBeNull();
    expect(added.data).toMatchObject({
      object: "suppression",
      address: "jane@example.com",
      scope: "marketing",
      reason: "manual",
      email_id: null,
    });
    if (!added.data) throw new Error("add failed");
    expect(
      (await coss.email.suppressions.add({ address: "jane@example.com", scope: "marketing" })).data,
    ).toEqual(added.data);

    const check = await coss.email.suppressions.check({
      address: "jane@example.com",
      category: "marketing",
    });
    expect(check).toEqual({
      data: {
        object: "suppression_check",
        address: "jane@example.com",
        suppressed: true,
        suppressions: [added.data],
      },
      error: null,
    });
    expect(
      (await coss.email.suppressions.check({ address: "jane@example.com" })).data?.suppressed,
    ).toBe(false);
    expect(await coss.email.suppressions.list({ scope: "marketing", limit: 10 })).toEqual({
      data: { object: "list", data: [added.data], has_more: false },
      error: null,
    });
    expect(await coss.email.suppressions.get(added.data.id)).toEqual({
      data: added.data,
      error: null,
    });

    const skipped = await coss.email.send({
      from: "hello@acme.com",
      to: ["jane@example.com", "joe@example.com"],
      subject: "Sale",
      text: "Sale",
      category: "marketing",
    });
    expect(skipped.data?.category).toBe("marketing");
    // Suppressed at send time, before dispatch.
    expect(skipped.data?.recipients.map((r) => [r.address, r.status])).toEqual([
      ["jane@example.com", "suppressed"],
      ["joe@example.com", "queued"],
    ]);
    await dispatch();
    const dispatched = await coss.email.get(skipped.data?.id ?? "");
    expect(dispatched.data?.recipients.map((r) => [r.address, r.status])).toEqual([
      ["jane@example.com", "suppressed"],
      ["joe@example.com", "delivered"],
    ]);
    expect(sandboxProvider.sent.at(-1)?.to).toEqual(["joe@example.com"]);
    const events = await coss.email.listEvents(skipped.data?.id ?? "");
    expect(events.data?.data.find((e) => e.type === "email.suppressed")).toMatchObject({
      recipient: "jane@example.com",
      data: { suppression: { id: added.data.id, scope: "marketing", reason: "manual" } },
    });

    expect(await coss.email.suppressions.remove(added.data.id)).toEqual({
      data: { object: "suppression", id: added.data.id, deleted: true },
      error: null,
    });
    const gone = await coss.email.suppressions.get(added.data.id);
    expect(gone.error).toMatchObject({ type: "not_found_error", code: "not_found", status: 404 });
    const validation = await coss.email.suppressions.add({ address: "nope", scope: "*" });
    expect(validation.error).toMatchObject({ type: "invalid_request_error", param: "address" });
  });
});

describe("coss.email.suppressions bulk import and export against the API", () => {
  test("import batches large lists, and export returns CSV that imports again", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const suppressions = Array.from({ length: 1500 }, (_, i) => ({
      address: `user${i}@example.com`,
    }));
    suppressions.push({ address: "nope" }, { address: "user0@example.com" });

    expect(await coss.email.suppressions.import({ suppressions })).toEqual({
      data: {
        object: "suppression_import",
        created: 1500,
        existing: 1,
        invalid: [{ index: 1500, address: "nope", message: expect.any(String) }],
      },
      error: null,
    });

    const exported = await coss.email.suppressions.export({ reason: "import" });
    const lines = exported.data?.trimEnd().split("\r\n") ?? [];
    expect(lines).toHaveLength(1501);
    expect(lines[1]).toMatch(/^user\d+@example\.com,\*,import,[^,]+,,sup_\w+$/);

    const other = clientFor(app, tenant.liveKey);
    const rows = lines.slice(1).map((line) => {
      const [address = "", scope] = line.split(",");
      return { address, scope };
    });
    expect((await other.email.suppressions.import({ suppressions: rows })).data?.created).toBe(
      1500,
    );
  });
  test("a scheduled send can be canceled", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const scheduled = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Later",
      text: "Hi",
      scheduled_at: scheduledAt,
    });
    expect(scheduled.data).toMatchObject({ status: "scheduled", scheduled_at: scheduledAt });
    if (!scheduled.data) throw new Error("send failed");

    const canceled = await coss.email.cancel(scheduled.data.id);
    expect(canceled.error).toBeNull();
    expect(canceled.data).toMatchObject({
      status: "canceled",
      recipients: [{ status: "canceled" }],
    });
    const events = await coss.email.listEvents(scheduled.data.id);
    expect(events.data?.data.map((e) => e.type)).toEqual(["email.scheduled", "email.canceled"]);
    expect(sandboxProvider.sent).toHaveLength(0);

    const sent = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Now",
      text: "Hi",
    });
    if (!sent.data) throw new Error("send failed");
    const refused = await coss.email.cancel(sent.data.id);
    expect(refused.error).toMatchObject({ code: "email_not_cancelable", status: 422 });
  });

  test("a scheduled send can be rescheduled", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const scheduled = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Later",
      text: "Hi",
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    if (!scheduled.data) throw new Error("send failed");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const rescheduled = await coss.email.reschedule(scheduled.data.id, { scheduled_at: tomorrow });
    expect(rescheduled.error).toBeNull();
    expect(rescheduled.data).toMatchObject({ status: "scheduled", scheduled_at: tomorrow });
    const events = await coss.email.listEvents(scheduled.data.id);
    expect(events.data?.data.at(-1)).toMatchObject({
      type: "email.rescheduled",
      data: {
        reschedule: { scheduled_at: tomorrow, previous_scheduled_at: scheduled.data.scheduled_at },
      },
    });
    expect(sandboxProvider.sent).toHaveLength(0);

    await coss.email.cancel(scheduled.data.id);
    const refused = await coss.email.reschedule(scheduled.data.id, { scheduled_at: tomorrow });
    expect(refused.error).toMatchObject({ code: "email_not_reschedulable", status: 422 });
  });
});

describe("coss.domains against the API", () => {
  test("create, verify, list and delete round-trip a domain", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.liveKey);
    const name = uniqueDomainName();

    const created = await coss.domains.create({ name });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ object: "domain", name, status: "pending" });
    if (!created.data) throw new Error("create failed");
    expect(created.data.records.map((record) => record.purpose)).toContain("dkim");

    const verified = await coss.domains.verify(created.data.id);
    expect(verified.data).toMatchObject({
      id: created.data.id,
      status: "verified",
      can_send: true,
    });

    const fetched = await coss.domains.get(created.data.id);
    expect(fetched.data).toEqual(verified.data);

    const listed = await coss.domains.list();
    expect(listed.data?.data.map((domain) => domain.id)).toEqual([created.data.id]);

    const deleted = await coss.domains.delete(created.data.id);
    expect(deleted.data).toEqual({ object: "domain", id: created.data.id, deleted: true });
    expect((await coss.domains.get(created.data.id)).error).toMatchObject({
      type: "not_found_error",
      status: 404,
    });
  });

  test("an invalid name maps to invalid_request_error with the param", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.liveKey, { maxRetries: 0 });

    const result = await coss.domains.create({ name: "not a domain" });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      type: "invalid_request_error",
      code: "invalid_domain",
      status: 422,
      param: "name",
    });
    expect(result.error?.request_id).toMatch(REQUEST_ID);
  });
});

describe("coss.email.tracking against the API", () => {
  test("update, read and remove the default and category rules; sends follow them", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    expect(await coss.email.tracking.get()).toEqual({
      data: { object: "tracking_settings", default: null, categories: [] },
      error: null,
    });
    const defaultRule = await coss.email.tracking.updateDefault({ opens: true, clicks: true });
    expect(defaultRule.data).toMatchObject({ category: null, opens: true, clicks: true });
    const resetRule = await coss.email.tracking.updateCategory("password-reset", { opens: false });
    expect(resetRule.data).toMatchObject({
      object: "tracking_rule",
      category: "password-reset",
      opens: false,
      clicks: false,
    });
    expect(await coss.email.tracking.get()).toEqual({
      data: {
        object: "tracking_settings",
        default: defaultRule.data,
        categories: resetRule.data ? [resetRule.data] : [],
      },
      error: null,
    });

    const sent = await coss.email.send({
      from: "Acme <hello@acme.com>",
      to: "user@example.com",
      subject: "Reset your password",
      html: "<p>Hi</p>",
      category: "password-reset",
    });
    expect(sent.data?.tracking).toMatchObject({ opens: false, clicks: false });

    expect(await coss.email.tracking.removeCategory("password-reset")).toEqual({
      data: {
        object: "tracking_rule",
        id: resetRule.data?.id ?? "",
        category: "password-reset",
        deleted: true,
      },
      error: null,
    });
    expect((await coss.email.tracking.removeDefault()).data).toMatchObject({ deleted: true });
    const gone = await coss.email.tracking.removeDefault();
    expect(gone.error).toMatchObject({ type: "not_found_error", code: "not_found", status: 404 });
    const invalid = await coss.email.tracking.updateCategory("has space", { opens: true });
    expect(invalid.error).toMatchObject({ code: "validation_error", param: "category" });
  });
});

describe("coss.email.storage against the API", () => {
  test("switch content storage off; sent emails then keep only their metadata", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    expect(await coss.email.storage.get()).toEqual({
      data: { object: "storage_settings", content_storage: "store", updated_at: null },
      error: null,
    });
    const updated = await coss.email.storage.update({ content_storage: "discard" });
    expect(updated.data).toMatchObject({ content_storage: "discard" });
    expect((await coss.email.storage.get()).data).toEqual(updated.data);

    const sent = await coss.email.send({
      from: "Acme <hello@acme.com>",
      to: "user@example.com",
      subject: "Your results",
      html: "<p>Results</p>",
    });
    expect(sent.data?.content_storage).toEqual({ mode: "discard", discarded_at: null });
    await dispatch();
    const read = await coss.email.get(sent.data?.id ?? "");
    expect(read.data).toMatchObject({
      status: "sent",
      subject: "",
      html: null,
      content_storage: { mode: "discard", discarded_at: expect.any(String) },
    });

    // @ts-expect-error: only "store" and "discard".
    const invalid = await coss.email.storage.update({ content_storage: "forget" });
    expect(invalid.error).toMatchObject({ code: "validation_error", param: "content_storage" });
  });
});

describe("coss.domains.tracking against the API", () => {
  test("create and delete a tracking domain", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.liveKey);
    const domain = await createVerifiedDomain(tenant.organization.id);
    const hostname = `links.${domain.name}`;

    const created = await coss.domains.tracking.create(domain.id, { hostname });
    expect(created.error).toBeNull();
    expect(created.data?.tracking).toMatchObject({
      hostname,
      status: "active",
      record: { type: "CNAME", name: hostname, value: "track.coss.test" },
    });

    const again = await coss.domains.tracking.create(domain.id, { hostname: `t.${domain.name}` });
    expect(again.error).toMatchObject({ code: "tracking_domain_exists", status: 422 });

    const removed = await coss.domains.tracking.delete(domain.id);
    expect(removed.data).toMatchObject({ id: domain.id, tracking: null });
  });
});

describe("coss.domains.dmarc against the API", () => {
  test("a domain's DMARC status and reports through the SDK", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.liveKey);
    const domain = await createVerifiedDomain(tenant.organization.id);
    await receiveSampleDmarcReport(domain, TEST_INBOUND_DOMAIN);

    const status = await coss.domains.dmarc.get(domain.id);
    expect(status.error).toBeNull();
    expect(status.data).toMatchObject({
      object: "domain_dmarc",
      report_address: dmarcReportAddress(domain.dmarcReportToken, TEST_INBOUND_DOMAIN),
      report_summary: { reports: 1 },
    });
    const list = await coss.domains.dmarc.reports.list(domain.id, { limit: 10 });
    expect(list.data?.data).toHaveLength(1);
    const reportId = list.data?.data[0]?.id ?? "";
    const report = await coss.domains.dmarc.reports.get(domain.id, reportId);
    expect(report.data?.records).toHaveLength(3);
    const missing = await coss.domains.dmarc.reports.get(domain.id, "dmarcrep_missing");
    expect(missing.error).toMatchObject({ code: "not_found", status: 404 });
  });
});

describe("coss.email.received against the API", () => {
  test("a received email is listed, read, downloaded and deleted through the SDK", async () => {
    const tenant = await createTestTenant();
    const { app, inbound } = createTestApp();
    if (!inbound) throw new Error("no inbound runtime");
    const coss = clientFor(app, tenant.liveKey);
    const address = await coss.email.received.address();
    expect(address.error).toBeNull();
    const to = `orders@${address.data?.domain}`;
    const raw = buildTestMessage({
      from: "jane@example.com",
      to: [to],
      subject: "Order 42",
      text: "Where is it?",
      attachments: [
        {
          filename: "a.bin",
          contentType: "application/octet-stream",
          content: new Uint8Array([0, 255, 7]),
        },
      ],
    });
    await receiveFakeEmail(
      { raw, mailFrom: "jane@example.com", recipients: [to], subject: "Order 42" },
      inbound,
    );

    const list = await coss.email.received.list({ limit: 10 });
    expect(list.error).toBeNull();
    const id = list.data?.data[0]?.id ?? "";
    const email = await coss.email.received.get(id);
    expect(email.data).toMatchObject({
      subject: "Order 42",
      text: "Where is it?",
      recipients: [to],
    });
    const attachmentId = email.data?.attachments[0]?.id ?? "";
    expect((await coss.email.received.getAttachment(id, attachmentId)).data).toEqual(
      new Uint8Array([0, 255, 7]),
    );
    const message = await coss.email.received.getRaw(id);
    expect(new TextDecoder().decode(message.data ?? new Uint8Array())).toContain(
      "Subject: Order 42",
    );

    expect((await coss.email.received.delete(id)).data).toEqual({
      object: "received_email",
      id,
      deleted: true,
    });
    expect((await coss.email.received.getRaw(id)).error).toMatchObject({
      type: "not_found_error",
      status: 404,
    });
  });

  test("receiving domains are created for the key's environment", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const domain = await createVerifiedDomain(tenant.organization.id);
    const created = await coss.domains.receiving.create(domain.id, { hostname: domain.name });
    expect(created.data?.receiving).toMatchObject({
      hostname: domain.name,
      environment_id: tenant.development.id,
    });
    expect((await coss.domains.receiving.delete(domain.id)).data?.receiving).toBeNull();
  });
});

describe("coss.webhookEndpoints against the API", () => {
  test("a lost creation response does not create a duplicate endpoint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    let attempts = 0;
    let createdId: string | undefined;
    let creationStatus: number | undefined;
    const coss = clientFor(app, tenant.sandboxKey, {
      maxRetries: 3,
      fetch: async (input, init) => {
        attempts++;
        const response = await app.fetch(toRequest(input, init));
        creationStatus = response.status;
        const created = (await response.json()) as { id: string };
        createdId = created.id;
        throw new TypeError("Connection lost after creation committed");
      },
    });

    const result = await coss.webhookEndpoints.create(
      { url: "https://example.com/hook" },
      { idempotencyKey: crypto.randomUUID() },
    );

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("network_error");
    expect(attempts).toBe(1);
    expect(creationStatus).toBe(200);
    if (!createdId) throw new Error("creation did not commit");
    const listed = await clientFor(app, tenant.sandboxKey).webhookEndpoints.list();
    expect(listed.error).toBeNull();
    expect(listed.data?.data.map((endpoint) => endpoint.id)).toEqual([createdId]);
  });

  test("create, update, list and delete round-trip an endpoint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    const created = await coss.webhookEndpoints.create({
      url: "https://example.com/webhooks/coss",
      description: "Receiver",
      event_types: ["email.bounced", "email.complained"],
    });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({
      object: "webhook_endpoint",
      url: "https://example.com/webhooks/coss",
      description: "Receiver",
      event_types: ["email.bounced", "email.complained"],
      enabled: true,
    });
    if (!created.data) throw new Error("create failed");
    expect(created.data.secret).toStartWith("whsec_");
    // Events are rendered in the SDK's version, matching its WebhookEvent types.
    expect(created.data.api_version).toBe(API_VERSION);

    const updated = await coss.webhookEndpoints.update(created.data.id, { enabled: false });
    expect(updated.data).toMatchObject({ id: created.data.id, enabled: false });
    if (!updated.data) throw new Error("update failed");

    const listed = await coss.webhookEndpoints.list();
    expect(listed.data?.data).toEqual([updated.data]);
    // The secret is returned once, by create, and is never part of a read.
    expect(listed.data?.data[0]).not.toHaveProperty("secret");

    const deleted = await coss.webhookEndpoints.delete(created.data.id);
    expect(deleted.data).toEqual({
      object: "webhook_endpoint",
      id: created.data.id,
      deleted: true,
    });
  });

  test("an endpoint of the other environment maps to not_found_error", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const sandbox = clientFor(app, tenant.sandboxKey);
    const live = clientFor(app, tenant.liveKey, { maxRetries: 0 });

    const created = await sandbox.webhookEndpoints.create({ url: "https://example.com/hook" });
    const result = await live.webhookEndpoints.get(created.data?.id ?? "missing");

    expect(result.error).toMatchObject({ type: "not_found_error", status: 404 });
  });
});

describe("coss.webhookEndpoints.deliveries against the API", () => {
  test("list, get and retry round-trip a delivery", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const endpoint = await coss.webhookEndpoints.create({ url: "https://example.com/hook" });
    if (!endpoint.data) throw new Error("create failed");
    const eventId = newId("evt");
    await enqueueWebhookMessage(db, {
      id: eventId,
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      type: "email.delivered",
      payload: { id: eventId, object: "event", type: "email.delivered", data: {} },
    });
    await runDueWebhookDeliveries(
      { scope: { organizationIds: [tenant.organization.id] } },
      { secretsKeys: TEST_SECRETS_KEYS, send: async () => ({ status: 200, body: "ok" }) },
    );

    const listed = await coss.webhookEndpoints.deliveries.list(endpoint.data.id, {
      status: "succeeded",
      limit: 10,
    });
    expect(listed.error).toBeNull();
    const [delivery] = listed.data?.data ?? [];
    expect(delivery).toMatchObject({
      object: "webhook_delivery",
      event_id: eventId,
      status: "succeeded",
      attempts: [{ object: "webhook_attempt", status_code: 200, response_excerpt: "ok" }],
    });
    if (!delivery) throw new Error("no delivery");

    const fetched = await coss.webhookEndpoints.deliveries.get(endpoint.data.id, delivery.id);
    expect(fetched).toEqual({ data: delivery, error: null });

    const retried = await coss.webhookEndpoints.deliveries.retry(endpoint.data.id, delivery.id);
    expect(retried.data).toMatchObject({ id: delivery.id, status: "pending" });
  });
});

describe("coss.webhookEndpoints.recover against the API", () => {
  test("requeues failed deliveries and reports a disabled endpoint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const created = await coss.webhookEndpoints.create({ url: "https://example.com/hook" });
    if (!created.data) throw new Error("create failed");

    const recovered = await coss.webhookEndpoints.recover(created.data.id, {
      since: new Date(Date.now() - 60_000),
    });
    expect(recovered).toEqual({
      data: {
        object: "webhook_endpoint_recovery",
        endpoint_id: created.data.id,
        requeued: 0,
        has_more: false,
      },
      error: null,
    });

    const disabled = await coss.webhookEndpoints.update(created.data.id, { enabled: false });
    expect(disabled.data).toMatchObject({
      enabled: false,
      disabled_reason: "manual",
      failing_since: null,
    });
    const refused = await coss.webhookEndpoints.recover(created.data.id, { since: new Date() });
    expect(refused.error).toMatchObject({ status: 422, code: "endpoint_disabled" });
  });
});

describe("coss.webhookEndpoints.rollSecret against the API", () => {
  test("deliveries verify with the old and the new secret until the old one expires", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const created = await coss.webhookEndpoints.create({ url: "https://example.com/hook" });
    if (!created.data) throw new Error("create failed");

    const rolled = await coss.webhookEndpoints.rollSecret(created.data.id, {
      previous_secret_expires_in: 60,
    });
    expect(rolled.error).toBeNull();
    if (!rolled.data) throw new Error("roll failed");
    expect(rolled.data.secret).not.toBe(created.data.secret);
    const expiresAt = Date.parse(rolled.data.previous_secret_expires_at ?? "");

    async function deliver(now: Date) {
      const id = newId("evt");
      await enqueueWebhookMessage(db, {
        id,
        organizationId: tenant.organization.id,
        environmentId: tenant.development.id,
        type: "email.delivered",
        payload: { id, object: "event", type: "email.delivered", data: {} },
        now,
      });
      let sent: { headers: Record<string, string>; body: string } | undefined;
      await runDueWebhookDeliveries(
        { now, scope: { organizationIds: [tenant.organization.id] } },
        {
          secretsKeys: TEST_SECRETS_KEYS,
          send: async (request) => {
            sent = request;
            return { status: 200, body: "ok" };
          },
        },
      );
      if (!sent) throw new Error("nothing sent");
      return sent;
    }

    const during = await deliver(new Date());
    for (const secret of [created.data.secret, rolled.data.secret]) {
      expect(await verifyWebhook(during.body, during.headers, secret)).toMatchObject({
        type: "email.delivered",
      });
    }

    const at = new Date(expiresAt + 1000);
    const after = await deliver(at);
    expect(
      await verifyWebhook(after.body, after.headers, rolled.data.secret, { now: at }),
    ).toMatchObject({ type: "email.delivered" });
    await expect(
      verifyWebhook(after.body, after.headers, created.data.secret, { now: at }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});

describe("coss.environment against the API", () => {
  test("get names the key's environment, project and organization", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { data, error } = await clientFor(app, tenant.sandboxKey).environment.get();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      object: "environment",
      id: tenant.development.id,
      mode: "sandbox",
      project: { id: tenant.project.id, slug: tenant.project.slug },
      organization: { id: tenant.organization.id, api_version: API_VERSION },
      api_key: { name: "Test sandbox key", access: "full" },
    });
    expect(data?.api_key.permissions).toContain("email:send");
  });
});

describe("coss.webhookListeners against the API", () => {
  test("a listener receives the environment's events, which verify once the CLI signs them", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const { data: listener } = await coss.webhookListeners.create({
      event_types: ["email.sent"],
      description: "contract test",
    });
    expect(listener).toMatchObject({ object: "webhook_listener", event_types: ["email.sent"] });

    const sent = await coss.email.send({
      from: "hello@acme.com",
      to: "user@example.com",
      subject: "Hi",
      text: "Hi",
    });
    await dispatch();
    const { data: answer } = await coss.webhookListeners.poll(must(listener).id, { wait_ms: 0 });
    expect(answer?.deliveries).toHaveLength(1);
    const [delivery] = must(answer).deliveries;
    const event = JSON.parse(must(delivery).body);
    expect(event).toMatchObject({ type: "email.sent", data: { email_id: sent.data?.id } });
    expect(event.id).toBe(must(delivery).event_id);

    const { data: acked } = await coss.webhookListeners.poll(must(listener).id, {
      wait_ms: 0,
      acks: [
        {
          delivery_id: must(delivery).id,
          ack_token: must(delivery).ack_token,
          status_code: 200,
          duration_ms: 3,
          error: null,
        },
      ],
    });
    expect(acked?.acknowledged).toBe(1);
    expect((await coss.webhookListeners.delete(must(listener).id)).data).toEqual({
      object: "webhook_listener",
      id: must(listener).id,
      deleted: true,
    });
    expect((await coss.webhookListeners.poll(must(listener).id)).error).toMatchObject({
      type: "not_found_error",
    });
  });
});

describe("coss.webhookEvents against the API", () => {
  test("the SDK's event type lists are the API's", () => {
    expect([...SDK_WEBHOOK_EVENT_TYPES]).toEqual([...WEBHOOK_EVENT_TYPES]);
    expect([...SDK_TEST_WEBHOOK_EVENT_TYPES]).toEqual([...TEST_WEBHOOK_EVENT_TYPES]);
  });

  test("a test event reaches a listener, and live keys are refused", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const { data: listener } = await coss.webhookListeners.create({
      event_types: ["risk.assessment.review"],
    });
    const { data, error } = await coss.webhookEvents.test({
      type: "risk.assessment.review",
      data: { user_id: "u_42" },
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      object: "webhook_test_event",
      endpoints: 0,
      listeners: 1,
      event: { type: "risk.assessment.review", data: { user_id: "u_42", decision: "review" } },
    });
    const { data: answer } = await coss.webhookListeners.poll(must(listener).id, { wait_ms: 0 });
    expect(JSON.parse(must(answer?.deliveries[0]).body)).toEqual(must(data).event);

    const live = clientFor(app, tenant.liveKey);
    expect((await live.webhookEvents.test({ type: "email.sent" })).error).toMatchObject({
      type: "permission_error",
      code: "sandbox_only",
      status: 403,
    });
  });
});

describe("coss.email.dedicatedIps against the API", () => {
  test("get reads the organization's pool, from any environment's key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const live = clientFor(app, tenant.liveKey);
    expect(await live.email.dedicatedIps.get()).toEqual({
      data: {
        object: "dedicated_ip_pool",
        status: "not_enabled",
        ips: [],
        dedicated_share: null,
        message: null,
        created_at: null,
        ready_at: null,
      },
      error: null,
    });
    await ensureOrgTenant(tenant.organization.id, new FakeIdentityProvider());
    await reconcileDedicatedIpPools(
      { entitled: [tenant.organization.id], scope: { organizationIds: [tenant.organization.id] } },
      { identity: new FakeIdentityProvider(), dedicatedIps: new FakeDedicatedIpProvider() },
    );
    const { data } = await clientFor(app, tenant.sandboxKey).email.dedicatedIps.get();
    expect(data).toMatchObject({ status: "warming", ips: [] });
  });
});

describe("coss.reputation against the API", () => {
  test("get mirrors the standing, and a suspended live send is a permission_error", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.liveKey);
    const from = await domainFrom(tenant.organization.id);

    expect(await coss.reputation.get()).toEqual({
      data: {
        object: "reputation",
        status: "good",
        reason: null,
        status_changed_at: null,
        evaluated_at: null,
        window: null,
        checks: [],
        marketing: { status: "active", reason: null, paused_at: null },
      },
      error: null,
    });

    await suspendOrganization({
      organizationId: tenant.organization.id,
      trigger: "bounce_rate",
      actor: { kind: "system" },
    });
    const { data } = await coss.reputation.get();
    expect(data).toMatchObject({ status: "suspended", reason: "bounce_rate" });
    expect(data?.status_changed_at).toBeString();

    const sent = await coss.email.send({ from, to: "user@example.com", subject: "Hi", text: "Hi" });
    expect(sent.data).toBeNull();
    expect(sent.error).toMatchObject({
      type: "permission_error",
      code: "account_suspended",
      status: 403,
    });
  });
});

describe("coss.logs against the API", () => {
  test("list and get read the environment's request log", async () => {
    const tenant = await createTestTenant();
    const writer = createLogWriter({ flushMs: 60_000 });
    const { app } = createTestApp({ logWriter: writer });
    const coss = clientFor(app, tenant.sandboxKey);
    await coss.email.send({
      from: "Acme <hello@acme.com>",
      to: "nobody",
      subject: "Hi",
      text: "Hi",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await writer.flush();

    const listed = await coss.logs.list({ level: ["warning", "error"], status: ["4xx"] });
    expect(listed.error).toBeNull();
    expect(listed.data?.data).toHaveLength(1);
    const line = listed.data?.data[0];
    if (!line) throw new Error("missing log line");
    expect(line).toMatchObject({
      object: "log",
      source: "api",
      level: "warning",
      method: "POST",
      route: "/v1/emails",
      status_code: 422,
      error_code: "validation_error",
    });
    expect(line.request_id).toMatch(REQUEST_ID);
    expect(await coss.logs.get(line.id)).toEqual({ data: line, error: null });

    const invalid = await coss.logs.list({
      from: "2026-01-02T00:00:00Z",
      to: "2026-01-01T00:00:00Z",
    });
    expect(invalid.error).toMatchObject({ code: "invalid_range", status: 422 });
  });
});

describe("coss.auditEvents against the API", () => {
  test("list and get read the organization's audit log from any environment", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const sandbox = clientFor(app, tenant.sandboxKey);
    const created = await sandbox.email.suppressions.add({ address: "gone@example.com" });
    expect(created.error).toBeNull();

    // Read with the other environment's key: the audit log is organization-wide.
    const live = clientFor(app, tenant.liveKey);
    const listed = await live.auditEvents.list({ action: ["suppression."], actor_type: "api_key" });
    expect(listed.error).toBeNull();
    expect(listed.data).toMatchObject({ object: "list", has_more: false });
    const event = listed.data?.data[0];
    if (!event) throw new Error("missing audit event");
    expect(event).toMatchObject({
      object: "audit_event",
      action: "suppression.created",
      actor_type: "api_key",
      target_id: created.data?.id,
      environment_id: tenant.development.id,
    });
    expect(await live.auditEvents.get(event.id)).toEqual({ data: event, error: null });

    const invalid = await live.auditEvents.list({ limit: 0 });
    expect(invalid.error).toMatchObject({ code: "validation_error", status: 422 });
  });
});

describe("coss.logDrains against the API", () => {
  test("a drain receives the environment's log as batches verifyLogDrainBatch accepts", async () => {
    const tenant = await createTestTenant();
    const writer = createLogWriter({ flushMs: 60_000 });
    const { app } = createTestApp({ logWriter: writer });
    const coss = clientFor(app, tenant.sandboxKey);
    const receiver = webhookReceiver();
    try {
      const created = await coss.logDrains.create({
        url: receiver.url,
        sources: ["api", "audit"],
      });
      expect(created.error).toBeNull();
      if (!created.data) throw new Error("create failed");
      expect(created.data).toMatchObject({ object: "log_drain", sources: ["api", "audit"] });
      const secret = created.data.secret;

      await coss.reputation.get();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await writer.flush();
      await runDueLogDrainDeliveries(
        { scope: { organizationIds: [tenant.organization.id] } },
        { secretsKeys: TEST_SECRETS_KEYS, send: testSender() },
      );

      const request = receiver.received[0];
      if (!request) throw new Error("nothing delivered");
      const lines = await verifyLogDrainBatch(request.body, request.headers, secret);
      expect(lines.map((line) => line.object)).toEqual(["audit_event", "log", "log"]);
      expect(lines[0]).toMatchObject({ action: "log_drain.created", actor_type: "api_key" });
      expect(lines.slice(1)).toEqual([
        expect.objectContaining({ route: "/v1/log_drains", status_code: 200 }),
        expect.objectContaining({ route: "/v1/reputation", status_code: 200 }),
      ]);
      await expect(
        verifyLogDrainBatch(request.body, request.headers, "whsec_AAAA"),
      ).rejects.toThrow(WebhookVerificationError);

      const batches = await coss.logDrains.batches.list(created.data.id);
      expect(batches.data?.data[0]).toMatchObject({
        id: request.headers.get("webhook-id") ?? "",
        status: "succeeded",
        line_count: 3,
      });

      expect(created.data).toMatchObject({ format: "ndjson", auth_header_name: null });
      const otlp = await coss.logDrains.update(created.data.id, {
        format: "otlp",
        auth_header: { name: "Authorization", value: "Bearer drain-token" },
      });
      expect(otlp.data).toMatchObject({ format: "otlp", auth_header_name: "Authorization" });
      expect(JSON.stringify(otlp.data)).not.toContain("drain-token");
      const reserved = await coss.logDrains.update(created.data.id, {
        auth_header: { name: "Content-Type", value: "text/plain" },
      });
      expect(reserved.error).toMatchObject({ type: "invalid_request_error" });

      const updated = await coss.logDrains.update(created.data.id, {
        enabled: false,
        auth_header: null,
      });
      expect(updated.data).toMatchObject({
        enabled: false,
        disabled_reason: "manual",
        auth_header_name: null,
      });
      const deleted = await coss.logDrains.delete(created.data.id);
      expect(deleted.data).toEqual({ object: "log_drain", id: created.data.id, deleted: true });
    } finally {
      receiver.stop();
    }
  });
});

describe("coss.risk against the API", () => {
  test("assess, feedback, read, lists and forget round-trip; review webhooks verify", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const receiver = webhookReceiver();
    try {
      const endpoint = await coss.webhookEndpoints.create({
        url: receiver.url,
        event_types: ["risk.assessment.review"],
      });
      if (!endpoint.data) throw new Error("create failed");

      const listed = await coss.risk.lists.add("block", { country: "gb", note: "Test" });
      expect(listed.data).toMatchObject({ list: "block", type: "country", value: "GB" });

      // Sandbox fixtures: 192.0.2.9 is a clean GB home connection, 192.0.2.1 a Tor exit.
      const blocked = await coss.risk.assess({
        event: "login",
        user: { id: "u1" },
        ip: "192.0.2.9",
      });
      expect(blocked.data).toMatchObject({
        object: "risk_assessment",
        decision: "block",
        reasons: [{ code: "list.blocked", type: "country", entry: listed.data?.id }],
      });
      if (!listed.data) throw new Error("add failed");
      expect((await coss.risk.lists.remove(listed.data.id)).data?.deleted).toBe(true);

      const review = await coss.risk.assess({
        event: "signup",
        user: { id: "u2", email: "x@disposable.test" },
        ip: "192.0.2.9",
        user_agent: "Mozilla/5.0",
      });
      expect(review.error).toBeNull();
      expect(review.data).toMatchObject({ decision: "review", review_status: "open" });
      if (!review.data) throw new Error("assess failed");

      await runDueWebhookDeliveries(
        { scope: { organizationIds: [tenant.organization.id] } },
        { secretsKeys: TEST_SECRETS_KEYS, send: testSender() },
      );
      const [delivery] = receiver.received;
      if (!delivery) throw new Error("no webhook");
      const event = await verifyWebhook(delivery.body, delivery.headers, endpoint.data.secret);
      expect(event).toMatchObject({
        type: "risk.assessment.review",
        data: { assessment_id: review.data.id, decision: "review", user_id: "u2" },
      });

      const queue = await coss.risk.assessments.list({ review_status: "open" });
      expect(queue.data?.data.map((a) => a.id)).toEqual([review.data.id]);
      const resolved = await coss.risk.feedback(review.data.id, { outcome: "abuse" });
      expect(resolved.data).toMatchObject({ outcome: "abuse", review_status: "resolved" });
      expect((await coss.risk.assessments.get(review.data.id)).data).toEqual(resolved.data);

      const forgotten = await coss.risk.users.forget("u2");
      expect(forgotten).toEqual({
        data: { object: "risk_user", id: "u2", deleted: true },
        error: null,
      });
      expect((await coss.risk.assessments.get(review.data.id)).data?.user).toEqual({
        id: null,
        email: null,
      });
    } finally {
      receiver.stop();
    }
  });
});

describe("coss.billing against the API", () => {
  test("get, usage, invoices and credits from any environment's key", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const { app } = createTestApp();
    await createTestContract(
      org,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-08-01T00:00:00Z") },
    );
    await runDueBillingPeriods({
      now: new Date("2026-10-01T00:20:00Z"),
      scope: { organizationIds: [org] },
    });
    await recordTestUsage({
      organizationId: org,
      environmentId: tenant.production.id,
      meter: "email.recipients",
      quantity: 1_200,
      at: new Date("2026-09-14T08:00:00Z"),
    });
    await recordTestUsage({
      organizationId: org,
      environmentId: tenant.production.id,
      meter: "email.recipients",
      quantity: 300,
      at: new Date("2026-09-15T08:00:00Z"),
      source: { projectId: tenant.project.id, apiKeyId: "key_personal", userId: tenant.owner.id },
    });
    const credit = await createCreditGrant({
      grant: {
        organizationId: org,
        kind: "units",
        amount: 10_000n,
        meter: "email.recipients",
        source: "promotion",
        description: "Welcome credit",
        effectiveAt: new Date("2026-09-01T00:00:00Z"),
        expiresAt: null,
      },
      actor: { userId: tenant.owner.id, email: tenant.owner.email },
      reason: "test",
    });
    const coss = clientFor(app, tenant.sandboxKey);

    const billing = await coss.billing.get();
    expect(billing.error).toBeNull();
    expect(billing.data).toMatchObject({ object: "billing", organization_id: org, plan: "pro" });

    const usage = await coss.billing.usage({
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      granularity: "month",
      group_by: "environment",
      meter: "email.recipients",
    });
    expect(usage).toEqual({
      data: {
        object: "list",
        has_more: false,
        data: [
          {
            object: "usage",
            meter: "email.recipients",
            dimension: null,
            environment_id: tenant.production.id,
            project_id: null,
            api_key_id: null,
            user_id: null,
            start: "2026-09-01T00:00:00.000Z",
            end: "2026-10-01T00:00:00.000Z",
            quantity: 1_500,
          },
        ],
      },
      error: null,
    });
    // By member: usage without a personal key (here: recorded before attribution) is `null`.
    const byUser = await coss.billing.usage({
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      granularity: "month",
      group_by: "user",
    });
    expect(byUser.data?.data.map(({ user_id, quantity }) => ({ user_id, quantity }))).toEqual([
      { user_id: null, quantity: 1_200 },
      { user_id: tenant.owner.id, quantity: 300 },
    ]);

    const invoices = await coss.billing.invoices.list({ limit: 1 });
    expect(invoices.data).toMatchObject({ object: "list", has_more: true });
    const summary = invoices.data?.data[0];
    if (!summary) throw new Error("missing invoice");
    const invoice = await coss.billing.invoices.get(summary.id);
    expect(invoice.data).toEqual({ ...summary, lines: expect.any(Array) });
    const missing = await coss.billing.invoices.get("inv_01k7c8m4q2f3e9v6t5r1n0p8yz");
    expect(missing.error).toMatchObject({
      type: "not_found_error",
      code: "not_found",
      status: 404,
    });

    const credits = await coss.billing.credits.list({ status: "all" });
    expect(credits.data?.data.map((row) => row.id)).toContain(credit.id);

    const invalid = await coss.billing.usage({
      from: "2026-09-02T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
    });
    expect(invalid.error).toMatchObject({ code: "invalid_range", status: 422 });
  });
});

describe("coss.risk.settings and coss.risk.rules against the API", () => {
  test("settings, rules and captcha round-trip; reviewed webhooks verify", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const receiver = webhookReceiver();
    try {
      const endpoint = await coss.webhookEndpoints.create({
        url: receiver.url,
        event_types: ["risk.assessment.reviewed"],
      });
      if (!endpoint.data) throw new Error("create failed");

      const settings = await coss.risk.settings.update({
        review_threshold: 0.4,
        disabled_reasons: ["email.role_account"],
        captcha: { provider: "turnstile", secret: "0xsecret", required: true },
      });
      expect(settings.error).toBeNull();
      expect(settings.data).toMatchObject({
        object: "risk_settings",
        review_threshold: 0.4,
        captcha: { provider: "turnstile", required: true },
      });
      expect(await coss.risk.settings.get()).toEqual(settings);

      const rule = await coss.risk.rules.create({
        name: "Block failed captchas from new domains",
        match: "all",
        conditions: [
          { field: "captcha.passed", operator: "is", value: false },
          { field: "email.domain_age_days", operator: "lt", value: 30 },
        ],
        action: "block",
      });
      if (!rule.data) throw new Error("rule failed");
      expect((await coss.risk.rules.list()).data?.data).toEqual([rule.data]);

      // Sandbox fixtures: a failed test token, and new.test registered 2 days ago.
      const blocked = await coss.risk.assess({
        event: "signup",
        user: { email: "a@new.test" },
        captcha: { token: "test-fail" },
      });
      expect(blocked.data).toMatchObject({
        decision: "block",
        signals: { captcha: { provided: true, passed: false }, email: { domain_age_days: 2 } },
      });
      expect(blocked.data?.reasons[0]).toMatchObject({ code: "rule.matched", rule: rule.data.id });

      await coss.risk.rules.update(rule.data.id, { enabled: false });
      const review = await coss.risk.assess({
        event: "signup",
        user: { id: "u9", email: "a@new.test" },
      });
      // No token while one is required, plus a new domain: 1 − 0.6 × 0.65 = 0.61 ≥ 0.4.
      expect(review.data).toMatchObject({ decision: "review", review_status: "open" });
      if (!review.data) throw new Error("assess failed");
      await coss.risk.feedback(review.data.id, { outcome: "legitimate" });

      await runDueWebhookDeliveries(
        { scope: { organizationIds: [tenant.organization.id] } },
        { secretsKeys: TEST_SECRETS_KEYS, send: testSender() },
      );
      const [delivery] = receiver.received;
      if (!delivery) throw new Error("no webhook");
      const event = await verifyWebhook(delivery.body, delivery.headers, endpoint.data.secret);
      expect(event).toMatchObject({
        type: "risk.assessment.reviewed",
        data: { assessment_id: review.data.id, outcome: "legitimate", user_id: "u9" },
      });

      expect((await coss.risk.rules.delete(rule.data.id)).data).toEqual({
        object: "risk_rule",
        id: rule.data.id,
        deleted: true,
      });
    } finally {
      receiver.stop();
    }
  });
});

describe("coss.risk building blocks and rate limits against the API", () => {
  test("checks, classification, content thresholds and limits round-trip", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);

    expect((await coss.risk.checkEmail("a@disposable.test")).data).toMatchObject({
      object: "risk_email_check",
      disposable: true,
    });
    expect((await coss.risk.checkIp("192.0.2.3")).data).toMatchObject({
      object: "risk_ip_check",
      hosting_kind: "vpn",
    });
    expect((await coss.risk.checkPhone("+1 202-555-0104")).data).toMatchObject({
      object: "risk_phone_check",
      phone: "+12025550104",
      line_type: "mobile",
      sim_swap: { recent: true },
    });
    expect(await coss.risk.classify({ text: "Pay with gift cards [coss-test:fraud]" })).toEqual({
      data: {
        object: "risk_content_classification",
        scores: { spam: 0.01, phishing: 0.01, malware: 0.01, fraud: 0.99 },
        truncated: false,
      },
      error: null,
    });

    const settings = await coss.risk.settings.update({ content_thresholds: { fraud: 0.9 } });
    expect(settings.data?.content_thresholds).toEqual({
      spam: null,
      phishing: null,
      malware: null,
      fraud: 0.9,
    });
    const assessed = await coss.risk.assess({
      event: "message",
      content: { text: "Pay with gift cards [coss-test:fraud]" },
    });
    expect(assessed.data?.signals.content?.fraud).toBe(0.99);
    expect(assessed.data?.reasons.map((reason) => reason.code)).toEqual(["content.fraud"]);

    const bucket = await coss.risk.limitBuckets.create({
      name: "password_reset",
      limit: 1,
      period_seconds: 60,
    });
    if (!bucket.data) throw new Error("bucket failed");
    expect(bucket.data).toMatchObject({ name: "password_reset", burst: 1, on_failure: "allow" });
    expect((await coss.risk.limitBuckets.list()).data?.data).toEqual([bucket.data]);
    const first = await coss.risk.limit({ bucket: "password_reset", key: "ada@example.com" });
    expect(first.data).toMatchObject({ allowed: true, remaining: 0, degraded: false });
    const second = await coss.risk.limit({ bucket: "password_reset", key: "ada@example.com" });
    expect(second.data).toMatchObject({ allowed: false, remaining: 0 });
    expect(second.data?.retry_after_ms).toBeGreaterThan(0);
    const updated = await coss.risk.limitBuckets.update(bucket.data.id, { burst: 3 });
    expect(updated.data).toMatchObject({ burst: 3 });
    expect((await coss.risk.limitBuckets.get(bucket.data.id)).data).toEqual(updated.data);
    expect((await coss.risk.limitBuckets.delete(bucket.data.id)).data).toEqual({
      object: "risk_limit_bucket",
      id: bucket.data.id,
      deleted: true,
    });
    const missing = await coss.risk.limit({ bucket: "password_reset", key: "k" });
    expect(missing.error).toMatchObject({ type: "not_found_error", param: "bucket" });
  });
});

describe("coss.risk checkouts, devices and calibration against the API", () => {
  test("a device token from coss/device, checkout fields, privacy data, calibration and weights", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = clientFor(app, tenant.sandboxKey);
    const codes = (result: { data: { reasons: { code: string }[] } | null }) =>
      result.data?.reasons.map((reason) => reason.code) ?? [];

    // The browser's token, as the SDK makes it, read by the API.
    const first = await coss.risk.assess({
      event: "signup",
      user: { id: "d1" },
      device: { token: collectDevice({ storage: "memory" }) },
    });
    expect(first.error).toBeNull();
    expect(first.data?.signals.device).toMatchObject({ valid: true, automation: false });
    const second = await coss.risk.assess({
      event: "signup",
      user: { id: "d2" },
      device: { token: collectDevice({ storage: "memory" }) },
    });
    expect(second.data?.reasons).toContainEqual(
      expect.objectContaining({ code: "duplicate.device", previous_user: "d1" }),
    );

    // Sandbox: 192.0.2.9 is a home connection in GB, 192.0.2.3 a VPN exit.
    const checkout = await coss.risk.assess({
      event: "checkout",
      ip: "192.0.2.9",
      checkout: {
        amount: 1999,
        currency: "USD",
        card: { fingerprint: "fp_test", country: "US", funding: "prepaid" },
        billing_country: "US",
      },
    });
    expect(checkout.data?.signals.checkout).toEqual({
      amount: 1999,
      currency: "USD",
      card_country: "US",
      card_funding: "prepaid",
      billing_country: "US",
      shipping_country: null,
    });
    expect(codes(checkout)).toEqual(
      expect.arrayContaining(["checkout.card_country_mismatch", "checkout.prepaid_card"]),
    );
    const misplaced = await coss.risk.assess({
      event: "signup",
      checkout: { amount: 1, currency: "USD" },
    });
    expect(misplaced.error).toMatchObject({ code: "validation_error" });

    const vpn = await coss.risk.assess({ event: "login", user: { id: "d1" }, ip: "192.0.2.3" });
    expect(codes(vpn)).toContain("ip.vpn");
    expect(vpn.data?.signals.ip?.privacy).toMatchObject({ vpn: true });
    expect((await coss.risk.checkIp("192.0.2.4")).data?.privacy).toMatchObject({ proxy: true });

    if (!checkout.data) throw new Error("assess failed");
    await coss.risk.feedback(checkout.data.id, { outcome: "fraud" });
    const calibration = await coss.risk.calibration();
    expect(calibration.error).toBeNull();
    expect(calibration.data).toMatchObject({ object: "risk_calibration", labeled: 1 });
    expect(calibration.data?.reasons).toContainEqual(
      expect.objectContaining({ code: "checkout.prepaid_card", fired: 1, fraud: 1, precision: 1 }),
    );

    const settings = await coss.risk.settings.update({
      reason_weights: { "checkout.prepaid_card": 0.6 },
    });
    expect(settings.data?.reason_weights).toEqual({ "checkout.prepaid_card": 0.6 });
    const again = await coss.risk.assess({
      event: "checkout",
      checkout: { amount: 1, currency: "USD", card: { funding: "prepaid" } },
    });
    expect(again.data?.score).toBe(0.6);
  });
});

describe("coss.scheduling.reassignments against the API", () => {
  test("previews, runs, reports, undoes and cancels", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { scheduling } = clientFor(app, tenant.sandboxKey);
    const rules = [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }];
    const first = must(
      (await scheduling.hosts.create({ uid: "first", name: "First", time_zone: "UTC" })).data,
    );
    const second = must(
      (await scheduling.hosts.create({ uid: "second", name: "Second", time_zone: "UTC" })).data,
    );
    await scheduling.schedules.create("first", { rules });
    await scheduling.schedules.create("second", { rules });
    const pool = must(
      (
        await scheduling.eventTypes.create({
          title: "Consultation",
          kind: "pool",
          duration_minutes: 30,
          hosts: [{ host: "first" }, { host: "second" }],
        })
      ).data,
    );
    const booking = must(
      (
        await scheduling.bookings.create({
          event_type: pool.id,
          start: "2031-01-06T10:00:00.000Z",
          host: "first",
          attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
        })
      ).data,
    );
    const preview = must(
      (
        await scheduling.reassignments.preview({
          selection: { host: "first" },
          strategy: { preferred_hosts: ["second"] },
        })
      ).data,
    );
    expect(preview.items[0]).toMatchObject({ booking: booking.id, to_host: second.id });

    const created = await scheduling.reassignments.create(
      {
        selection: { host: "first" },
        strategy: { to_host: "second" },
        reason_code: "out_of_office",
      },
      { idempotencyKey: "move-them" },
    );
    const run = must(created.data);
    expect(run).toMatchObject({ object: "scheduling.reassignment", status: "pending" });
    const replay = await scheduling.reassignments.create(
      {
        selection: { host: "first" },
        strategy: { to_host: "second" },
        reason_code: "out_of_office",
      },
      { idempotencyKey: "move-them" },
    );
    expect(replay.data?.id).toBe(run.id);

    const early = await scheduling.reassignments.undo(run.id);
    expect(early.error?.code).toBe("reassignment_not_finished");

    const deps = testSchedulingDeps();
    await runDueReassignments(deps, { scope: { organizationIds: [tenant.organization.id] } });
    const done = must((await scheduling.reassignments.get(run.id)).data);
    expect(done.status).toBe("completed");
    expect(done.counts.reassigned).toBe(1);
    const items = must((await scheduling.reassignments.items(run.id)).data);
    expect(items.data[0]).toMatchObject({
      object: "scheduling.reassignment_item",
      booking: booking.id,
      from_host: first.id,
      to_host: second.id,
      outcome: "reassigned",
    });
    const list = must((await scheduling.reassignments.list()).data);
    expect(list.data.map((row) => row.id)).toContain(run.id);

    const undo = must((await scheduling.reassignments.undo(run.id)).data);
    expect(undo.undo_of).toBe(run.id);
    const cancelled = must((await scheduling.reassignments.cancel(undo.id)).data);
    expect(cancelled.status).toBe("cancelled");
  });

  test("an out of office entry can start one", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { scheduling } = clientFor(app, tenant.sandboxKey);
    const rules = [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }];
    await scheduling.hosts.create({ uid: "first", name: "First", time_zone: "UTC" });
    await scheduling.hosts.create({ uid: "second", name: "Second", time_zone: "UTC" });
    await scheduling.schedules.create("first", { rules });
    await scheduling.schedules.create("second", { rules });
    const pool = must(
      (
        await scheduling.eventTypes.create({
          title: "Consultation",
          kind: "pool",
          duration_minutes: 30,
          hosts: [{ host: "first" }, { host: "second" }],
        })
      ).data,
    );
    await scheduling.bookings.create({
      event_type: pool.id,
      start: "2031-01-06T10:00:00.000Z",
      host: "first",
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    const entries = must(
      (
        await scheduling.outOfOffice.create({
          host: "first",
          start: "2031-01-06T09:00:00.000Z",
          end: "2031-01-06T18:00:00.000Z",
          existing_bookings: "reassign",
          reassign: { preferred_hosts: ["second"] },
        })
      ).data,
    );
    expect(entries.data[0]?.existing_bookings).toBe("reassign");
    const runs = must((await scheduling.reassignments.list()).data);
    expect(runs.data[0]?.out_of_office).toBe(entries.data[0]?.id as string);
  });
});

describe("coss.scheduling.bookings.reassign against the API", () => {
  test("lists who could take it, gives it to them, and refuses what it should", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { scheduling } = clientFor(app, tenant.sandboxKey);
    const rules = [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }];
    const first = must(
      (await scheduling.hosts.create({ uid: "first", name: "First", time_zone: "UTC" })).data,
    );
    const second = must(
      (await scheduling.hosts.create({ uid: "second", name: "Second", time_zone: "UTC" })).data,
    );
    await scheduling.schedules.create("first", { rules });
    await scheduling.schedules.create("second", { rules });
    const pool = must(
      (
        await scheduling.eventTypes.create({
          title: "Consultation",
          kind: "pool",
          duration_minutes: 30,
          hosts: [{ host: "first" }, { host: "second" }],
        })
      ).data,
    );
    expect(pool.reassignment_enabled).toBe(true);
    const booking = must(
      (
        await scheduling.bookings.create({
          event_type: pool.id,
          host: "first",
          start: "2031-01-06T10:00:00.000Z",
          attendee: { name: "Sam", email: "sam@example.com", time_zone: "UTC" },
        })
      ).data,
    );
    const candidates = await scheduling.bookings.reassignCandidates(booking.id);
    expect(candidates.data?.data[0]).toMatchObject({
      object: "scheduling.reassign_candidate",
      host: second.id,
      member: true,
      available: true,
      reason: null,
    });
    const moved = await scheduling.bookings.reassign(booking.id, {
      changes: [{ to_host: "second" }],
      reason_code: "out_of_office",
    });
    expect(moved.data?.hosts).toEqual([second.id]);
    expect(moved.data?.id).toBe(booking.id);
    const again = await scheduling.bookings.reassign(booking.id, {
      changes: [{ to_host: "second" }],
      reason_code: "other",
    });
    expect(again.error?.code).toBe("invalid_reassignment");
    const back = await scheduling.bookings.reassign(booking.id, {
      changes: [{ auto: true }],
      reason_code: "workload",
    });
    expect(back.data?.hosts).toEqual([first.id]);
  });
});

describe("coss.scheduling.outOfOffice against the API", () => {
  test("marks a host away, stops offering them, shows conflicts and takes it back", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { scheduling } = clientFor(app, tenant.sandboxKey);
    const host = must(
      (await scheduling.hosts.create({ uid: "doctor_1", name: "Dr. Reyes", time_zone: "UTC" }))
        .data,
    );
    await scheduling.schedules.create("doctor_1", {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    const eventType = must(
      (
        await scheduling.eventTypes.create({
          title: "Consultation",
          duration_minutes: 30,
          hosts: [{ host: "doctor_1" }],
        })
      ).data,
    );
    const booking = must(
      (
        await scheduling.bookings.create({
          event_type: eventType.id,
          start: "2031-01-06T10:00:00.000Z",
          attendee: { name: "Sam", email: "sam@example.com", time_zone: "UTC" },
        })
      ).data,
    );

    const created = must(
      (
        await scheduling.outOfOffice.create({
          host: "doctor_1",
          start_date: "2031-01-06",
          end_date: "2031-01-06",
          reason: "vacation",
          notes: "Lisbon",
          public_message: "Back on Tuesday.",
        })
      ).data,
    );
    const entry = must(created.data[0]);
    expect(entry).toMatchObject({
      object: "scheduling.out_of_office",
      host: host.id,
      reason: "vacation",
      notes: "Lisbon",
      source: "api",
      all_day: { start_date: "2031-01-06", end_date: "2031-01-06", time_zone: "UTC" },
    });
    expect((await scheduling.outOfOffice.get(entry.id)).data?.id).toBe(entry.id);
    expect((await scheduling.outOfOffice.list({ host: "doctor_1" })).data?.data.length).toBe(1);
    const slots = await scheduling.slots.list(eventType.id, {
      start: "2031-01-06T00:00:00.000Z",
      end: "2031-01-07T00:00:00.000Z",
    });
    expect(slots.data?.data).toEqual([]);
    const conflicts = await scheduling.outOfOffice.conflicts(entry.id);
    expect(conflicts.data?.data.map((conflict) => conflict.booking)).toEqual([booking.id]);
    expect((await scheduling.bookings.get(booking.id)).data?.status).toBe("confirmed");

    const moved = await scheduling.outOfOffice.update(entry.id, { end_date: "2031-01-07" });
    expect(moved.data?.all_day?.end_date).toBe("2031-01-07");
    const synced = await scheduling.outOfOffice.put("leave_1", {
      host: "doctor_1",
      start_date: "2031-02-03",
      end_date: "2031-02-03",
    });
    expect(synced.data?.external_id).toBe("leave_1");
    const again = await scheduling.outOfOffice.put("leave_1", {
      host: "doctor_1",
      start_date: "2031-02-04",
      end_date: "2031-02-04",
    });
    expect(again.data?.id).toBe(must(synced.data).id);

    const removed = await scheduling.outOfOffice.remove(entry.id);
    expect(removed.data).toEqual({
      object: "scheduling.out_of_office",
      id: entry.id,
      deleted: true,
    });
    expect((await scheduling.outOfOffice.get(entry.id)).error?.code).toBe("not_found");
  });
});

describe("coss.scheduling against the API", () => {
  test("host, schedule, event type, slots, a booking's life, a hold, a session", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const { scheduling } = clientFor(app, tenant.sandboxKey);
    const start = "2031-01-06T10:00:00.000Z";
    const moved = "2031-01-06T11:00:00.000Z";
    const later = "2031-01-06T14:00:00.000Z";

    const host = must(
      (await scheduling.hosts.create({ uid: "doctor_1", name: "Dr. Reyes", time_zone: "UTC" }))
        .data,
    );
    expect(host).toMatchObject({ object: "scheduling.host", uid: "doctor_1", status: "active" });
    expect((await scheduling.hosts.get("doctor_1")).data?.id).toBe(host.id);

    const schedule = await scheduling.schedules.create("doctor_1", {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    expect(schedule.error).toBeNull();

    const eventType = must(
      (
        await scheduling.eventTypes.create({
          title: "Consultation",
          duration_minutes: 30,
          hosts: [{ host: "doctor_1" }],
          locations: [{ type: "link", url: "https://example.com/room" }],
        })
      ).data,
    );
    expect(eventType.object).toBe("scheduling.event_type");

    const slots = await scheduling.slots.list(eventType.id, {
      start: "2031-01-06T00:00:00.000Z",
      end: "2031-01-07T00:00:00.000Z",
    });
    expect(slots.data?.data.map((slot) => slot.start)).toContain(start);

    const attendee = { uid: "patient_1", name: "Sam Lee", time_zone: "UTC" };
    const booking = must(
      (await scheduling.bookings.create({ event_type: eventType.id, start, attendee })).data,
    );
    expect(booking).toMatchObject({ object: "scheduling.booking", status: "confirmed", start });
    expect(booking.hosts).toEqual([host.id]);

    const taken = await scheduling.bookings.create({ event_type: eventType.id, start, attendee });
    expect(taken.data).toBeNull();
    expect(taken.error).not.toBeNull();

    const rescheduled = await scheduling.bookings.reschedule(booking.id, { start: moved });
    expect(rescheduled.data).toMatchObject({ id: booking.id, start: moved });
    expect((await scheduling.bookings.get(booking.id)).data?.attendees[0]?.uid).toBe("patient_1");
    expect((await scheduling.bookings.cancel(booking.id)).data?.status).toBe("cancelled");

    const hold = must(
      (await scheduling.holds.create({ event_type: eventType.id, start: later, attendee })).data,
    );
    expect(hold.status).toBe("held");
    expect((await scheduling.holds.confirm(hold.id)).data?.status).toBe("confirmed");

    const session = await scheduling.sessions.createForHost("doctor_1");
    expect(session.error).toBeNull();
    expect(session.data?.token.length).toBeGreaterThan(20);

    const settings = await scheduling.settings.update({ brand_name: "Acme Health" });
    expect(settings.data?.brand_name).toBe("Acme Health");

    const erased = await scheduling.attendees.erase("patient_1");
    expect(erased.error).toBeNull();
  });
});
