import { unclaimedEmailBacklog } from "@coss/email";
import { unclaimedSmsBacklog } from "@coss/sms";

/** Past the sweep's first requeue (10 minutes), well before these messages fail (an hour). */
export const DISPATCH_BACKLOG_MS = 15 * 60_000;

/**
 * A stalled dispatch produces no provider events, so no other alarm sees it. A `console.error` is a
 * Sentry event: counts and ages only, no addresses or organizations.
 */
export async function reportDispatchBacklog(
  opts: { now?: Date; scope?: { organizationIds: string[] } } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const olderThan = new Date(now.getTime() - DISPATCH_BACKLOG_MS);
  const [emails, sms] = await Promise.all([
    unclaimedEmailBacklog({ olderThan, scope: opts.scope }),
    unclaimedSmsBacklog({ olderThan, scope: opts.scope }),
  ]);
  for (const [what, backlog] of [
    ["emails", emails],
    ["SMS", sms],
  ] as const) {
    if (backlog.count === 0 || !backlog.oldest) continue;
    const minutes = Math.round((now.getTime() - backlog.oldest.getTime()) / 60_000);
    console.error(
      `[worker:dispatch-backlog] ${backlog.count} ${what} waiting for dispatch, the oldest for ${minutes} minutes`,
    );
  }
}
