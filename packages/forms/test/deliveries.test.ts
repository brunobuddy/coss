import { beforeAll, describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { testRiskDeps } from "@coss/risk/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import {
  confirmFormSubmission,
  createForm,
  FakeFormFileStore,
  type FormContactInput,
  type FormEmail,
  type FormEnvironment,
  type FormError,
  findConfirmation,
  releaseSubmission,
  runDueFormDeliveries,
  submitForm,
} from "../src/index.ts";
import { CreateFormRequest } from "../src/schemas.ts";
import { TEST_FORM_LINKS, testFormChecks } from "../src/testing.ts";

const riskDeps = testRiskDeps();
const submitDeps = { riskDeps, store: new FakeFormFileStore(), links: TEST_FORM_LINKS };

let tenant: TestTenant;
let env: FormEnvironment;
let scope: { organizationIds: string[] };

beforeAll(async () => {
  tenant = await createTestTenant();
  env = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
  };
  scope = { organizationIds: [tenant.organization.id] };
});

/** `next_attempt_at` has microseconds and a Date doesn't: a row made this millisecond is after it. */
const rightNow = () => new Date(Date.now() + 1);

function recorder() {
  const emails: FormEmail[] = [];
  const contacts: FormContactInput[] = [];
  let failing = false;
  return {
    emails,
    contacts,
    fail(value: boolean) {
      failing = value;
    },
    deps: {
      formsUrl: "https://forms.coss.test",
      dashboardUrl: "https://coss.test",
      verifiedAddress: async () => false,
      mailer: {
        async send(email: FormEmail) {
          if (failing) throw new Error("SES is down");
          emails.push(email);
          return { replayed: false };
        },
      },
      contacts: {
        async add(input: FormContactInput) {
          contacts.push(input);
        },
      },
    },
  };
}

async function newForm(params: Record<string, unknown>) {
  return createForm(env, CreateFormRequest.parse({ name: "Waitlist", ...params }), {
    links: TEST_FORM_LINKS,
    checks: testFormChecks(),
  });
}

async function submit(formId: string, fields: Record<string, string>) {
  const result = await submitForm(submitDeps, {
    formId,
    fields: Object.entries(fields),
    files: [],
    ip: null,
    userAgent: null,
    origin: null,
    referrer: null,
  });
  if (!("submissionId" in result)) throw new Error(`not stored: ${result.outcome}`);
  return result;
}

async function delivery(submissionId: string, kind: "notification" | "contact" | "verification") {
  const [row] = await db
    .select()
    .from(schema.formDelivery)
    .where(
      and(eq(schema.formDelivery.submissionId, submissionId), eq(schema.formDelivery.kind, kind)),
    );
  return row;
}

describe("runDueFormDeliveries", () => {
  test("notifies the recipients and adds the contact, once", async () => {
    const form = await newForm({
      notifications: { recipients: [tenant.owner.email] },
      fields: [
        { name: "email", type: "email", required: true },
        { name: "name", type: "text", label: "Your name" },
        { name: "company", type: "text" },
      ],
      contacts: { enabled: true, first_name_field: "name", topics: [] },
    });
    const { submissionId } = await submit(form.id, {
      email: "ada@example.com",
      name: "Ada",
      company: "<b>Analytical</b>",
    });
    const { emails, contacts, deps } = recorder();
    expect(await runDueFormDeliveries({ scope, now: rightNow() }, deps)).toBe(2);
    expect(await runDueFormDeliveries({ scope, now: rightNow() }, deps)).toBe(0);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: [tenant.owner.email.toLowerCase()],
      replyTo: "ada@example.com",
      from: null,
      customerOnly: false,
      idempotencyKey: `form-notification:${submissionId}`,
    });
    // Submitted text is escaped in the HTML part, and labels are the form's.
    expect(emails[0]?.html).toContain("&lt;b&gt;Analytical&lt;/b&gt;");
    expect(emails[0]?.text).toContain("Your name:\nAda");
    expect(emails[0]?.text).toContain(`/forms/${form.id}/submissions/${submissionId}`);
    expect(contacts).toEqual([
      expect.objectContaining({ email: "ada@example.com", firstName: "Ada", doubleOptIn: null }),
    ]);
    expect((await delivery(submissionId, "notification"))?.state).toBe("delivered");
  });

  test("a failure is retried later with backoff; a suspended organization waits", async () => {
    const form = await newForm({ notifications: { recipients: [tenant.owner.email] } });
    const { submissionId } = await submit(form.id, { email: "ada@example.com" });
    const { emails, deps, fail } = recorder();
    fail(true);
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    const failed = await delivery(submissionId, "notification");
    expect(failed).toMatchObject({ state: "pending", attempts: 1, lastError: "SES is down" });
    expect(failed?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    fail(false);
    await db
      .insert(schema.organizationSuspension)
      .values({ organizationId: env.organizationId, reason: "test" });
    const later = new Date(Date.now() + 60 * 60_000);
    expect(await runDueFormDeliveries({ scope, now: later }, deps)).toBe(0);
    await db
      .delete(schema.organizationSuspension)
      .where(eq(schema.organizationSuspension.organizationId, env.organizationId));
    expect(await runDueFormDeliveries({ scope, now: later }, deps)).toBeGreaterThan(0);
    expect(emails).toHaveLength(1);
  });
});

