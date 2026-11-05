import { describe, expect, test } from "bun:test";
import {
  needsSenderRegistration,
  registerAgainHref,
  registerSenderHref,
} from "../src/lib/sms-registration";

const local = { id: "num_local", kind: "local", status: "active", providerSid: "PN1" } as const;
const tollFree = { id: "num_tf", kind: "toll_free", status: "active", providerSid: "PN2" } as const;

describe("registerSenderHref", () => {
  test("an unregistered local number registers the organization for 10DLC", () => {
    expect(registerSenderHref(local, null)).toBe("/sms/numbers/register?kind=us_10dlc");
  });

  test("an unregistered toll-free number is verified on its own", () => {
    expect(registerSenderHref(tollFree, null)).toBe("/sms/numbers/register?number=num_tf");
  });

  test("rejected and failed registrations can be submitted again", () => {
    expect(registerSenderHref(local, "rejected")).not.toBeNull();
    expect(registerSenderHref(tollFree, "failed")).not.toBeNull();
  });

  test("nothing to register while a registration is under way or approved", () => {
    for (const status of ["submitted", "in_review", "approved"] as const) {
      expect(registerSenderHref(local, status)).toBeNull();
      expect(registerSenderHref(tollFree, status)).toBeNull();
    }
  });

  test("a toll-free purchase that hasn't settled can't be verified yet, a local one still registers", () => {
    expect(
      registerSenderHref({ ...tollFree, status: "pending", providerSid: null }, null),
    ).toBeNull();
    expect(
      needsSenderRegistration({ ...tollFree, status: "pending", providerSid: null }, null),
    ).toBe(true);
    expect(registerSenderHref({ ...local, status: "pending", providerSid: null }, null)).toBe(
      "/sms/numbers/register?kind=us_10dlc",
    );
  });

  test("a number being released needs nothing", () => {
    expect(needsSenderRegistration({ ...local, status: "releasing" }, null)).toBe(false);
    expect(registerSenderHref({ ...tollFree, status: "releasing" }, null)).toBeNull();
  });
});

describe("registerAgainHref", () => {
  test("a refused registration is retried for the same sender", () => {
    expect(registerAgainHref({ kind: "toll_free", numberId: "num_tf" })).toBe(
      "/sms/numbers/register?number=num_tf",
    );
    expect(registerAgainHref({ kind: "us_10dlc", numberId: null })).toBe(
      "/sms/numbers/register?kind=us_10dlc",
    );
  });
});
