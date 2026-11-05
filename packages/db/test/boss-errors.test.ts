import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { logPgBossError } from "../src/boss-errors.ts";

describe("logPgBossError", () => {
  const consoleError = spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => consoleError.mockClear());

  const logged = () => consoleError.mock.calls[0]?.[1] as Error & { code?: string };

  test("turns the plain copies pg-boss emits back into errors", () => {
    const original = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const copy = { ...original, message: original.message, stack: original.stack };

    logPgBossError(copy as Error);

    expect(logged()).toBeInstanceOf(Error);
    expect(logged().message).toBe("connect ECONNREFUSED");
    expect(logged().stack).toBe(original.stack as string);
    expect(logged().code).toBe("ECONNREFUSED");
  });

  test("logs real errors as they are", () => {
    const error = new Error("boom");

    logPgBossError(error);

    expect(logged()).toBe(error);
  });
});
