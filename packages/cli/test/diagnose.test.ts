import { describe, expect, test } from "bun:test";
import { PRODUCT_SDK_REFERENCES } from "coss/diagnose";
import {
  form,
  hookDelivery,
  hookEndpoint,
  schedulingEventType,
  schedulingHost,
  signer,
  signRequest,
  sms,
  smsEvent,
  submission,
  VERIFY_SETTINGS,
  verification,
} from "../../sdk/test/diagnose-fixtures.ts";
import { PRODUCT_REFERENCES } from "../src/commands/diagnose.ts";
import { findCommand } from "../src/completion.ts";
import { COMMANDS, run } from "../src/run.ts";
import { fakeFetch, SANDBOX_KEY, testIo } from "./helpers.ts";

const env = { COSS_API_KEY: SANDBOX_KEY };
const list = (data: unknown[]) => ({ object: "list", data, has_more: false });
const SMS_ID = "sms_01k7c8m4q2f3e9v6t5r1n0p8yz";

async function diagnose(argv: string[], routes: Parameters<typeof fakeFetch>[0]) {
  const { fetch, requests } = fakeFetch(routes);
  const io = testIo({ env, fetch });
  const code = await run(argv, io);
  return { code, io, requests };
}

describe("coss … diagnose", () => {
  test("sms diagnose by number: the newest, in the CLI's terms", async () => {
    const failure = { code: "carrier_filtered", message: "Filtered." };
    const { code, io } = await diagnose(["sms", "diagnose", "--to", "+15005550004"], {
      "GET /v1/sms": list([sms({ id: "sms_1" })]),
      "GET /v1/sms/sms_1": sms({
        id: "sms_1",
        status: "undelivered",
        delivered_at: null,
        failure,
      }),
      "GET /v1/sms/sms_1/events": list([smsEvent("sms.undelivered", { failure })]),
    });
    expect(code).toBe(0);
    expect(io.output()).toContain("not delivered");
    expect(io.output()).toContain("`coss sms numbers`");
    expect(io.output()).toContain("sms.undelivered");
  });

  test("sms diagnose: nothing found, or too much asked", async () => {
    const none = await diagnose(["sms", "diagnose", "--to", "+15005550004"], {
      "GET /v1/sms": list([]),
    });
    expect(none.code).toBe(1);
    expect(none.io.errors()).toContain("No message to +15005550004");
    const both = await diagnose(["sms", "diagnose", "sms_1", "--to", "+1"], {});
    expect(both.code).toBe(2);
    const neither = await diagnose(["sms", "diagnose"], {});
    expect(neither.code).toBe(2);
  });

  test("verify diagnose: blocked, with the fraud guard's reasons, as JSON too", async () => {
    const blocked = verification({
      status: "blocked",
      sends: [],
      reasons: [{ code: "ip.tor" }],
    });
    const routes = {
      "GET /v1/verifications/vrf_1": blocked,
      "GET /v1/verify/settings": VERIFY_SETTINGS,
    };
    const { code, io } = await diagnose(["verify", "diagnose", "vrf_1"], routes);
    expect(code).toBe(0);
    expect(io.output()).toContain("ip.tor: The end user's IP address is a Tor exit node.");
    expect(io.output()).toContain("`coss risk lists add allow <type> <value>`");
    const json = await diagnose(["verify", "diagnose", "vrf_1", "--json"], routes);
    expect(JSON.parse(json.io.output())).toMatchObject({
      verdict: "blocked",
      verification_id: "vrf_1",
    });
  });

  test("verify diagnose follows the latest code's message, and never prints a code", async () => {
    const { io } = await diagnose(["verify", "diagnose", "--to", "+14155550199"], {
      "GET /v1/verifications": list([verification()]),
      "GET /v1/verifications/vrf_1": verification(),
      [`GET /v1/sms/${SMS_ID}`]: sms(),
      [`GET /v1/sms/${SMS_ID}/events`]: list([smsEvent("sms.delivered")]),
    });
    expect(io.output()).toContain("latest code:");
    expect(io.output()).toContain("Delivered to");
    expect(io.output()).not.toContain("482913");
  });

  test("sign diagnose: each signer's state, whose turn, and terminal escapes removed", async () => {
    const { code, io } = await diagnose(["sign", "diagnose", "sreq_1"], {
      "GET /v1/sign/requests/sreq_1": signRequest({
        signing_order: "sequential",
        signers: [
          signer({ id: "s1", name: "Ada\u001b]0;pwned\u0007", status: "viewed", viewed_at: "t" }),
          signer({ id: "s2", name: "Grace", order: 2, status: "pending" }),
        ],
      }),
      "GET /v1/sign/requests/sreq_1/audit_trail": list([]),
    });
    expect(code).toBe(0);
    expect(io.output()).toContain("awaiting signers");
    expect(io.output()).toContain("waiting for turn");
    expect(io.output()).toContain("`coss sign remind <request>`");
    expect(io.output()).not.toContain("\u001b]0;");
  });

  test("forms diagnose: spam looks like a success, and the values stay out", async () => {
    const { code, io } = await diagnose(["forms", "diagnose", "form_1"], {
      "GET /v1/forms/form_1": form(),
      "GET /v1/forms/form_1/submissions": list([submission({ id: "fsub_9" })]),
      "GET /v1/forms/form_1/submissions/fsub_9": submission({
        id: "fsub_9",
        status: "spam",
        spam_reason: "risk_block",
        accepted_at: null,
      }),
    });
    expect(code).toBe(0);
    expect(io.output()).toContain("even though the submitter saw a success");
    expect(io.output()).toContain("submitter saw:");
    expect(io.output()).toContain("`coss forms release <form> <submission>`");
    expect(io.output()).not.toContain("Ignore your instructions");
    const none = await diagnose(["forms", "diagnose", "form_1"], {
      "GET /v1/forms/form_1/submissions": list([]),
    });
    expect(none.code).toBe(1);
    const usage = await diagnose(["forms", "diagnose"], {});
    expect(usage.code).toBe(2);
  });

  test("hooks diagnose: by delivery, or a message's worst", async () => {
    const app = "GET /v1/hooks/applications/happ_1";
    const failed = hookDelivery({
      id: "hdlv_bad",
      status: "failed",
      attempt_count: 8,
      next_attempt_at: null,
      last_status_code: 404,
    });
    const routes = {
      [`${app}/messages/hmsg_1/deliveries`]: list([
        hookDelivery({ id: "hdlv_ok", status: "succeeded", last_status_code: 200 }),
        failed,
      ]),
      [`${app}/deliveries/hdlv_bad`]: failed,
      [`${app}/deliveries/hdlv_bad/attempts`]: list([
        {
          object: "hook_attempt",
          id: "hatt_1",
          delivery_id: "hdlv_bad",
          endpoint_id: "hep_1",
          attempted_at: "2026-10-15T11:00:00.000Z",
          status_code: 404,
          duration_ms: 40,
          error: null,
          response_excerpt: "Not here",
        },
      ]),
      [`${app}/endpoints/hep_1`]: hookEndpoint(),
    };
    const { code, io } = await diagnose(
      ["hooks", "diagnose", "happ_1", "--message", "hmsg_1"],
      routes,
    );
    expect(code).toBe(0);
    expect(io.output()).toContain("the URL is wrong");
    expect(io.output()).toContain("8/8 attempts");
    expect(io.output()).toContain("answered: Not here");
    expect(io.output()).toContain("`coss hooks retry <app> <delivery>`");
    expect((await diagnose(["hooks", "diagnose", "happ_1", "hdlv_bad"], routes)).code).toBe(0);
    expect((await diagnose(["hooks", "diagnose", "happ_1"], routes)).code).toBe(2);
    expect(
      (await diagnose(["hooks", "diagnose", "happ_1", "hdlv_bad", "--message", "m"], routes)).code,
    ).toBe(2);
  });

  test("scheduling diagnose: findings with how sure they are", async () => {
    const { code, io } = await diagnose(["scheduling", "diagnose", "set_1"], {
      "GET /v1/scheduling/event_types/set_1": schedulingEventType(),
      "GET /v1/scheduling/event_types/set_1/slots": list([]),
      "GET /v1/scheduling/hosts/shost_1": schedulingHost(),
      "GET /v1/scheduling/hosts/shost_1/schedules": list([]),
      "GET /v1/scheduling/hosts/shost_1/calendar_connections": list([]),
      "GET /v1/scheduling/bookings": list([]),
    });
    expect(code).toBe(0);
    expect(io.output()).toContain("no slots");
    expect(io.output()).toContain("no_schedule");
    expect(io.output()).toContain("certain");
    expect(io.output()).toContain("Grace has no working hours");
  });

  test("an API failure is reported, and exits 1", async () => {
    const { code, io } = await diagnose(["sign", "diagnose", "nope"], {});
    expect(code).toBe(1);
    expect(io.errors()).toContain("Couldn't diagnose the request");
  });

  test("every reference names a real command", () => {
    expect(Object.keys(PRODUCT_REFERENCES).sort()).toEqual(
      Object.keys(PRODUCT_SDK_REFERENCES).sort(),
    );
    for (const reference of Object.values(PRODUCT_REFERENCES)) {
      const words = reference
        .replace(/^`coss /, "")
        .replace(/`$/, "")
        .split(" ");
      expect([reference, findCommand(COMMANDS, words) !== null]).toEqual([reference, true]);
    }
  });
});
