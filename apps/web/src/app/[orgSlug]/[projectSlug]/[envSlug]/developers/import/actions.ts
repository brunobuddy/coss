"use server";

import {
  cancelMigration,
  checkCredentials,
  connectMigration,
  getMigration,
  importDomains,
  inventoryOf,
  MIGRATION_KINDS,
  MIGRATION_PROVIDERS,
  type MigrationKind,
  type MigrationProvider,
  PROVIDER_NAMES,
  ProviderError,
  startMigration,
} from "@coss/migrate";
import { getEnvironment, readOrganizationApiVersion } from "@coss/tenancy";
import { versioning } from "@coss/versioning";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { emailRuntime } from "@/lib/email-runtime";
import { rateLimitRuntime } from "@/lib/rate-limit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { webhookManagementDeps } from "@/lib/webhooks";
import { importPermissions } from "./permissions";

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found;
}

function basePath(context: OrgContext, found: Awaited<ReturnType<typeof environmentFromForm>>) {
  return `/${context.organization.slug}/${found.project.slug}/${found.environment.slug}`;
}

function isProvider(value: string): value is MigrationProvider {
  return (MIGRATION_PROVIDERS as readonly string[]).includes(value);
}

export type ConnectResult = { servers: { id: number; name: string }[] };

/**
 * Checks the provider's key and stores it for the worker, which reads the account; then opens
 * the import. A Postmark account token with several servers first asks which one.
 */
export async function connectMigrationAction(
  _previous: ActionResult<ConnectResult> | null,
  formData: FormData,
): Promise<ActionResult<ConnectResult>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const found = await environmentFromForm(context, formData);
    const provider = formString(formData, "provider");
    if (!isProvider(provider)) throw new ActionError("Choose a provider.");
    const apiKey = formString(formData, "apiKey").trim();
    if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
      throw new ActionError(`Paste your ${PROVIDER_NAMES[provider]} API key.`);
    }
    const serverValue = formString(formData, "serverId");
    const serverId = serverValue ? Number(serverValue) : undefined;
    if (serverId !== undefined && !Number.isInteger(serverId)) {
      throw new ActionError("Choose a server.");
    }

    // Every check calls the provider: coss.com mustn't become a way to test stolen keys.
    const { limiter } = rateLimitRuntime();
    const decision = await limiter.consume({
      buckets: ["dashboard.migration_connections" as const],
      subject: context.organization.id,
      organizationId: context.organization.id,
    });
    if (!decision.allowed) {
      throw new ActionError(
        "Too many keys were checked for this organization today. Try again tomorrow.",
      );
    }

    let check: Awaited<ReturnType<typeof checkCredentials>>;
    try {
      check = await checkCredentials(provider, apiKey, { serverId });
    } catch (error) {
      if (error instanceof ProviderError) throw new ActionError(error.message);
      throw error;
    }
    if (!check.ok) return { servers: check.servers };

    const migration = await connectMigration(
      { organizationId: context.organization.id, environmentId: found.environment.id },
      { provider, apiKey, options: check.options, userId: context.session.user.id },
      { secretsKeys: webhookManagementDeps().secretsKeys },
    );
    if (!migration) throw new ActionError("Environment not found.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "migration.connected",
      target: { type: "migration", id: migration.id, label: PROVIDER_NAMES[provider] },
      projectId: found.project.id,
      environmentId: found.environment.id,
      metadata: { provider, ...(check.account ? { account: check.account } : {}) },
    });
    redirect(`${basePath(context, found)}/developers/import/${migration.id}`);
  });
}

/** Starts the import with what the customer chose; domains are created here (see `importDomains`). */
export async function startMigrationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const orgSlug = formString(formData, "orgSlug");
    const known = new Set<string>(MIGRATION_KINDS);
    const kinds = formData
      .getAll("kinds")
      .filter((value): value is MigrationKind => typeof value === "string" && known.has(value));
    if (kinds.length === 0) throw new ActionError("Choose what to import.");
    const context = await requireOrgPermission(orgSlug, importPermissions(kinds));
    const found = await environmentFromForm(context, formData);
    const env = { organizationId: context.organization.id, environmentId: found.environment.id };
    const migration = await getMigration(env, formString(formData, "migrationId"));
    if (!migration) throw new ActionError("Import not found.");
    const inventory = inventoryOf(migration);
    if (migration.status !== "ready" || !inventory) {
      throw new ActionError("This import has already started or was canceled.");
    }
    const unavailable = kinds.find((kind) => inventory.unavailable[kind]);
    if (unavailable) throw new ActionError(inventory.unavailable[unavailable] ?? "Not available.");
    const offered = new Set(inventory.domains.map((domain) => domain.id));
    const domainIds = kinds.includes("domains")
      ? formData
          .getAll("domainIds")
          .filter((value): value is string => typeof value === "string" && offered.has(value))
      : [];
    if (kinds.includes("domains") && domainIds.length === 0) {
      throw new ActionError("Choose the domains to import, or leave domains out.");
    }
    // Imported endpoints get the organization's version, like the ones it creates.
    const webhookApiVersion =
      (await readOrganizationApiVersion({ organizationId: context.organization.id })) ??
      versioning.latest;
    // Domains first, while the import can still be started: if creating one fails, starting again
    // retries it (each domain is recorded, so none is created twice).
    if (domainIds.length > 0) {
      await importDomains(
        migration,
        domainIds,
        { userId: context.session.user.id },
        emailRuntime().domainDeps,
      );
    }
    const started = await startMigration(env, migration.id, {
      kinds,
      domainIds,
      webhookApiVersion,
    });
    if (!started) throw new ActionError("This import has already started or was canceled.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "migration.started",
      target: { type: "migration", id: migration.id, label: PROVIDER_NAMES[migration.provider] },
      projectId: found.project.id,
      environmentId: found.environment.id,
      metadata: { provider: migration.provider, kinds },
    });
    refresh();
    return null;
  });
}

/** Cancels an import that hasn't finished; the provider's key is deleted with it. */
export async function cancelMigrationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const found = await environmentFromForm(context, formData);
    const canceled = await cancelMigration(
      { organizationId: context.organization.id, environmentId: found.environment.id },
      formString(formData, "migrationId"),
    );
    if (!canceled) throw new ActionError("This import has already finished.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "migration.canceled",
      target: { type: "migration", id: canceled.id, label: PROVIDER_NAMES[canceled.provider] },
      projectId: found.project.id,
      environmentId: found.environment.id,
    });
    refresh();
    return null;
  });
}
