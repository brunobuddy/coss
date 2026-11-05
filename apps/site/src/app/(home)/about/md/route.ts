import { aboutMarkdown } from "@/lib/page-markdown";
import { markdownResponse } from "@/lib/site";

// `/about.md` is rewritten here (next.config.ts).
export const revalidate = false;

export function GET() {
  return markdownResponse(aboutMarkdown(), "/about");
}
