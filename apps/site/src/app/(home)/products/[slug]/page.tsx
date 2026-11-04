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
  type OnwardLink,
  OnwardLinks,
  Page,
  ProductTile,
  Stage,
  Tray,
} from "@/components/marketing/kit";
import { PricingAndLimits, ProductSample } from "@/components/marketing/samples";
import { SHOWCASES } from "@/components/products";
import { COMPARE_ROUTE, competitorsFor } from "@/lib/compare";
import {
  marketingMarkdownUrl,
  type ProductPage,
  productBySlug,
  productPages,
  solutionPages,
} from "@/lib/marketing";
import { productVisual } from "@/lib/product-visuals";
import { breadcrumbSchema, faqSchema, pageMetadata, productSchema } from "@/lib/seo";

export default async function ProductRoute({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const page = productBySlug(slug);
  const showcase = SHOWCASES[slug];
  if (!page || !showcase) notFound();
  const { title, headline, description, docs, features, faq } = page.data;
  const markdown = await page.data.getText("processed");
  const leading = showcase.highlights.slice(0, 2);
  const rest = showcase.highlights.slice(2);
  return (
    <Page>
      <JsonLd
        data={productSchema({
          name: title,
          description: description ?? "",
          path: page.url,
          features,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          ["Products", "/products"],
          [title, page.url],
        ])}
      />
      {faq.length ? <JsonLd data={faqSchema(faq)} /> : null}
      <Crumbs trail={[["Products", "/products"], [title]]} />
      <Hero
        actions={<HeroActions docs={docs} />}
        headline={headline}
        lede={<p>{showcase.lede}</p>}
        tile={<ProductTile size="lg" slug={slug} />}
      >
        <Stage
          code={<ProductSample body={page.data.body} />}
          title={showcase.call}
          tone={productVisual(slug).tone}
        >
          {showcase.stage}
        </Stage>
      </Hero>
      <Band>
        <div className="flex flex-col gap-16 sm:gap-24">
          {leading.map((highlight, index) => (
            <FeatureRow
              body={highlight.body}
              href={highlight.href}
              key={highlight.title}
              reverse={index % 2 === 1}
              title={highlight.title}
            >
              {highlight.demo}
            </FeatureRow>
          ))}
          {rest.length ? (
            <div className="grid gap-10 md:grid-cols-2 md:gap-8">
              {rest.map((highlight) => (
                <FeatureCell
                  body={highlight.body}
                  href={highlight.href}
                  key={highlight.title}
                  title={highlight.title}
                >
                  {highlight.demo}
                </FeatureCell>
              ))}
            </div>
          ) : null}
        </div>
      </Band>
      <PricingAndLimits body={page.data.body} docs={docs} markdown={markdown} />
      <FaqList faq={faq} />
      <OnwardLinks
        id="related-title"
        lede="On the same key, SDK, webhooks and logs: nothing more to set up."
        links={related(page)}
        title="Works with"
      />
      <OnwardLinks
        id="compare-title"
        links={competitorsFor(slug).map((c) => ({
          href: `${COMPARE_ROUTE}/${c.slug}`,
          title: `coss.com vs ${c.name}`,
        }))}
        title="Compared"
      />
      <Close title={showcase.close ?? `Start with ${title} today.`}>
        <p>Development keys record every request and event and deliver nothing.</p>
      </Close>
    </Page>
  );
}

/** The related products, then the solutions that use this one. */
function related(page: ProductPage): OnwardLink[] {
  const slug = page.slugs[0] ?? "";
  const products = page.data.related.flatMap((other) => {
    const product = productBySlug(other);
    return product
      ? [
          {
            href: product.url,
            title: product.data.title,
            slug: other,
          },
        ]
      : [];
  });
  const solutions = solutionPages()
    .filter((solution) => solution.data.products.includes(slug))
    .map((solution) => ({
      href: solution.url,
      title: solution.data.title,
    }));
  return [...products, ...solutions];
}

export function generateStaticParams() {
  return productPages().map((page) => ({ slug: page.slugs[0] ?? "" }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = productBySlug(slug);
  if (!page) notFound();
  return pageMetadata({
    title: page.data.seoTitle,
    description: page.data.description ?? "",
    path: page.url,
    markdown: marketingMarkdownUrl(page.url),
    ownImage: true,
  });
}
