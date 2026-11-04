import { describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeSetup } from "coss";
import {
  agentNotes,
  detectPackageManager,
  installCommand,
  removeEnvVar,
  setAgentNotes,
  setEnvVar,
} from "../src/commands/init.ts";
import { type CliIo, shellFor } from "../src/io.ts";
import { run } from "../src/run.ts";
import { apiError, environmentObject, fakeFetch, testIo } from "./helpers.ts";

const PROJECT_KEY = `coss_test_${"p".repeat(64)}`;

type Exec = { command: string; args: string[]; cwd: string };

/** A project directory, the dashboard and API, and a recording `exec` (git: not ignored). */
async function project(
  files: Record<string, string>,
  options: { mode?: "live" | "sandbox"; exec?: (call: Exec) => number | null } = {},
) {
  let tokenRequests = 0;
  const api = fakeFetch({
    "POST https://coss.com/api/cli/v1/token": () => {
      tokenRequests++;
      return { api_key: PROJECT_KEY, api_key_id: "key_p", name: "my-app · coss init" };
    },
    "GET /v1/environment": ({ headers }) =>
      headers.get("authorization") === `Bearer ${PROJECT_KEY}`
        ? environmentObject(options.mode ?? "sandbox")
        : apiError(401, "authentication_error", "invalid_api_key"),
    "DELETE /v1/api_key": { object: "api_key", id: "key_p", deleted: true },
  });
  const calls: Exec[] = [];
  const io = testIo({
    fetch: api.fetch,
    answers: ["the-code"],
    exec: async (command, args, { cwd }) => {
      const call = { command, args, cwd };
      calls.push(call);
      return options.exec ? options.exec(call) : command === "git" ? 1 : 0;
    },
  });
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(io.cwd, name, ".."), { recursive: true });
    await writeFile(join(io.cwd, name), text);
  }
  return { io, api, calls, tokens: () => tokenRequests };
}

const NEXT_APP = JSON.stringify({ name: "@acme/my-app", dependencies: { next: "16.0.0" } });