test("a worker that lost its lease writes nothing over the newer attempt", async () => {
  const form = await newForm({ notifications: { recipients: [tenant.owner.email] } });
  const { submissionId } = await submit(form.id, { email: "eve@example.com" });
  const { deps } = recorder();
  const slow = {
    ...deps,
    mailer: {
      async send() {
        // Another worker claims the row while this send is still on its way.
        await db
          .update(schema.formDelivery)
          .set({ attempts: 5 })
          .where(eq(schema.formDelivery.submissionId, submissionId));
        return { replayed: false };
      },
    },
  };
  await runDueFormDeliveries({ scope, now: rightNow() }, slow);
  expect(await delivery(submissionId, "notification")).toMatchObject({
    state: "pending",
    attempts: 5,
  });
});

test("live notifications go only to recipients still allowed", async () => {
  const live: FormEnvironment = { ...env, environmentId: tenant.production.id, mode: "live" };
  const form = await createForm(
    live,
    CreateFormRequest.parse({
      name: "Live",
      notifications: { recipients: [tenant.owner.email, "support@acme.test"] },
    }),
    { links: TEST_FORM_LINKS, checks: testFormChecks(["acme.test"]) },
  );
  await submit(form.id, { email: "fay@example.com" });
  const { emails, deps } = recorder();
  // acme.test is no longer verified: only the member is still notified.
  await runDueFormDeliveries({ scope, now: rightNow() }, deps);
  const sent = emails.find((email) => email.replyTo === "fay@example.com");
  expect(sent?.to).toEqual([tenant.owner.email.toLowerCase()]);
});

