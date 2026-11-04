import { docsMarkdownResponse } from "@/lib/llms";
import { source } from "@/lib/source";

// `/docs/index.md` is rewritten here (next.config.ts): the docs home as Markdown.
export const revalidate = false;

export async function GET() {
  const page = source.getPage([]);
  if (!page) throw new Error("The docs have no home page.");
  return docsMarkdownResponse(page);
}
