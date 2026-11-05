import {
  applyMarketingFooter,
  contactVariables,
  countRecipients,
  getAudience,
  getBroadcast,
  getBroadcastRow,
  getMarketingSettingsRow,
  getSegment,
  listBroadcastEmails,
  propertyDefinitions,
  renderBroadcast,
} from "@coss/email";
import type { BroadcastOutput } from "@coss/email/broadcast-schemas";
import { listVerifiedMemberEmails } from "@coss/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailStatusBadge } from "@/components/email-badges";
import { BroadcastStatusBadge } from "@/components/marketing";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { Stat, StatRow } from "@/components/stat-row";
import { PREVIEW_HEAD } from "@/lib/email-preview";
import { formatDateTime, formatPercent } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";
import {
  BroadcastChangeButton,
  CancelBroadcastButton,
  DeleteBroadcastButton,
  SendBroadcastDialog,
  TestBroadcastDialog,
} from "../broadcast-controls";
import { BroadcastEditor } from "../broadcast-editor";
import { broadcastEditorData, draftOf } from "../editor-data";

export const metadata: Metadata = { title: "Broadcast" };

const PAUSE_REASONS: Record<string, string> = {
  paused: "You paused it.",
  billing_hold: "A billing hold pauses sending; it resumes on its own once the hold is lifted.",
  usage_limit: "Your plan's included emails are used up; it resumes when there is room again.",
  sending_paused: "Sending is paused for this organization; it resumes on its own once lifted.",
  marketing_paused:
    "Marketing email is paused for this organization (complaint or bounce rates). Resume it once coss.com lifts the pause.",
  account_suspended: "This organization is suspended. Resume it once the suspension is lifted.",
  mailing_address_required: "The postal address was removed from the marketing settings.",
};

function rateOf(count: number, of: number): string {
  return of > 0 ? formatPercent(count / of) : "—";
}

/**
 * The preview: the template with its fallbacks (the properties' own included, as test sends
 * without a contact get them), the footer and links that go nowhere.
 */
function preview(
  broadcast: BroadcastOutput,
  mailingAddress: string,
  fallbacks: Record<string, string>,
) {
  const rendered = renderBroadcast(
    {
      subject: broadcast.subject,
      html: broadcast.html,
      text: broadcast.text,
      previewText: broadcast.preview_text,
    },
    fallbacks,
  );
  return {
    subject: rendered.subject,
    ...applyMarketingFooter(rendered, {
      unsubscribeUrl: "#unsubscribe",
      preferencesUrl: "#preferences",
      mailingAddress: mailingAddress || "(your postal address)",
    }),
  };
}

