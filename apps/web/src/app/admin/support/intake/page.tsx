import { listFailedSupportIntakes } from "@coss/support/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { MailCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SupportActionButton } from "@/components/support/support-action";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";
import { requeueSupportIntakeAction } from "../actions";

export const metadata: Metadata = { title: "Unfiled mail" };

export default async function UnfiledMailPage() {
  await requirePlatformAdmin();
  const failed = await listFailedSupportIntakes();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Email to support that kept failing, so it was set aside without a ticket. Fix the cause, then requeue it."
        title="Unfiled mail"
      />
      {failed.length === 0 ? (
        <EmptyState
          description="Every email to support has been filed."
          icon={MailCheckIcon}
          title="Nothing set aside"
        />
      ) : (
        <Panel>
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Set aside</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {failed.map((row) => (
                <TableRow key={row.receivedEmailId}>
                  <TableCell>{row.from ?? "Unknown"}</TableCell>
                  <TableCell>{row.subject ?? "(no subject)"}</TableCell>
                  <TableCell className="max-w-64 truncate" title={row.lastError ?? undefined}>
                    {row.lastError}
                  </TableCell>
                  <TableCell>{row.failedAt ? formatDateTime(row.failedAt) : null}</TableCell>
                  <TableCell className="text-right">
                    <SupportActionButton
                      action={requeueSupportIntakeAction}
                      hidden={{ receivedEmailId: row.receivedEmailId }}
                      size="xs"
                      success="Requeued"
                      variant="outline"
                    >
                      Requeue
                    </SupportActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
