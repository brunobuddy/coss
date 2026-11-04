import { describe, expect, test } from "bun:test";
import { EmailError, type SendEmailInput } from "@coss/email";
import { PermanentSupportSendError, type SupportEmail } from "@coss/support";
import { supportMailer } from "../src/support-mailer.ts";

const environment = {
  organizationId: "org_coss",
  projectId: "proj_coss",
  environmentId: "env_support",
  mode: "live" as const,
};

function email(overrides: Partial<SupportEmail> = {}): SupportEmail {
  return {
    fromName: "coss.com support",
    to: ["ada@example.com"],
    cc: [],
    replyTo: "t_1@reply.coss.com",
    subject: "Re: help",
    text: "text",
    html: "<p>html</p>",
    inReplyTo: null,
    references: [],
    attachments: [],
    idempotencyKey: "support:1",
    requestHash: "hash",
    ...overrides,
  } as SupportEmail;
}

function mailer(fail?: Error) {
  const sent: SendEmailInput[] = [];
  return {
    sent,
    mailer: supportMailer({
      environment,
      fromAddress: "support@coss.com",
      service: {
        async send(input: SendEmailInput) {
          if (fail) throw fail;
          sent.push(input);
          return { email: { id: "email_1" } };
        },
        messageIdOf: () => null,
      } as never,
    }),
  };
}

describe("supportMailer", () => {
  test("threads replies, never tracks and is exempt from screening", async () => {
    const { mailer: m, sent } = mailer();
    await expect(
      m.send(email({ inReplyTo: "<a@x>", references: ["<z@x>", "<a@x>"] })),
    ).resolves.toEqual({ emailId: "email_1" });
    const input = sent[0] as SendEmailInput;
    expect(input.params.headers).toEqual({ "in-reply-to": "<a@x>", references: "<z@x> <a@x>" });
    expect(input.params.tracking).toEqual({ opens: false, clicks: false, unsubscribe: false });
    expect(input.screeningExempt).toBe(true);
    expect(input.idempotencyKey).toBe("support:1");
    expect(input.apiKeyId).toBeNull();
  });

  test("base64-encodes attachments", async () => {
    const { mailer: m, sent } = mailer();
    await m.send(
      email({
        attachments: [
          { filename: "a.txt", contentType: "text/plain", content: new Uint8Array([104, 105]) },
        ],
      }),
    );
    expect(sent[0]?.params.attachments).toEqual([
      { filename: "a.txt", content: "aGk=", content_id: null, content_type: "text/plain" },
    ]);
  });

  test("an invalid message fails for good rather than retrying", async () => {
    const { mailer: m } = mailer();
    await expect(m.send(email({ to: ["not an address"] }))).rejects.toBeInstanceOf(
      PermanentSupportSendError,
    );
  });

  test("other send errors stay retryable", async () => {
    const { mailer: m } = mailer(new Error("database down"));
    await expect(m.send(email())).rejects.toThrow("database down");
  });

  test("EmailError other than a reused key is rethrown", async () => {
    const failure = new EmailError("billing_hold", "Held.");
    const { mailer: m } = mailer(failure);
    await expect(m.send(email())).rejects.toBe(failure);
  });
});
