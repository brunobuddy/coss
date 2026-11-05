/**
 * Platform-level reads of every organization's email, for the admin console only: callers must
 * have checked `requirePlatformAdmin*` first. Nothing here is scoped by a caller's organization;
 * `scope` narrows the scans in tests (the test database is shared and never truncated).
 */
import { hipaaModeSql } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { isId } from "@coss/db/id";
import { and, desc, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { EmailObjectOutput } from "./schemas.ts";

const {
  apikey,
  contentScreening,
  domain,
  email,
  environment,
  member,
  organization,
  organizationDeletion,
  organizationSuspension,
  project,
  reputationStanding,
  user,
} = schema;

type EmailStatus = EmailObjectOutput["status"];
type EnvironmentMode = (typeof environment.$inferSelect)["mode"];
type ScreeningVerdict = (typeof contentScreening.$inferSelect)["verdict"];

export type AdminEmailScope = { organizationIds?: string[] };

function inScope(scope: AdminEmailScope | undefined): SQL | undefined {
  return scope?.organizationIds ? inArray(email.organizationId, scope.organizationIds) : undefined;
}

const sameEnvironment = and(
  eq(environment.id, email.environmentId),
  eq(environment.organizationId, email.organizationId),
);

export type PlatformEmailCounts = {
  /** Live emails by status. */
  live: Record<EmailStatus, number>;
  /** Sandbox emails (never delivered). */
  sandbox: number;
  /** Organizations with at least one live email sent. */
  liveSenders: number;
};

function zeroCounts(): PlatformEmailCounts {
  return {
    live: { queued: 0, sent: 0, failed: 0, scheduled: 0, canceled: 0 },
    sandbox: 0,
    liveSenders: 0,
  };
}

/**
 * Emails created in `[since, now)` across every organization, split into coss.com's own organization
 * (`systemOrganizationId`: account and notification emails) and everyone else.
 */
export async function platformEmailStats(input: {
  since: Date;
  now?: Date;
  systemOrganizationId: string | null;
  scope?: AdminEmailScope;
}): Promise<{ customers: PlatformEmailCounts; coss: PlatformEmailCounts }> {
  const now = input.now ?? new Date();
  const coss = sql<boolean>`coalesce(${email.organizationId} = ${input.systemOrganizationId}, false)`;
  const rows = await db
    .select({
      coss,
      mode: environment.mode,
      status: email.status,
      count: sql<number>`count(*)::int`,
    })
    .from(email)
    .innerJoin(environment, sameEnvironment)
    .where(and(gte(email.createdAt, input.since), lt(email.createdAt, now), inScope(input.scope)))
    // By position: the organization id is a parameter, so `coss` is a new expression each time.
    .groupBy(sql`1`, sql`2`, sql`3`);
  const senders = await db
    .select({ coss, senders: sql<number>`count(distinct ${email.organizationId})::int` })
    .from(email)
    .innerJoin(environment, sameEnvironment)
    .where(
      and(
        gte(email.createdAt, input.since),
        lt(email.createdAt, now),
        eq(environment.mode, "live"),
        eq(email.status, "sent"),
        inScope(input.scope),
      ),
    )
    .groupBy(sql`1`);

  const result = { customers: zeroCounts(), coss: zeroCounts() };
  for (const row of rows) {
    const counts = row.coss ? result.coss : result.customers;
    if (row.mode === "live") counts.live[row.status] += row.count;
    else counts.sandbox += row.count;
  }
  for (const row of senders) (row.coss ? result.coss : result.customers).liveSenders = row.senders;
  return result;
}

export type AdminSenderRow = {
  organizationId: string;
  name: string;
  slug: string;
  organizationCreatedAt: Date;
  ownerEmail: string | null;
  verifiedDomains: number;
  liveSent: number;
  /** Billable recipients of the live emails sent. */
  liveRecipients: number;
  liveFailed: number;
  /** Live emails queued or scheduled. */
  livePending: number;
  sandbox: number;
  lastEmailAt: Date;
  screeningFlagged: number;
  screeningBlocked: number;
  standingStatus: "good" | "warning" | "suspended";
  standingMetrics: Record<string, unknown> | null;
  suspended: boolean;
  deleting: boolean;
};

/**
 * Organizations that created emails in `[since, now)`, the most live emails sent first: who is
 * sending, how much, and how it is going.
 */
export async function listSendersForAdmin(input: {
  since: Date;
  now?: Date;
  /** Only this organization (its own page). */
  organizationId?: string;
  /** Leave this organization out (coss.com's own). */
  excludeOrganizationId?: string | null;
  limit?: number;
  scope?: AdminEmailScope;
}): Promise<AdminSenderRow[]> {
  const now = input.now ?? new Date();
  const live = sql`${environment.mode} = 'live'`;
  const counts = db.$with("counts").as(
    db
      .select({
        organizationId: email.organizationId,
        liveSent:
          sql<number>`(count(*) filter (where ${live} and ${email.status} = 'sent'))::int`.as(
            "live_sent",
          ),
        liveRecipients:
          sql<number>`(coalesce(sum(${email.billableRecipients}) filter (where ${live} and ${email.status} = 'sent'), 0))::int`.as(
            "live_recipients",
          ),
        liveFailed:
          sql<number>`(count(*) filter (where ${live} and ${email.status} = 'failed'))::int`.as(
            "live_failed",
          ),
        livePending:
          sql<number>`(count(*) filter (where ${live} and ${email.status} in ('queued', 'scheduled')))::int`.as(
            "live_pending",
          ),
        sandbox: sql<number>`(count(*) filter (where not ${live}))::int`.as("sandbox"),
        lastEmailAt: sql<Date>`max(${email.createdAt})`.as("last_email_at"),
      })
      .from(email)
      .innerJoin(environment, sameEnvironment)
      .where(
        and(
          gte(email.createdAt, input.since),
          lt(email.createdAt, now),
          input.organizationId ? eq(email.organizationId, input.organizationId) : undefined,
          input.excludeOrganizationId
            ? sql`${email.organizationId} <> ${input.excludeOrganizationId}`
            : undefined,
          inScope(input.scope),
        ),
      )
      .groupBy(email.organizationId),
  );
  const screeningCount = (verdict: ScreeningVerdict) =>
    sql<number>`(select count(*)::int from ${contentScreening}
      where ${contentScreening.organizationId} = ${organization.id}
        and ${contentScreening.createdAt} >= ${input.since.toISOString()}
        and ${contentScreening.createdAt} < ${now.toISOString()}
        and ${contentScreening.verdict} = ${verdict})`;
  const rows = await db
    .with(counts)
    .select({
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      organizationCreatedAt: organization.createdAt,
      ownerEmail: sql<string | null>`(select ${user.email} from ${member}
        inner join ${user} on ${user.id} = ${member.userId}
        where ${member.organizationId} = ${organization.id}
          and 'owner' = any(string_to_array(${member.role}, ','))
        order by ${member.createdAt} limit 1)`,
      verifiedDomains: sql<number>`(select count(*)::int from ${domain}
        where ${domain.organizationId} = ${organization.id} and ${domain.status} = 'verified')`,
      liveSent: counts.liveSent,
      liveRecipients: counts.liveRecipients,
      liveFailed: counts.liveFailed,
      livePending: counts.livePending,
      sandbox: counts.sandbox,
      lastEmailAt: counts.lastEmailAt,
      screeningFlagged: screeningCount("flagged"),
      screeningBlocked: screeningCount("blocked"),
      standingStatus: reputationStanding.status,
      standingMetrics: reputationStanding.metrics,
      suspended: sql<boolean>`${organizationSuspension.organizationId} is not null`,
      deleting: sql<boolean>`exists (select 1 from ${organizationDeletion}
        where ${organizationDeletion.organizationId} = ${organization.id}
          and ${organizationDeletion.status} = 'pending')`,
    })
    .from(counts)
    .innerJoin(organization, eq(organization.id, counts.organizationId))
    .leftJoin(reputationStanding, eq(reputationStanding.organizationId, organization.id))
    .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
    .orderBy(
      desc(counts.liveSent),
      desc(sql`${counts.liveFailed} + ${counts.livePending}`),
      desc(counts.sandbox),
      organization.id,
    )
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500));
  return rows.map((row) => ({
    ...row,
    lastEmailAt: new Date(row.lastEmailAt),
    standingStatus: row.standingStatus ?? "good",
  }));
}