describe("verifying submitters", () => {
  test("the emailed link confirms the submission once, and only then is it delivered", async () => {
    const form = await newForm({
      submitter: { verify: true },
      notifications: { recipients: [tenant.owner.email] },
    });
    const { submissionId, outcome } = await submit(form.id, { email: "ada@example.com" });
    expect(outcome).toBe("pending_confirmation");
    const { emails, deps } = recorder();
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    expect(emails).toHaveLength(1);
    const verification = emails[0];
    expect(verification).toMatchObject({
      to: ["ada@example.com"],
      customerOnly: true,
      category: "form_verification",
    });
    const token = /\/f\/c\/(cossf_[A-Za-z0-9_-]+)/.exec(verification?.text ?? "")?.[1] ?? "";
    expect(token).not.toBe("");

    // Viewing the link changes nothing.
    expect(await findConfirmation(token)).toMatchObject({ confirmed: false });
    expect(await confirmFormSubmission(token)).toMatchObject({ outcome: "confirmed" });
    expect(await confirmFormSubmission(token)).toMatchObject({ outcome: "already_confirmed" });
    expect(await confirmFormSubmission("cossf_nope")).toBeNull();

    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    expect(emails.map((email) => email.category)).toEqual([
      "form_verification",
      "form_notification",
    ]);
    const [row] = await db
      .select()
      .from(schema.formSubmission)
      .where(eq(schema.formSubmission.id, submissionId));
    expect(row).toMatchObject({ status: "accepted" });
    expect(row?.confirmedAt).toBeInstanceOf(Date);
  });

  test("a suspended organization's link confirms nothing until it is lifted", async () => {
    const form = await newForm({ submitter: { verify: true } });
    const { submissionId } = await submit(form.id, { email: "dee@example.com" });
    const { emails, deps } = recorder();
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    const token = /\/f\/c\/(cossf_[A-Za-z0-9_-]+)/.exec(emails[0]?.text ?? "")?.[1] ?? "";
    await db
      .insert(schema.organizationSuspension)
      .values({ organizationId: env.organizationId, reason: "test" });
    try {
      expect(await confirmFormSubmission(token)).toMatchObject({ outcome: "unavailable" });
      const [row] = await db
        .select()
        .from(schema.formSubmission)
        .where(eq(schema.formSubmission.id, submissionId));
      expect(row?.status).toBe("pending_confirmation");
    } finally {
      await db
        .delete(schema.organizationSuspension)
        .where(eq(schema.organizationSuspension.organizationId, env.organizationId));
    }
    expect(await confirmFormSubmission(token)).toMatchObject({ outcome: "confirmed" });
  });

  test("a worker whose lease was taken over never replaces the newer link", async () => {
    const form = await newForm({ submitter: { verify: true } });
    const { submissionId } = await submit(form.id, { email: "gus@example.com" });
    const { emails, deps } = recorder();
    const overtaken = {
      ...deps,
      // Another worker claims the delivery while this one is admitted.
      admitVerification: async () => {
        await db
          .update(schema.formDelivery)
          .set({ attempts: 9 })
          .where(eq(schema.formDelivery.submissionId, submissionId));
        return { refund: async () => {} };
      },
    };
    await runDueFormDeliveries({ scope, now: rightNow() }, overtaken);
    expect(emails.filter((email) => email.to[0] === "gus@example.com")).toEqual([]);
    const [row] = await db
      .select()
      .from(schema.formSubmission)
      .where(eq(schema.formSubmission.id, submissionId));
    expect(row?.confirmationTokenHash).toBeNull();
  });

  test("a retry whose send fails keeps the link already sent working", async () => {
    const form = await newForm({ submitter: { verify: true } });
    const { submissionId } = await submit(form.id, { email: "hal@example.com" });
    const { emails, deps, fail } = recorder();
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    const token =
      /\/f\/c\/(cossf_[A-Za-z0-9_-]+)/.exec(
        emails.find((email) => email.to[0] === "hal@example.com")?.text ?? "",
      )?.[1] ?? "";
    // The delivery runs again (say its answer was lost) and this time the send fails.
    await db
      .update(schema.formDelivery)
      .set({ state: "pending", nextAttemptAt: new Date(0) })
      .where(eq(schema.formDelivery.submissionId, submissionId));
    fail(true);
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    expect(await findConfirmation(token)).toMatchObject({ confirmed: false });
  });

  test("an expired link confirms nothing", async () => {
    const form = await newForm({ submitter: { verify: true } });
    await submit(form.id, { email: "ada@example.com" });
    const { emails, deps } = recorder();
    await runDueFormDeliveries({ scope, now: rightNow() }, deps);
    const token = /\/f\/c\/(cossf_[A-Za-z0-9_-]+)/.exec(emails[0]?.text ?? "")?.[1] ?? "";
    const later = new Date(Date.now() + 8 * 24 * 60 * 60_000);
    expect(await confirmFormSubmission(token, later)).toBeNull();
  });

  test("failed sends give the verification quota back", async () => {
    const form = await newForm({ submitter: { verify: true } });
    const { submissionId } = await submit(form.id, { email: "cy@example.com" });
    let budget = 1;
    const { emails, deps, fail } = recorder();
    const admitted = {
      ...deps,
      // Three hours on, other tests' rows in this organization are due too: only this address counts.
      admitVerification: async ({ address }: { address: string }) => {
        if (address !== "cy@example.com") return { async refund() {} };
        if (budget === 0) return null;
        budget--;
        return {
          async refund() {
            budget++;
          },
        };
      },
    };
    fail(true);
    let now = rightNow();
    for (let attempt = 0; attempt < 3; attempt++) {
      await runDueFormDeliveries({ scope, now }, admitted);
      now = new Date(now.getTime() + 60 * 60_000);
    }
    expect(budget).toBe(1);
    fail(false);
    await runDueFormDeliveries({ scope, now }, admitted);
    expect(emails.filter((email) => email.to[0] === "cy@example.com")).toHaveLength(1);
    expect(await delivery(submissionId, "verification")).toMatchObject({ state: "delivered" });
  });
});

describe("releaseSubmission", () => {
  test("held or spam → accepted and delivered; Risk learns it was legitimate", async () => {
    const form = await newForm({ notifications: { recipients: [tenant.owner.email] } });
    const { submissionId, outcome } = await submit(form.id, {
      email: "ada@example.com",
      message: "Hello [coss-test:spam]",
    });
    expect(outcome).toBe("spam");
    const released = await releaseSubmission(
      { ...env, submissionId },
      { actor: { kind: "user", userId: tenant.owner.id }, riskHash: riskDeps.hash },
    );
    expect(released).toMatchObject({ status: "accepted", releasedBy: `user:${tenant.owner.id}` });
    const [assessment] = await db
      .select({ outcome: schema.riskAssessment.outcome })
      .from(schema.riskAssessment)
      .where(eq(schema.riskAssessment.id, released.riskAssessmentId ?? ""));
    expect(assessment?.outcome).toBe("legitimate");
    expect((await delivery(submissionId, "notification"))?.state).toBe("pending");

    try {
      const { submissionId: pending } = await submit(
        (await newForm({ submitter: { verify: true } })).id,
        { email: "ada@example.com" },
      );
      await releaseSubmission(
        { ...env, submissionId: pending },
        { actor: { kind: "user", userId: tenant.owner.id }, riskHash: riskDeps.hash },
      );
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as FormError).code).toBe("submission_not_releasable");
    }
  });
});
