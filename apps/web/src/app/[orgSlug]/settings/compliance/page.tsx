import {
  getHipaaAttention,
  getHipaaMode,
  HIPAA_CONTROL_GROUPS,
  HIPAA_CONTROLS,
  HIPAA_RESPONSIBILITIES,
  HIPAA_VENDORS,
  type HipaaVendorStatus,
} from "@coss/compliance";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import {
  SettingsNote,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsTable,
} from "@/components/settings";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Compliance" };

const VENDOR_STATUS: Record<
  HipaaVendorStatus,
  { label: string; tone: "success" | "neutral" | "warning" }
> = {
  under_baa: { label: "Under BAA", tone: "success" },
  not_used: { label: "Not used", tone: "neutral" },
  no_phi_expected: { label: "No PHI expected", tone: "neutral" },
  no_baa: { label: "No BAA", tone: "warning" },
};

const dateOnly = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 ps-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function CompliancePage({
  params,
}: PageProps<"/[orgSlug]/settings/compliance">) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgMember(orgSlug);
  const hipaa = await getHipaaMode(organization.id);

  if (!hipaa) {
    return (
      <SettingsPage>
        <SettingsSection
          action={
            <Button
              render={<Link href={`/${organization.slug}/support/new`} />}
              size="sm"
              variant="outline"
            >
              Contact us
            </Button>
          }
          description="HIPAA mode is for organizations that handle protected health information. It comes with a Business Associate Agreement and is added to your contract. Don't send PHI to coss.com without a signed BAA."
          title="HIPAA mode"
        >
          <SettingsRow label="Status">
            <Badge variant="outline">
              <StatusDot tone="neutral">Not active</StatusDot>
            </Badge>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection
          description="Once it's on, these apply across your organization."
          title="What's included"
        >
          {HIPAA_CONTROLS.map((control) => (
            <SettingsRow description={control.description} key={control.id} label={control.label} />
          ))}
        </SettingsSection>
      </SettingsPage>
    );
  }

  const attention = await getHipaaAttention(organization.id);
  const vendors = Object.values(HIPAA_VENDORS);

  return (
    <SettingsPage>
      <SettingsSection
        description="The safeguards below are enforced by coss.com for your organization. They support your HIPAA compliance, which also depends on how you use coss.com."
        title="HIPAA mode"
      >
        <SettingsRow label="Status">
          <Badge variant="outline">
            <StatusDot tone="success">Active</StatusDot>
          </Badge>
        </SettingsRow>
        <SettingsRow label="Active since">{formatDateTime(hipaa.enabledAt)}</SettingsRow>
        <SettingsRow
          description={`Signed ${dateOnly.format(hipaa.baaSignedAt)}`}
          label="Business Associate Agreement"
        >
          <span className="font-mono text-xs">{hipaa.baaReference}</span>
        </SettingsRow>
        <SettingsRow description="HIPAA mode is a line on your contract." label="Billing">
          <Button
            render={<Link href={`/${organization.slug}/settings/billing`} />}
            size="sm"
            variant="outline"
          >
            View billing
          </Button>
        </SettingsRow>
        <SettingsRow
          description="Everything your members and coss.com support change, which you can export."
          label="Audit log"
        >
          <Button
            render={<Link href={`/${organization.slug}/settings/audit`} />}
            size="sm"
            variant="outline"
          >
            View audit log
          </Button>
        </SettingsRow>
      </SettingsSection>

      {HIPAA_CONTROL_GROUPS.map((group) => (
        <SettingsSection key={group} title={group}>
          {HIPAA_CONTROLS.filter((control) => control.group === group).map((control) => {
            const note = attention[control.id];
            return (
              <SettingsRow
                description={note ?? control.description}
                key={control.id}
                label={control.label}
              >
                <StatusDot tone={note ? "warning" : "success"}>
                  {note ? "Needs attention" : "Enforced"}
                </StatusDot>
              </SettingsRow>
            );
          })}
        </SettingsSection>
      ))}

      <SettingsSection
        description="Who handles your organization's data, and whether a BAA covers them."
        title="Vendors"
      >
        <SettingsTable>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => {
              const status = VENDOR_STATUS[vendor.status];
              return (
                <TableRow key={vendor.name}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {vendor.purpose}
                    {"note" in vendor ? ` ${vendor.note}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusDot tone={status.tone}>{status.label}</StatusDot>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </SettingsTable>
      </SettingsSection>

      <SettingsSection
        description="What HIPAA mode can't do for you."
        title="Your responsibilities"
      >
        <SettingsNote>
          <BulletList items={HIPAA_RESPONSIBILITIES} />
        </SettingsNote>
      </SettingsSection>
    </SettingsPage>
  );
}
