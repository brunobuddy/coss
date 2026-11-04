import { BUCKETS, type BucketName } from "@coss/ratelimit/buckets";

/** The public API's rate limits, in the order the docs list them, with what each one covers. */
const API_BUCKETS: readonly { bucket: BucketName; per: string; covers: string }[] = [
  { bucket: "api.read", per: "API key", covers: "Reads: every `GET`" },
  {
    bucket: "api.write",
    per: "API key",
    covers: "Writes: every other request, unless a row below covers it",
  },
  {
    bucket: "api.send",
    per: "API key",
    covers:
      "Sends: emails and batches, SMS, inbox messages and replies, broadcasts, Hooks messages and endpoint tests, verifications",
  },
  {
    bucket: "risk.assess",
    per: "API key",
    covers:
      "Risk assessments, and email, IP, phone and content checks (10 a second, bursts of 50, on the Free plan)",
  },
  { bucket: "risk.limit", per: "API key", covers: "Risk rate limit checks (`coss.risk.limit()`)" },
  {
    bucket: "api.authentication.key",
    per: "API key",
    covers: "Authenticating a key, before any other limit (`too_many_authentications`)",
  },
  {
    bucket: "api.authentication.ip",
    per: "client IP",
    covers: "Authenticating any key, before any other limit (`too_many_authentications`)",
  },
  {
    bucket: "api.auth_failure",
    per: "client IP",
    covers: "Requests with an invalid key (`too_many_failed_authentications`)",
  },
];

const PERIODS: readonly [ms: number, unit: string][] = [
  [24 * 60 * 60 * 1000, "day"],
  [60 * 60 * 1000, "hour"],
  [60 * 1000, "minute"],
  [1000, "second"],
];

/** "50 per second", "30 per minute"; a period that isn't one unit is written in that unit. */
export function formatRule(limit: number, periodMs: number): string {
  const [ms, unit] = PERIODS.find(([ms]) => periodMs % ms === 0) ?? [1, "millisecond"];
  const n = periodMs / ms;
  const amount = limit.toLocaleString("en-US");
  return n === 1 ? `${amount} per ${unit}` : `${amount} per ${n} ${unit}s`;
}

export type ApiRateLimitRow = {
  bucket: BucketName;
  covers: string;
  per: string;
  rate: string;
  burst: string;
};

export function apiRateLimitRows(): ApiRateLimitRow[] {
  return API_BUCKETS.map(({ bucket, per, covers }) => {
    const rule: { limit: number; periodMs: number; burst?: number } = BUCKETS[bucket];
    return {
      bucket,
      covers,
      per,
      rate: formatRule(rule.limit, rule.periodMs),
      burst: (rule.burst ?? rule.limit).toLocaleString("en-US"),
    };
  });
}

/** `<ApiRateLimits />` (`src/components/rate-limits.tsx`) as Markdown, for `.md` pages and /llms*.txt. */
export function renderRateLimitComponents(markdown: string): string {
  if (!markdown.includes("<ApiRateLimits />")) return markdown;
  const table = [
    "| Bucket | Covers | Counted per | Rate | Burst |",
    "| --- | --- | --- | --- | --- |",
    ...apiRateLimitRows().map(
      (row) => `| \`${row.bucket}\` | ${row.covers} | ${row.per} | ${row.rate} | ${row.burst} |`,
    ),
  ].join("\n");
  return markdown.replaceAll("<ApiRateLimits />", table);
}
