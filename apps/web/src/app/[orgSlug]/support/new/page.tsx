import { supportPlanAt } from "@coss/billing";
import { formatSupportTarget, SUPPORT_TIERS, supportResponseMinutes } from "@coss/billing/catalog";
import { formatSupportTime, hasUrgentSupport, responseDueAt } from "@coss/support";
import { SUPPORT_CATEGORIES, type SupportCategory } from "@coss/support/schemas";
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
  const { plan, allHours } = await supportPlanAt(organization.id, now);
  const expectation = (severity: "normal" | "urgent") => {
    const minutes = supportResponseMinutes(plan, severity);
    return {
      target: formatSupportTarget(minutes, { allHours }),
      by: formatSupportTime(responseDueAt({ from: now, minutes, allHours })),
    };
  };
  const topic = single(search.topic);
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
        defaultSubject={single(search.subject).slice(0, 200)}
        expectations={{ normal: expectation("normal"), urgent: expectation("urgent") }}
        from={single(search.from)}
        orgSlug={orgSlug}
      />
    </div>
  );
}
