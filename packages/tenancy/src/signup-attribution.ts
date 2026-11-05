import { db, schema } from "@coss/db";
import { count, desc, eq, gte, sql } from "drizzle-orm";

const { signupAttribution, user } = schema;

/** A touch reported later than this isn't about how the account came to exist. */
const REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SignupAttributionInput = {
  userId: string;
  landingPath: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landedAt: Date;
};

/** Once per account, and only while the account is new. Returns whether a row was written. */
export async function recordSignupAttribution(
  input: SignupAttributionInput,
  { now = new Date() }: { now?: Date } = {},
): Promise<boolean> {
  const [account] = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, input.userId));
  if (!account || now.getTime() - account.createdAt.getTime() > REPORT_WINDOW_MS) return false;
  const rows = await db
    .insert(signupAttribution)
    .values(input)
    .onConflictDoNothing()
    .returning({ userId: signupAttribution.userId });
  return rows.length > 0;
}

export type SignupSourceCount = { value: string | null; count: number };

export type SignupSources = {
  /** Accounts created since `since`. */
  accounts: number;
  /** Those with a first touch: the rest had no browser record (invited, another device, GPC). */
  attributed: number;
  byLanding: SignupSourceCount[];
  byReferrer: SignupSourceCount[];
  byCampaignSource: SignupSourceCount[];
};

/** Platform-level: only after `requirePlatformAdmin*`. */
export async function signupSourcesForAdmin({
  since,
  limit = 10,
}: {
  since: Date;
  limit?: number;
}): Promise<SignupSources> {
  const [accounts] = await db
    .select({ count: count() })
    .from(user)
    .where(gte(user.createdAt, since));
  const top = async (
    column: (typeof signupAttribution)["landingPath" | "referrerHost" | "utmSource"],
  ) => {
    const rows = await db
      .select({ value: column, count: count() })
      .from(signupAttribution)
      .innerJoin(user, eq(user.id, signupAttribution.userId))
      .where(gte(user.createdAt, since))
      .groupBy(column)
      .orderBy(desc(count()), sql`${column} nulls last`)
      .limit(limit);
    return rows.map((row) => ({ value: row.value, count: Number(row.count) }));
  };
  const byLanding = await top(signupAttribution.landingPath);
  const byReferrer = await top(signupAttribution.referrerHost);
  const byCampaignSource = await top(signupAttribution.utmSource);
  const [attributed] = await db
    .select({ count: count() })
    .from(signupAttribution)
    .innerJoin(user, eq(user.id, signupAttribution.userId))
    .where(gte(user.createdAt, since));
  return {
    accounts: Number(accounts?.count ?? 0),
    attributed: Number(attributed?.count ?? 0),
    byLanding,
    byReferrer,
    byCampaignSource,
  };
}
