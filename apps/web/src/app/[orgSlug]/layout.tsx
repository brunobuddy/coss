import { listBudgetHolds } from "@coss/billing";
import { orgLinkHref, type ProductKey, settingsHref } from "@coss/dashboard-routes";
import { getReputationStanding } from "@coss/reputation";
import { listUserOrganizations, organizationLogoVersions } from "@coss/tenancy";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { cookies } from "next/headers";
import Link from "next/link";
import { BillingBanner } from "@/components/billing/billing-banner";
import { HipaaModeBanner } from "@/components/hipaa-mode-banner";
import { ReputationBanner } from "@/components/reputation";
import { AppShell } from "@/components/shell/app-shell";
import { ConsoleSidebar } from "@/components/shell/console-sidebar";
import { SsoBreakGlassAlert } from "@/components/sso-break-glass-alert";
import { SuspendedAlert } from "@/components/suspended-alert";
import { avatarUrl } from "@/lib/avatars";
import { billingBannerState } from "@/lib/billing";
import { environmentPath } from "@/lib/navigation";
import { productActivity, productPreferences } from "@/lib/products";
import { listProjectsWithDefaultEnvironment, toShellProjects } from "@/lib/projects";
import { environmentCookieName, rememberedEnvironment } from "@/lib/remembered-environment";
import { isPlatformAdmin, requireOrgMember } from "@/lib/session";

export default async function OrganizationLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { session, organization, member, suspended, ssoBreakGlass, hipaaMode, can } =
    await requireOrgMember(orgSlug);
  const [
    organizations,
    projectRows,
    standing,
    billing,
    budgetHolds,
    activity,
    preferences,
    cookieStore,
  ] = await Promise.all([
    listUserOrganizations({ userId: session.user.id }),
    listProjectsWithDefaultEnvironment(organization.id),
    getReputationStanding(organization.id),
    can({ billing: ["read"] }) ? billingBannerState(organization.id) : null,
    listBudgetHolds(organization.id),
    productActivity(organization.id),
    productPreferences(organization.id, session.user.id),
    cookies(),
  ]);
  const logos = await organizationLogoVersions(organizations.map((org) => org.id));
  const logoOf = (org: { id: string; slug: string }) => {
    const version = logos.get(org.id);
    return version ? `/${org.slug}/settings/logo?v=${version}` : null;
  };
  // The member's own personal keys over their budget (billing readers see every budget on Spend).
  const ownBudgetPaused = budgetHolds.some(
    (hold) => hold.scope === "user" && hold.targetId === session.user.id,
  );
  const base = `/${organization.slug}`;
  const projects = toShellProjects(projectRows);
  const orgs = organizations.map((org) => ({
    name: org.name,
    slug: org.slug,
    logo: logoOf(org),
    role: org.role,
  }));
  const current = { name: organization.name, slug: organization.slug, logo: logoOf(organization) };
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: avatarUrl(session.user),
    isAdmin: isPlatformAdmin(session),
  };

  // Breadcrumb labels for the dynamic segments: the organization, its projects and environments.
  const names: Record<string, string> = { [base]: organization.name };
  for (const project of projects) {
    names[`${base}/${project.slug}`] = project.name;
    for (const env of project.environments) {
      names[environmentPath(organization.slug, project.slug, env.slug)] = env.name;
    }
  }

  const inUse: Record<string, ProductKey[]> = {};
  for (const { project, environments } of projectRows) {
    for (const env of environments)
      inUse[`${project.slug}/${env.slug}`] = activity.get(env.id) ?? [];
  }
  const remembered = rememberedEnvironment(
    projects,
    cookieStore.get(environmentCookieName(organization.slug))?.value,
  );
  const fallback = remembered
    ? { project: remembered.project.slug, environment: remembered.environment.slug }
    : null;
  const settingsPaths = [
    "",
    "/projects",
    "/members",
    ...(can({ billing: ["read"] }) ? ["/billing"] : []),
    "/spend",
    ...(can({ billing: ["read"] }) ? ["/spend/budgets"] : []),
    ...(can({ sso: ["read"] }) ? ["/sso"] : []),
    ...(can({ scim: ["read"] }) ? ["/scim"] : []),
    ...(can({ audit: ["read"] }) ? ["/audit"] : []),
    "/compliance",
  ];

  return (
    <AppShell
      banners={
        standing || suspended || billing || ssoBreakGlass || ownBudgetPaused || hipaaMode ? (
          <div className="flex flex-col gap-3">
            {hipaaMode ? <HipaaModeBanner orgSlug={organization.slug} /> : null}
            {standing ? (
              <ReputationBanner
                href={orgLinkHref(organization.slug, "/email/reputation")}
                orgSlug={organization.slug}
                standing={standing}
              />
            ) : null}
            {suspended ? <SuspendedAlert orgSlug={organization.slug} /> : null}
            {billing ? (
              <BillingBanner
                href={`${base}/settings/billing`}
                orgSlug={organization.slug}
                state={billing}
              />
            ) : null}
            {ownBudgetPaused ? (
              <Alert variant="error">
                <AlertDescription>
                  Your personal API keys reached your monthly budget: their live sends are paused
                  until next month or until an owner raises it.{" "}
                  <Link className="underline" href={settingsHref(organization.slug, "/spend")}>
                    Your spend
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
            {ssoBreakGlass ? <SsoBreakGlassAlert orgSlug={organization.slug} /> : null}
          </div>
        ) : null
      }
      command={{
        organization: current,
        organizations: orgs,
        projects,
        fallback,
        settingsPaths,
        isAdmin: user.isAdmin,
      }}
      context={{ orgSlug: organization.slug, projects, fallback }}
      names={names}
      session={session}
      sidebar={
        <ConsoleSidebar
          fallback={fallback}
          inUse={inUse}
          organization={{ ...current, role: member.role }}
          organizations={orgs}
          preferences={preferences}
          projects={projects}
          settingsPaths={settingsPaths}
          user={user}
        />
      }
    >
      {children}
    </AppShell>
  );
}
