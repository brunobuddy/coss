import { CHANGELOG_ROUTE, changelogMarkdown } from "@/lib/changelog";
import { markdownResponse } from "@/lib/site";

export const revalidate = false;

export function GET() {
  return markdownResponse(changelogMarkdown(), CHANGELOG_ROUTE);
}