describe("coss init", () => {
  test("a Next.js project: a development key in .env.local, the SDK installed", async () => {
    const { io, api, calls } = await project({ "package.json": NEXT_APP, "bun.lock": "" });
    expect(await run(["init", "--no-browser"], io)).toBe(0);

    // The approval page is asked for a project key (sandbox environments only, named for it).
    const link = /https:\/\/coss\.com\/app\/authorize\/cli\?\S+/.exec(io.errors())?.[0] ?? "";
    expect(new URL(link).searchParams.get("project")).toBe("my-app");
    expect(new URL(link).searchParams.get("mode")).toBe("code");
    expect(api.requests.find((r) => r.url.pathname === "/api/cli/v1/token")?.body).toMatchObject({
      code: "the-code",
    });

    const envFile = join(io.cwd, ".env.local");
    expect(await readFile(envFile, "utf8")).toBe(`COSS_API_KEY=${PROJECT_KEY}\n`);
    expect((await stat(envFile)).mode & 0o777).toBe(0o600);
    expect(calls).toEqual([
      { command: "git", args: ["check-ignore", "-q", envFile], cwd: io.cwd },
      { command: "bun", args: ["add", "coss"], cwd: io.cwd },
    ]);
    expect(io.output()).toContain(
      "Saved a development key of Acme / Default / Development (sandbox) to .env.local as COSS_API_KEY.",
    );
    expect(io.output()).toContain("Installed the coss package.");
    expect(io.output()).toContain('import { Coss } from "coss";');
    expect(io.output()).toContain("coss listen --forward-to");
    expect(io.errors()).toContain(".env.local isn't ignored by git");
    // The key is written, never shown.
    expect(io.output() + io.errors()).not.toContain(PROJECT_KEY);
  });

  test("keeps a key the env file already has, unless --force", async () => {
    const existing = "# app\nDATABASE_URL=postgres://x\nCOSS_API_KEY=coss_test_old\nOTHER=1";
    const kept = await project({ ".env": existing }, { exec: () => 0 });
    expect(await run(["init"], kept.io)).toBe(0);
    expect(kept.tokens()).toBe(0);
    expect(await readFile(join(kept.io.cwd, ".env"), "utf8")).toBe(existing);
    expect(kept.io.errors()).toContain(".env already has COSS_API_KEY: kept it");
    expect(kept.io.errors()).toContain("No package.json here");
    expect(kept.io.errors()).not.toContain("isn't ignored by git");

    const forced = await project({ ".env": existing }, { exec: () => 0 });
    expect(await run(["init", "--force", "--no-browser"], forced.io)).toBe(0);
    expect(await readFile(join(forced.io.cwd, ".env"), "utf8")).toBe(
      `# app\nDATABASE_URL=postgres://x\nCOSS_API_KEY=${PROJECT_KEY}\nOTHER=1`,
    );
  });

  test("never writes a live key: it's revoked", async () => {
    const { io, api } = await project({ "package.json": NEXT_APP }, { mode: "live" });
    expect(await run(["init", "--no-browser"], io)).toBe(1);
    expect(io.errors()).toContain("is live, so its key was revoked");
    expect(
      api.requests.some((r) => r.method === "DELETE" && r.url.pathname === "/v1/api_key"),
    ).toBe(true);
    expect(await readFile(join(io.cwd, ".env.local"), "utf8").catch(() => null)).toBeNull();
  });

  test("--env-file, --no-install, a local API remembered, and JSON", async () => {
    const { io, calls } = await project(
      { "package.json": JSON.stringify({ name: "worker" }) },
      { exec: () => 0 },
    );
    io.env.COSS_BASE_URL = "http://localhost:3001";
    expect(
      await run(
        ["init", "--env-file", "config/dev.env", "--no-install", "--no-browser", "--json"],
        io,
      ),
    ).toBe(0);
    const envFile = join(io.cwd, "config/dev.env");
    expect(await readFile(envFile, "utf8")).toBe(
      `COSS_API_KEY=${PROJECT_KEY}\nCOSS_BASE_URL=http://localhost:3001\n`,
    );
    expect(calls.map((call) => call.command)).toEqual(["git"]);

    // A new key follows the API it came from: another local one, then the default.
    io.prompt = async () => "the-code";
    io.env.COSS_BASE_URL = "http://localhost:4001";
    const again = [
      "init",
      "--env-file",
      "config/dev.env",
      "--no-install",
      "--no-browser",
      "--force",
    ];
    expect(await run(again, io)).toBe(0);
    expect(await readFile(envFile, "utf8")).toBe(
      `COSS_API_KEY=${PROJECT_KEY}\nCOSS_BASE_URL=http://localhost:4001\n`,
    );
    delete io.env.COSS_BASE_URL;
    expect(await run(again, io)).toBe(0);
    expect(await readFile(envFile, "utf8")).toBe(`COSS_API_KEY=${PROJECT_KEY}\n`);
    expect(JSON.parse(io.output().trim().split("\n")[0] ?? "")).toEqual({
      env_file: envFile,
      key: {
        id: "key_1",
        name: "my-app · coss init",
        environment: "Acme / Default / Development (sandbox)",
      },
      installed: null,
      ignored_by_git: true,
      agents_file: join(io.cwd, "AGENTS.md"),
      setup: describeSetup({
        mode: "sandbox",
        domains: [],
        webhookEndpoints: [],
        productsInUse: [],
        warning:
          "Couldn't list domains (Not found.). Couldn't list webhook endpoints (Not found.).",
      }),
    });
  });

  test("a failed install says so (after the key is saved)", async () => {
    const { io } = await project(
      { "package.json": JSON.stringify({ name: "x" }), "package-lock.json": "{}" },
      { exec: (call) => (call.command === "npm" ? 1 : null) },
    );
    expect(await run(["init", "--no-browser"], io)).toBe(1);
    expect(io.errors()).toContain("`npm install coss` failed (exit code 1)");
    expect(await readFile(join(io.cwd, ".env"), "utf8")).toContain("COSS_API_KEY=");
  });

  test("skips the install when coss is already a dependency", async () => {
    const pkg = JSON.stringify({ name: "x", dependencies: { coss: "^0.6.0" } });
    const { io, calls } = await project({
      "package.json": pkg,
      ".env": "COSS_API_KEY=coss_test_k\n",
    });
    expect(await run(["init"], io)).toBe(0);
    expect(calls.map((call) => call.command)).toEqual(["git"]);
    expect(io.errors()).toContain("coss is already a dependency.");
  });
});

