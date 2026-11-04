import { pricingMarkdown } from "@/lib/page-markdown";
import { markdownResponse } from "@/lib/site";

// `/pricing.md` is rewritten here (next.config.ts).
export const revalidate = false;

export function GET() {
  return markdownResponse(pricingMarkdown(), "/pricing");
}
