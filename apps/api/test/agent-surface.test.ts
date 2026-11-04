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
import { createTestTenant } from "@coss/tenancy/testing";
import { Coss } from "coss";
import {
  diagnoseHookDelivery,
  fetchSchedulingSlotsDiagnosis,
  VERIFICATION_REASON_EXPLANATIONS,
} from "coss/diagnose";
import { AGENT_SURFACE_EXEMPTIONS } from "./agent-surface-exemptions.ts";
import { createTestApp } from "./helpers.ts";

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
 * `source` without comments and what strings hold, so only code counts: a reference like
 * `"coss.hooks.endpoints.recover(…)"` in a next step isn't a call. Template literals keep their
 * `${…}` code. A `/` after something a value can end with is division; otherwise a regex literal.
 */
function codeOnly(source: string): string {
  let out = "";
  let i = 0;
  // One entry per open template literal: the `{` depth inside its current `${…}`.
  const templates: number[] = [];
  const template = () => {
    while (i < source.length) {
      const char = source[i];
      if (char === "\\") i += 2;
      else if (char === "`") {
        i += 1;
        out += "``";
        return;
      } else if (char === "$" && source[i + 1] === "{") {
        i += 2;
        templates.push(0);
        return;
      } else i += 1;
    }
  };
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (char === "'" || char === '"') {
      i += 1;
      while (i < source.length && source[i] !== char) i += source[i] === "\\" ? 2 : 1;
      i += 1;
      out += '""';
    } else if (char === "`") {
      i += 1;
      template();
    } else if (char === "/" && !/[\w$)\]]\s*$/.test(out.slice(-40))) {
      // A regex literal: to its closing `/`, past escapes and character classes.
      i += 1;
      let inClass = false;
      while (i < source.length && (source[i] !== "/" || inClass)) {
        if (source[i] === "\\") i += 1;
        else if (source[i] === "[") inClass = true;
        else if (source[i] === "]") inClass = false;
        i += 1;
      }
      i += 1;
      out += "/~/";
    } else if (char === "{" && templates.length > 0) {
      templates[templates.length - 1] = (templates.at(-1) as number) + 1;
      out += char;
      i += 1;
    } else if (char === "}" && templates.length > 0) {
      if (templates.at(-1) === 0) {
        templates.pop();
        i += 1;
        template();
      } else {
        templates[templates.length - 1] = (templates.at(-1) as number) - 1;
        out += char;
        i += 1;
      }
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

/**
 * What the MCP server and the CLI call: code only, whitespace gone so a call split over lines still
 * matches. The SDK's setup report and diagnoses count: `get_setup`, `coss init` and the diagnose
 * tools and commands are what call them.
 */
const CALLED = [
  sources("packages/mcp/src"),
  sources("packages/cli/src"),
  sources("packages/sdk/src", (name) => name === "setup.ts" || name.startsWith("diagnose")),
]
  .map(codeOnly)
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

describe("codeOnly", () => {
  test("keeps code; drops comments, strings and regex contents", () => {
    const source = [
      "// coss.a.commented(",
      "/* coss.a.block( */",
      'const text = "coss.a.string(";',
      "const single = 'coss.a.single(';",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this is source text to scan.
      "const template = `coss.a.template( ${coss.a.inTemplate({ x: `${coss.a.nested()}` })} coss.a.after(`;",
      "const regex = /coss.a.regex(\\/[/\"']/.test(value);",
      "const ratio = a / b; coss.a.divided();",
      "coss.a.called();",
    ].join("\n");
    const code = codeOnly(source);
    for (const called of ["inTemplate", "nested", "divided", "called"]) {
      expect(code).toContain(`coss.a.${called}(`);
    }
    for (const hidden of ["commented", "block", "string", "single", "template", "after", "regex"]) {
      expect(code).not.toContain(`coss.a.${hidden}(`);
    }
  });

  test("doesn't lose its place in the real sources", () => {
    for (const method of [
      "coss.email.send(",
      "coss.domains.verify(",
      "coss.hooks.messages.send(",
    ]) {
      expect(CALLED).toContain(method);
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

  test("who's in a pool: the same hosts the API offers", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = new Coss({
      apiKey: tenant.sandboxKey,
      baseUrl: "http://api.test",
      fetch: (input, init) =>
        Promise.resolve(
          app.fetch(
            input instanceof Request ? new Request(input, init) : new Request(String(input), init),
          ),
        ),
    });
    const hours = { rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }] };
    const host = async (uid: string, attributes: Record<string, string | string[]>) => {
      await coss.scheduling.hosts.create({ uid, name: uid, time_zone: "UTC", attributes });
      return uid;
    };
    const everyone = [
      await host("one-value", { team: "sales" }),
      await host("several-values", { team: ["support", "sales"] }),
      await host("other-value", { team: "support" }),
      await host("no-attribute", { region: "emea" }),
      await host("both-keys", { team: "sales", region: "emea" }),
    ];
    const filters: Record<string, string | string[]>[] = [
      { team: "sales" },
      { team: ["sales", "support"] },
      { team: "sales", region: "emea" },
      { region: "apac" },
    ];
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86_400_000).toISOString();

    // Nobody has hours yet, so each diagnosis looks at its pool's hosts by itself.
    const diagnosed: string[][] = [];
    for (const [index, host_filter] of filters.entries()) {
      const eventType = await coss.scheduling.eventTypes.create({
        uid: `pool-${index}`,
        kind: "pool",
        title: "Pool",
        duration_minutes: 30,
        host_filter,
      });
      expect(eventType.error).toBeNull();
      const diagnosis = await fetchSchedulingSlotsDiagnosis(coss, `pool-${index}`, { start, end });
      diagnosed.push((diagnosis.data?.hosts ?? []).map((entry) => entry.id).sort());
    }

    // What the API itself offers, once everyone has hours.
    for (const uid of everyone) await coss.scheduling.schedules.create(uid, hours);
    for (const index of filters.keys()) {
      const search = await coss.scheduling.availability.search({
        event_type: `pool-${index}`,
        start,
        end,
      });
      expect(search.error).toBeNull();
      expect(diagnosed[index]).toEqual((search.data?.data ?? []).map((entry) => entry.host).sort());
    }
  });
});
