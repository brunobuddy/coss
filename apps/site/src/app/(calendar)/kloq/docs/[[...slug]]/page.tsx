import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCalendarMDXComponents } from "@/components/calendar/docs/mdx";
import { DocsPageFrame } from "@/components/docs-frame";
import { JsonLd } from "@/components/json-ld";
import { CALENDAR } from "@/lib/calendar";
import { OG_IMAGE } from "@/lib/calendar/site";
import { docsSchema } from "@/lib/calendar/structured-data";
import { calendarPageMarkdown, calendarSource } from "@/lib/calendar-docs";
import { contentDate } from "@/lib/content-dates";
import { neighbours } from "@/lib/docs-tree";
import { metaDescription, pageMetadata } from "@/lib/seo";

export default async function Page({ params }: PageProps<"/kloq/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = calendarSource.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <>
      <JsonLd
        data={docsSchema({
          title: page.data.title ?? "",
          description: page.data.description,
          url: page.url,
        })}
      />
      <DocsPageFrame
        description={page.data.description}
        lastUpdated={contentDate(`content/calendar/${page.path}`)}
        markdown={await calendarPageMarkdown(page)}
        neighbours={neighbours(calendarSource.getPageTree(), page.url)}
        title={page.data.title}
        toc={page.data.toc}
      >
        <MDX components={getCalendarMDXComponents()} />
      </DocsPageFrame>
    </>
  );
}

export function generateStaticParams() {
  return calendarSource.generateParams();
}

// Every page is prerendered: anything else is a 404 straight away (see /docs).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/kloq/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  const page = calendarSource.getPage(slug);
  if (!page) notFound();
  return pageMetadata({
    title: `${page.data.title} · ${CALENDAR.name} docs`,
    description: metaDescription(page.data.description ?? ""),
    path: page.url,
    type: "article",
    image: OG_IMAGE,
  });
}
