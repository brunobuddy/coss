import { getRiskCalibration, listRiskRules } from "@coss/risk";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ListFilterIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { RiskDecisionBadge } from "@/components/risk-badges";
import { StatusDot } from "@/components/status-dot";
import { describeRuleConditions } from "@/lib/risk-rules";
import { requireOrgMember } from "@/lib/session";
import { RuleDialog } from "./rule-dialog";
import { DeleteRuleButton, ToggleRuleButton } from "./rule-row-actions";

export const metadata: Metadata = { title: "Risk rules" };

export default async function RiskRulesPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/rules">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ riskRule: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const [rules, calibration] = await Promise.all([listRiskRules(scope), getRiskCalibration(scope)]);
  const outcomes = new Map(calibration.rules.map((rule) => [rule.rule, rule]));
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canUpdate = can({ riskRule: ["update"] });
  const canDelete = can({ riskRule: ["delete"] });

  const create = can({ riskRule: ["create"] }) ? <RuleDialog {...target} trigger="create" /> : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Checked after the allow and block lists, in position order: the first enabled rule whose conditions match an event decides it."
        meta={<ModeBadge mode={environment.mode} />}
        title="Risk rules"
      />

      <Panel>
        {rules.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description="Without rules, decisions come from the lists and the score."
              icon={ListFilterIcon}
              title="No rules yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead className="w-0">#</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Then</TableHead>
                <TableHead>Last 90 days</TableHead>
                {canUpdate || canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {rule.position}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 font-medium">
                        {rule.name}
                        {rule.enabled ? null : <StatusDot tone="neutral">Disabled</StatusDot>}
                      </span>
                      <span className="font-mono text-muted-foreground text-xs">
                        {rule.events.length > 0 ? rule.events.join(", ") : "every event"}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell
                    className={
                      rule.enabled ? "max-w-md text-sm" : "max-w-md text-muted-foreground text-sm"
                    }
                  >
                    {describeRuleConditions(rule)}
                  </TableCell>
                  <TableCell>
                    <RiskDecisionBadge decision={rule.action} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <RuleOutcomes outcome={outcomes.get(rule.id)} />
                  </TableCell>
                  {canUpdate || canDelete ? (
                    <TableCell>
                      <span className="flex gap-2">
                        {canUpdate ? (
                          <>
                            <RuleDialog {...target} rule={rule} trigger="edit" />
                            <ToggleRuleButton {...target} enabled={rule.enabled} ruleId={rule.id} />
                          </>
                        ) : null}
                        {canDelete ? (
                          <DeleteRuleButton {...target} name={rule.name} ruleId={rule.id} />
                        ) : null}
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

/** How often the rule decided, and the fraud rate among labeled matches. */
function RuleOutcomes({
  outcome,
}: {
  outcome:
    | { matched: number; fraud: number; legitimate: number; precision: number | null }
    | undefined;
}) {
  if (!outcome || outcome.matched === 0) {
    return <span className="text-muted-foreground">No matches</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span>{outcome.matched.toLocaleString()} matched</span>
      <span className="text-muted-foreground text-xs">
        {outcome.precision === null
          ? "no feedback yet"
          : `${Math.round(outcome.precision * 100)}% fraud rate · ${outcome.fraud} fraud, ${outcome.legitimate} legitimate`}
      </span>
    </span>
  );
}
