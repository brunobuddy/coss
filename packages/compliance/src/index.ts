/**
 * HIPAA mode: one per-organization switch that narrows where PHI can go and who can reach it.
 * Packages read the table themselves rather than taking this injected, so a missing wire can't
 * leave a safeguard off, and a database failure fails the operation instead of skipping the check.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { HIPAA_SMS_COUNTRIES, type HipaaControlId } from "./catalog.ts";

export * from "./catalog.ts";

const { organizationHipaaMode, member, user, dedicatedIpPool, emailTrackingRule } = schema;

export const HIPAA_MODE_RESTRICTION = "hipaa_mode_restriction";

/** A request this organization's HIPAA mode refuses; the message is safe to show. */
export class HipaaModeError extends Error {
  readonly code = HIPAA_MODE_RESTRICTION;
  constructor(message: string) {
    super(message);
    this.name = "HipaaModeError";
  }
}

export type HipaaMode = {
  organizationId: string;
  baaSignedAt: Date;
  baaReference: string;
  enabledAt: Date;
};

export async function getHipaaMode(
  organizationId: string,
  executor: Executor = db,
): Promise<HipaaMode | null> {
  const [row] = await executor
    .select()
    .from(organizationHipaaMode)
    .where(eq(organizationHipaaMode.organizationId, organizationId))
    .limit(1);
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    baaSignedAt: row.baaSignedAt,
    baaReference: row.baaReference,
    enabledAt: row.createdAt,
  };
}

export async function isHipaaMode(
  organizationId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ organizationId: organizationHipaaMode.organizationId })
    .from(organizationHipaaMode)
    .where(eq(organizationHipaaMode.organizationId, organizationId))
    .limit(1);
  return row !== undefined;
}

/**
 * Whether the mode's limits on stored data apply to this environment: its organization is in the
 * mode and it's live. Sandbox environments keep test messages for developers to read.
 */
export async function hipaaModeApplies(
  environmentId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ organizationId: organizationHipaaMode.organizationId })
    .from(schema.environment)
    .innerJoin(
      organizationHipaaMode,
      eq(organizationHipaaMode.organizationId, schema.environment.organizationId),
    )
    .where(and(eq(schema.environment.id, environmentId), eq(schema.environment.mode, "live")))
    .limit(1);
  return row !== undefined;
}

/** SQL for "this organization is in HIPAA mode", for queries that already filter by organization. */
export function hipaaModeSql(organizationId: unknown) {
  // Spelled out: drizzle drops table names from columns in a select without joins.
  return sql<boolean>`exists (select 1 from organization_hipaa_mode h where h.organization_id = ${organizationId})`;
}

/**
 * SQL for `hipaaModeApplies`, for what ends a message. A message can finish without ever being
 * claimed (canceled, refused), so the mode must also be read where its content is cleared.
 */
export function hipaaModeAppliesSql(environmentId: unknown) {
  return sql<boolean>`exists (select 1 from environment e join organization_hipaa_mode h on h.organization_id = e.organization_id where e.id = ${environmentId} and e.mode = 'live')`;
}

export type HipaaImpact = {
  membersWithoutTwoFactor: number;
  liveEnvironmentsTracking: number;
  dedicatedPool: boolean;
  smsOutsideUsLast30Days: number;
};

/**
 * What turning the mode on would change for this organization, or what still needs its members'
 * attention once it's on.
 */
export async function getHipaaImpact(
  organizationId: string,
  executor: Executor = db,
): Promise<HipaaImpact> {
  const [twoFactor] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        sql`coalesce(${user.twoFactorEnabled}, false) = false`,
      ),
    );
  const [tracking] = await executor
    .select({
      count: sql<number>`count(distinct ${emailTrackingRule.environmentId})::int`,
    })
    .from(emailTrackingRule)
    .innerJoin(schema.environment, eq(schema.environment.id, emailTrackingRule.environmentId))
    .where(
      and(
        eq(emailTrackingRule.organizationId, organizationId),
        eq(schema.environment.mode, "live"),
        sql`(${emailTrackingRule.opens} or ${emailTrackingRule.clicks})`,
      ),
    );
  const [pool] = await executor
    .select({ id: dedicatedIpPool.id })
    .from(dedicatedIpPool)
    .where(eq(dedicatedIpPool.organizationId, organizationId))
    .limit(1);
  const [sms] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.smsMessage)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.smsMessage.environmentId))
    .where(
      and(
        eq(schema.smsMessage.organizationId, organizationId),
        eq(schema.environment.mode, "live"),
        notInArray(schema.smsMessage.toCountry, [...HIPAA_SMS_COUNTRIES]),
        gte(schema.smsMessage.createdAt, sql`now() - interval '30 days'`),
      ),
    );
  return {
    membersWithoutTwoFactor: twoFactor?.count ?? 0,
    liveEnvironmentsTracking: tracking?.count ?? 0,
    dedicatedPool: pool !== undefined,
    smsOutsideUsLast30Days: sms?.count ?? 0,
  };
}

/** Whether the organization's dedicated pool, if any, is still waiting to require TLS. */
async function poolAwaitingTls(organizationId: string, executor: Executor): Promise<boolean> {
  const [row] = await executor
    .select({ id: dedicatedIpPool.id })
    .from(dedicatedIpPool)
    .where(
      and(
        eq(dedicatedIpPool.organizationId, organizationId),
        inArray(dedicatedIpPool.status, ["warming", "ready"]),
        isNull(dedicatedIpPool.tlsRequiredAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Where a control isn't fully in effect yet, by control, in words for the customer. Every other
 * control is enforced in code from the moment the mode is on.
 */
export async function getHipaaAttention(
  organizationId: string,
  executor: Executor = db,
): Promise<Partial<Record<HipaaControlId, string>>> {
  const [impact, awaitingTls] = await Promise.all([
    getHipaaImpact(organizationId, executor),
    poolAwaitingTls(organizationId, executor),
  ]);
  const attention: Partial<Record<HipaaControlId, string>> = {};
  const count = impact.membersWithoutTwoFactor;
  if (count > 0) {
    attention.two_factor = `${count} ${count === 1 ? "member hasn't" : "members haven't"} set up two-factor authentication. They can't open this organization until they do, unless they sign in through your SSO provider.`;
  }
  if (awaitingTls) {
    attention.required_tls =
      "Your mail uses shared IPs until your dedicated IPs require TLS, usually within minutes.";
  }
  return attention;
}
