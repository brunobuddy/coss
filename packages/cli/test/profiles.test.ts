import { describe, expect, test } from "bun:test";
import { dashboardPageUrl } from "../src/commands/open.ts";
import { type Config, type Profile, readConfig, writeConfig } from "../src/config.ts";
import { run } from "../src/run.ts";
import {
  apiError,
  environmentObject,
  fakeFetch,
  LIVE_KEY,
  SANDBOX_KEY,
  type TestIo,
  testIo,
} from "./helpers.ts";

function profile(mode: "live" | "sandbox", overrides: Partial<Profile> = {}): Profile {
  const environment = environmentObject(mode);
  return {
    api_key: mode === "live" ? LIVE_KEY : SANDBOX_KEY,
    api_key_id: environment.api_key.id,
    login: "browser",
    organization: { id: "org_1", name: "Acme", slug: "acme" },
    project: { id: "proj_1", name: "Default", slug: "default" },
    environment: {
      id: environment.id,
      name: environment.name,
      slug: environment.slug,
      mode,
    },
    created_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function withProfiles(io: TestIo, config: Partial<Config> = {}): Promise<void> {
  await writeConfig(io, {
    version: 1,
    default_profile: "default",
    profiles: {
      default: profile("sandbox"),
      prod: profile("live", { login: "manual", base_url: "http://localhost:3001" }),
    },
    ...config,
  });
}

describe("coss profiles list", () => {
  test("every saved profile, the one in use marked, never a key", async () => {
    const io = testIo();
    await withProfiles(io);
    expect(await run(["profiles", "list"], io)).toBe(0);
    const [first, second] = io.output().trim().split("\n");
    expect(first).toBe(
      "* default  Acme / Default / Development (sandbox)  default, created by coss login",
    );
    expect(second).toBe(
      "  prod  Acme / Default / Production (live)  pasted, http://localhost:3001",
    );
    expect(io.output()).not.toContain("coss_");

    const json = testIo({ configDir: io.configDir });
    expect(await run(["profiles", "list", "--json", "--profile", "prod"], json)).toBe(0);
    const rows = json
      .output()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows.map((row) => [row.name, row.default, row.in_use])).toEqual([
      ["default", true, false],
      ["prod", false, true],
    ]);
    expect(rows[1]).toMatchObject({ login: "manual", base_url: "http://localhost:3001" });
    expect(json.output()).not.toContain("coss_");

    const env = testIo({ configDir: io.configDir, env: { COSS_API_KEY: SANDBOX_KEY } });
    expect(await run(["profiles", "list"], env)).toBe(0);
    expect(env.output()).not.toContain("*");
    expect(env.errors()).toContain("COSS_API_KEY is set");
  });

  test("no profiles yet", async () => {
    const io = testIo();
    expect(await run(["profiles", "list"], io)).toBe(0);
    expect(io.output()).toBe("");
    expect(io.errors()).toContain("No saved profiles. Run `coss login`.");
  });
});

describe("coss use", () => {
  test("makes a saved profile the default", async () => {
    const io = testIo();
    await withProfiles(io);
    expect(await run(["use", "prod"], io)).toBe(0);
    expect(io.output()).toContain('"prod" is the default profile.');
    expect((await readConfig(io)).default_profile).toBe("prod");

    const shadowed = testIo({ configDir: io.configDir, env: { COSS_PROFILE: "default" } });
    expect(await run(["use", "default"], shadowed)).toBe(0);
    expect(shadowed.errors()).toContain("COSS_PROFILE is set in this shell");
  });

  test("refuses a profile that isn't saved, or no name", async () => {
    const io = testIo();
    await withProfiles(io);
    expect(await run(["use", "staging"], io)).toBe(1);
    expect(io.errors()).toContain('No profile named "staging" (saved: default, prod)');
    expect((await readConfig(io)).default_profile).toBe("default");
    expect(await run(["use"], testIo())).toBe(2);
    expect(await run(["use", "a", "b"], testIo())).toBe(2);
  });
});

describe("coss open", () => {
  test("URLs of environment and organization pages", () => {
    const slugs = { organization: "acme", project: "web", environment: "production" };
    expect(dashboardPageUrl("https://coss.com", slugs, "overview")).toBe(
      "https://coss.com/acme/web/production",
    );
    expect(dashboardPageUrl("https://coss.com", slugs, "api-keys")).toBe(
      "https://coss.com/acme/web/production/developers/api-keys",
    );
    expect(dashboardPageUrl("https://coss.com", slugs, "domains")).toBe(
      "https://coss.com/acme/web/production/email/domains",
    );
    expect(dashboardPageUrl("https://coss.com", slugs, "audit-log")).toBe(
      "https://coss.com/acme/settings/audit",
    );
  });

  test("opens the API key's environment, as the API names it now", async () => {
    // Renamed since login: the API's slugs win over the profile's.
    const renamed = { ...environmentObject(), slug: "dev" };
    const api = fakeFetch({ "GET /v1/environment": renamed });
    let opened = "";
    const io = testIo({
      fetch: api.fetch,
      openBrowser: async (url) => {
        opened = url;
        return true;
      },
    });
    await withProfiles(io);
    expect(await run(["open", "logs"], io)).toBe(0);
    expect(opened).toBe("https://coss.com/acme/default/dev/developers/logs");

    const printed = testIo({ fetch: api.fetch, env: { COSS_API_KEY: SANDBOX_KEY } });
    expect(await run(["open", "--print"], printed)).toBe(0);
    expect(printed.output()).toBe("https://coss.com/acme/default/dev\n");
    const json = testIo({ fetch: api.fetch, env: { COSS_API_KEY: SANDBOX_KEY } });
    expect(await run(["open", "webhooks", "--json"], json)).toBe(0);
    expect(JSON.parse(json.output())).toEqual({
      url: "https://coss.com/acme/default/dev/developers/webhooks",
    });
  });

  test("falls back to the profile's slugs, and prints the URL when no browser opens", async () => {
    const api = fakeFetch({
      "GET /v1/environment": () => apiError(503, "api_error", "service_unavailable"),
    });
    const io = testIo({ fetch: api.fetch });
    await withProfiles(io);
    expect(await run(["open", "emails"], io)).toBe(0);
    expect(io.output()).toBe("https://coss.com/acme/default/development/email/messages\n");
    expect(io.errors()).toContain("using the profile's");

    const env = testIo({ fetch: api.fetch, env: { COSS_API_KEY: SANDBOX_KEY } });
    expect(await run(["open"], env)).toBe(1);
    expect(env.errors()).toContain("Couldn't read the environment");
  });

  test("unknown pages are usage errors", async () => {
    const io = testIo({ env: { COSS_API_KEY: SANDBOX_KEY } });
    expect(await run(["open", "nope"], io)).toBe(2);
    expect(io.errors()).toContain("`coss open` takes one page: overview, home, products");
  });
});
