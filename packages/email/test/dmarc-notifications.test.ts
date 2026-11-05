import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  listDmarcNotifications,
  renderDmarcNotification,
  runDueDmarcNotifications,
} from "../src/dmarc-notifications.ts";
import { dmarcReportAddress } from "../src/dmarc-record.ts";
import { ingestDmarcReports } from "../src/dmarc-reports.ts";
import { dmarcReportMessage } from "../src/dmarc-sample.ts";
import type { DomainRow } from "../src/domains.ts";
import { NO_VERDICTS } from "../src/inbound.ts";
import type { Notice } from "../src/notifier.ts";
import { createVerifiedDomain } from "../src/testing.ts";

const STALE_RECORD = "v=DMARC1; p=quarantine; rua=mailto:stale@acme.test;";
const DAY = 24 * 60 * 60 * 1000;
const MANAGED = "inbound.coss.test";

/** Reports of only passing coss.com mail, 20 and 2 days ago: ready for quarantine. */
async function healthyReports(row: DomainRow): Promise<void> {
  const address = dmarcReportAddress(row.dmarcReportToken, MANAGED) as string;
  for (const daysAgo of [20, 2]) {
    const end = new Date(Date.now() - daysAgo * DAY);
    const raw = dmarcReportMessage(
      {
        domain: row.name,
        reportId: `r-${row.id}-${daysAgo}`,
        begin: new Date(end.getTime() - DAY),
        end,
        records: [
          {
            sourceIp: "54.240.8.9",
            count: 500,
            dkim: "pass",
            spf: "pass",
            envelopeFrom: row.mailFromDomain,
            dkimResults: [{ domain: row.name, selector: row.dkimTokens[0] ?? "", result: "pass" }],
          },
        ],
      },
      { to: address },
    );
    await ingestDmarcReports(
      {
        provider: "fake",
        providerMessageId: `msg-${row.id}-${daysAgo}`,
        raw: async () => raw,
        verdicts: { ...NO_VERDICTS, spf: "pass", dkim: "pass" },
        receivedAt: new Date(),
      },
      [row.dmarcReportToken],
      { managedDomain: MANAGED },
    );
  }
}

function capture() {
  const sent: Notice[] = [];
  return {
    sent,
    deps: {
      dashboardUrl: "https://coss.test",
      dmarcReportDomain: MANAGED,
      notifier: {
        async send(notice: Notice) {
          sent.push(notice);
        },
      },
    },
  };
}

async function setup(opts: { reports?: boolean } = {}) {
  const tenant = await createTestTenant();
  const organizationId = tenant.organization.id;
  const since = new Date(Date.now() - 30 * DAY);
  const created = await createVerifiedDomain(organizationId);
  const address = dmarcReportAddress(created.dmarcReportToken, MANAGED) as string;
  const [row] = (await db
    .update(schema.domain)
    .set({ dmarcRecord: `v=DMARC1; p=none; rua=mailto:${address}`, dmarcPolicyChangedAt: since })
    .where(eq(schema.domain.id, created.id))
    .returning()) as [DomainRow];
  if (opts.reports !== false) await healthyReports(row);
  // Start from exactly one queued readiness email, whatever ingesting queued.
  await db.delete(schema.dmarcNotification).where(eq(schema.dmarcNotification.domainId, row.id));
  const [notification] = await db
    .insert(schema.dmarcNotification)
    .values({
      organizationId,
      domainId: row.id,
      kind: "ready_quarantine",
      dedupeKey: `ready_quarantine:${row.id}:${since.toISOString()}`,
      policyChangedAt: since,
      // Overridden at send time by the record built from the domain's current DNS.
      detail: { record: STALE_RECORD },
      nextAttemptAt: new Date(),
    })
    .returning();
  return {
    tenant,
    organizationId,
    address,
    row,
    notification,
    scope: { organizationIds: [organizationId] },
  };
}

