import { DEV_API_ORIGIN, DEV_DASHBOARD_ORIGIN, SITE_URL } from "./site";

export type StatusTarget = { name: string; description: string; url: string };

export type ServiceStatus = StatusTarget & {
  up: boolean;
  /** How long it took to answer; `null` when it didn't. */
  latencyMs: number | null;
};

export type StatusReport = { checkedAt: Date; services: ServiceStatus[] };

const dev = process.env.NODE_ENV === "development";

export const STATUS_TARGETS: readonly StatusTarget[] = [
  {
    name: "API",
    description: "api.coss.com, what the SDKs and the CLI call.",
    url: `${dev ? DEV_API_ORIGIN : "https://api.coss.com"}/health`,
  },
  {
    name: "Dashboard",
    description: "coss.com's dashboard and sign-in.",
    url: `${dev ? DEV_DASHBOARD_ORIGIN : SITE_URL}/api/health`,
  },
];

const TIMEOUT_MS = 5_000;
/** One check per task at most this often, whatever the page's traffic. */
const CACHE_MS = 30_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function checkServices(
  targets: readonly StatusTarget[],
  deps: { fetch: Fetch; now: () => Date },
): Promise<StatusReport> {
  const checkedAt = deps.now();
  const services = await Promise.all(
    targets.map(async (target): Promise<ServiceStatus> => {
      const started = performance.now();
      try {
        const res = await deps.fetch(target.url, {
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok
          ? { ...target, up: true, latencyMs: Math.round(performance.now() - started) }
          : { ...target, up: false, latencyMs: null };
      } catch {
        return { ...target, up: false, latencyMs: null };
      }
    }),
  );
  return { checkedAt, services };
}

/** `check`, reused for `cacheMs`; concurrent callers share one run. */
export function cachedStatus(
  check: () => Promise<StatusReport>,
  options: { cacheMs?: number; now?: () => number } = {},
): () => Promise<StatusReport> {
  const cacheMs = options.cacheMs ?? CACHE_MS;
  const now = options.now ?? Date.now;
  let last: { at: number; report: Promise<StatusReport> } | null = null;
  return () => {
    if (!last || now() - last.at >= cacheMs) {
      last = { at: now(), report: check() };
    }
    return last.report;
  };
}

export const currentStatus = cachedStatus(() =>
  checkServices(STATUS_TARGETS, { fetch, now: () => new Date() }),
);
