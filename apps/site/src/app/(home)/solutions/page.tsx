import { JsonLd } from "@/components/json-ld";
import { LinkGrid, MarketingClose, Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
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
  return (
    <Sheet>
      <JsonLd data={breadcrumbSchema([["Solutions", SOLUTIONS_ROUTE]])} />
      <JsonLd
        data={itemListSchema(solutionPages().map((page) => [page.data.title ?? "", page.url]))}
      />
      <section className="border-b">
        <SectionHead as="h1" id="solutions-title" title="Solutions">
          <p>{DESCRIPTION}</p>
        </SectionHead>
      </section>
      <LinkGrid
        id="solutions-list"
        links={solutionPages().map((page) => ({
          href: page.url,
          title: page.data.title,
          description: page.data.description ?? "",
          mark: page.data.mark,
          call: "coss.com",
        }))}
        title="By job"
      />
      <MarketingClose title="One key for all of it." />
    </Sheet>
  );
}
