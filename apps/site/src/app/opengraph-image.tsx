import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";
import { SITE_DESCRIPTION } from "@/lib/site";

// coss.com's default card: every page without its own (the landing page, pricing, docs) uses it.
export const alt = "coss.com: one API key and one SDK";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    label: "One key, one SDK",
    title: "The foundation the world's apps are built on.",
    description: SITE_DESCRIPTION,
  });
}
