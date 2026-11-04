import { readFileSync } from "node:fs";
import { join } from "node:path";

function load(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "content-dates.json"), "utf8"));
  } catch {
    return {};
  }
}

const dates = load();

/**
 * The day a file under content/ last changed (YYYY-MM-DD), from the git history that
 * infra/scripts/site-content-dates.sh reads before an image build. Builds without that file give
 * no date: a build time would claim every page just changed.
 */
export function contentDate(path: string): string | undefined {
  return dates[path];
}
