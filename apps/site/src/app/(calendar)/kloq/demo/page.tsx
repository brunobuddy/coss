import type { Metadata } from "next";
import { DemoCalendar } from "@/components/calendar/demo/demo-calendar";
import { JsonLd } from "@/components/json-ld";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";

const TITLE = "Live demo - a React calendar you can drag";
const DESCRIPTION =
  "The full kloq calendar, backed by localStorage. Drag to create, move and resize events; press ⌥D for design mode. Nothing leaves your browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: canonical("/kloq/demo"),
  openGraph: {
    images: [OG_IMAGE],
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: abs("/kloq/demo"),
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE],
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** Static: `?events=` (the stress store) is read on the client, in `DemoCalendar`. */
export default function DemoPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: TITLE,
          description: DESCRIPTION,
          url: abs("/kloq/demo"),
          applicationCategory: "DeveloperApplication",
          browserRequirements: "Requires JavaScript",
          offers: { "@type": "Offer", price: "0.00", priceCurrency: "USD" },
        }}
      />
      <DemoCalendar />
    </>
  );
}
