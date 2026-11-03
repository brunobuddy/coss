import { supportPlanAt } from "@coss/billing";
import { formatSupportTarget, SUPPORT_TIERS, supportResponseMinutes } from "@coss/billing/catalog";
import { PRODUCTS } from "@coss/dashboard-routes";
import { formatSupportTime, hasUrgentSupport, responseDueAt } from "@coss/support";
import { SUPPORT_CATEGORIES, type SupportCategory } from "@coss/support/schemas";
import { listProjectsWithEnvironments } from "@coss/tenancy";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireOrgMember } from "@/lib/session";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = { title: "New ticket" };

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function NewTicketPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/support/new">) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { organization } = await requireOrgMember(orgSlug);
  const now = new Date();
  const [{ plan, allHours }, projects] = await Promise.all([
    supportPlanAt(organization.id, now),
    listProjectsWithEnvironments({ organizationId: organization.id }),
  ]);
  const expectation = (severity: "normal" | "urgent") => {
    const minutes = supportResponseMinutes(plan, severity);
    return {
      target: formatSupportTarget(minutes, { allHours }),
      by: formatSupportTime(responseDueAt({ from: now, minutes, allHours })),
    };
  };
  const topic = single(search.topic);
  const from = single(search.from);

  // `/<org>/<project>/<environment>/<product>/…`: what the page they came from was about.
  const [, fromOrg, fromProject, fromEnvironment, ...rest] = from.split("/");
  const fromProjectRow =
    fromOrg === orgSlug ? projects.find(({ project }) => project.slug === fromProject) : undefined;
  const fromEnvironmentRow = fromProjectRow?.environments.find(
    (environment) => environment.slug === fromEnvironment,
  );
  const restPath = `/${rest.join("/")}`;
  const fromProduct = fromEnvironmentRow
    ? PRODUCTS.find(
        (product) => restPath === product.path || restPath.startsWith(`${product.path}/`),
      )
    : undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        description="A person reads every ticket and replies here and by email."
        title="New ticket"
      />
      <NewTicketForm
        canBeUrgent={hasUrgentSupport(plan) && SUPPORT_TIERS[plan].responseMinutes.urgent !== null}
        categories={SUPPORT_CATEGORIES.map((category) => ({
          value: category.key,
          label: category.label,
        }))}
        defaultCategory={
          SUPPORT_CATEGORIES.some((category) => category.key === topic)
            ? (topic as SupportCategory)
            : "technical"
        }
        defaultEnvironmentId={fromEnvironmentRow?.id ?? null}
        defaultProduct={fromProduct?.key ?? null}
        defaultReference={single(search.reference).slice(0, 80)}
        defaultSubject={single(search.subject).slice(0, 200)}
        environments={projects.flatMap(({ project, environments }) =>
          environments.map((environment) => ({
            value: environment.id,
            label: `${project.name} / ${environment.name}`,
          })),
        )}
        expectations={{ normal: expectation("normal"), urgent: expectation("urgent") }}
        from={from}
        orgSlug={orgSlug}
        products={PRODUCTS.map((product) => ({ value: product.key, label: product.name }))}
      />
    </div>
  );
}
