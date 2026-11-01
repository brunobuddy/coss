import {
  getMigration,
  type Inventory,
  inventoryOf,
  listMigrationItems,
  MIGRATION_KINDS,
  type MigrationItemRow,
  type MigrationKind,
  PROVIDER_NAMES,
  phasesFor,
  progressOf,
  selectionOf,
} from "@coss/migrate";
import { getEnvironment } from "@coss/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { ITEM_KIND_LABELS, OUTCOME_LABELS, PHASE_LABELS, STATUS_LABELS } from "../labels";
import { startableKinds } from "../permissions";
import { CancelImportButton } from "./cancel-button";
import { type KindChoice, StartImportForm } from "./start-form";

export const metadata: Metadata = { title: "Import" };

const ACTIVE = new Set(["inspecting", "queued", "running"]);

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** What the inventory found of a kind, in words. */
function found(inventory: Inventory, kind: MigrationKind): { text: string; empty: boolean } {
  switch (kind) {
    case "domains":
      return { text: plural(inventory.domains.length, "domain"), empty: !inventory.domains.length };
    case "templates":
      return {
        text: plural(inventory.templates.length, "template"),
        empty: !inventory.templates.length,
      };
    case "contacts": {
      const count = inventory.contacts?.count ?? 0;
      const parts = [
        `${inventory.contacts && !inventory.contacts.exact ? "at least " : ""}${plural(count, "contact")}`,
        plural(inventory.lists.length, "list"),
        plural(inventory.properties.length, "custom field"),
        plural(inventory.topics.length, "topic"),
      ];
      return {
        text: parts.join(", "),
        // An estimate of 0 (counting ran out of time) isn't nothing.
        empty:
          count === 0 &&
          inventory.contacts?.exact !== false &&
          !inventory.lists.length &&
          !inventory.properties.length &&
          !inventory.topics.length,
      };
    }
    case "suppressions":
      return {
        text: inventory.suppressions
          ? `${inventory.suppressions.exact ? "" : "at least "}${plural(inventory.suppressions.count, "address", "addresses")}`
          : "",
        empty: inventory.suppressions?.count === 0 && inventory.suppressions.exact,
      };
    case "webhooks":
      return {
        text: plural(inventory.webhooks.length, "endpoint"),
        empty: !inventory.webhooks.length,
      };
  }
}

