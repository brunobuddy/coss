import { notFound } from "next/navigation";
import { COMPETITORS, competitorBySlug } from "@/lib/compare";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "coss.com compared with another service";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const competitor = competitorBySlug((await params).slug);
  if (!competitor) notFound();
  return ogImage({
    label: "Compare",
    title: `coss.com vs ${competitor.name}`,
    description: competitor.verdict,
  });
}

export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ slug: competitor.slug }));
}
