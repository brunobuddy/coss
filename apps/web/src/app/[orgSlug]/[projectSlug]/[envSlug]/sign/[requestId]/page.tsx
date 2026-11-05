import { getSignRequest, listSignRequestEvents, SignError } from "@coss/sign";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SignRequestStatusDot, SignSignerStatusDot } from "@/components/sign-badges";
import { SpecItem, SpecList } from "@/components/spec-list";
import { formatDateTime } from "@/lib/format";
import { signPageContext } from "../page-context";
import { CancelRequestButton, DeleteRequestButton, RemindButton } from "../sign-actions";

export const metadata: Metadata = { title: "Signature request" };

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  sent: "Sent",
  notified: "Emailed the signing link",
  viewed: "Opened",
  consented: "Agreed to sign electronically",
  signed: "Signed",
  declined: "Declined",
  reminded: "Reminded",
  canceled: "Canceled",
  expired: "Expired",
  completed: "Everyone signed",
  sealed: "Signed document sealed",
};

export default async function SignRequestPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sign/[requestId]">) {
  const { requestId, ...rest } = await params;
  const { organization, environment, can, signPath, target } = await signPageContext(rest);
  const scope = { organizationId: organization.id, environmentId: environment.id, requestId };
  const request = await getSignRequest(scope).catch((error: unknown) => {
    if (error instanceof SignError) notFound();
    throw error;
  });
  const events = await listSignRequestEvents(scope);
  const signers = new Map(request.signers.map((signer) => [signer.id, signer]));
  const hasEmailSigners = request.signers.some(
    (signer) => signer.delivery === "email" && signer.status !== "signed",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {request.signed_document ? (
              <Button
                render={<a download href={`${signPath}/${request.id}/signed-document`} />}
                size="sm"
              >
                Download signed PDF
              </Button>
            ) : null}
            {request.status === "sent" && hasEmailSigners && can({ sign: ["send"] }) ? (
              <RemindButton {...target} requestId={request.id} />
            ) : null}
            {(request.status === "sent" || request.status === "draft") &&
            can({ sign: ["update"] }) ? (
              <CancelRequestButton {...target} requestId={request.id} title={request.title} />
            ) : null}
            {request.status !== "sent" && can({ sign: ["delete"] }) ? (
              <DeleteRequestButton {...target} requestId={request.id} title={request.title} />
            ) : null}
          </div>
        }
        description={request.message ?? undefined}
        meta={<SignRequestStatusDot status={request.status} />}
        title={request.title}
      />

      <Panel title="Request">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="ID" mono>
              {request.id}
            </SpecItem>
            <SpecItem label="Signing order">
              {request.signing_order === "sequential" ? "One after another" : "Any order"}
            </SpecItem>
            <SpecItem label="Created">{formatDateTime(request.created_at)}</SpecItem>
            <SpecItem label="Sent">{formatDateTime(request.sent_at)}</SpecItem>
            <SpecItem label="Expires">{formatDateTime(request.expires_at)}</SpecItem>
            <SpecItem label="Completed">{formatDateTime(request.completed_at)}</SpecItem>
            {request.signed_document ? (
              <SpecItem label="Signed PDF SHA-256" mono>
                {request.signed_document.sha256}
              </SpecItem>
            ) : null}
            {Object.keys(request.metadata).length > 0 ? (
              <SpecItem label="Metadata" mono stacked>
                {JSON.stringify(request.metadata)}
              </SpecItem>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>

      <Panel title="Signers">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Signer</TableHead>
              <TableHead>Signs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Signed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {request.signers.map((signer) => (
              <TableRow key={signer.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{signer.name}</span>
                    <span className="text-muted-foreground text-xs">{signer.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {signer.delivery === "email" ? "By email" : "In your app"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <SignSignerStatusDot status={signer.status} />
                  {signer.decline_reason ? (
                    <p className="text-muted-foreground text-xs">“{signer.decline_reason}”</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(signer.signed_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Documents">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Pages</TableHead>
              <TableHead>SHA-256 as sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {request.documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell>{document.filename}</TableCell>
                <TableCell className="text-right tabular-nums">{document.page_count}</TableCell>
                <TableCell className="max-w-72 truncate font-mono text-muted-foreground text-xs">
                  {document.sha256}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        description="Every event, oldest first. Each hash covers the event and the one before it, so the last one vouches for the whole trail."
        title="Audit trail"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>By</TableHead>
              <TableHead>From</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="tabular-nums">{event.sequence}</TableCell>
                <TableCell>{EVENT_LABEL[event.type] ?? event.type}</TableCell>
                <TableCell className="text-muted-foreground">
                  {event.signer_id
                    ? (signers.get(event.signer_id)?.email ?? event.signer_id)
                    : event.actor === "api_key"
                      ? "Your API key"
                      : event.actor === "dashboard"
                        ? "A member"
                        : "coss.com"}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">
                  {event.ip_address ?? ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(event.occurred_at)}
                </TableCell>
                <TableCell
                  className="max-w-40 truncate font-mono text-muted-foreground text-xs"
                  title={event.hash}
                >
                  {event.hash}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