export default async function BroadcastPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/[broadcastId]">) {
  const resolved = await params;
  const { env, base, target, context } = await marketingPage(resolved, "broadcast");
  const [broadcast, row, settings, definitions] = await Promise.all([
    getBroadcast(env, resolved.broadcastId),
    getBroadcastRow(env, resolved.broadcastId),
    getMarketingSettingsRow(env),
    propertyDefinitions(env),
  ]);
  if (!broadcast || !row) notFound();
  const draft = broadcast.status === "draft";
  const [audience, segment, editorData, emails, estimate] = await Promise.all([
    broadcast.audience_id ? getAudience(env, broadcast.audience_id) : null,
    broadcast.segment_id ? getSegment(env, broadcast.segment_id) : null,
    broadcastEditorData(env),
    draft ? null : listBroadcastEmails(env, broadcast.id, { limit: 20 }),
    draft
      ? countRecipients(
          env,
          broadcast.audience_id
            ? { audienceId: broadcast.audience_id }
            : { segmentId: broadcast.segment_id as string },
          { topic: broadcast.topic },
        ).catch(() => null)
      : null,
  ]);
  const controls = { ...target, broadcastId: broadcast.id, name: broadcast.name };
  const canSend = context.can({ broadcast: ["send"] });
  const canTest = canSend && context.can({ email: ["send"] });
  const recipients =
    canTest && broadcast.status !== "canceled"
      ? await listVerifiedMemberEmails({ organizationId: env.organizationId })
      : [];
  const { stats } = broadcast;
  const fallbacks = contactVariables(
    { address: "", firstName: null, lastName: null, properties: {} },
    definitions,
  );
  const shown = preview(broadcast, settings?.mailingAddress ?? "", fallbacks);
  const deletable =
    context.can({ broadcast: ["delete"] }) &&
    (draft || (broadcast.status === "canceled" && row.materialized === 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canTest && broadcast.status !== "canceled" ? (
              <TestBroadcastDialog
                {...controls}
                currentUserEmail={context.session.user.email}
                recipients={recipients}
              />
            ) : null}
            {canSend && (broadcast.status === "scheduled" || broadcast.status === "sending") ? (
              <BroadcastChangeButton {...controls} change="pause" />
            ) : null}
            {canSend && broadcast.status === "paused" ? (
              <BroadcastChangeButton {...controls} change="resume" />
            ) : null}
            {canSend && ["scheduled", "sending", "paused"].includes(broadcast.status) ? (
              <CancelBroadcastButton {...controls} />
            ) : null}
            {deletable ? <DeleteBroadcastButton {...controls} /> : null}
            {canSend && draft ? <SendBroadcastDialog {...controls} estimate={estimate} /> : null}
          </div>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BroadcastStatusBadge status={broadcast.status} />
            {broadcast.status === "scheduled" && broadcast.scheduled_at
              ? `Starts ${formatDateTime(broadcast.scheduled_at)}`
              : `Updated ${formatDateTime(broadcast.updated_at)}`}
          </span>
        }
        title={broadcast.name}
      />

      {broadcast.status === "paused" && broadcast.pause_reason ? (
        <Alert variant="warning">
          <AlertTitle>Paused</AlertTitle>
          <AlertDescription>
            {PAUSE_REASONS[broadcast.pause_reason] ?? broadcast.pause_reason}
          </AlertDescription>
        </Alert>
      ) : null}
      {broadcast.status === "sending" && broadcast.pause_reason ? (
        <Alert variant="warning">
          <AlertTitle>Waiting</AlertTitle>
          <AlertDescription>
            {PAUSE_REASONS[broadcast.pause_reason] ?? broadcast.pause_reason}
          </AlertDescription>
        </Alert>
      ) : null}
      {broadcast.error ? (
        <Alert variant="error">
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription>{broadcast.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {draft && !settings?.mailingAddress ? (
        <Alert variant="warning">
          <AlertTitle>No postal address</AlertTitle>
          <AlertDescription>
            Broadcasts can't be sent until the{" "}
            <Link className="underline" href={`${base}/marketing/settings`}>
              marketing settings
            </Link>{" "}
            have your postal address (CAN-SPAM).
          </AlertDescription>
        </Alert>
      ) : null}

      {draft ? null : (
        <>
          <StatRow>
            <Stat
              detail={
                broadcast.recipients_estimated === null
                  ? undefined
                  : `of ~${broadcast.recipients_estimated.toLocaleString("en-US")}`
              }
              label="Recipients"
              value={stats.recipients.toLocaleString("en-US")}
            />
            <Stat
              detail={`${rateOf(stats.delivered, stats.sent)} of sent`}
              label="Delivered"
              value={stats.delivered.toLocaleString("en-US")}
            />
            <Stat
              detail={broadcast.tracking.opens ? "unique" : "tracking off"}
              label="Opened"
              value={broadcast.tracking.opens ? rateOf(stats.opened, stats.delivered) : "—"}
            />
            <Stat
              detail={broadcast.tracking.clicks ? "unique" : "tracking off"}
              label="Clicked"
              value={broadcast.tracking.clicks ? rateOf(stats.clicked, stats.delivered) : "—"}
            />
          </StatRow>
          <StatRow>
            <Stat
              detail={rateOf(stats.bounced, stats.sent)}
              label="Bounced"
              value={stats.bounced.toLocaleString("en-US")}
            />
            <Stat
              detail={rateOf(stats.complained, stats.delivered)}
              label="Complaints"
              value={stats.complained.toLocaleString("en-US")}
            />
            <Stat
              detail={rateOf(stats.unsubscribed, stats.delivered)}
              label="Unsubscribed"
              value={stats.unsubscribed.toLocaleString("en-US")}
            />
            <Stat label="Failed" value={stats.failed.toLocaleString("en-US")} />
          </StatRow>
        </>
      )}

      <Panel title="Details">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="Send to">
              {audience ? (
                <Link
                  className="hover:underline"
                  href={`${base}/marketing/audiences/${audience.id}`}
                >
                  {audience.name} (audience)
                </Link>
              ) : segment ? (
                <Link className="hover:underline" href={`${base}/marketing/segments/${segment.id}`}>
                  {segment.name} (segment)
                </Link>
              ) : (
                "—"
              )}
            </SpecItem>
            <SpecItem label="Topic">{broadcast.topic ?? "—"}</SpecItem>
            <SpecItem label="From" mono>
              {broadcast.from}
            </SpecItem>
            {draft ? (
              <SpecItem label="Reach now">
                {estimate === null ? "—" : `~${estimate.toLocaleString("en-US")} contacts`}
              </SpecItem>
            ) : null}
            <SpecItem label="Scheduled">{formatDateTime(broadcast.scheduled_at)}</SpecItem>
            <SpecItem label="Started">{formatDateTime(broadcast.started_at)}</SpecItem>
            <SpecItem label="Finished">
              {formatDateTime(broadcast.completed_at ?? broadcast.canceled_at)}
            </SpecItem>
            <SpecItem label="Rate">{broadcast.rate_per_second ?? editorData.planRate} / s</SpecItem>
          </SpecList>
        </PanelBody>
      </Panel>

      <Panel title={`Preview: ${shown.subject}`}>
        <PanelBody className="flex flex-col gap-2 p-2">
          {shown.html !== null ? (
            <iframe
              className="h-[600px] w-full rounded-lg border bg-white"
              referrerPolicy="no-referrer"
              sandbox=""
              srcDoc={PREVIEW_HEAD + shown.html}
              title="Broadcast preview"
            />
          ) : null}
          {shown.text !== null ? (
            <pre className="overflow-x-auto whitespace-pre-wrap p-3 font-mono text-[0.8125rem] leading-relaxed">
              {shown.text}
            </pre>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel title={draft ? "Edit" : "Content"}>
        <PanelBody>
          <BroadcastEditor
            {...target}
            {...editorData}
            broadcastId={broadcast.id}
            canEdit={draft && context.can({ broadcast: ["update"] })}
            draft={draftOf(broadcast)}
          />
        </PanelBody>
      </Panel>

      {emails && emails.data.length > 0 ? (
        <Panel title="Recent emails">
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.data.map((email) => (
                <TableRow key={email.id}>
                  <TableCell className="font-mono text-[0.8125rem]">
                    {context.can({ email: ["read"] }) ? (
                      <Link className="hover:underline" href={`${base}/email/messages/${email.id}`}>
                        {email.to[0]}
                      </Link>
                    ) : (
                      email.to[0]
                    )}
                  </TableCell>
                  <TableCell>
                    <EmailStatusBadge status={email.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(email.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}
