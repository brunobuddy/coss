/**
 * Re-encrypts stored endpoint secrets with the newest `WEBHOOK_SECRETS_KEY`, the step that lets an
 * old key leave the list (README.md, "Rotating WEBHOOK_SECRETS_KEY"). System-level: the scan spans
 * organizations, and every write is scoped by the row's own id and organization.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedWithPrimary,
  type SecretsKeyRing,
} from "./secrets.ts";

const {
  hookEndpoint,
  logDrain,
  migration,
  riskSettings,
  schedulingCalendarConnection,
  schedulingCalendarDelegation,
  schedulingOauthApp,
  smsAccount,
  webhookEndpoint,
} = schema;

/**
 * Tables of endpoints with a current and a previous (rolled) secret: coss.com's own webhook endpoints
 * and Hooks endpoints. Their secret columns are identical, so one loop covers both.
 */
const ROLLED_SECRET_TABLES = [
  webhookEndpoint,
  hookEndpoint as unknown as typeof webhookEndpoint,
] as const;

export type ReencryptResult = {
  /**
   * Webhook endpoints, Hooks endpoints, log drains, captcha secrets, SMS auth tokens, imports'
   * provider keys and calendar credentials looked at.
   */
  checked: number;
  /** Rows rewritten (with `dryRun`: that would be). */
  reencrypted: number;
  /** Rows with a secret no listed key decrypts: nothing can be delivered to them until it is back. */
  unreadable: { id: string; organizationId: string; error: string }[];
  /** Rows whose secret changed while this ran (left as they are); run again to cover them. */
  conflicts: number;
};

/**
 * Rewrites every webhook endpoint, Hooks endpoint, log drain and risk captcha secret (and every SMS
 * auth token and provider key an unfinished import holds) not encrypted with the key ring's primary key, and drops previous endpoint secrets that stopped signing. Idempotent and safe while the apps serve traffic: a row is only
 * updated if it still holds what was read. `scope` limits the scan to some organizations (tests).
 */
export async function reencryptWebhookSecrets(opts: {
  keys: SecretsKeyRing;
  dryRun?: boolean;
  batchSize?: number;
  now?: Date;
  scope?: { organizationIds: string[] };
}): Promise<ReencryptResult> {
  const { keys } = opts;
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 200;
  const result: ReencryptResult = { checked: 0, reencrypted: 0, unreadable: [], conflicts: 0 };
  const reencrypt = (stored: string) =>
    isEncryptedWithPrimary(stored, keys)
      ? stored
      : encryptSecret(decryptSecret(stored, keys), keys);
  for (const table of ROLLED_SECRET_TABLES) {
    await reencryptRolledSecrets(table, { ...opts, batchSize, now }, reencrypt, result);
  }
  await reencryptLogDrainSecrets({ ...opts, batchSize }, result);
  await reencryptCaptchaSecrets({ ...opts, batchSize }, result);
  await reencryptSmsAuthTokens({ ...opts, batchSize }, result);
  await reencryptMigrationCredentials({ ...opts, batchSize }, result);
  await reencryptCalendarCredentials({ ...opts, batchSize }, result);
  await reencryptCalendarDelegations({ ...opts, batchSize }, result);
  await reencryptSchedulingOauthApps({ ...opts, batchSize }, result);
  return result;
}

