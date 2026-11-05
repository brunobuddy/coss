import { entitlementsFor, PLANS } from "@coss/billing";
import {
  countLiveHosts,
  failingCalendarDelegations,
  failingOauthApps,
  listHosts,
} from "@coss/scheduling";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { schedulingPageContext } from "../page-context";
import {
  DeleteHostButton,
  HostLocationsDialog,
  HostStatusButton,
  NewHostDialog,
  OpenPortalButton,
} from "../scheduling-actions";

export const metadata: Metadata = { title: "Hosts" };

const PAGE_SIZE = 50;

/** From this share of the plan's live hosts, the page says so before a create is refused. */
const HOST_LIMIT_WARNING = 0.8;

export default async function HostsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/hosts">) {
  const { schedulingPath, scope, can, target, environment } = await schedulingPageContext(
    await params,
  );
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const page = await listHosts(scope, { limit: PAGE_SIZE, after });
  const [failing, failingApps] = await Promise.all([
    failingCalendarDelegations(scope),
    failingOauthApps(scope),
  ]);
  const last = page.data.at(-1);
  const hostsPath = `${schedulingPath}/hosts`;
  const canUpdate = can({ scheduling: ["update"] });
  const [hostLimit, liveHosts] =
    environment.mode === "live"
      ? await Promise.all([
          entitlementsFor(scope.organizationId).then((plan) => plan.limits.schedulingHosts),
          countLiveHosts(scope.organizationId),
        ])
      : [null, 0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={can({ scheduling: ["create"] }) ? <NewHostDialog {...target} /> : null}
        description="The people who can be booked. Each has their own page for hours and calendars."
        title="Hosts"
      />
      {hostLimit !== null && liveHosts >= hostLimit * HOST_LIMIT_WARNING ? (
        <Alert variant="warning">
          <AlertTitle>
            {liveHosts.toLocaleString("en-US")} of {hostLimit.toLocaleString("en-US")} live hosts
          </AlertTitle>
          <AlertDescription>
            <p>
              Your plan's limit counts every live environment. Hosts you have keep working; to add
              more,{" "}
              <Link
                className="underline underline-offset-4"
                href={`/${target.orgSlug}/settings/billing/plans`}
              >
                move to {PLANS.scale.name}
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {failing.length > 0 ? (
        <Alert variant="error">
          <AlertTitle>Hosts on {failing.join(", ")} aren't being offered</AlertTitle>
          <AlertDescription>
            Calendar access for this domain was refused.{" "}
            <Link className="underline" href={`${schedulingPath}/calendar-delegation`}>
              See what's wrong
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {failingApps.length > 0 ? (
        <Alert variant="error">
          <AlertTitle>Your OAuth app's credentials were refused</AlertTitle>
          <AlertDescription>
            Calendars connected through it can't be read, so hosts stop being offered once what's
            known of them is out of date.{" "}
            <Link className="underline" href={`${schedulingPath}/oauth-apps`}>
              Update the secret
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? hostsPath : undefined}
              olderHref={page.hasMore && last ? `${hostsPath}?after=${last.id}` : undefined}
            />
          ) : undefined
        }
      >
        {page.data.length === 0 ? (
          <PanelBody>
            <EmptyState
              action={can({ scheduling: ["create"] }) ? <NewHostDialog {...target} /> : null}
              description="Create one here or with the API, usually one for each of your users who takes bookings."
              icon={UserRoundIcon}
              title="No hosts yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Your id</TableHead>
                <TableHead>Time zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((host) => (
                <TableRow key={host.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`${hostsPath}/${host.id}`}>
                      {host.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{host.uid ?? "—"}</TableCell>
                  <TableCell>{host.time_zone}</TableCell>
                  <TableCell>
                    <StatusDot tone={host.status === "active" ? "success" : "neutral"}>
                      {host.status === "active" ? "Active" : "Disabled"}
                    </StatusDot>
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <div className="flex justify-end gap-1">
                        <OpenPortalButton {...target} hostId={host.id} />
                        <HostLocationsDialog
                          {...target}
                          hostId={host.id}
                          locations={host.locations}
                          name={host.name}
                        />
                        <HostStatusButton {...target} hostId={host.id} status={host.status} />
                        {can({ scheduling: ["delete"] }) ? (
                          <DeleteHostButton {...target} hostId={host.id} name={host.name} />
                        ) : null}
                      </div>
                    ) : null}
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
