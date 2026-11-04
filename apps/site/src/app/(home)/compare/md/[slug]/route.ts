import { notFound } from "next/navigation";
import { COMPARE_ROUTE, COMPETITORS, compareMarkdown, competitorBySlug } from "@/lib/compare";
import { markdownResponse, SITE_URL } from "@/lib/site";

// `/compare/<slug>.md` is rewritten here (next.config.ts).
export const revalidate = false;
export const dynamicParams = false;

export async function GET(_request: Request, { params }: RouteContext<"/compare/md/[slug]">) {
  const { slug } = await params;
  const competitor = competitorBySlug(slug);
  if (!competitor) notFound();
  const url = `${COMPARE_ROUTE}/${slug}`;
  return markdownResponse(compareMarkdown(competitor, `${SITE_URL}${url}`), url);
}

export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ slug: competitor.slug }));
}
