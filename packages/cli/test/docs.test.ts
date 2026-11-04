/** The docs list every command, so agents and people can find one without running `--help`. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMANDS } from "../src/run.ts";

const ROOT = join(import.meta.dir, "../../..");
const DOCS = {
  "(tools)/cli.mdx": readFileSync(join(ROOT, "apps/site/content/docs/(tools)/cli.mdx"), "utf8"),
  "packages/cli/README.md": readFileSync(join(ROOT, "packages/cli/README.md"), "utf8"),
};

describe("the docs list every command", () => {
  for (const [name, text] of Object.entries(DOCS)) {
    test(name, () => {
      const missing = COMMANDS.map((command) => command.name).filter(
        (command) => !new RegExp(`(?:^|[\\s\`])coss ${command}(?:[\\s\`]|$)`, "m").test(text),
      );
      expect(missing).toEqual([]);
    });
  }
});
