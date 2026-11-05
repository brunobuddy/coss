import { RATE_CARDS, rateCardAt } from "@coss/billing/catalog";
import { formatUnitPrice } from "@coss/billing/money";
import { environmentHref } from "@coss/dashboard-routes";
import {
  allowedCountries,
  getSmsAccount,
  HIGH_RISK_SMS_COUNTRIES,
  listSmsNumbersWithSendability,
  listSmsRegistrations,
} from "@coss/sms";
import { listProjectsWithEnvironments } from "@coss/tenancy";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { MessageSquareIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/panel";
import { RegistrationStatusDot } from "@/components/sms-badges";
import { StatusDot } from "@/components/status-dot";
import { SupportLink } from "@/components/support/support-link";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { smsProvisioningEnabled } from "@/lib/sms";
import { needsSenderRegistration, registerSenderHref } from "@/lib/sms-registration";
import { RegistrationSubmittedPanel } from "./registration-submitted";
import {
  BuyNumberDialog,
  CountriesForm,
  type EnvironmentOption,
  ReceivingEnvironmentForm,
  ReleaseNumberButton,
} from "./sms-forms";

export const metadata: Metadata = { title: "SMS" };

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return REGIONS.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Countries with a list price now (or from the next card, if it is already published). */
function pricedCountries(): { code: string; price: string }[] {
  const now = rateCardAt(new Date());
  const latest = RATE_CARDS.at(-1) ?? now;
  const byDimension = {
    ...now.rates["sms.segments"]?.byDimension,
    ...latest.rates["sms.segments"]?.byDimension,
  };
  return Object.entries(byDimension).flatMap(([dimension, rate]) => {
    const [tier] = rate.tiers;
    return tier
      ? [
          {
            code: dimension.slice(dimension.indexOf("=") + 1),
            price: formatUnitPrice(tier.unitNanos),
          },
        ]
      : [];
  });
}

const KIND_LABEL = { us_10dlc: "US A2P 10DLC", toll_free: "Toll-free verification" } as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What the numbers still waiting on a registration need, and the one place to start it. */
function registrationPrompt(
  envBase: string,
  unregistered: { kind: "local" | "toll_free"; href: string | null }[],
): { description: string; href: string } | null {
  const local = unregistered.filter((row) => row.kind === "local");
  const tollFree = unregistered.filter((row) => row.kind === "toll_free");
  if (local.length === 0 && tollFree.length === 0) return null;
  const which = [
    local.length > 0 ? plural(local.length, "local number", "local numbers") : null,
    tollFree.length > 0 ? plural(tollFree.length, "toll-free number", "toll-free numbers") : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const steps = [
    local.length > 0
      ? "Register your business for US A2P 10DLC (one registration covers every local number)"
      : null,
    tollFree.length > 0
      ? `${local.length > 0 ? "verify" : "Verify"} ${tollFree.length === 1 ? "the toll-free number" : "each toll-free number"}`
      : null,
  ]
    .filter(Boolean)
    .join(", then ");
  // Local numbers first: one registration unblocks all of them.
  const [only] = tollFree;
  const href =
    local.length > 0
      ? `${envBase}/sms/numbers/register?kind=us_10dlc`
      : tollFree.length === 1 && only?.href
        ? only.href
        : `${envBase}/sms/numbers/register?kind=toll_free`;
  return {
    description: `Carriers only deliver messages from registered senders, so your ${which} can't send yet. ${steps}; carriers usually review it within a few days.`,
    href,
  };
}

export default async function OrganizationSmsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sms/numbers">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const envBase = environmentHref({
    organization: orgSlug,
    project: projectSlug,
    environment: envSlug,
  });
  const query = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ smsSender: ["read"] })) notFound();
  const [numbers, registrations, account, projects] = await Promise.all([
    listSmsNumbersWithSendability(organization.id),
    listSmsRegistrations(organization.id),
    getSmsAccount(organization.id),
    listProjectsWithEnvironments({ organizationId: organization.id }),
  ]);
  const sendable = numbers.map((row) => row.canSend);
  const registerHrefs = numbers.map((row) => {
    const href = registerSenderHref(row.number, row.registration?.status ?? null);
    return href ? `${envBase}${href}` : null;
  });
  const environments: EnvironmentOption[] = projects.flatMap(({ project, environments: list }) =>
    list
      .filter((environment) => environment.mode === "live")
      .map((environment) => ({
        id: environment.id,
        label: `${project.name} / ${environment.name}`,
      })),
  );
  const environmentLabel = new Map(
    environments.map((environment) => [environment.id, environment.label]),
  );
  const enabled = smsProvisioningEnabled();
  const canCreate = can({ smsSender: ["create"] }) && enabled;
  const canUpdate = can({ smsSender: ["update"] });
  const canDelete = can({ smsSender: ["delete"] });
  const allowed = [...allowedCountries(account)];
  const unlocked = account?.unlockedCountries ?? [];
  const countries = pricedCountries()
    .map((country) => ({
      ...country,
      name: countryName(country.code),
      locked: HIGH_RISK_SMS_COUNTRIES.includes(country.code) && !unlocked.includes(country.code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const submitted =
    typeof query.registered === "string"
      ? registrations.find((row) => row.id === query.registered)
      : undefined;
  const submittedNumbers = submitted
    ? numbers
        .filter((row) =>
          submitted.kind === "toll_free"
            ? row.number.id === submitted.numberId
            : row.number.kind === "local" && row.number.registrationId === submitted.id,
        )
        .map((row) => row.number.phoneNumber)
    : [];
  const prompt = registrationPrompt(
    envBase,
    numbers.flatMap((row, index) =>
      needsSenderRegistration(row.number, row.registration?.status ?? null)
        ? [{ kind: row.number.kind, href: registerHrefs[index] ?? null }]
        : [],
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          canCreate ? (
            <>
              <Button
                render={<Link href={`${envBase}/sms/numbers/register`} />}
                size="sm"
                variant="outline"
              >
                Register a sender
              </Button>
              <BuyNumberDialog environments={environments} orgSlug={organization.slug} />
            </>
          ) : null
        }
        description="Your organization's phone numbers, their carrier registrations and the countries live messages may go to. Sandbox environments need none of this: their messages are simulated."
        title="Phone numbers"
      />

      {submitted ? (
        <RegistrationSubmittedPanel
          numbers={submittedNumbers}
          envBase={envBase}
          registration={submitted}
        />
      ) : null}

      {!enabled ? (
        <Alert>
          <AlertTitle>SMS senders aren't available yet</AlertTitle>
          <AlertDescription>
            Sandbox environments already send simulated messages.{" "}
            <SupportLink orgSlug={orgSlug} subject="Live SMS" topic="sales" /> to get started with
            live SMS.
          </AlertDescription>
        </Alert>
      ) : prompt ? (
        <Alert variant="warning">
          <ShieldAlertIcon />
          <AlertTitle>Register a sender to start sending</AlertTitle>
          <AlertDescription>
            {canCreate
              ? prompt.description
              : `${prompt.description} Ask an organization admin to register it.`}
          </AlertDescription>
          {canCreate ? (
            <AlertAction>
              <Button render={<Link href={prompt.href} />} size="sm">
                Register sender
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}

      <Panel>
        <PanelHeader>
          <PanelTitle>Numbers</PanelTitle>
          <PanelDescription>
            Live sends go <code>from</code> one of these, once its registration is approved.
          </PanelDescription>
        </PanelHeader>
        {numbers.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={
                canCreate ? (
                  <BuyNumberDialog environments={environments} orgSlug={organization.slug} />
                ) : null
              }
              compact
              description="Buy a local number (registered for US A2P 10DLC) or a toll-free one (verified on its own)."
              icon={MessageSquareIcon}
              title="No numbers yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Sending</TableHead>
                <TableHead>Replies go to</TableHead>
                {canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((row, index) => (
                <TableRow key={row.number.id}>
                  <TableCell className="font-mono text-[0.8125rem]">
                    {row.number.phoneNumber}
                  </TableCell>
                  <TableCell>{row.number.kind === "toll_free" ? "Toll-free" : "Local"}</TableCell>
                  <TableCell>
                    {sendable[index] ? (
                      <StatusDot tone="success">Can send</StatusDot>
                    ) : registerHrefs[index] ? (
                      <span className="inline-flex items-center gap-3">
                        <RegistrationStatusDot status={row.registration?.status ?? null} />
                        {canCreate ? (
                          <Button
                            render={<Link href={registerHrefs[index]} />}
                            size="xs"
                            variant="outline"
                          >
                            {row.registration ? "Register again" : "Register"}
                          </Button>
                        ) : null}
                      </span>
                    ) : row.number.status === "pending" ? (
                      <StatusDot tone="warning">Setting up</StatusDot>
                    ) : (
                      <RegistrationStatusDot status={row.registration?.status ?? null} />
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <ReceivingEnvironmentForm
                        environments={environments}
                        numberId={row.number.id}
                        orgSlug={organization.slug}
                        phoneNumber={row.number.phoneNumber}
                        value={row.number.receivingEnvironmentId}
                      />
                    ) : (
                      (environmentLabel.get(row.number.receivingEnvironmentId ?? "") ?? "Dropped")
                    )}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <ReleaseNumberButton
                        numberId={row.number.id}
                        orgSlug={organization.slug}
                        phoneNumber={row.number.phoneNumber}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Registrations</PanelTitle>
          <PanelDescription>
            Carriers review the business behind every sender. coss.com submits your details to
            Twilio and follows the review; brand and campaign fees are passed through at cost.
          </PanelDescription>
        </PanelHeader>
        {registrations.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={
                canCreate && numbers.length > 0 ? (
                  <Button
                    render={<Link href={prompt?.href ?? `${envBase}/sms/numbers/register`} />}
                    size="sm"
                  >
                    Register a sender
                  </Button>
                ) : null
              }
              compact
              description="Register your business for US A2P 10DLC, or verify a toll-free number."
              icon={ShieldCheckIcon}
              title="Nothing registered yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Registration</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{KIND_LABEL[row.kind]}</TableCell>
                  <TableCell>{row.profile.legalName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <RegistrationStatusDot status={row.status} />
                      {row.rejectionReason ? (
                        <span className="max-w-96 whitespace-normal text-muted-foreground text-xs">
                          {row.rejectionReason}
                        </span>
                      ) : null}
                      {canCreate && (row.status === "rejected" || row.status === "failed") ? (
                        <Link
                          className="text-xs underline underline-offset-2"
                          href={`${envBase}/sms/numbers/register?from=${row.id}`}
                        >
                          Fix and resubmit
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.submittedAt ? formatDateTime(row.submittedAt.toISOString()) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Countries</PanelTitle>
          <PanelDescription>
            Where live messages may go, with the price per segment. Allowing only the countries your
            customers are in protects you from SMS pumping fraud.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          <CountriesForm
            allowed={allowed}
            countries={countries}
            disabled={!canUpdate}
            orgSlug={organization.slug}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
