import { getTrackingSettings } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { TagIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge, TrackingBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import {
  CategoryRuleDialog,
  DefaultTrackingForm,
  DeleteTrackingRuleButton,
} from "./tracking-forms";

export const metadata: Metadata = { title: "Tracking" };

export default async function TrackingPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/tracking">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ environment: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const settings = await getTrackingSettings({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canEdit = can({ environment: ["update"] });

  const code = "font-mono text-[0.8125rem]";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={
          <>
            coss.com can add an invisible image to HTML emails to record opens, send links through a
            redirect to record clicks, and add one-click unsubscribe headers, which Gmail, Yahoo and
            Outlook require from bulk senders. Each email&apos;s settings are fixed when it is sent:
            its own <code className={code}>tracking</code> option wins, then the rule for its
            category, then this environment&apos;s default.
          </>
        }
        meta={<ModeBadge mode={environment.mode} />}
        title="Open & click tracking"
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel
            action={
              canEdit && settings.default ? (
                <DeleteTrackingRuleButton
                  {...target}
                  category={null}
                  ruleId={settings.default.id}
                />
              ) : null
            }
            description={
              <>
                Applies to emails without a category rule.{" "}
                {settings.default
                  ? `Last changed ${formatDateTime(settings.default.updatedAt)}.`
                  : "Not set: tracking and one-click unsubscribe are off."}
              </>
            }
            title="Environment default"
          >
            <PanelBody>
              <DefaultTrackingForm
                {...target}
                canEdit={canEdit}
                clicks={settings.default?.clicks ?? false}
                key={settings.default?.updatedAt.toISOString() ?? "unset"}
                opens={settings.default?.opens ?? false}
                unsubscribe={settings.default?.unsubscribe ?? false}
              />
            </PanelBody>
          </Panel>

          <Panel
            action={canEdit ? <CategoryRuleDialog {...target} trigger="add" /> : null}
            description={
              <>
                Override the default for emails sent with a <code className={code}>category</code>,
                e.g. track <code className={code}>marketing</code> and let its recipients
                unsubscribe, but never <code className={code}>password-reset</code>.
              </>
            }
            title="Category rules"
          >
            {settings.categories.length === 0 ? (
              <PanelBody flush>
                <EmptyState
                  compact
                  description="Every category follows the environment default."
                  icon={TagIcon}
                  title="No category rules"
                />
              </PanelBody>
            ) : (
              <Table variant="card">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Opens</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Unsubscribe</TableHead>
                    <TableHead>Updated</TableHead>
                    {canEdit ? <TableHead className="w-0" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.categories.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium font-mono">{rule.category}</TableCell>
                      <TableCell>
                        <TrackingBadge on={rule.opens} />
                      </TableCell>
                      <TableCell>
                        <TrackingBadge on={rule.clicks} />
                      </TableCell>
                      <TableCell>
                        <TrackingBadge on={rule.unsubscribe} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(rule.updatedAt)}
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <span className="flex justify-end gap-2">
                            <CategoryRuleDialog
                              {...target}
                              category={rule.category ?? ""}
                              clicks={rule.clicks}
                              opens={rule.opens}
                              trigger="edit"
                              unsubscribe={rule.unsubscribe}
                            />
                            <DeleteTrackingRuleButton
                              {...target}
                              category={rule.category}
                              ruleId={rule.id}
                            />
                          </span>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>

        <Panel title="Good to know">
          <PanelBody>
            <ul className="flex flex-col gap-2.5 text-muted-foreground text-sm [&>li]:relative [&>li]:ps-4 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:content-['–']">
              <li>Only HTML bodies are tracked; plain-text parts are sent unchanged.</li>
              <li>
                Add <code className={code}>data-coss-no-track</code> to a link to keep it as is.{" "}
                <code className={code}>mailto:</code>, <code className={code}>tel:</code> and
                merge-tag links are never rewritten.
              </li>
              <li>
                Opens and clicks are attributed to a recipient only when the email had a single one.
              </li>
              <li>
                Links point at the default tracking host unless the sender&apos;s domain has an
                active custom tracking domain (such as <code className={code}>links.acme.com</code>
                ), set up on its page under Domains.
              </li>
              <li>
                Some mail clients preload images (inflating opens) and security scanners follow
                links (inflating clicks). Use the counts as signals, not exact numbers.
              </li>
              <li>
                One-click unsubscribe headers are added only to emails with a{" "}
                <code className={code}>category</code> and a single recipient (send one email per
                recipient). An unsubscribe suppresses that recipient for the category and records{" "}
                <code className={code}>email.unsubscribed</code>. A{" "}
                <code className={code}>List-Unsubscribe</code> header of your own wins.
              </li>
              <li>
                Tracking pixels and rewritten links can affect deliverability and may need consent
                under privacy laws in some regions.
              </li>
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
