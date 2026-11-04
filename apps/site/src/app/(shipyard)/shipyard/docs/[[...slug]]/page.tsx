import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPageFrame } from "@/components/docs-frame";
import { JsonLd } from "@/components/json-ld";
import { getShipyardMDXComponents } from "@/components/shipyard/docs/mdx";
import { contentDate } from "@/lib/content-dates";
import { neighbours } from "@/lib/docs-tree";
import { articleSchema, breadcrumbSchema, metaDescription, pageMetadata } from "@/lib/seo";
import { SHIPYARD } from "@/lib/shipyard";
import { shipyardSource } from "@/lib/shipyard-docs";

export default async function Page({ params }: PageProps<"/shipyard/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = shipyardSource.getPage(slug);
  if (!page) notFound();

  const markdown = `# ${page.data.title} (${page.url})\n\n${await page.data.getText("processed")}`;
  const MDX = page.data.body;
  const modified = contentDate(`content/shipyard/${page.path}`);
  return (
    <>
      <JsonLd
        data={articleSchema({
          type: "TechArticle",
          title: page.data.title ?? "",
          description: page.data.description,
          path: page.url,
          modified,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          [SHIPYARD.name, SHIPYARD.path],
          ["Docs", SHIPYARD.docs],
          ...(page.url === SHIPYARD.docs ? [] : [[page.data.title ?? "", page.url] as const]),
        ])}
      />
      <DocsPageFrame
        description={page.data.description}
        lastUpdated={modified}
        markdown={markdown}
        neighbours={neighbours(shipyardSource.getPageTree(), page.url)}
        title={page.data.title}
        toc={page.data.toc}
      >
        <MDX components={getShipyardMDXComponents()} />
      </DocsPageFrame>
    </>
  );
}

export function generateStaticParams() {
  return shipyardSource.generateParams();
}

// Every page is prerendered: anything else is a 404 straight away (see /docs).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/shipyard/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  const page = shipyardSource.getPage(slug);
  if (!page) notFound();
  return pageMetadata({
    title: `${page.data.title} · ${SHIPYARD.name} docs`,
    description: metaDescription(page.data.description ?? ""),
    path: page.url,
    type: "article",
    image: SHIPYARD.image,
  });
}
