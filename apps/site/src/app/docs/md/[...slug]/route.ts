import { notFound } from "next/navigation";
import { docsMarkdownResponse } from "@/lib/llms";
import { source } from "@/lib/source";

// `/docs/<page>.md` is rewritten here (next.config.ts); the docs home's is ../route.ts.
export const revalidate = false;
export const dynamicParams = false;

export async function GET(_request: Request, { params }: RouteContext<"/docs/md/[...slug]">) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return docsMarkdownResponse(page);
}

export function generateStaticParams() {
  return source.generateParams().filter(({ slug }) => slug.length > 0);
}
