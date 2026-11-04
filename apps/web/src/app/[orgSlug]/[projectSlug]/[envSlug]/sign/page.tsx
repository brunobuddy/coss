import { listSignRequests } from "@coss/sign";
import { SIGN_REQUEST_STATUSES, type SignRequestStatus } from "@coss/sign/schemas";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { SignatureIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SignRequestStatusDot } from "@/components/sign-badges";
import { formatDateTime } from "@/lib/format";
import { signStore } from "@/lib/sign";
import { signPageContext } from "./page-context";

export const metadata: Metadata = { title: "Signature requests" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

const FILTERS: { value: string; label: string; statuses: SignRequestStatus[] | undefined }[] = [
  { value: "all", label: "All", statuses: undefined },
  { value: "sent", label: "Waiting", statuses: ["sent"] },
  { value: "completed", label: "Completed", statuses: ["completed"] },
  { value: "draft", label: "Drafts", statuses: ["draft"] },
  {
    value: "closed",
    label: "Declined, canceled, expired",
    statuses: ["declined", "canceled", "expired"],
  },
];

export default async function SignRequestsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sign">) {
  const { organization, environment, signPath } = await signPageContext(await params);
  const search = await searchParams;
  const filter = FILTERS.find((option) => option.value === single(search.status)) ?? FILTERS[0];
  const after = single(search.after);
  const page = await listSignRequests({
    organizationId: organization.id,
    environmentId: environment.id,
    status: filter?.statuses?.filter((status) =>
      (SIGN_REQUEST_STATUSES as readonly string[]).includes(status),
    ),
    limit: PAGE_SIZE,
    after,
  });
  const query = (extra: Record<string, string>) => {
    const values = {
      ...(filter && filter.value !== "all" ? { status: filter.value } : {}),
      ...extra,
    };
    const encoded = new URLSearchParams(values).toString();
    return encoded ? `${signPath}?${encoded}` : signPath;
  };
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Requests made with this environment's keys: who signed, who still has to, and their audit trail."
        meta={<ModeBadge mode={environment.mode} />}
        title="Signature requests"
      />
      {signStore() ? null : (
        <Alert variant="warning">
          <AlertTitle>Sign is temporarily unavailable</AlertTitle>
          <AlertDescription>
            API calls answer 503 `sign_unavailable` for now, with sandbox keys too.
          </AlertDescription>
        </Alert>
      )}
      <FilterLinks
        options={FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
          href: option.value === "all" ? signPath : `${signPath}?status=${option.value}`,
        }))}
        value={filter?.value ?? "all"}
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? query({}) : undefined}
              olderHref={page.hasMore && last ? query({ after: last.id }) : undefined}
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={
                after || filter?.statuses ? null : (
                  <Button render={<a href="/docs/sign" />} size="sm" variant="outline">
                    Read the docs
                  </Button>
                )
              }
              compact
              description="Create one with coss.sign.requests.create() or POST /v1/sign/requests."
              icon={SignatureIcon}
              title={after ? "No more requests" : "No signature requests yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link className="hover:underline" href={`${signPath}/${request.id}`}>
                      {request.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <SignRequestStatusDot status={request.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {request.signers.filter((signer) => signer.status === "signed").length} of{" "}
                    {request.signers.length}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(request.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
