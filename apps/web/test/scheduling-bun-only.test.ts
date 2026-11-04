import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dir, "../src");

/**
 * What works out who's free or what time a date means. The dashboard runs on Node, whose time zone
 * data can disagree with the API's Bun (`packages/scheduling/AGENTS.md`, "Slots").
 */
const BUN_ONLY = [
  "createBooking",
  "createHold",
  "createOutOfOffice",
  "createSeries",
  "listEventTypeSlots",
  "listReassignCandidates",
  "listRescheduleSlots",
  "previewReassignment",
  "previewSeries",
  "putOutOfOffice",
  "reassignBooking",
  "rescheduleBooking",
  "updateOutOfOffice",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the dashboard and scheduling's clock", () => {
  test("nothing here imports what has to run in Bun", () => {
    const imported = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@coss\/scheduling"/g;
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const [, names] of readFileSync(file, "utf8").matchAll(imported)) {
        for (const name of (names ?? "").split(",").map((part) => part.trim())) {
          if (BUN_ONLY.includes(name)) found.push(`${path.relative(SRC, file)}: ${name}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
