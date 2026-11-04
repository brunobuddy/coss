import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpenAPIPage } from "@/components/api-page";
import { DocsPageFrame } from "@/components/docs-frame";
import { ApiOperations, DocsSections } from "@/components/docs-sections";
import { JsonLd } from "@/components/json-ld";
import { getMDXComponents } from "@/components/mdx";
import { contentDate } from "@/lib/content-dates";
import { docsDescription, docsRelated, docsSection, docsTitle } from "@/lib/docs-seo";
import { neighbours, sectionsOf } from "@/lib/docs-tree";
import { singleOperationProps } from "@/lib/openapi-single-operation";
import { articleSchema, breadcrumbSchema, pageMetadata } from "@/lib/seo";
import { type DocsPage, markdownUrl, pageMarkdown, source } from "@/lib/source";

/** When an MDX page last changed. API operations all share one file, so they have no date. */
function pageDate(page: DocsPage): string | undefined {
  return page.type === "openapi" ? undefined : contentDate(`content/docs/${page.path}`);
}

/** A docs page as a TechArticle, with its trail through the docs. */
function DocsJsonLd({ page }: { page: DocsPage }) {
  const section = docsSection(page);
  const name = page.data.title ?? "";
  return (
    <>
      <JsonLd
        data={articleSchema({
          type: "TechArticle",
          title: page.data.title ?? "",
          description: docsDescription(page),
          path: page.url,
          modified: pageDate(page),
        })}
      />
      <JsonLd
        data={breadcrumbSchema(
          page.url === "/docs"
            ? [["Docs", "/docs"]]
            : [
                ["Docs", "/docs"],
                ...(section && section.url !== page.url
                  ? [[String(section.name), section.url] as const]
                  : []),
                [name, page.url],
              ],
        )}
      />
    </>
  );
}

export default async function Page({ params }: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const markdown = await pageMarkdown(page);
  const tree = source.getPageTree();
  const around = neighbours(tree, page.url);

  if (page.type === "openapi") {
    // The operation renders its own description, in Fumadocs' prose styling.
    return (
      <>
        <DocsJsonLd page={page} />
        <DocsPageFrame
          markdown={markdown}
          neighbours={around}
          related={docsRelated(page)}
          title={page.data.title}
          toc={page.data.toc}
        >
          <div className="prose max-w-none">
            <OpenAPIPage {...singleOperationProps(page.data.getOpenAPIPageProps())} />
          </div>
        </DocsPageFrame>
      </>
    );
  }

  const MDX = page.data.body;
  return (
    <>
      <DocsJsonLd page={page} />
      <DocsPageFrame
        description={page.data.description}
        lastUpdated={pageDate(page)}
        markdown={markdown}
        neighbours={around}
        related={docsRelated(page)}
        title={page.data.title}
        toc={page.data.toc}
      >
        <MDX
          components={getMDXComponents({
            DocsSections: () => <DocsSections current={page.url} sections={sectionsOf(tree)} />,
            ApiOperations: () => (
              <ApiOperations section={sectionsOf(tree).find((s) => s.url === page.url)} />
            ),
          })}
        />
      </DocsPageFrame>
    </>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

// Every page is prerendered: anything else is a 404 straight away, never rendered on demand
// (which would also try to cache the result in the read-only image).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return pageMetadata({
    title: docsTitle(page),
    description: docsDescription(page),
    path: page.url,
    type: "article",
    // The page as Markdown, for agents that land on the HTML.
    markdown: markdownUrl(page.url),
  });
}