describe("coss init --agents", () => {
  test("adds the notes to AGENTS.md, and updates them on the next run", async () => {
    const { io } = await project(
      { "package.json": NEXT_APP, "AGENTS.md": "# My app\n\nUse pnpm.\n" },
      { exec: () => 0 },
    );
    expect(await run(["init", "--agents", "--no-install", "--no-browser"], io)).toBe(0);
    const file = join(io.cwd, "AGENTS.md");
    const first = await readFile(file, "utf8");
    expect(first).toBe(`# My app\n\nUse pnpm.\n\n${agentNotes(".env.local")}`);
    expect(first).toContain("https://coss.com/llms.txt");
    expect(first).toContain("in `.env.local` as `COSS_API_KEY`");
    expect(io.output()).toContain("Added the coss.com notes for coding agents in AGENTS.md.");

    // Kept key, same notes: the section is replaced, not added twice.
    expect(await run(["init", "--agents", "--no-install"], io)).toBe(0);
    expect(await readFile(file, "utf8")).toBe(first);
    expect(io.output()).toContain("Updated the coss.com notes for coding agents in AGENTS.md.");
  });

  test("a CLAUDE.md without AGENTS.md gets them; otherwise a new AGENTS.md", async () => {
    const claude = await project({ "CLAUDE.md": "Be terse." }, { exec: () => 0 });
    expect(await run(["init", "--agents", "--no-browser", "--json"], claude.io)).toBe(0);
    expect(await readFile(join(claude.io.cwd, "CLAUDE.md"), "utf8")).toBe(
      `Be terse.\n\n${agentNotes(".env")}`,
    );
    expect(JSON.parse(claude.io.output()).agents_file).toBe(join(claude.io.cwd, "CLAUDE.md"));

    const bare = await project({}, { exec: () => 0 });
    expect(await run(["init", "--agents", "--no-browser"], bare.io)).toBe(0);
    expect(await readFile(join(bare.io.cwd, "AGENTS.md"), "utf8")).toBe(agentNotes(".env"));
  });

  test("--no-agents writes no notes", async () => {
    const { io } = await project({ "package.json": NEXT_APP }, { exec: () => 0 });
    expect(await run(["init", "--no-agents", "--no-install", "--no-browser"], io)).toBe(0);
    expect(await readFile(join(io.cwd, "AGENTS.md"), "utf8").catch(() => null)).toBeNull();
    expect(io.output()).toContain('import { Coss } from "coss";');
    expect(io.output()).toContain('from: "hello@example.com"');
    expect(io.output()).toContain('to: "bounce@simulator.amazonses.com"');
  });

  test("a Nodemailer project is pointed at coss/nodemailer", async () => {
    const pkg = JSON.stringify({ name: "mailer", dependencies: { nodemailer: "7.0.0" } });
    const { io } = await project({ "package.json": pkg }, { exec: () => 0 });
    expect(await run(["init", "--no-agents", "--no-install", "--no-browser"], io)).toBe(0);
    expect(io.output()).toContain('from "coss/nodemailer"');
    expect(io.output()).toContain('to: "bounce@simulator.amazonses.com"');
    expect(io.output()).not.toContain('import { Coss } from "coss";');
  });

  test("a Laravel project is told the driver install command", async () => {
    const { io } = await project(
      { "composer.json": '{ "require": { "laravel/framework": "^12.0" } }' },
      { exec: () => 0 },
    );
    expect(await run(["init", "--no-agents", "--no-browser"], io)).toBe(0);
    expect(io.output()).toContain("composer require coss/laravel");
    expect(io.errors()).toContain("No package.json here");
  });

  test("a live key the env file keeps is called out, never called a development key", async () => {
    const { io } = await project(
      { ".env.local": "COSS_API_KEY=coss_live_abc\n" },
      { exec: () => 0 },
    );
    expect(await run(["init", "--agents", "--env-file", ".env.local"], io)).toBe(0);
    expect(io.errors()).toContain(".env.local's COSS_API_KEY is a live key");
    const notes = await readFile(join(io.cwd, "AGENTS.md"), "utf8");
    expect(notes).toContain("A `coss_live_…` key there delivers for real: don't test with it");
    expect(notes).not.toContain("is a development key");
  });

  test("the section is replaced wherever it is", () => {
    const notes = agentNotes(".env");
    const text = `# A\n\n${agentNotes(".env.old")}\n## B\n`;
    expect(setAgentNotes(text, notes)).toBe(`# A\n\n${notes}\n## B\n`);
    expect(setAgentNotes("", notes)).toBe(notes);
  });
});

