import type { Budget, BudgetStatus } from "@coss/billing";
import { settingsHref } from "@coss/dashboard-routes";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { KeyRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetCell } from "@/components/billing/budget-cell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SubNav } from "@/components/sub-nav";
import { centsInput, formatCents } from "@/lib/billing-format";
import { requireOrgMember } from "@/lib/session";
import {
  budgetPaused,
  budgetStatusOf,
  environmentLabel,
  keyLabel,
  memberLabel,
  ownBudget,
  projectLabel,
  type SpendNames,
  spendOverview,
} from "@/lib/spend";
import { BudgetDialog, RemoveBudgetButton } from "../budget-forms";

export const metadata: Metadata = { title: "Budgets" };

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export default async function BudgetsPage({
  params,
}: PageProps<"/[orgSlug]/settings/spend/budgets">) {
  const { orgSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ billing: ["read"] })) notFound();
  const canManage = can({ billing: ["update"] });
  const overview = await spendOverview(organization.id);
  const { budgets, names } = overview;
  const orgSlugValue = organization.slug;
  const memberDefault = budgets.find((budget) => budget.scope === "member_default") ?? null;
  const paused = (scope: string, targetId: string) => budgetPaused(overview, scope, targetId);
  const statusOf = (scope: BudgetStatus["scope"], targetId: string) =>
    budgetStatusOf(overview, scope, targetId);
  const budgetOf = (scope: Budget["scope"], targetId: string) =>
    ownBudget(overview, scope, targetId);
  const editable = (budget: Budget | null) => ({
    amount: budget ? centsInput(budget.amountCents) : undefined,
    thresholds: budget?.alertThresholds.join(", "),
  });

  const keyBudgets = budgets.filter((budget) => budget.scope === "api_key" && budget.apiKeyId);
  const keysWithout = [...names.keys]
    .filter(([id]) => !keyBudgets.some((budget) => budget.apiKeyId === id))
    .map(([id, key]) => ({
      value: id,
      label: `${key.name} · ${environmentLabel(names, key.environmentId)}`,
    }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Monthly budgets for what members' personal API keys, projects and single API keys spend. Over a budget, its live sending pauses until next month or until the budget is raised; the billing contacts (and the member it concerns) are emailed at its alert thresholds."
        title="Spend"
      />
      <SubNav base={settingsHref(organization.slug, "/spend")} className="border-b" nav="spend" />

      <Panel
        action={
          canManage ? (
            <>
              <BudgetDialog
                {...editable(memberDefault)}
                description="Applies to every member's personal API keys, unless a member has a budget of their own."
                orgSlug={orgSlugValue}
                scope="member_default"
                title="Default member budget"
                trigger={memberDefault ? "Edit default" : "Set a default"}
                triggerVariant={memberDefault ? "outline" : "default"}
              />
              {memberDefault ? (
                <RemoveBudgetButton
                  budgetId={memberDefault.id}
                  description="Members without a budget of their own will have no limit."
                  orgSlug={orgSlugValue}
                  title="Remove the default member budget?"
                />
              ) : null}
            </>
          ) : null
        }
        description={
          memberDefault?.amountCents !== null && memberDefault?.amountCents !== undefined
            ? `Default: ${formatCents(memberDefault.amountCents)} a month for each member's personal keys.`
            : "No default: members' personal keys have no limit unless you set one for them."
        }
        title="Members"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-56">This month</TableHead>
              {canManage ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...names.members].map(([userId, member]) => {
              const own = budgetOf("user", userId);
              const label = memberLabel(names, userId);
              return (
                <TableRow key={userId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 font-medium">
                        {label}
                        {paused("user", userId) ? <Badge variant="error">Paused</Badge> : null}
                      </span>
                      <span className="text-muted-foreground text-xs">{member.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.role
                      .split(",")
                      .map((role) => ROLE_LABELS[role] ?? role)
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    <BudgetCell status={statusOf("user", userId)} />
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <BudgetDialog
                          {...editable(own)}
                          description="Their personal keys' monthly budget, instead of the default."
                          exempt={own !== null && own.amountCents === null}
                          orgSlug={orgSlugValue}
                          scope="user"
                          targetId={userId}
                          title={`Budget for ${label}`}
                          trigger={own ? "Edit" : "Set budget"}
                        />
                        {own ? (
                          <RemoveBudgetButton
                            budgetId={own.id}
                            description="Their personal keys go back to the default member budget."
                            orgSlug={orgSlugValue}
                            title={`Remove ${label}'s budget?`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        description="Everything sent in a project counts, whatever key (or the dashboard) sent it."
        title="Projects"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="w-56">This month</TableHead>
              {canManage ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...names.projects].map(([projectId]) => {
              const budget = budgetOf("project", projectId);
              const label = projectLabel(names, projectId);
              return (
                <TableRow key={projectId}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {label}
                      {paused("project", projectId) ? <Badge variant="error">Paused</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <BudgetCell status={budget ? statusOf("project", projectId) : undefined} />
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <BudgetDialog
                          {...editable(budget)}
                          description="What the whole project may spend in a month."
                          orgSlug={orgSlugValue}
                          scope="project"
                          targetId={projectId}
                          title={`Budget for ${label}`}
                          trigger={budget ? "Edit" : "Set budget"}
                        />
                        {budget ? (
                          <RemoveBudgetButton
                            budgetId={budget.id}
                            description="The project will have no limit of its own."
                            orgSlug={orgSlugValue}
                            title={`Remove ${label}'s budget?`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        action={
          canManage && keysWithout.length ? (
            <BudgetDialog
              description="What one API key may spend in a month, e.g. a staging server's."
              orgSlug={orgSlugValue}
              scope="api_key"
              targets={keysWithout}
              title="Budget for an API key"
              trigger="Add key budget"
              triggerVariant="default"
            />
          ) : null
        }
        description="Budgets for single keys, organization or personal."
        title="API keys"
      >
        {keyBudgets.length ? (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead className="w-56">This month</TableHead>
                {canManage ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keyBudgets.map((budget) => (
                <KeyBudgetRow
                  budget={budget}
                  canManage={canManage}
                  editable={editable(budget)}
                  key={budget.id}
                  names={names}
                  orgSlug={orgSlugValue}
                  paused={paused("api_key", budget.apiKeyId ?? "")}
                  status={statusOf("api_key", budget.apiKeyId ?? "")}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <PanelBody flush>
            <EmptyState
              compact
              description="Cap a single key, like a staging server's or a contractor's."
              icon={KeyRoundIcon}
              title="No key budgets"
            />
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}

function KeyBudgetRow(props: {
  budget: Budget;
  status: BudgetStatus;
  names: SpendNames;
  orgSlug: string;
  canManage: boolean;
  paused: boolean;
  editable: { amount?: string; thresholds?: string };
}) {
  const apiKeyId = props.budget.apiKeyId ?? "";
  const key = props.names.keys.get(apiKeyId);
  const label = keyLabel(props.names, apiKeyId);
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="flex items-center gap-2 font-medium">
            {label}
            {props.paused ? <Badge variant="error">Paused</Badge> : null}
          </span>
          {key ? (
            <span className="text-muted-foreground text-xs">
              {environmentLabel(props.names, key.environmentId)}
              {key.ownerUserId
                ? ` · ${memberLabel(props.names, key.ownerUserId)}'s personal key`
                : ""}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <BudgetCell status={props.status} />
      </TableCell>
      {props.canManage ? (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <BudgetDialog
              {...props.editable}
              description="What this key may spend in a month."
              orgSlug={props.orgSlug}
              scope="api_key"
              targetId={apiKeyId}
              title={`Budget for ${label}`}
              trigger="Edit"
            />
            <RemoveBudgetButton
              budgetId={props.budget.id}
              description="The key will have no limit of its own."
              orgSlug={props.orgSlug}
              title={`Remove ${label}'s budget?`}
            />
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
