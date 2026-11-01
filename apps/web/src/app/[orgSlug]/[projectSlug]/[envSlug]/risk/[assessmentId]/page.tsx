import { getRiskAssessment } from "@coss/risk";
import { CONTENT_CATEGORIES } from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import { ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { RiskDecisionBadge, RiskOutcomeBadge } from "@/components/risk-badges";
import { SpecItem, SpecList } from "@/components/spec-list";
import { Stat, StatRow } from "@/components/stat-row";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { RiskFeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Risk assessment" };

function yesNo(value: boolean | null | undefined): string {
  return value ? "Yes" : "No";
}

// After 90 days, or when the user was forgotten.
const REMOVED = <span className="text-muted-foreground">Removed</span>;
const NONE = <span className="text-muted-foreground">—</span>;

export default async function RiskAssessmentPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/[assessmentId]">) {
  const { orgSlug, projectSlug, envSlug, assessmentId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ risk: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const assessment = await getRiskAssessment(
    { organizationId: organization.id, environmentId: environment.id },
    assessmentId,
  );
  if (!assessment) notFound();

  // Signals stay after the address itself is removed (90 days); without signals there was none.
  const { email, ip, velocity, captcha, login, content, checkout, device } = assessment.signals;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        meta={
          <>
            <RiskDecisionBadge decision={assessment.decision} />
            {assessment.outcome ? <RiskOutcomeBadge outcome={assessment.outcome} /> : null}
            <code className="font-mono text-xs">{assessment.id}</code>
            <span className="font-mono text-xs">{formatDateTime(assessment.created_at)}</span>
          </>
        }
        title={assessment.event_name ?? assessment.event}
      />

      <StatRow>
        <Stat label="Score" value={assessment.score.toFixed(2)} />
        <Stat label="Decision" value={<span className="capitalize">{assessment.decision}</span>} />
        <Stat
          label="Review"
          value={assessment.review_status === "open" ? "Open" : "—"}
          detail={assessment.review_status === "open" ? "waiting for an outcome" : undefined}
        />
        <Stat
          detail={
            assessment.degraded.length > 0
              ? `made without: ${assessment.degraded.join(", ")}`
              : "all signals collected"
          }
          label="Reasons"
          value={assessment.reasons.length}
        />
      </StatRow>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel title="Reasons">
            {assessment.reasons.length === 0 ? (
              <PanelBody flush>
                <EmptyState
                  compact
                  description="The assessment found nothing risky."
                  icon={ShieldCheckIcon}
                  title="No risk signals fired"
                />
              </PanelBody>
            ) : (
              <PanelBody flush>
                <ul className="flex flex-col">
                  {assessment.reasons.map((reason) => (
                    <li
                      className="flex flex-col gap-1 border-t px-5 py-3 first:border-t-0"
                      key={`${reason.code}-${reason.entry ?? ""}`}
                    >
                      <code className="font-mono text-muted-foreground text-xs">{reason.code}</code>
                      <span className="text-sm">{reason.message}</span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            )}
          </Panel>

          <Panel
            footer={
              ip?.asn ? (
                // IPinfo Lite is CC BY-SA 4.0: credit it wherever its data is shown.
                <span className="text-xs">
                  Network and country data by{" "}
                  <a
                    className="underline underline-offset-4"
                    href="https://ipinfo.io"
                    rel="noreferrer"
                    target="_blank"
                  >
                    IPinfo
                  </a>
                  .
                </span>
              ) : null
            }
            title="Signals"
          >
            <PanelBody flush>
              <SpecList columns={2}>
                <SpecItem label="User id" mono>
                  {assessment.user.id ?? NONE}
                </SpecItem>
                <SpecItem label="Email">
                  {assessment.user.email ?? (email ? REMOVED : NONE)}
                </SpecItem>
                <SpecItem label="IP address" mono>
                  {assessment.ip ?? (ip ? REMOVED : NONE)}
                </SpecItem>
                {email ? (
                  <>
                    <SpecItem label="Email checks">
                      {email.valid ? `${email.deliverability}` : "invalid"}
                      {email.disposable ? " · disposable" : ""}
                      {email.role_account ? " · role account" : ""}
                      {email.free_provider ? " · free provider" : ""}
                    </SpecItem>
                    <SpecItem label="Did you mean">{email.suggestion ?? NONE}</SpecItem>
                    <SpecItem label="Domain age">
                      {email.domain_age_days === null ? NONE : `${email.domain_age_days} days`}
                    </SpecItem>
                  </>
                ) : null}
                {ip ? (
                  <>
                    <SpecItem label="Network">
                      {ip.asn ? `AS${ip.asn} ${ip.as_name ?? ""}` : NONE}
                    </SpecItem>
                    <SpecItem label="Country">{ip.country ?? NONE}</SpecItem>
                    <SpecItem label="IP checks">
                      {ip.private
                        ? "private address"
                        : `Tor ${yesNo(ip.tor).toLowerCase()} · ${ip.hosting ? `${ip.hosting_kind}: ${ip.hosting_provider}` : "not hosting"}`}
                    </SpecItem>
                    {ip.privacy ? (
                      <SpecItem label="VPN, proxy, relay">
                        {ip.privacy.vpn || ip.privacy.proxy || ip.privacy.relay
                          ? [
                              ip.privacy.vpn ? "VPN" : null,
                              ip.privacy.proxy ? "proxy" : null,
                              ip.privacy.relay ? "privacy relay" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") + (ip.privacy.service ? ` (${ip.privacy.service})` : "")
                          : "none"}
                      </SpecItem>
                    ) : null}
                  </>
                ) : null}
                {checkout ? (
                  <>
                    <SpecItem label="Amount" mono>
                      {checkout.amount.toLocaleString()} {checkout.currency} (minor units)
                    </SpecItem>
                    <SpecItem label="Card">
                      {[
                        checkout.card_country ? `issued in ${checkout.card_country}` : null,
                        checkout.card_funding,
                      ]
                        .filter(Boolean)
                        .join(" · ") || NONE}
                    </SpecItem>
                    <SpecItem label="Billing, shipping">
                      {checkout.billing_country ?? NONE} · {checkout.shipping_country ?? NONE}
                    </SpecItem>
                  </>
                ) : null}
                {device ? (
                  <SpecItem label="Device">
                    {device.valid
                      ? [
                          device.automation ? "automated" : null,
                          device.timezone,
                          device.language,
                          device.platform,
                          device.screen,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "invalid token"}
                  </SpecItem>
                ) : null}
                {captcha ? (
                  <SpecItem label="Captcha">
                    {!captcha.provided
                      ? "no token"
                      : captcha.passed === null
                        ? "not checked"
                        : captcha.passed
                          ? "passed"
                          : "failed"}
                  </SpecItem>
                ) : null}
                {login ? (
                  <SpecItem label="Login">
                    {login.new_country || login.new_network
                      ? [
                          login.new_country ? "new country" : null,
                          login.new_network ? "new network" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "usual country and network"}
                  </SpecItem>
                ) : null}
                {content ? (
                  <SpecItem label="Content scores" mono>
                    {CONTENT_CATEGORIES.map(
                      (category) => `${category} ${content[category].toFixed(2)}`,
                    ).join(" · ")}
                  </SpecItem>
                ) : null}
                {velocity && Object.keys(velocity).length > 0 ? (
                  <SpecItem label="Velocity" mono>
                    {Object.entries(velocity)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(" · ")}
                  </SpecItem>
                ) : null}
              </SpecList>
            </PanelBody>
          </Panel>
        </div>

        {can({ risk: ["feedback"] }) ? (
          <Panel
            description={
              assessment.outcome
                ? `Reported as ${assessment.outcome}. Report again to change it.`
                : "What did this turn out to be?"
            }
            title="Outcome"
          >
            <PanelBody>
              <RiskFeedbackForm
                assessmentId={assessment.id}
                envSlug={environment.slug}
                orgSlug={organization.slug}
                projectSlug={project.slug}
              />
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
