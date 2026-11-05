import { notFound } from "next/navigation";
import { productBySlug, productPages } from "@/lib/marketing";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "A coss.com product";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = productBySlug((await params).slug);
  if (!page) notFound();
  return ogImage({
    label: page.data.call,
    title: page.data.headline,
    description: page.data.description,
  });
}

export function generateStaticParams() {
  return productPages().map((page) => ({ slug: page.slugs[0] ?? "" }));
}
