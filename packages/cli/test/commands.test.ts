import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandHelp, flagLabel, wrap } from "../src/command.ts";
import { complete } from "../src/completion.ts";
import { writeConfig } from "../src/config.ts";
import { COMMANDS, HELP, run } from "../src/run.ts";
import { testIo } from "./helpers.ts";

const README = readFileSync(join(import.meta.dir, "../README.md"), "utf8");
const DOCS = readFileSync(
  join(import.meta.dir, "../../../apps/site/content/docs/(tools)/cli.mdx"),
  "utf8",
);

describe("the command registry", () => {
  test("coss --help lists every command; coss <command> --help shows its flags", async () => {
    for (const command of COMMANDS) {
      expect(HELP).toContain(`  ${command.name} `);
      const io = testIo();
      expect(await run([...command.name.split(" "), "--help"], io)).toBe(0);
      expect(io.output()).toBe(`${commandHelp(command)}\n`);
      expect(io.output()).toStartWith(`Usage: coss ${command.name} `);
      for (const [name, flag] of Object.entries(command.flags)) {
        expect(io.output()).toContain(flagLabel(name, flag));
      }
      for (const line of io.output().split("\n")) expect(line.length).toBeLessThanOrEqual(100);
    }
  });

  test("every command is in the README and the docs, with every flag in the docs", () => {
    for (const command of COMMANDS) {
      expect(README).toContain(`coss ${command.name}`);
      expect(DOCS).toContain(`coss ${command.name}`);
      for (const [name, flag] of Object.entries(command.flags)) {
        const documented =
          DOCS.includes(`--${name}`) || (flag.short && DOCS.includes(`-${flag.short}`));
        expect(documented ? name : `--${name} of coss ${command.name} is not in cli.mdx`).toBe(
          name,
        );
      }
    }
  });

  test("unknown commands and groups without a command are usage errors", async () => {
    for (const [argv, message] of [
      [["emails"], '"emails" needs a command: try `coss emails send`, `coss emails list`'],
      [["emails", "lst"], 'Unknown command "emails lst"'],
      [
        ["nope"],
        'Unknown command "nope". Run `coss --help` to see the commands. `coss api <path>`',
      ],
      [
        ["hooks", "apps"],
        '"hooks apps" needs a command: try `coss hooks apps list`, `coss hooks apps create`.',
      ],
      [["hooks", "apps", "delete", "x"], 'Unknown command "hooks apps delete"'],
      [
        ["hooks", "--json"],
        '"hooks" needs a command: try `coss hooks apps`, `coss hooks event-types`',
      ],
      [["risk", "lists", "--help"], '"risk lists" needs a command'],
      [["whoami", "extra"], "Unexpected argument"],
      [["whoami", "--nope"], "Unknown option"],
    ] as const) {
      const io = testIo();
      expect(await run([...argv], io)).toBe(2);
      expect(io.errors()).toContain(message);
    }
  });

  test("each of those errors says `coss api` calls anything without a command", async () => {
    for (const argv of [["emails"], ["emails", "lst"], ["nope"], ["hooks", "apps"]]) {
      const io = testIo();
      expect(await run(argv, io)).toBe(2);
      expect(io.errors()).toContain("`coss api <path>` calls any endpoint");
    }
  });

  test("wrap keeps lines within the width", () => {
    expect(wrap("one two three four", 2, 12)).toEqual(["  one two", "  three four"]);
  });
});

describe("shell completion", () => {
  test("commands, subcommands, flags and their values", async () => {
    const io = testIo();
    const c = (words: string[]) => complete(COMMANDS, words, io);
    // Each top-level word once, in `coss --help`'s order.
    expect(await c([""])).toEqual([
      ...new Set(COMMANDS.map((command) => command.name.split(" ")[0] ?? "")),
    ]);
    expect(await c([""])).toEqual(
      expect.arrayContaining([
        "login",
        "profiles",
        "use",
        "init",
        "open",
        "hooks",
        "risk",
        "trigger",
      ]),
    );
    expect(await c(["lo"])).toEqual(["login", "logout", "logs", "log-drains"]);
    // Groups inside groups: `coss hooks apps list`.
    expect(await c(["hooks", "e"])).toEqual(["event-types", "endpoints"]);
    expect(await c(["hooks", "apps", ""])).toEqual(["list", "create"]);
    expect(await c(["risk", "assess"])).toEqual(["assess", "assessments"]);
    expect(await c(["risk", "lists", "list", "--type", "d"])).toEqual(["domain"]);
    expect(await c(["hooks", "deliveries", "acme", "--status", ""])).toEqual([
      "pending",
      "succeeded",
      "failed",
    ]);
    expect(await c(["emails", ""])).toEqual([
      "send",
      "list",
      "get",
      "events",
      "diagnose",
      "cancel",
      "reschedule",
    ]);
    expect(await c(["webhooks", ""])).toEqual(["list", "add", "deliveries", "retry"]);
    // A command that has subcommands of its own.
    expect(await c(["inbox", ""])).toEqual(["get"]);
    expect(await c(["inbox", "get", ""])).toEqual([]);
    expect(await c(["emails", "send", "--sim"])).toEqual(["--simulate"]);
    expect(await c(["emails", "send", "--simulate", "b"])).toEqual(["bounced"]);
    expect(await c(["logs", "tail", "--source", ""])).toContain("webhook");
    expect(await c(["api", "-X", "P"])).toEqual(["POST", "PUT", "PATCH"]);
    expect(await c(["whoami", "--p"])).toEqual(["--profile"]);
    expect(await c(["completion", ""])).toEqual(["bash", "zsh", "fish"]);
    expect(await c(["open", "log"])).toEqual(["logs", "log-drains"]);
    // A value of its own (a path, an address): the shell offers files.
    expect(await c(["emails", "send", "--to", ""])).toEqual([]);
  });

  test("saved profiles complete --profile and coss use (nothing without a config)", async () => {
    const io = testIo();
    expect(await complete(COMMANDS, ["use", ""], io)).toEqual([]);
    const profile = { api_key: "coss_test_x", login: "manual" as const, created_at: "" };
    await writeConfig(io, { version: 1, profiles: { default: profile, staging: profile } });
    expect(await complete(COMMANDS, ["use", ""], io)).toEqual(["default", "staging"]);
    expect(await complete(COMMANDS, ["whoami", "--profile", "st"], io)).toEqual(["staging"]);
  });

  test("coss __complete prints them; coss completion prints each shell's script", async () => {
    const io = testIo();
    expect(await run(["__complete", "logs", "tail", "--le"], io)).toBe(0);
    expect(io.output()).toBe("--level\n");
    for (const shell of ["bash", "zsh", "fish"]) {
      const script = testIo();
      expect(await run(["completion", shell], script)).toBe(0);
      expect(script.output()).toContain("coss __complete");
    }
    const bad = testIo();
    expect(await run(["completion", "powershell"], bad)).toBe(2);
  });
});
