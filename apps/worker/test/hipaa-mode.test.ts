import { describe, expect, test } from "bun:test";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import type { SendEmailInput } from "@coss/email";
import type { FormEmail } from "@coss/forms";
import { memoryLimiter } from "@coss/ratelimit/testing";
import type { SignEmail } from "@coss/sign";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { formMailer } from "../src/form-mailer.ts";
import { signMailer } from "../src/sign-mailer.ts";

const coss = {
  organizationId: "org_coss",
  projectId: "proj_coss",
  environmentId: "env_coss",
  mode: "live" as const,
};

function recorder() {
  const sent: SendEmailInput[] = [];
  return {
    sent,
    send: async (input: SendEmailInput) => {
      sent.push(input);
      return {} as never;
    },
  };
}

function environmentOf(tenant: TestTenant) {
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live" as const,
  };
}

function formEmail(tenant: TestTenant): FormEmail {
  return {
    environment: environmentOf(tenant),
    from: null,
    senderName: "Intake",
    to: ["owner@clinic.test"],
    subject: "New submission to Intake",
    text: "Symptoms: chest pain",
    html: "<p>Symptoms: chest pain</p>",
    idempotencyKey: `form:${tenant.organization.id}`,
  } as FormEmail;
}

function signEmail(tenant: TestTenant): SignEmail {
  return {
    environment: environmentOf(tenant),
    from: null,
    requester: "Clinic",
    to: "patient@example.com",
    subject: "Please sign",
    text: "Please sign",
    html: "<p>Please sign</p>",
    cossContent: { subject: "Please sign", text: "Please sign", html: "<p>Please sign</p>" },
    idempotencyKey: `sign:${tenant.organization.id}`,
  } as SignEmail;
}

describe("HIPAA mode's mail through coss.com's organization", () => {
  test("a form notification keeps the mode, whose own checks would see coss.com's org", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const service = recorder();
    const mailer = formMailer({
      service,
      limiter: memoryLimiter(),
      fallback: { environment: coss, address: "forms@coss.com" },
    });

    await mailer.send(formEmail(tenant));

    expect(service.sent[0]?.environment).toEqual(coss);
    expect(service.sent[0]?.hipaaOrigin).toBe(true);
  });

  test("a signature request keeps it too", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const service = recorder();
    const mailer = signMailer({
      service,
      fallback: { environment: coss, address: "sign@coss.com" },
    });

    await mailer.send(signEmail(tenant));

    expect(service.sent[0]?.hipaaOrigin).toBe(true);
  });

  test("other organizations' mail is sampled as usual", async () => {
    const tenant = await createTestTenant();
    const forms = recorder();
    const sign = recorder();

    await formMailer({
      service: forms,
      limiter: memoryLimiter(),
      fallback: { environment: coss, address: "forms@coss.com" },
    }).send(formEmail(tenant));
    await signMailer({
      service: sign,
      fallback: { environment: coss, address: "sign@coss.com" },
    }).send(signEmail(tenant));

    expect(forms.sent[0]?.hipaaOrigin).toBe(false);
    expect(sign.sent[0]?.hipaaOrigin).toBe(false);
  });
});
