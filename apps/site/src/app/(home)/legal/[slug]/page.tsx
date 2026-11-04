import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { getMDXComponents } from "@/components/mdx";
import { formatLegalDate, legalSource } from "@/lib/legal";
import { articleSchema, breadcrumbSchema, pageMetadata } from "@/lib/seo";

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = legalSource.getPage([slug]);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:py-16">
      <JsonLd
        data={articleSchema({
          title: page.data.title ?? "",
          description: page.data.description,
          path: page.url,
          modified: page.data.lastUpdated,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          ["Legal", "/legal"],
          [page.data.title ?? "", page.url],
        ])}
      />
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">{page.data.title}</h1>
        <p className="text-muted-foreground text-sm">
          Last updated{" "}
          <time dateTime={page.data.lastUpdated}>{formatLegalDate(page.data.lastUpdated)}</time>
        </p>
      </header>
      <InlineTOC items={page.data.toc} />
      <article className="prose min-w-0 max-w-none">
        <MDX components={getMDXComponents()} />
      </article>
    </main>
  );
}

export function generateStaticParams() {
  return legalSource.getPages().map((page) => ({ slug: page.slugs[0] }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = legalSource.getPage([slug]);
  if (!page) notFound();
  return pageMetadata({
    title: `${page.data.title} · coss.com`,
    description: page.data.description ?? "",
    path: page.url,
    type: "article",
  });
}
