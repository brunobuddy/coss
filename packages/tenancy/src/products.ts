import {
  isProductKey,
  PRODUCT_KEYS,
  type ProductKey,
  type ProductPreferences,
} from "@coss/dashboard-routes";
import { db, schema } from "@coss/db";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

const { environment, productPreference } = schema;

// Qualified by hand: drizzle leaves `environment.id` bare, which the subquery would read as its own `id`.
const ENVIRONMENT_ID = sql`${environment}.${sql.identifier("id")}`;

function anyIn(table: PgTable, environmentId: PgColumn): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${table} where ${environmentId} = ${ENVIRONMENT_ID})`;
}

function anyInOrganization(table: PgTable, organizationId: PgColumn, id: string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${table} where ${organizationId} = ${id})`;
}

/**
 * The products each of the organization's environments uses: those with anything of theirs in it
 * (an email, a form, a Hooks application…), plus Email once the organization has a domain and SMS
 * once it has a number. The dashboard shows them without being asked.
 */
export async function productActivityByEnvironment(
  organizationId: string,
): Promise<Map<string, ProductKey[]>> {
  const rows = await db
    .select({
      environmentId: environment.id,
      email: sql<boolean>`${anyIn(schema.email, schema.email.environmentId)} or ${anyIn(schema.receivedEmail, schema.receivedEmail.environmentId)} or ${anyInOrganization(schema.domain, schema.domain.organizationId, organizationId)}`,
      marketing: sql<boolean>`${anyIn(schema.contact, schema.contact.environmentId)} or ${anyIn(schema.broadcast, schema.broadcast.environmentId)}`,
      inboxes: anyIn(schema.inbox, schema.inbox.environmentId),
      sms: sql<boolean>`${anyIn(schema.smsMessage, schema.smsMessage.environmentId)} or ${anyInOrganization(schema.smsNumber, schema.smsNumber.organizationId, organizationId)}`,
      verify: anyIn(schema.verifyRequest, schema.verifyRequest.environmentId),
      sign: anyIn(schema.signRequest, schema.signRequest.environmentId),
      forms: anyIn(schema.form, schema.form.environmentId),
      hooks: anyIn(schema.hookApplication, schema.hookApplication.environmentId),
      risk: anyIn(schema.riskAssessment, schema.riskAssessment.environmentId),
    })
    .from(environment)
    .where(eq(environment.organizationId, organizationId));
  return new Map(
    rows.map((row) => [row.environmentId, PRODUCT_KEYS.filter((key) => Boolean(row[key]))]),
  );
}

/** A member's pinned (`true`) and hidden (`false`) products in an organization. */
export async function listProductPreferences(input: {
  organizationId: string;
  userId: string;
}): Promise<ProductPreferences> {
  const rows = await db
    .select({ product: productPreference.product, pinned: productPreference.pinned })
    .from(productPreference)
    .where(
      and(
        eq(productPreference.organizationId, input.organizationId),
        eq(productPreference.userId, input.userId),
      ),
    );
  const preferences: ProductPreferences = {};
  for (const row of rows) if (isProductKey(row.product)) preferences[row.product] = row.pinned;
  return preferences;
}

/** Pins (`true`) or hides (`false`) a product for a member; `null` goes back to showing it while in use. */
export async function setProductPreference(input: {
  organizationId: string;
  userId: string;
  product: ProductKey;
  pinned: boolean | null;
}): Promise<void> {
  const member = and(
    eq(productPreference.organizationId, input.organizationId),
    eq(productPreference.userId, input.userId),
    eq(productPreference.product, input.product),
  );
  if (input.pinned === null) {
    await db.delete(productPreference).where(member);
    return;
  }
  await db
    .insert(productPreference)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      product: input.product,
      pinned: input.pinned,
    })
    .onConflictDoUpdate({
      target: [
        productPreference.organizationId,
        productPreference.userId,
        productPreference.product,
      ],
      set: { pinned: input.pinned, updatedAt: new Date() },
    });
}

function countIn(
  table: PgTable,
  columns: { organizationId: PgColumn; environmentId: PgColumn; createdAt?: PgColumn },
  where: { organizationId: string; environmentId: string; since?: Date },
): SQL<number> {
  const recent =
    where.since && columns.createdAt ? sql` and ${columns.createdAt} >= ${where.since}` : sql``;
  return sql<number>`(select count(*)::int from ${table} where ${columns.organizationId} = ${where.organizationId} and ${columns.environmentId} = ${where.environmentId}${recent})`;
}

/**
 * One figure per product for an environment's home: what was sent, signed or assessed since
 * `since` for the busy products, how many there are of the rest (forms, inboxes, applications).
 */
export async function productFigures(input: {
  organizationId: string;
  environmentId: string;
  since: Date;
}): Promise<Record<ProductKey, number>> {
  const all = { organizationId: input.organizationId, environmentId: input.environmentId };
  const [row] = await db
    .select({
      email: countIn(schema.email, schema.email, input),
      marketing: countIn(schema.broadcast, schema.broadcast, all),
      inboxes: countIn(schema.inbox, schema.inbox, all),
      sms: countIn(schema.smsMessage, schema.smsMessage, input),
      verify: countIn(schema.verifyRequest, schema.verifyRequest, input),
      sign: countIn(schema.signRequest, schema.signRequest, input),
      forms: countIn(schema.form, schema.form, all),
      hooks: countIn(schema.hookApplication, schema.hookApplication, all),
      risk: countIn(schema.riskAssessment, schema.riskAssessment, input),
    })
    .from(sql`(select 1) as one`);
  if (!row) throw new Error("No figures returned.");
  return row;
}

type DailyTable = PgTable & {
  organizationId: PgColumn;
  environmentId: PgColumn;
  createdAt: PgColumn;
};

/** What each product's daily count counts (its busiest kind of row). */
const DAILY_TABLES: Record<ProductKey, DailyTable> = {
  email: schema.email,
  marketing: schema.contact,
  inboxes: schema.inboxThread,
  sms: schema.smsMessage,
  verify: schema.verifyRequest,
  sign: schema.signRequest,
  forms: schema.formSubmission,
  hooks: schema.hookMessage,
  risk: schema.riskAssessment,
};

/**
 * Per product, how many things happened in an environment on each of the last `days` UTC days
 * (oldest first, today last): emails, texts, signature requests, assessments, form submissions,
 * Hooks messages… for sparklines. One query.
 */
export async function productDailyActivity(input: {
  organizationId: string;
  environmentId: string;
  days: number;
  now?: Date;
}): Promise<Record<ProductKey, number[]>> {
  const now = input.now ?? new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(today - (input.days - 1) * 86_400_000);
  const parts = PRODUCT_KEYS.map((key) => {
    const table = DAILY_TABLES[key];
    return sql`select ${key}::text as product, to_char(${table.createdAt} at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as count from ${table} where ${table.organizationId} = ${input.organizationId} and ${table.environmentId} = ${input.environmentId} and ${table.createdAt} >= ${since} group by 2`;
  });
  const result = await db.execute<{ product: ProductKey; day: string; count: number }>(
    sql.join(parts, sql` union all `),
  );
  const series = Object.fromEntries(
    PRODUCT_KEYS.map((key) => [key, Array.from({ length: input.days }, () => 0)]),
  ) as Record<ProductKey, number[]>;
  for (const row of result.rows) {
    const index = Math.round((Date.parse(`${row.day}T00:00:00Z`) - since.getTime()) / 86_400_000);
    const values = series[row.product];
    if (values && index >= 0 && index < input.days) values[index] = row.count;
  }
  return series;
}
