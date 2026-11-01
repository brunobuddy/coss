import { environmentHref, visibleProducts } from "@coss/dashboard-routes";
import { getEnvironment } from "@coss/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { productActivity, productPreferences } from "@/lib/products";
import { requireOrgMember } from "@/lib/session";
import { ProductCatalog } from "./catalog";

export const metadata: Metadata = { title: "All products" };

export default async function ProductsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/products">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, session } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const [activity, preferences] = await Promise.all([
    productActivity(organization.id),
    productPreferences(organization.id, session.user.id),
  ]);
  const inUse = activity.get(found.environment.id) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Everything coss.com runs for you, on one API key and one SDK. Add a product to your sidebar to keep it a click away."
        title="All products"
      />
      <ProductCatalog
        base={environmentHref({
          organization: orgSlug,
          project: projectSlug,
          environment: envSlug,
        })}
        inUse={inUse}
        orgSlug={organization.slug}
        preferences={preferences}
        visible={visibleProducts(inUse, preferences)}
      />
    </div>
  );
}
