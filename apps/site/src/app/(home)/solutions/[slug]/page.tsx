import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import {
  Band,
  Close,
  Crumbs,
  FaqList,
  FeatureCell,
  FeatureRow,
  Heading,
  Hero,
  HeroActions,
  OnwardLinks,
  Page,
  ProductTile,
  Stage,
  Tray,
} from "@/components/marketing/kit";
import { PricingAndLimits, ProductSample } from "@/components/marketing/samples";
import { SOLUTION_SHOWCASES } from "@/components/solutions";
import {
  marketingMarkdownUrl,
  productBySlug,
  SOLUTIONS_ROUTE,
  solutionBySlug,
  solutionPages,
} from "@/lib/marketing";
import { articleSchema, breadcrumbSchema, faqSchema, pageMetadata } from "@/lib/seo";

export default async function SolutionRoute({ params }: PageProps<"/solutions/[slug]">) {
  const { slug } = await params;
  const page = solutionBySlug(slug);
  const showcase = SOLUTION_SHOWCASES[slug];
  if (!page || !showcase) notFound();
  const { title, headline, description, faq } = page.data;
  const products = page.data.products.flatMap((other) => {
    const product = productBySlug(other);
    return product ? [{ slug: other, page: product }] : [];
  });
  const markdown = await page.data.getText("processed");
  const leading = showcase.steps.slice(0, 2);
  const rest = showcase.steps.slice(2);
  return (
    <Page>
      <JsonLd data={articleSchema({ title: headline, description, path: page.url })} />
      <JsonLd
        data={breadcrumbSchema([
          ["Solutions", SOLUTIONS_ROUTE],
          [title, page.url],
        ])}
      />
      {faq.length ? <JsonLd data={faqSchema(faq)} /> : null}
      <Crumbs trail={[["Solutions", SOLUTIONS_ROUTE], [title]]} />
      <Hero
        actions={<HeroActions docs={products[0]?.page.data.docs ?? "/docs"} />}
        headline={headline}
        lede={<p>{showcase.lede}</p>}
        tile={
          <ul aria-label="The products it puts together" className="flex items-center gap-2">
            {products.map((product) => (
              <li key={product.slug}>
                <Link
                  aria-label={product.page.data.title}
                  className="block rounded-xl transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  href={product.page.url}
                  title={product.page.data.title}
                >
                  <ProductTile size="lg" slug={product.slug} />
                </Link>
              </li>
            ))}
          </ul>
        }
      >
        <Stage code={<ProductSample body={page.data.body} />} title={showcase.call}>
          {showcase.stage}
        </Stage>
      </Hero>
      <Band>
        <div className="flex flex-col gap-16 sm:gap-24">
          {leading.map((step, index) => (
            <FeatureRow
              body={step.body}
              href={step.href}
              key={step.title}
              reverse={index % 2 === 1}
              title={step.title}
            >
              {step.demo}
            </FeatureRow>
          ))}
          {rest.length ? (
            <div className="grid gap-10 md:grid-cols-2 md:gap-8">
              {rest.map((step) => (
                <FeatureCell body={step.body} href={step.href} key={step.title} title={step.title}>
                  {step.demo}
                </FeatureCell>
              ))}
            </div>
          ) : null}
        </div>
      </Band>
      <PricingAndLimits body={page.data.body} markdown={markdown} />
      <FaqList faq={faq} />
      <OnwardLinks
        id="products-title"
        lede="One key, one SDK, one log for all of them."
        links={products.map((product) => ({
          href: product.page.url,
          title: product.page.data.title,
          slug: product.slug,
        }))}
        title="The products"
      />
      <Close title="Build it this afternoon.">
        <p>Development keys record every request and event and deliver nothing.</p>
      </Close>
    </Page>
  );
}

export function generateStaticParams() {
  return solutionPages().map((page) => ({ slug: page.slugs[0] ?? "" }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/solutions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = solutionBySlug(slug);
  if (!page) notFound();
  return pageMetadata({
    title: page.data.seoTitle,
    description: page.data.description ?? "",
    path: page.url,
    type: "article",
    markdown: marketingMarkdownUrl(page.url),
    ownImage: true,
  });
}
