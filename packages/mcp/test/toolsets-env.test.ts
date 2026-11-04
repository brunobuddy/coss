import { describe, expect, test } from "bun:test";
import { parseToolsets } from "../src/toolsets-env.ts";

describe("COSS_MCP_TOOLSETS", () => {
  test("unset, empty or whitespace means every tool, not only the core ones", () => {
    for (const value of [undefined, "", "   ", " , ,"]) {
      expect(parseToolsets(value)).toEqual({ unknown: [] });
      expect(parseToolsets(value).toolsets).toBeUndefined();
    }
  });

  test("names the groups to offer", () => {
    expect(parseToolsets("email, sms")).toEqual({ toolsets: ["email", "sms"], unknown: [] });
  });

  test("reports names it doesn't know and keeps the rest", () => {
    expect(parseToolsets("email,nope")).toEqual({ toolsets: ["email"], unknown: ["nope"] });
  });

  test("only unknown names offer the core tools: fewer tools was still the choice", () => {
    expect(parseToolsets("nope")).toEqual({ toolsets: [], unknown: ["nope"] });
  });
});
