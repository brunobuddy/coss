import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparePage } from "@/components/calendar/compare/compare-page";
import { JsonLd } from "@/components/json-ld";
import { COMPETITORS, competitorBySlug } from "@/lib/calendar/compare";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";
import { compareSchema } from "@/lib/calendar/structured-data";

export default async function Page(props: PageProps<"/kloq/compare/[competitor]">) {
  const { competitor } = await props.params;
  const data = competitorBySlug(competitor);
  if (!data) notFound();

  return (
    <>
      <JsonLd data={compareSchema(data)} />
      <ComparePage competitor={data} />
    </>
  );
}

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata(
  props: PageProps<"/kloq/compare/[competitor]">,
): Promise<Metadata> {
  const { competitor } = await props.params;
  const data = competitorBySlug(competitor);
  if (!data) notFound();

  const title = `kloq vs ${data.name}: ${data.query}`;
  const description = data.verdict;
  const url = `/kloq/compare/${data.slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: canonical(url),
    openGraph: { images: [OG_IMAGE], type: "article", title, description, url: abs(url) },
    twitter: { card: "summary_large_image", images: [OG_IMAGE], title, description },
  };
}
