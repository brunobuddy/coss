import { JsonLd } from "@/components/json-ld";
import { Band, Close, FeatureCell, FeatureRow, Hero, Page, Tray } from "@/components/marketing/kit";
import { SOLUTION_SHOWCASES } from "@/components/solutions";
import { SOLUTIONS_ROUTE, solutionPages } from "@/lib/marketing";
import { breadcrumbSchema, itemListSchema, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "What teams build with coss.com: AI agents with their own inboxes, multi-tenant platforms, sign-up and login security, and product notifications.";

export const metadata = pageMetadata({
  title: "Solutions: what you can build with coss.com",
  description: DESCRIPTION,
  path: SOLUTIONS_ROUTE,
  ownImage: true,
});

export default function SolutionsPage() {
  const pages = solutionPages();
  const [first, ...rest] = pages;
  return (
    <Page>
      <JsonLd data={breadcrumbSchema([["Solutions", SOLUTIONS_ROUTE]])} />
      <JsonLd data={itemListSchema(pages.map((page) => [page.data.title ?? "", page.url]))} />
      <Hero
        headline="Products put together for one job."
        lede={<p>Start from what you're building. Every part runs on the same key.</p>}
      />
      <Band className="sm:pt-16">
        {first ? (
          <FeatureRow
            body={SOLUTION_SHOWCASES[first.slugs[0] ?? ""]?.lede}
            href={first.url}
            title={first.data.title}
          >
            <Tray>{SOLUTION_SHOWCASES[first.slugs[0] ?? ""]?.stage}</Tray>
          </FeatureRow>
        ) : null}
        <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
          {rest.map((page) => {
            const showcase = SOLUTION_SHOWCASES[page.slugs[0] ?? ""];
            return (
              <div className="h-full [&>div]:h-full [&>div>:first-child]:flex-1" key={page.url}>
                <FeatureCell body={showcase?.lede} href={page.url} title={page.data.title}>
                  <Tray bodyClassName="flex-1">{showcase?.stage}</Tray>
                </FeatureCell>
              </div>
            );
          })}
        </div>
      </Band>
      <Close title="One key for all of it." />
    </Page>
  );
}
