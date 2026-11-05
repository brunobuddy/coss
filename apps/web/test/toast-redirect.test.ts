import { describe, expect, test } from "bun:test";
import { redirect } from "next/navigation";
import { isSuccessRedirect } from "../src/lib/toast";

function thrownBy(path: string): unknown {
  try {
    redirect(path);
  } catch (error) {
    return error;
  }
}

describe("isSuccessRedirect", () => {
  test("a redirect to a page means the action did its work", () => {
    expect(isSuccessRedirect(thrownBy("/acme/support/ticket_1"))).toBe(true);
  });

  test("a guard's redirect, or any other failure, means nothing happened", () => {
    expect(isSuccessRedirect(thrownBy("/sign-in?next=/acme/support/new"))).toBe(false);
    expect(isSuccessRedirect(new Error("Failed to fetch"))).toBe(false);
  });
});
