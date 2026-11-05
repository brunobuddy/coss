import { notFound } from "next/navigation";
import { marketingMarkdown, productBySlug, productPages } from "@/lib/marketing";
import { markdownResponse } from "@/lib/site";

// `/products/<slug>.md` is rewritten here (next.config.ts).
export const revalidate = false;
export const dynamicParams = false;

export async function GET(_request: Request, { params }: RouteContext<"/products/md/[slug]">) {
  const page = productBySlug((await params).slug);
  if (!page) notFound();
  return markdownResponse(await marketingMarkdown(page), page.url);
}

export function generateStaticParams() {
  return productPages().map((page) => ({ slug: page.slugs[0] ?? "" }));
}
