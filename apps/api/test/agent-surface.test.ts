/**
 * Drift guard: every API operation is either called by an MCP tool or CLI command, or listed in
 * `agent-surface-exemptions.ts` with why, and that list has no stale lines. It reads sources rather
 * than running anything, so a new operation fails here until someone decides what agents get.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOOK_MAX_ATTEMPTS } from "@coss/hooks";
import { VERIFICATION_REASONS } from "@coss/risk/schemas";
import { diagnoseHookDelivery, VERIFICATION_REASON_EXPLANATIONS } from "coss/diagnose";
import { AGENT_SURFACE_EXEMPTIONS } from "./agent-surface-exemptions.ts";

const ROOT = join(import.meta.dir, "../../..");

function sources(dir: string, include: (name: string) => boolean = () => true): string {
  let text = "";
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(ROOT, dir, name);
    if (statSync(path).isDirectory()) text += sources(join(dir, name), include);
    else if (name.endsWith(".ts") && include(name)) text += readFileSync(path, "utf8");
  }
  return text;
}

/** Every operation of the OpenAPI document, as `METHOD /path`. */
function operations(): string[] {
  const { paths } = JSON.parse(readFileSync(join(ROOT, "apps/api/openapi.json"), "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(paths).flatMap(([path, methods]) =>
    Object.keys(methods)
      .filter((method) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

/** `METHOD /path` → the SDK method (`tooling/sdkgen/src/methods.ts`, kept complete by its tests). */
function sdkMethods(): Map<string, string> {
  const text = readFileSync(join(ROOT, "tooling/sdkgen/src/methods.ts"), "utf8");
  return new Map(
    [...text.matchAll(/"([A-Z]+ \/[^"]+)":\s*"([^"]+)"/g)].map(
      (match) => [match[1] as string, match[2] as string] as const,
    ),
  );
}

/**
 * What the MCP server and the CLI call, whitespace gone so a call split over lines still matches.
 * The SDK's setup report and diagnoses count: `get_setup`, `coss init` and the diagnose tools and
 * commands are what call them.
 */
const CALLED = [
  sources("packages/mcp/src"),
  sources("packages/cli/src"),
  sources("packages/sdk/src", (name) => name === "setup.ts" || name.startsWith("diagnose")),
]
  .join("\n")
  .replace(/\s+/g, "")
  .replaceAll("?.", ".");

function isCalled(operation: string, methods: Map<string, string>): boolean {
  return CALLED.includes(`coss.${methods.get(operation)}(`);
}

describe("agent surface", () => {
  const all = operations();
  const methods = sdkMethods();

  test("every operation has an SDK method to look for", () => {
    expect(all.filter((operation) => !methods.has(operation))).toEqual([]);
  });

  test("every operation is called by a tool or command, or exempted with a reason", () => {
    const uncovered = all.filter(
      (operation) => !isCalled(operation, methods) && !AGENT_SURFACE_EXEMPTIONS[operation],
    );
    // A new operation: add an MCP tool or CLI command, or a line in agent-surface-exemptions.ts.
    expect(uncovered).toEqual([]);
  });

  test("no exemption is stale", () => {
    const known = new Set(all);
    const stale = Object.keys(AGENT_SURFACE_EXEMPTIONS).filter(
      (operation) => !known.has(operation) || isCalled(operation, methods),
    );
    // Delete these lines from agent-surface-exemptions.ts: they're used now, or they're gone.
    expect(stale).toEqual([]);
  });

  test("every exemption has a reason", () => {
    for (const [operation, reason] of Object.entries(AGENT_SURFACE_EXEMPTIONS)) {
      expect([operation, reason.length > 20]).toEqual([operation, true]);
    }
  });
});

describe("what the diagnoses mirror", () => {
  test("the fraud guard's reasons", () => {
    expect(Object.keys(VERIFICATION_REASON_EXPLANATIONS).sort()).toEqual(
      Object.keys(VERIFICATION_REASONS).sort(),
    );
  });

  test("a delivery's attempts", () => {
    const { max_attempts } = diagnoseHookDelivery({
      delivery: {
        object: "hook_delivery",
        id: "hdlv_1",
        application_id: "happ_1",
        message_id: "hmsg_1",
        endpoint_id: "hep_1",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_status_code: null,
        last_error: null,
        created_at: "2026-10-15T12:00:00.000Z",
        finished_at: null,
      },
    });
    expect(max_attempts).toBe(HOOK_MAX_ATTEMPTS);
  });
});
