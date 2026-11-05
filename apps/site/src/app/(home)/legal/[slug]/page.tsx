import { InlineTOC } from "fumadocs-ui/components/inline-toc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Container, Crumbs, Page } from "@/components/marketing/kit";
import { getMDXComponents } from "@/components/mdx";
import { formatLegalDate, legalSource } from "@/lib/legal";
import { articleSchema, breadcrumbSchema, pageMetadata } from "@/lib/seo";

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = legalSource.getPage([slug]);
  if (!page) notFound();

  const MDX = page.data.body;
  return (
    <Page>
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
      <Crumbs trail={[["Legal", "/legal"], [page.data.title ?? ""]]} />
      <Container className="grid gap-10 pt-10 pb-16 sm:pt-14 sm:pb-24 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-14">
        <nav
          aria-label="On this page"
          className="max-h-[calc(100svh-7rem)] overflow-y-auto text-sm max-lg:hidden lg:sticky lg:top-24 lg:self-start"
        >
          <ul className="flex flex-col gap-2">
            {page.data.toc
              .filter((item) => item.depth === 2)
              .map((item) => (
                <li key={item.url}>
                  <a
                    className="block text-muted-foreground leading-snug hover:text-foreground"
                    href={item.url}
                  >
                    {item.title}
                  </a>
                </li>
              ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-[68ch] flex-col gap-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-balance font-heading font-semibold text-4xl tracking-[-0.012em] sm:text-5xl">
              {page.data.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              Last updated{" "}
              <time dateTime={page.data.lastUpdated}>{formatLegalDate(page.data.lastUpdated)}</time>
            </p>
          </header>
          <div className="lg:hidden">
            <InlineTOC items={page.data.toc} />
          </div>
          <article className="prose min-w-0 max-w-none">
            <MDX components={getMDXComponents()} />
          </article>
        </div>
      </Container>
    </Page>
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