/** One endpoint table's current and previous secrets. */
async function reencryptRolledSecrets(
  table: typeof webhookEndpoint,
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    now: Date;
    scope?: { organizationIds: string[] };
  },
  reencrypt: (stored: string) => string,
  result: ReencryptResult,
): Promise<void> {
  const { keys, batchSize, now } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: table.id,
        organizationId: table.organizationId,
        secretCiphertext: table.secretCiphertext,
        previousSecretCiphertext: table.previousSecretCiphertext,
        previousSecretExpiresAt: table.previousSecretExpiresAt,
      })
      .from(table)
      .where(
        and(
          gt(table.id, after),
          opts.scope ? inArray(table.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(table.id))
      .limit(batchSize);
    for (const row of rows) {
      result.checked++;
      const dropPrevious =
        row.previousSecretCiphertext !== null &&
        (row.previousSecretExpiresAt === null || row.previousSecretExpiresAt <= now);
      const previous = dropPrevious ? null : row.previousSecretCiphertext;
      const stale = [row.secretCiphertext, previous].some(
        (stored) => stored !== null && !isEncryptedWithPrimary(stored, keys),
      );
      if (!stale && !dropPrevious) continue;
      let next: { secretCiphertext: string; previousSecretCiphertext: string | null };
      try {
        next = {
          secretCiphertext: reencrypt(row.secretCiphertext),
          previousSecretCiphertext: previous === null ? null : reencrypt(previous),
        };
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(table)
        .set({
          ...next,
          previousSecretExpiresAt: previous === null ? null : row.previousSecretExpiresAt,
          // The customer changed nothing.
          updatedAt: sql`${table.updatedAt}`,
        })
        .where(
          and(
            eq(table.id, row.id),
            eq(table.organizationId, row.organizationId),
            eq(table.secretCiphertext, row.secretCiphertext),
            row.previousSecretCiphertext === null
              ? isNull(table.previousSecretCiphertext)
              : eq(table.previousSecretCiphertext, row.previousSecretCiphertext),
          ),
        )
        .returning({ id: table.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) break;
    after = last.id;
  }
}

/** Risk settings' captcha secrets (encrypted with the same key ring, `@coss/risk`). */
async function reencryptCaptchaSecrets(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: riskSettings.environmentId,
        organizationId: riskSettings.organizationId,
        secretCiphertext: riskSettings.captchaSecretCiphertext,
      })
      .from(riskSettings)
      .where(
        and(
          gt(riskSettings.environmentId, after),
          isNotNull(riskSettings.captchaSecretCiphertext),
          opts.scope ? inArray(riskSettings.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(riskSettings.environmentId))
      .limit(opts.batchSize);
    for (const row of rows) {
      const stored = row.secretCiphertext;
      if (!stored) continue;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let secretCiphertext: string;
      try {
        secretCiphertext = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(riskSettings)
        .set({
          captchaSecretCiphertext: secretCiphertext,
          updatedAt: sql`${riskSettings.updatedAt}`,
        })
        .where(
          and(
            eq(riskSettings.environmentId, row.id),
            eq(riskSettings.organizationId, row.organizationId),
            eq(riskSettings.captchaSecretCiphertext, stored),
          ),
        )
        .returning({ id: riskSettings.environmentId });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

/** SMS: each organization's Twilio subaccount auth token (`@coss/sms` verifies callbacks with it). */
async function reencryptSmsAuthTokens(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({ id: smsAccount.organizationId, authToken: smsAccount.authToken })
      .from(smsAccount)
      .where(
        and(
          gt(smsAccount.organizationId, after),
          isNotNull(smsAccount.authToken),
          opts.scope ? inArray(smsAccount.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(smsAccount.organizationId))
      .limit(opts.batchSize);
    for (const row of rows) {
      const stored = row.authToken;
      if (!stored) continue;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let authToken: string;
      try {
        authToken = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(smsAccount)
        .set({ authToken, updatedAt: sql`${smsAccount.updatedAt}` })
        .where(and(eq(smsAccount.organizationId, row.id), eq(smsAccount.authToken, stored)))
        .returning({ id: smsAccount.organizationId });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

/**
 * Scheduling's calendar credentials. Refreshes rewrite these rows all the time, so a conflict just
 * means the row now holds a newer value, which the writer encrypted with the primary key already.
 */
async function reencryptCalendarCredentials(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingCalendarConnection.id,
        organizationId: schedulingCalendarConnection.organizationId,
        stored: schedulingCalendarConnection.encryptedCredentials,
      })
      .from(schedulingCalendarConnection)
      .where(
        and(
          gt(schedulingCalendarConnection.id, after),
          isNotNull(schedulingCalendarConnection.encryptedCredentials),
          opts.scope
            ? inArray(schedulingCalendarConnection.organizationId, opts.scope.organizationIds)
            : undefined,
        ),
      )
      .orderBy(asc(schedulingCalendarConnection.id))
      .limit(opts.batchSize);
    for (const row of rows) {
      const stored = row.stored;
      if (!stored) continue;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let encryptedCredentials: string;
      try {
        encryptedCredentials = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(schedulingCalendarConnection)
        .set({
          encryptedCredentials,
          updatedAt: sql`${schedulingCalendarConnection.updatedAt}`,
        })
        .where(
          and(
            eq(schedulingCalendarConnection.id, row.id),
            eq(schedulingCalendarConnection.organizationId, row.organizationId),
            eq(schedulingCalendarConnection.encryptedCredentials, stored),
          ),
        )
        .returning({ id: schedulingCalendarConnection.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

/** Scheduling's calendar delegations: a customer's service account key or client secret. */
async function reencryptCalendarDelegations(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingCalendarDelegation.id,
        organizationId: schedulingCalendarDelegation.organizationId,
        stored: schedulingCalendarDelegation.encryptedCredentials,
      })
      .from(schedulingCalendarDelegation)
      .where(
        and(
          gt(schedulingCalendarDelegation.id, after),
          opts.scope
            ? inArray(schedulingCalendarDelegation.organizationId, opts.scope.organizationIds)
            : undefined,
        ),
      )
      .orderBy(asc(schedulingCalendarDelegation.id))
      .limit(opts.batchSize);
    for (const row of rows) {
      const { stored } = row;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let encryptedCredentials: string;
      try {
        encryptedCredentials = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(schedulingCalendarDelegation)
        .set({
          encryptedCredentials,
          updatedAt: sql`${schedulingCalendarDelegation.updatedAt}`,
        })
        .where(
          and(
            eq(schedulingCalendarDelegation.id, row.id),
            eq(schedulingCalendarDelegation.organizationId, row.organizationId),
            eq(schedulingCalendarDelegation.encryptedCredentials, stored),
          ),
        )
        .returning({ id: schedulingCalendarDelegation.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

async function reencryptSchedulingOauthApps(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: schedulingOauthApp.id,
        organizationId: schedulingOauthApp.organizationId,
        stored: schedulingOauthApp.encryptedCredentials,
      })
      .from(schedulingOauthApp)
      .where(
        and(
          gt(schedulingOauthApp.id, after),
          opts.scope
            ? inArray(schedulingOauthApp.organizationId, opts.scope.organizationIds)
            : undefined,
        ),
      )
      .orderBy(asc(schedulingOauthApp.id))
      .limit(opts.batchSize);
    for (const row of rows) {
      const { stored } = row;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let encryptedCredentials: string;
      try {
        encryptedCredentials = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(schedulingOauthApp)
        .set({
          encryptedCredentials,
          updatedAt: sql`${schedulingOauthApp.updatedAt}`,
        })
        .where(
          and(
            eq(schedulingOauthApp.id, row.id),
            eq(schedulingOauthApp.organizationId, row.organizationId),
            eq(schedulingOauthApp.encryptedCredentials, stored),
          ),
        )
        .returning({ id: schedulingOauthApp.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

/** Provider API keys of imports from other providers (`@coss/migrate`), held until they finish. */
async function reencryptMigrationCredentials(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: migration.id,
        organizationId: migration.organizationId,
        secretCiphertext: migration.credentialsCiphertext,
      })
      .from(migration)
      .where(
        and(
          gt(migration.id, after),
          isNotNull(migration.credentialsCiphertext),
          opts.scope ? inArray(migration.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(migration.id))
      .limit(opts.batchSize);
    for (const row of rows) {
      const stored = row.secretCiphertext;
      if (!stored) continue;
      result.checked++;
      if (isEncryptedWithPrimary(stored, keys)) continue;
      let secretCiphertext: string;
      try {
        secretCiphertext = encryptSecret(decryptSecret(stored, keys), keys);
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(migration)
        .set({ credentialsCiphertext: secretCiphertext, updatedAt: sql`${migration.updatedAt}` })
        .where(
          and(
            eq(migration.id, row.id),
            eq(migration.organizationId, row.organizationId),
            eq(migration.credentialsCiphertext, stored),
          ),
        )
        .returning({ id: migration.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}

/** Log drains have one signing secret each (no rolls), and optionally an auth header value. */
async function reencryptLogDrainSecrets(
  opts: {
    keys: SecretsKeyRing;
    dryRun?: boolean;
    batchSize: number;
    scope?: { organizationIds: string[] };
  },
  result: ReencryptResult,
): Promise<void> {
  const { keys } = opts;
  const reencrypt = (stored: string) =>
    isEncryptedWithPrimary(stored, keys)
      ? stored
      : encryptSecret(decryptSecret(stored, keys), keys);
  let after = "";
  for (;;) {
    const rows = await db
      .select({
        id: logDrain.id,
        organizationId: logDrain.organizationId,
        secretCiphertext: logDrain.secretCiphertext,
        authHeaderCiphertext: logDrain.authHeaderCiphertext,
      })
      .from(logDrain)
      .where(
        and(
          gt(logDrain.id, after),
          opts.scope ? inArray(logDrain.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(logDrain.id))
      .limit(opts.batchSize);
    for (const row of rows) {
      result.checked++;
      const stale = [row.secretCiphertext, row.authHeaderCiphertext].some(
        (stored) => stored !== null && !isEncryptedWithPrimary(stored, keys),
      );
      if (!stale) continue;
      let next: { secretCiphertext: string; authHeaderCiphertext: string | null };
      try {
        next = {
          secretCiphertext: reencrypt(row.secretCiphertext),
          authHeaderCiphertext:
            row.authHeaderCiphertext === null ? null : reencrypt(row.authHeaderCiphertext),
        };
      } catch (error) {
        result.unreadable.push({
          id: row.id,
          organizationId: row.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (opts.dryRun) {
        result.reencrypted++;
        continue;
      }
      const [updated] = await db
        .update(logDrain)
        .set({ ...next, updatedAt: sql`${logDrain.updatedAt}` })
        .where(
          and(
            eq(logDrain.id, row.id),
            eq(logDrain.organizationId, row.organizationId),
            eq(logDrain.secretCiphertext, row.secretCiphertext),
            row.authHeaderCiphertext === null
              ? isNull(logDrain.authHeaderCiphertext)
              : eq(logDrain.authHeaderCiphertext, row.authHeaderCiphertext),
          ),
        )
        .returning({ id: logDrain.id });
      if (updated) result.reencrypted++;
      else result.conflicts++;
    }
    const last = rows.at(-1);
    if (!last || rows.length < opts.batchSize) break;
    after = last.id;
  }
}