export default async function ImportPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/import/[migrationId]">) {
  const { orgSlug, projectSlug, envSlug, migrationId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ environment: ["read"] })) notFound();
  const found_ = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found_) notFound();
  const { project, environment } = found_;
  const env = { organizationId: organization.id, environmentId: environment.id };
  const migration = await getMigration(env, migrationId);
  if (!migration) notFound();
  const items = await listMigrationItems(env, migration.id);
  const inventory = inventoryOf(migration);
  const selection = selectionOf(migration);
  const progress = progressOf(migration);
  const status = STATUS_LABELS[migration.status] ?? { label: migration.status, tone: "neutral" };
  const provider = PROVIDER_NAMES[migration.provider];
  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
    migrationId: migration.id,
  };
  const canChange = can({ environment: ["update"] });
  const active = ACTIVE.has(migration.status) || migration.status === "ready";

  const actions = (
    <div className="flex items-center gap-2">
      {ACTIVE.has(migration.status) ? (
        <AutoRefresh renderedAt={new Date().toISOString()} seconds={3} />
      ) : null}
      {active && canChange ? <CancelImportButton {...target} /> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={actions}
        description={`Into ${project.name} · ${environment.name}${inventory?.account ? `, from ${inventory.account}` : ""}.`}
        meta={
          <div className="flex items-center gap-3">
            <ModeBadge mode={environment.mode} />
            <StatusDot pulse={status.pulse} tone={status.tone}>
              {status.label}
            </StatusDot>
          </div>
        }
        title={`Import from ${provider}`}
      />

      {migration.status === "failed" && migration.lastError ? (
        <Alert variant="error">
          <AlertTitle>The import stopped</AlertTitle>
          <AlertDescription>{migration.lastError}</AlertDescription>
        </Alert>
      ) : migration.lastError && ACTIVE.has(migration.status) ? (
        <Alert variant="warning">
          <AlertDescription>{migration.lastError} We'll keep trying for a while.</AlertDescription>
        </Alert>
      ) : null}

      {migration.status === "inspecting" ? (
        <Panel>
          <PanelBody>
            <p className="text-muted-foreground text-sm">
              Reading your {provider} account. This takes a few seconds, or longer for large contact
              lists.
            </p>
          </PanelBody>
        </Panel>
      ) : null}

      {migration.status === "ready" && inventory ? (
        <ReadyPanel
          canChange={canChange}
          inventory={inventory}
          kinds={canChange ? startableKinds(can) : []}
          target={target}
        />
      ) : null}

      {selection ? (
        <Panel title="Progress">
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Imported</TableHead>
                <TableHead className="text-right">Updated or already there</TableHead>
                <TableHead className="text-right">Skipped or invalid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selection.kinds.includes("domains") ? (
                <PhaseRow counts={countItems(items, "domain")} label="Domains" state="done" />
              ) : null}
              {phasesFor(selection.kinds).map((phase) => {
                const entry = progress[phase];
                return (
                  <PhaseRow
                    counts={{
                      created: entry?.created ?? 0,
                      existing: (entry?.existing ?? 0) + (entry?.updated ?? 0),
                      problems: (entry?.skipped ?? 0) + (entry?.invalid ?? 0),
                    }}
                    key={phase}
                    label={PHASE_LABELS[phase] ?? phase}
                    message={entry?.message}
                    samples={entry?.samples}
                    state={
                      // A stopped import's unfinished steps never ran (to the end).
                      (migration.status === "canceled" || migration.status === "failed") &&
                      entry?.state !== "done" &&
                      entry?.state !== "failed"
                        ? migration.status === "failed"
                          ? "failed_import"
                          : "canceled"
                        : (entry?.state ?? "pending")
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      {migration.status === "completed" ? (
        <NextSteps base={base} items={items} provider={provider} />
      ) : null}

      {Object.keys(ITEM_KIND_LABELS)
        .filter((kind) => items.some((item) => item.kind === kind))
        .map((kind) => (
          <ItemsPanel
            base={base}
            items={items.filter((item) => item.kind === kind)}
            key={kind}
            kind={kind}
          />
        ))}

      <Panel>
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="Key" mono>
              {migration.credentialHint}
              {migration.credentialsCiphertext ? "" : " (deleted)"}
            </SpecItem>
            <SpecItem label="Connected">{formatDateTime(migration.createdAt)}</SpecItem>
            {migration.startedAt ? (
              <SpecItem label="Started">{formatDateTime(migration.startedAt)}</SpecItem>
            ) : null}
            {migration.finishedAt ? (
              <SpecItem label="Finished">{formatDateTime(migration.finishedAt)}</SpecItem>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>
    </div>
  );
}

function ReadyPanel(props: {
  inventory: Inventory;
  kinds: MigrationKind[];
  canChange: boolean;
  target: { orgSlug: string; projectSlug: string; envSlug: string; migrationId: string };
}) {
  const allowed = new Set(props.kinds);
  const choices: KindChoice[] = MIGRATION_KINDS.map((kind) => {
    const what = found(props.inventory, kind);
    return {
      kind,
      found: what.text,
      unavailable:
        props.inventory.unavailable[kind] ??
        (!allowed.has(kind)
          ? "Your role can't create these."
          : what.empty
            ? "Nothing to import."
            : null),
    };
  });
  return (
    <Panel
      description="Choose what to bring over. Nothing changes in your old account."
      title="Found"
    >
      <PanelBody className="flex flex-col gap-5">
        {props.canChange ? (
          <StartImportForm {...props.target} domains={props.inventory.domains} kinds={choices} />
        ) : (
          <p className="text-muted-foreground text-sm">An owner or admin can start this import.</p>
        )}
        {props.inventory.notes.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground text-sm">
            {props.inventory.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

const PHASE_STATES: Record<
  string,
  { label: string; tone: "success" | "warning" | "error" | "info" | "neutral"; pulse?: boolean }
> = {
  pending: { label: "Waiting", tone: "neutral" },
  running: { label: "Importing", tone: "info", pulse: true },
  done: { label: "Done", tone: "success" },
  failed: { label: "Stopped", tone: "error" },
  canceled: { label: "Canceled", tone: "neutral" },
  // The import failed before this step finished.
  failed_import: { label: "Not run", tone: "neutral" },
};

function countItems(items: MigrationItemRow[], kind: MigrationItemRow["kind"]) {
  const ofKind = items.filter((item) => item.kind === kind);
  return {
    created: ofKind.filter((item) => item.outcome === "created").length,
    existing: ofKind.filter((item) => item.outcome === "existing").length,
    problems: ofKind.filter((item) => item.outcome === "skipped" || item.outcome === "failed")
      .length,
  };
}

function PhaseRow(props: {
  label: string;
  state: string;
  counts: { created: number; existing: number; problems: number };
  message?: string | undefined;
  samples?: { value: string; message: string }[] | undefined;
}) {
  const state = PHASE_STATES[props.state] ?? { label: props.state, tone: "neutral" };
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="font-medium">{props.label}</div>
        {props.message ? (
          <div className="text-muted-foreground text-xs">{props.message}</div>
        ) : null}
        {props.samples?.length ? (
          <details className="mt-1 text-muted-foreground text-xs">
            <summary className="cursor-pointer">Examples of what was left out</summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {props.samples.map((sample) => (
                <li key={`${sample.value}:${sample.message}`}>
                  <span className="font-mono">{sample.value}</span>: {sample.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </TableCell>
      <TableCell>
        <StatusDot pulse={state.pulse} tone={state.tone}>
          {state.label}
        </StatusDot>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {props.counts.created.toLocaleString("en-US")}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {props.counts.existing.toLocaleString("en-US")}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {props.counts.problems.toLocaleString("en-US")}
      </TableCell>
    </TableRow>
  );
}

/** Where the coss.com object an item became lives in the dashboard. */
function targetHref(base: string, item: MigrationItemRow): string | null {
  if (!item.targetId) return null;
  switch (item.kind) {
    case "domain":
      return `${base}/email/domains/${item.targetId}`;
    case "template":
      return `${base}/email/templates/${item.targetId}`;
    case "audience":
      return `${base}/marketing/audiences/${item.targetId}`;
    case "webhook_endpoint":
      return `${base}/developers/webhooks/${item.targetId}`;
    case "topic":
      return `${base}/marketing/topics`;
    case "property":
      return `${base}/marketing/contacts/properties`;
  }
}

function ItemsPanel(props: { kind: string; items: MigrationItemRow[]; base: string }) {
  return (
    <Panel title={ITEM_KIND_LABELS[props.kind] ?? props.kind}>
      <Table variant="card">
        <TableHeader>
          <TableRow>
            <TableHead>In the old account</TableHead>
            <TableHead>On coss.com</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.map((item) => {
            const outcome = OUTCOME_LABELS[item.outcome] ?? {
              label: item.outcome,
              tone: "neutral",
            };
            const href = targetHref(props.base, item);
            const warnings = Array.isArray(item.warnings) ? (item.warnings as string[]) : [];
            return (
              <TableRow key={item.id}>
                <TableCell className="max-w-72 truncate">{item.sourceName}</TableCell>
                <TableCell className="max-w-72 truncate font-mono text-[0.8125rem]">
                  {href ? (
                    <Link className="underline-offset-4 hover:underline" href={href}>
                      {item.targetName ?? "View"}
                    </Link>
                  ) : (
                    (item.targetName ?? "—")
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <StatusDot tone={item.needsReview ? "warning" : outcome.tone}>
                    {item.needsReview && item.outcome === "created"
                      ? "Needs review"
                      : outcome.label}
                  </StatusDot>
                  {item.message ? (
                    <div className="text-muted-foreground text-xs">{item.message}</div>
                  ) : null}
                  {warnings.length > 0 ? (
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 ps-4 text-muted-foreground text-xs">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

function NextSteps(props: { items: MigrationItemRow[]; base: string; provider: string }) {
  const created = (kind: MigrationItemRow["kind"]) =>
    props.items.filter((item) => item.kind === kind && item.outcome === "created");
  const domains = created("domain");
  const drafts = created("template").filter((item) => item.needsReview);
  const renamed = props.items.some(
    (item) =>
      item.kind === "template" &&
      Array.isArray(item.warnings) &&
      (item.warnings as string[]).some((warning) => warning.startsWith("Send ")),
  );
  const endpoints = created("webhook_endpoint");
  return (
    <Panel title="Next steps">
      <PanelBody>
        <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm">
          {domains.length > 0 ? (
            <li>
              Add coss.com's DNS records to{" "}
              {domains.map((item, index) => (
                <span key={item.id}>
                  {index > 0 ? ", " : ""}
                  <Link
                    className="font-mono underline underline-offset-4"
                    href={`${props.base}/email/domains/${item.targetId}`}
                  >
                    {item.sourceName}
                  </Link>
                </span>
              ))}{" "}
              (one click with Domain Connect where your DNS provider supports it). Keep{" "}
              {props.provider}'s records until you've switched your sending over.
            </li>
          ) : null}
          {drafts.length > 0 ? (
            <li>
              Review {plural(drafts.length, "template")} left as drafts (they use something coss.com
              templates don't have), then publish them.
            </li>
          ) : null}
          {renamed ? (
            <li>
              Some template variables were renamed (coss.com names can't have dots): send the new
              names listed under Templates.
            </li>
          ) : null}
          {endpoints.length > 0 ? (
            <li>
              Update your webhook handlers to coss.com's event format and verify each endpoint's new
              signing secret, then{" "}
              <Link
                className="underline underline-offset-4"
                href={`${props.base}/developers/webhooks`}
              >
                enable the endpoints
              </Link>
              .
            </li>
          ) : null}
          <li>
            Switch your code to the coss.com SDK or API (see{" "}
            <a className="underline underline-offset-4" href="/docs/migrate">
              the migration guides
            </a>
            ), then revoke the key you used in {props.provider}.
          </li>
        </ol>
      </PanelBody>
    </Panel>
  );
}