describe("runDueDmarcNotifications", () => {
  test("emails owners the record to publish, once", async () => {
    const { tenant, row, scope, organizationId, address } = await setup();
    const { sent, deps } = capture();
    expect(await runDueDmarcNotifications({ scope }, deps)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: tenant.owner.email,
      subject: `${row.name} is ready for DMARC p=quarantine`,
    });
    expect(sent[0]?.text).toContain(`v=DMARC1; p=quarantine; rua=mailto:${address};`);
    expect(sent[0]?.text).not.toContain(STALE_RECORD);
    expect(sent[0]?.text).toContain(
      `https://coss.test/${tenant.organization.slug}?to=${encodeURIComponent(`/email/domains/${row.id}/dmarc`)}`,
    );
    const [settled] = await listDmarcNotifications(organizationId);
    expect(settled).toMatchObject({ status: "sent", recipients: [tenant.owner.email] });
    expect(await runDueDmarcNotifications({ scope }, deps)).toBe(0);
  });

  test("skips a notification whose policy changed since it was queued", async () => {
    const { row, scope, organizationId } = await setup();
    await db
      .update(schema.domain)
      .set({ dmarcRecord: "v=DMARC1; p=quarantine", dmarcPolicyChangedAt: new Date() })
      .where(eq(schema.domain.id, row.id));
    const { sent, deps } = capture();
    await runDueDmarcNotifications({ scope }, deps);
    expect(sent).toHaveLength(0);
    const [settled] = await listDmarcNotifications(organizationId);
    expect(settled).toMatchObject({ status: "skipped" });
  });

  test("builds the record from DNS as it is when sending, not when queued", async () => {
    const { row, scope, address } = await setup();
    // Same policy, so the same epoch: another report address and a subdomain policy added.
    await db
      .update(schema.domain)
      .set({ dmarcRecord: `v=DMARC1; p=none; sp=none; rua=mailto:ops@acme.test,mailto:${address}` })
      .where(eq(schema.domain.id, row.id));
    const { sent, deps } = capture();
    expect(await runDueDmarcNotifications({ scope }, deps)).toBe(1);
    expect(sent[0]?.text).toContain(
      `v=DMARC1; p=quarantine; sp=none; rua=mailto:ops@acme.test,mailto:${address};`,
    );
  });

  test("skips readiness once the record stops sending reports to coss.com", async () => {
    const { row, scope, organizationId } = await setup();
    await db
      .update(schema.domain)
      .set({ dmarcRecord: "v=DMARC1; p=none; rua=mailto:ops@acme.test" })
      .where(eq(schema.domain.id, row.id));
    const { sent, deps } = capture();
    await runDueDmarcNotifications({ scope }, deps);
    expect(sent).toHaveLength(0);
    const [settled] = await listDmarcNotifications(organizationId);
    expect(settled).toMatchObject({ status: "skipped" });
  });

  test("skips readiness that later reports no longer support", async () => {
    const { scope, organizationId } = await setup({ reports: false });
    const { sent, deps } = capture();
    await runDueDmarcNotifications({ scope }, deps);
    expect(sent).toHaveLength(0);
    const [settled] = await listDmarcNotifications(organizationId);
    expect(settled).toMatchObject({
      status: "skipped",
      lastError: "No longer ready: later reports or DNS changed the checks.",
    });
  });

  test("retries a failed send with backoff", async () => {
    const { scope, organizationId } = await setup();
    const now = new Date();
    await runDueDmarcNotifications(
      { scope, now },
      {
        dashboardUrl: "https://coss.test",
        notifier: {
          async send() {
            throw new Error("smtp down");
          },
        },
      },
    );
    const [row] = await listDmarcNotifications(organizationId);
    expect(row).toMatchObject({ status: "pending", attemptCount: 1, lastError: "smtp down" });
    expect(row?.nextAttemptAt?.getTime()).toBe(now.getTime() + 60_000);
  });
});

describe("renderDmarcNotification", () => {
  test("escapes names and keeps subjects on one line", () => {
    const message = renderDmarcNotification({
      kind: "pass_rate_dropped",
      domain: "acme.test",
      organizationName: "Acme <script>\nInc",
      detail: { policy: "reject", coss_pass_rate: 0.9 },
      url: "https://coss.test/acme/domains/dom_1/dmarc",
    });
    expect(message.subject).toBe("Mail from acme.test is failing DMARC");
    expect(message.text).toContain("only 90.0% of the mail acme.test sends through coss.com");
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain("owner or admin of Acme <script> Inc");
  });
});
