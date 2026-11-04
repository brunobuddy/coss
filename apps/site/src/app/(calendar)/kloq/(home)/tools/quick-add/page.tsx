import type { Metadata } from "next";
import { QuickAddParser } from "@/components/calendar/tools/quick-add-parser";
import { ToolShell } from "@/components/calendar/tools/tool-shell";
import { JsonLd } from "@/components/json-ld";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";
import { toolSchema } from "@/lib/calendar/structured-data";
import { toolOf } from "@/lib/calendar/tools";

const tool = toolOf("quick-add");

export const metadata: Metadata = {
  title: { absolute: tool.title },
  description: tool.description,
  alternates: canonical(`/kloq/tools/${tool.slug}`),
  openGraph: {
    images: [OG_IMAGE],
    type: "website",
    title: tool.title,
    description: tool.description,
    url: abs(`/kloq/tools/${tool.slug}`),
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE],
    title: tool.title,
    description: tool.description,
  },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={toolSchema({ name: tool.name, description: tool.description, slug: tool.slug })}
      />
      <ToolShell tool={tool}>
        <QuickAddParser />
      </ToolShell>
    </>
  );
}
