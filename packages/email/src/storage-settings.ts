/**
 * Content storage, per environment: whether coss.com keeps an email's content (subject, body,
 * headers, template variables, attachment filenames) after sending it. Resolved once at send and
 * snapshotted on the email (`email.store_content`), like tracking; `purgeSendContent` clears it
 * when the email leaves the queue. No settings row means content is stored.
 */
import { HipaaModeError, hipaaModeApplies } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";
import type { ContentStorageMode, StorageSettingsOutput } from "./schemas.ts";

const { emailStorageSettings } = schema;

/** The environment storage settings belong to. */
export type StorageEnvironment = { organizationId: string; environmentId: string };

export type StorageSettings = {
  contentStorage: ContentStorageMode;
  /** `null` while the environment never changed the setting. */
  updatedAt: Date | null;
  /** HIPAA mode forces `discard`, whatever the environment's own setting says. */
  lockedByHipaaMode: boolean;
};

export function toStorageSettingsObject(settings: StorageSettings): StorageSettingsOutput {
  return {
    object: "storage_settings",
    content_storage: settings.contentStorage,
    updated_at: settings.updatedAt?.toISOString() ?? null,
  };
}

function inEnvironment(env: StorageEnvironment) {
  return and(
    eq(emailStorageSettings.organizationId, env.organizationId),
    eq(emailStorageSettings.environmentId, env.environmentId),
  );
}

export async function getStorageSettings(
  env: StorageEnvironment,
  executor: Executor = db,
): Promise<StorageSettings> {
  const hipaaMode = await hipaaModeApplies(env.environmentId, executor);
  const [row] = await executor
    .select({
      storeContent: emailStorageSettings.storeContent,
      updatedAt: emailStorageSettings.updatedAt,
    })
    .from(emailStorageSettings)
    .where(inEnvironment(env))
    .limit(1);
  return {
    contentStorage: hipaaMode || row?.storeContent === false ? "discard" : "store",
    updatedAt: row?.updatedAt ?? null,
    lockedByHipaaMode: hipaaMode,
  };
}

/** Whether a send in the environment keeps its content (snapshotted on the email). */
export async function resolveStoreContent(
  executor: Executor,
  env: StorageEnvironment,
): Promise<boolean> {
  return (await getStorageSettings(env, executor)).contentStorage === "store";
}

/**
 * Sets the environment's content storage; emails already sent keep theirs. The project is derived
 * from the environment row; `null` when the environment is not the organization's.
 */
export async function updateStorageSettings(
  env: StorageEnvironment,
  input: { contentStorage: ContentStorageMode },
): Promise<StorageSettings | null> {
  const hipaaMode = await hipaaModeApplies(env.environmentId);
  if (hipaaMode && input.contentStorage === "store") {
    throw new HipaaModeError("HIPAA mode discards email content in live environments.");
  }
  const [environment] = await db
    .select({ projectId: schema.environment.projectId })
    .from(schema.environment)
    .where(
      and(
        eq(schema.environment.id, env.environmentId),
        eq(schema.environment.organizationId, env.organizationId),
      ),
    )
    .limit(1);
  if (!environment) return null;
  const storeContent = input.contentStorage === "store";
  const [row] = await db
    .insert(emailStorageSettings)
    .values({
      organizationId: env.organizationId,
      projectId: environment.projectId,
      environmentId: env.environmentId,
      storeContent,
    })
    .onConflictDoUpdate({
      target: emailStorageSettings.environmentId,
      set: { storeContent, updatedAt: new Date() },
      // The conflicting row is this environment's, so it is the organization's too.
      setWhere: eq(emailStorageSettings.organizationId, env.organizationId),
    })
    .returning();
  if (!row) return null;
  return {
    contentStorage: row.storeContent ? "store" : "discard",
    updatedAt: row.updatedAt,
    lockedByHipaaMode: hipaaMode,
  };
}
