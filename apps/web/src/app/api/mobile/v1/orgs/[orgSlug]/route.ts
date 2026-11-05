import { listBudgetHolds } from "@coss/billing";
import type { OrganizationResponse } from "@coss/companion";
import { getReputationStanding } from "@coss/reputation";
import { listProjectsWithEnvironments } from "@coss/tenancy";
import { billingBannerState } from "@/lib/billing";
import { mobileRoute, requireMobileOrgMember } from "@/lib/mobile-api";
import { toMobileEnvironment, toMobileStanding } from "@/lib/mobile-wire";
import { schedulingDeps } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (request, ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]">) => {
    const { orgSlug } = await ctx.params;
    const { session, organization, member, suspended, can } = await requireMobileOrgMember(
      request,
      orgSlug,
    );
    const readBilling = can({ billing: ["read"] });
    // Without its keys the dashboard's Scheduling pages don't exist either.
    const scheduling = schedulingDeps() !== null;
    const [standing, projects, billing, budgetHolds] = await Promise.all([
      getReputationStanding(organization.id),
      listProjectsWithEnvironments({ organizationId: organization.id }),
      readBilling ? billingBannerState(organization.id) : null,
      listBudgetHolds(organization.id),
    ]);
    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
        suspended,
      },
      standing: toMobileStanding(standing),
      billing: billing && {
        held: billing.held,
        past_due: billing.pastDue,
        allowance: billing.allowance,
      },
      // The dashboard layout's banner: the member's own personal keys over their budget.
      budget_paused: budgetHolds.some(
        (hold) => hold.scope === "user" && hold.targetId === session.user.id,
      ),
      can: {
        read_email: can({ email: ["read"] }),
        read_sms: can({ sms: ["read"] }),
        read_reputation: can({ reputation: ["read"] }),
        read_billing: readBilling,
        read_domain: can({ domain: ["read"] }),
        read_audit: can({ audit: ["read"] }),
        read_webhook: can({ webhook: ["read"] }),
        read_risk: can({ risk: ["read"] }),
        read_log: can({ log: ["read"] }),
        read_suppression: can({ suppression: ["read"] }),
        read_api_key: can({ apiKey: ["read"] }),
        read_hook: can({ hook: ["read"] }),
        read_log_drain: can({ logDrain: ["read"] }),
        read_risk_rule: can({ riskRule: ["read"] }),
        read_risk_list: can({ riskList: ["read"] }),
        read_environment: can({ environment: ["read"] }),
        read_template: can({ emailTemplate: ["read"] }),
        read_broadcast: can({ broadcast: ["read"] }),
        read_contact: can({ contact: ["read"] }),
        read_sms_suppression: can({ smsSuppression: ["read"] }),
        read_sms_sender: can({ smsSender: ["read"] }),
        read_sso: can({ sso: ["read"] }),
        read_scim: can({ scim: ["read"] }),
        read_scheduling: scheduling && can({ scheduling: ["read"] }),
        update_scheduling: scheduling && can({ scheduling: ["update"] }),
      },
      projects: projects.map(({ project, environments }) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        environments: environments.map(toMobileEnvironment),
      })),
    } satisfies OrganizationResponse;
  },
);
