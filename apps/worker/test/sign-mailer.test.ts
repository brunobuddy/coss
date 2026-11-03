import { describe, expect, test } from "bun:test";
import { EmailError, type SendEmailInput } from "@coss/email";
import type { SignEmail } from "@coss/sign";
import { addressOf, signMailer } from "../src/sign-mailer.ts";

const live = {
  organizationId: "org_customer",
  projectId: "proj_customer",
  environmentId: "env_live",
  mode: "live" as const,
};
const coss = {
  organizationId: "org_coss",
  projectId: "proj_coss",
  environmentId: "env_coss",
  mode: "live" as const,
};

function email(overrides: Partial<SignEmail> = {}): SignEmail {
  return {
    environment: live,
    from: null,
    requester: 'Acme "Inc"',
    to: "ada@example.com",
    subject: "Sign this",
    text: "text",
    html: "<p>html</p>",
    cossContent: { subject: "Sign this", text: "text", html: "<p>coss</p>" },
    idempotencyKey: "sign-invite:ssgn_1",
    ...overrides,
  };
}

function service(fail?: (input: SendEmailInput) => Error | null) {
  const sent: SendEmailInput[] = [];
  return {
    sent,
    async send(input: SendEmailInput) {
      const error = fail?.(input);
      if (error) throw error;
      sent.push(input);
      return {} as never;
    },
  };
}

describe("signMailer", () => {
  test("without email_from, live emails come from coss.com as '<requester> via coss.com'", async () => {
    const recorder = service();
    const mailer = signMailer({
      service: recorder,
      fallback: { environment: coss, address: "sign@coss.com" },
    });
    await mailer.send(email());
    expect(recorder.sent[0]).toMatchObject({
      environment: coss,
      idempotencyKey: "sign-invite:ssgn_1",
      discardBody: true,
      params: {
        from: '"Acme Inc via coss.com" <sign@coss.com>',
        to: ["ada@example.com"],
        category: "signature_request",
        tracking: { opens: false, clicks: false, unsubscribe: false },
      },
    });
  });

  test("with email_from, from the customer's environment; coss.com when it isn't verified", async () => {
    const recorder = service((input) =>
      input.environment.environmentId === "env_live"
        ? new EmailError("domain_not_verified", "acme.com isn't verified.")
        : null,
    );
    const mailer = signMailer({
      service: recorder,
      fallback: { environment: coss, address: "sign@coss.com" },
    });
    await mailer.send(email({ from: "contracts@acme.com" }));
    expect(recorder.sent).toHaveLength(1);
    expect(recorder.sent[0]).toMatchObject({
      environment: coss,
      idempotencyKey: "sign-invite:ssgn_1",
    });
    // The copy with the customer's name on top never goes from coss.com's address.
    expect(recorder.sent[0]?.params.html).toBe("<p>coss</p>");

    const ok = service();
    await signMailer({ service: ok, fallback: null }).send(
      email({
        from: "contracts@acme.com",
        attachment: { filename: "NDA (signed).pdf", content: new Uint8Array([37, 80, 68, 70]) },
      }),
    );
    expect(ok.sent[0]).toMatchObject({
      environment: live,
      params: {
        from: '"Acme Inc" <contracts@acme.com>',
        attachments: [
          { filename: "NDA (signed).pdf", content: "JVBERg==", content_type: "application/pdf" },
        ],
      },
    });
  });

  test("a retry sends nothing once any route sent it", async () => {
    // An earlier attempt went out one way; the retry's body differs (a new link), and the route
    // changed in between (the domain lost or regained verification, email_from changed).
    for (const sentIn of ["env_live", "env_coss"]) {
      const recorder = service();
      const mailer = signMailer({
        service: recorder,
        fallback: { environment: coss, address: "sign@coss.com" },
        sentBefore: async (environments, key) =>
          key === "sign-invite:ssgn_1" &&
          environments.some((environment) => environment.environmentId === sentIn),
      });
      expect(await mailer.send(email({ from: "contracts@acme.com" }))).toEqual({ replayed: true });
      expect(await mailer.send(email())).toEqual({ replayed: true });
      expect(recorder.sent).toEqual([]);
    }
  });

  test("sandbox emails stay in their environment; live ones wait without any sender", async () => {
    const recorder = service();
    const mailer = signMailer({ service: recorder, fallback: null });
    const sandbox = { ...live, environmentId: "env_sandbox", mode: "sandbox" as const };
    await mailer.send(email({ environment: sandbox }));
    expect(recorder.sent[0]?.environment).toEqual(sandbox);
    await expect(mailer.send(email())).rejects.toThrow("email_from");
  });

  test("an already sent email is fine", async () => {
    const mailer = signMailer({
      service: service(() => new EmailError("idempotency_key_reused", "used")),
      fallback: { environment: coss, address: "sign@coss.com" },
    });
    await mailer.send(email());
    expect(addressOf("coss.com <notifications@coss.com>")).toBe("notifications@coss.com");
  });
});