export type AdminEmailListItem = {
  id: string;
  createdAt: Date;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  mode: EnvironmentMode;
  from: string;
  subject: string;
  recipients: number;
  status: EmailStatus;
  errorCode: string | null;
  /** The latest content screening of the email, if it was sampled. */
  screening: { verdict: ScreeningVerdict; enforced: boolean } | null;
};

export type AdminEmailFilters = {
  organizationId?: string;
  mode?: EnvironmentMode;
  status?: EmailStatus;
  /** A case-insensitive substring of the From address. */
  from?: string;
  /** Only emails older than this one (keyset cursor). */
  before?: string;
};

const HIPAA_HIDDEN_SUBJECT = "Hidden (HIPAA mode)";

/** Its organization is in HIPAA mode, or coss.com sent it on behalf of one that is. */
function hiddenFromStaff() {
  return sql<boolean>`(${email.hipaaOrigin} or ${hipaaModeSql(email.organizationId)})`;
}

/** `%`, `_` and `\` match themselves in an ILIKE pattern. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Every organization's emails, newest first, without content. */
export async function listEmailsForAdmin(
  input: AdminEmailFilters & { limit?: number; scope?: AdminEmailScope },
): Promise<{ items: AdminEmailListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  if (input.before !== undefined && !isId("email", input.before)) {
    return { items: [], nextCursor: null };
  }
  const from = input.from?.trim();
  const rows = await db
    .select({
      id: email.id,
      createdAt: email.createdAt,
      organizationId: email.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      mode: environment.mode,
      from: email.from,
      subject: sql<string>`case when ${hiddenFromStaff()} then ${HIPAA_HIDDEN_SUBJECT} else ${email.subject} end`,
      recipients: sql<number>`(cardinality(${email.to}) + cardinality(${email.cc}) + cardinality(${email.bcc}))::int`,
      status: email.status,
      errorCode: email.errorCode,
    })
    .from(email)
    .innerJoin(environment, sameEnvironment)
    .innerJoin(organization, eq(organization.id, email.organizationId))
    .where(
      and(
        input.organizationId ? eq(email.organizationId, input.organizationId) : undefined,
        input.mode ? eq(environment.mode, input.mode) : undefined,
        input.status ? eq(email.status, input.status) : undefined,
        from ? sql`${email.from} ilike ${likePattern(from)}` : undefined,
        input.before
          ? sql`(${email.createdAt}, ${email.id}) < (select c.created_at, c.id from ${email} c where c.id = ${input.before})`
          : undefined,
        inScope(input.scope),
      ),
    )
    // Backward scans of the (created_at) and (organization_id, created_at) indexes.
    .orderBy(desc(email.createdAt), desc(email.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const verdicts = await latestScreenings(page.map((row) => row.id));
  return {
    items: page.map((row) => ({ ...row, screening: verdicts.get(row.id) ?? null })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

async function latestScreenings(
  emailIds: string[],
): Promise<Map<string, { verdict: ScreeningVerdict; enforced: boolean }>> {
  const latest = new Map<string, { verdict: ScreeningVerdict; enforced: boolean }>();
  if (emailIds.length === 0) return latest;
  const rows = await db
    .select({
      subjectId: contentScreening.subjectId,
      verdict: contentScreening.verdict,
      enforced: contentScreening.enforced,
    })
    .from(contentScreening)
    .where(
      and(eq(contentScreening.product, "email"), inArray(contentScreening.subjectId, emailIds)),
    )
    .orderBy(desc(contentScreening.createdAt), desc(contentScreening.id));
  for (const row of rows) {
    if (!latest.has(row.subjectId)) {
      latest.set(row.subjectId, { verdict: row.verdict, enforced: row.enforced });
    }
  }
  return latest;
}

export type AdminEmailContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  mode: EnvironmentMode;
  /** Staff see nothing that identifies a recipient or says what the email was about. */
  hipaaMode: boolean;
  apiKeyId: string | null;
  /** The key's name; null once the key is deleted. */
  apiKeyName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/**
 * Where an email belongs: its organization, project, environment and API key. The admin pages then
 * read the email itself with the organization-scoped reads (`getEmail`, `listEmailEvents`).
 */
export async function getEmailForAdmin(emailId: string): Promise<AdminEmailContext | null> {
  if (!isId("email", emailId)) return null;
  const [row] = await db
    .select({
      organizationId: email.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      projectName: project.name,
      environmentId: email.environmentId,
      environmentName: environment.name,
      mode: environment.mode,
      hipaaMode: hiddenFromStaff(),
      apiKeyId: email.apiKeyId,
      apiKeyName: apikey.name,
      errorCode: email.errorCode,
      errorMessage: email.errorMessage,
    })
    .from(email)
    .innerJoin(environment, sameEnvironment)
    .innerJoin(project, eq(project.id, environment.projectId))
    .innerJoin(organization, eq(organization.id, email.organizationId))
    .leftJoin(apikey, eq(apikey.id, email.apiKeyId))
    .where(eq(email.id, emailId))
    .limit(1);
  return row ?? null;
}

/** An email's content: only for an admin who chose to see it (the caller audits that). */
export async function getEmailContentForAdmin(
  emailId: string,
): Promise<{ organizationId: string; html: string | null; text: string | null } | null> {
  if (!isId("email", emailId)) return null;
  const [row] = await db
    .select({ organizationId: email.organizationId, html: email.html, text: email.text })
    .from(email)
    .where(eq(email.id, emailId))
    .limit(1);
  return row ?? null;
}