describe("package managers", () => {
  test("only a Windows package-manager shim runs through a shell, with arguments it can't misread", () => {
    for (const manager of ["npm", "pnpm", "yarn", "bun"] as const) {
      const [command, args] = installCommand(manager);
      expect(shellFor(command, args, "win32")).toBe(manager !== "bun");
      expect(shellFor(command, args, "darwin")).toBe(false);
    }
    // git gets the env file's path: never a shell, whatever the path holds.
    expect(shellFor("git", ["check-ignore", "-q", "C:\\My Apps\\a&b\\.env"], "win32")).toBe(false);
    expect(shellFor("npm", ["install", "a&calc"], "win32")).toBeNull();
  });

  async function dir(files: string[], io: CliIo = testIo()): Promise<string> {
    for (const file of files) {
      await mkdir(join(io.cwd, file, ".."), { recursive: true });
      await writeFile(join(io.cwd, file), "");
    }
    return io.cwd;
  }

  test("the nearest lockfile, then packageManager, then npm", async () => {
    expect(await detectPackageManager(await dir(["pnpm-lock.yaml"]), {})).toBe("pnpm");
    expect(await detectPackageManager(await dir(["yarn.lock"]), {})).toBe("yarn");
    expect(await detectPackageManager(await dir(["bun.lockb"]), {})).toBe("bun");
    // A workspace package: the root's lockfile.
    const root = await dir(["bun.lock", "apps/web/package.json"]);
    expect(await detectPackageManager(join(root, "apps/web"), {})).toBe("bun");
    const bare = await dir([]);
    expect(await detectPackageManager(bare, { packageManager: "pnpm@10.0.0" })).toBe("pnpm");
    expect(await detectPackageManager(bare, {})).toBe("npm");
    expect(installCommand("npm")).toEqual(["npm", ["install", "coss"]]);
    expect(installCommand("yarn")).toEqual(["yarn", ["add", "coss"]]);
  });

  test("env vars are replaced in place or appended", () => {
    expect(removeEnvVar("A=1\n\nexport B=2\nC=3", "B")).toBe("A=1\n\nC=3");
    expect(removeEnvVar("A=1\nB=2", "B")).toBe("A=1\n");
    expect(setEnvVar("", "A", "1")).toBe("A=1\n");
    expect(setEnvVar("B=2", "A", "1")).toBe("B=2\nA=1\n");
    expect(setEnvVar("export A=old\nB=2\n", "A", "$new")).toBe("A=$new\nB=2\n");
  });
});
