import { environmentHref, visibleProducts } from "@coss/dashboard-routes";
import { getEnvironment } from "@coss/tenancy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { productPreferences, productUse } from "@/lib/products";
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
  const [use, preferences] = await Promise.all([
    productUse({
      organizationId: organization.id,
      projectId: found.project.id,
      environmentSlug: found.environment.slug,
    }),
    productPreferences(organization.id, session.user.id),
  ]);

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
        orgSlug={organization.slug}
        preferences={preferences}
        projectSlug={projectSlug}
        use={use}
        visible={visibleProducts(use.inProject, preferences)}
      />
    </div>
  );
}
