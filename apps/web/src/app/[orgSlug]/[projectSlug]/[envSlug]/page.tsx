import { API_KEY_PREFIX } from "@coss/auth/constants";
import {
  environmentHref,
  PRODUCTS,
  type ProductKey,
  settingsHref,
  visibleProducts,
} from "@coss/dashboard-routes";
import { emailActivity, listDomains } from "@coss/email";
import { queryLogs } from "@coss/logs";
import type { LogEntryOutput } from "@coss/logs/schemas";
import { listRiskAssessments } from "@coss/risk";
import { ListRiskAssessmentsQuery } from "@coss/risk/schemas";
import { listSignRequests } from "@coss/sign";
import {
  getEnvironment,
  listEnvironmentApiKeys,
  productDailyActivity,
  productFigures,
} from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import { listWebhookEndpoints } from "@coss/webhooks";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  type LucideIcon,
  ScrollTextIcon,
  UserPlusIcon,
  WebhookIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { Panel, PanelBody } from "@/components/panel";
import { type GlyphTone, PRODUCT_TEXT, ProductGlyph } from "@/components/product-glyph";
import { ProductCell, ProductGrid } from "@/components/product-grid";
import { SectionHeading } from "@/components/section-heading";
import { type SetupStep, SetupSteps } from "@/components/setup-steps";
import { Sparkline } from "@/components/sparkline";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatCompact, formatRelative } from "@/lib/format";
import { DEVELOPERS_ICON, PRODUCT_ICONS } from "@/lib/navigation";
import { PRODUCT_FIGURES, productActivity, productPreferences } from "@/lib/products";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

/** The window of the figures and sparklines. */
const DAYS = 14;
const DAY_MS = 86_400_000;
/** Attention counts stop here ("20+"). */
const COUNT_CAP = 20;

type Attention = {
  key: string;
  tone: GlyphTone;
  icon: LucideIcon;
  severity: StatusTone;
  title: string;
  description: string;
  href: string;
};

/**
 * An environment's home: a welcome with what happened lately, what needs attention, each product
 * with its last two weeks, the latest activity, and what's left to set up or discover.
 */
export default async function EnvironmentHomePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, session, can } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const live = environment.mode === "live";
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const now = new Date();
  const base = environmentHref({
    organization: organization.slug,
    project: project.slug,
    environment: environment.slug,
  });

  const [activity, preferences] = await Promise.all([
    productActivity(organization.id),
    productPreferences(organization.id, session.user.id),
  ]);
  const inUse = activity.get(environment.id) ?? [];
  const yours = visibleProducts(inUse, preferences);
  const uses = (key: ProductKey) => inUse.includes(key);

  const [figures, daily, keys, domains, endpoints, reviews, awaiting, email, logs] =
    await Promise.all([
      productFigures({ ...scope, since: new Date(now.getTime() - DAYS * DAY_MS) }),
      productDailyActivity({ ...scope, days: DAYS, now }),
      listEnvironmentApiKeys(scope),
      live && can({ domain: ["read"] }) ? listDomains({ organizationId: organization.id }) : null,
      can({ webhook: ["read"] }) ? listWebhookEndpoints(scope) : null,
      uses("risk") && can({ risk: ["read"] })
        ? listRiskAssessments(
            scope,
            ListRiskAssessmentsQuery.parse({ review_status: "open", limit: COUNT_CAP }),
          )
        : null,
      uses("sign") && can({ sign: ["read"] })
        ? listSignRequests({ ...scope, status: ["sent"], limit: COUNT_CAP })
        : null,
      uses("email") && can({ email: ["read"] })
        ? emailActivity({ ...scope, since: new Date(now.getTime() - 6 * DAY_MS), now })
        : null,
      can({ log: ["read"] })
        ? queryLogs({ ...scope, from: new Date(now.getTime() - 7 * DAY_MS), to: now, limit: 200 })
        : null,
    ]);

  const attention: Attention[] = [];
  if (reviews && reviews.data.length > 0) {
    const count = countLabel(reviews.data.length, reviews.has_more);
    attention.push({
      key: "risk",
      tone: "risk",
      icon: PRODUCT_ICONS.risk,
      severity: "warning",
      title: `${count} ${reviews.data.length === 1 ? "assessment needs" : "assessments need"} a review`,
      description: "Allow or block them, and report the outcome to sharpen future scores.",
      href: `${base}/risk?view=review`,
    });
  }
  if (awaiting && awaiting.data.length > 0) {
    const count = countLabel(awaiting.data.length, awaiting.hasMore);
    attention.push({
      key: "sign",
      tone: "sign",
      icon: PRODUCT_ICONS.sign,
      severity: "info",
      title: `${count} signature ${awaiting.data.length === 1 ? "request is" : "requests are"} waiting on signers`,
      description: "Sent and not yet completed. Reminders go out on their own.",
      href: `${base}/sign`,
    });
  }
  if (email && email.totals.failed > 0) {
    attention.push({
      key: "email",
      tone: "email",
      icon: PRODUCT_ICONS.email,
      severity: "error",
      title: `${formatCompact(email.totals.failed)} ${email.totals.failed === 1 ? "email" : "emails"} failed this week`,
      description: "See why each one failed: a bounce, a suppression or a rejected sender.",
      href: `${base}/email/messages?status=failed`,
    });
  }
  const failingEndpoints = (endpoints ?? []).filter(
    (endpoint) => endpoint.failingSince !== null || endpoint.disabledReason === "failing",
  );
  if (failingEndpoints.length > 0) {
    attention.push({
      key: "webhooks",
      tone: "neutral",
      icon: WebhookIcon,
      severity: "error",
      title: `${failingEndpoints.length} webhook ${failingEndpoints.length === 1 ? "endpoint is" : "endpoints are"} failing`,
      description: "Deliveries keep failing; failing endpoints are turned off after a while.",
      href: `${base}/developers/webhooks`,
    });
  }
  const brokenDomains = (domains ?? []).filter((domain) =>
    ["failed", "temporary_failure"].includes(domain.status),
  );
  if (brokenDomains.length > 0) {
    attention.push({
      key: "domains",
      tone: "email",
      icon: GlobeIcon,
      severity: "error",
      title: `${brokenDomains.length === 1 ? brokenDomains[0]?.name : `${brokenDomains.length} domains`} can't be verified`,
      description: "Their DNS records are missing or changed, so live email can't use them.",
      href: `${base}/email/domains`,
    });
  }

  const steps: SetupStep[] = [
    {
      label: "Create an API key",
      description: `One key reaches every product. This environment's start with ${API_KEY_PREFIX[environment.mode]}.`,
      done: keys.length > 0,
      href: `${base}/developers/api-keys`,
    },
    ...(domains
      ? [
          {
            label: "Verify a domain",
            description: "Live email goes out from your own domain.",
            done: domains.some((domain) => domain.canSend),
            href: `${base}/email/domains`,
          },
        ]
      : []),
    {
      label: "Make your first request",
      description: "Send an email or a text, request a signature, assess a sign-up…",
      done: Object.values(figures).some((count) => count > 0),
      href: `${base}/developers`,
    },
  ];
  const remaining = steps.filter((step) => !step.done).length;

  const yourProducts = PRODUCTS.filter((product) => yours.includes(product.key));
  const discover = PRODUCTS.filter((product) => !yours.includes(product.key));
  const firstName = session.user.name?.trim().split(/\s+/)[0];
  const summary = yourProducts
    .filter((product) => PRODUCT_FIGURES[product.key].recent && figures[product.key] > 0)
    .map((product) => {
      const figure = PRODUCT_FIGURES[product.key];
      const count = figures[product.key];
      return `${formatCompact(count)} ${count === 1 ? figure.one : figure.many}`;
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="relative -mt-2 overflow-hidden rounded-2xl border bg-card shadow-xs/5 lg:-mt-4">
        <div
          aria-hidden
          className="drafting-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_65%)]"
        />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
              <span>
                {project.name} · {environment.name}
              </span>
              <ModeBadge mode={environment.mode} />
            </div>
            <h1 className="text-balance font-heading font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-pretty text-muted-foreground">
              {summary.length > 0
                ? `In the last ${DAYS} days: ${listOf(summary)}.`
                : live
                  ? "Nothing has gone out from here in the last two weeks."
                  : "A sandbox: everything runs through every check, but nothing is delivered."}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                render={<Link href={`${base}/developers/api-keys`} />}
                size="sm"
                variant="outline"
              >
                <KeyRoundIcon />
                API keys
              </Button>
              {can({ log: ["read"] }) ? (
                <Button
                  render={<Link href={`${base}/developers/logs`} />}
                  size="sm"
                  variant="outline"
                >
                  <ScrollTextIcon />
                  Logs
                </Button>
              ) : null}
              <Button
                render={<Link href={settingsHref(organization.slug, "/members")} />}
                size="sm"
                variant="outline"
              >
                <UserPlusIcon />
                Invite a teammate
              </Button>
              <Button render={<a href="/docs" />} size="sm" variant="ghost">
                <BookOpenIcon />
                Docs
              </Button>
            </div>
          </div>
          {yourProducts.length > 0 ? (
            <div className="flex items-center gap-3 lg:flex-col lg:items-end">
              <div className="flex -space-x-2">
                {yourProducts.slice(0, 6).map((product) => (
                  <Link
                    aria-label={product.name}
                    className="rounded-xl ring-4 ring-card transition-transform hover:z-10 hover:-translate-y-0.5 motion-reduce:transition-none"
                    href={base + product.path}
                    key={product.key}
                  >
                    <ProductGlyph
                      className="size-11 rounded-xl bg-card"
                      icon={PRODUCT_ICONS[product.key]}
                      tone={product.key}
                    />
                  </Link>
                ))}
              </div>
              <span className="text-muted-foreground text-xs">
                {yourProducts.length} {yourProducts.length === 1 ? "product" : "products"} in use
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Needs your attention" />
        {attention.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
            {attention.map((item) => (
              <Link
                className="group/row flex items-center gap-4 border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-accent/40"
                href={item.href}
                key={item.key}
              >
                <ProductGlyph className="size-9 rounded-xl" icon={item.icon} tone={item.tone} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <StatusDot className="font-medium text-sm" tone={item.severity}>
                    {item.title}
                  </StatusDot>
                  <span className="truncate text-muted-foreground text-sm">{item.description}</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/row:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-xs/5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success ring-1 ring-success/20 ring-inset">
              <CheckIcon className="size-4.5" strokeWidth={2.25} />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">All clear</span>
              <span className="text-muted-foreground text-sm">
                No failed sends, failing endpoints or reviews waiting on you.
              </span>
            </div>
          </div>
        )}
      </section>

      {yourProducts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            action={
              <Button render={<Link href={`${base}/products`} />} size="sm" variant="ghost">
                <LayoutGridIcon />
                All products
              </Button>
            }
            description={`The last ${DAYS} days of the products this environment uses, and the ones you pinned.`}
            title="Your products"
          />
          <ProductGrid>
            {yourProducts.map((product) => {
              const figure = PRODUCT_FIGURES[product.key];
              const count = figures[product.key];
              return (
                <ProductCell
                  detail={
                    <div className="flex flex-col gap-2">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-heading font-semibold text-lg tabular-nums">
                          {formatCompact(count)}
                        </span>
                        <span className="text-muted-foreground">
                          {count === 1 ? figure.one : figure.many}
                          {figure.recent ? ` in ${DAYS} days` : ""}
                        </span>
                      </span>
                      <Sparkline
                        className={PRODUCT_TEXT[product.key]}
                        id={product.key}
                        values={daily[product.key]}
                      />
                    </div>
                  }
                  href={base + product.path}
                  key={product.key}
                  product={product}
                />
              );
            })}
          </ProductGrid>
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {logs ? (
          <Panel
            action={
              <Button render={<Link href={`${base}/developers/logs`} />} size="sm" variant="ghost">
                All logs
                <ArrowRightIcon />
              </Button>
            }
            className="lg:col-span-2"
            description="The latest requests and events in this environment."
            title="Recent activity"
          >
            {logs.data.length === 0 ? (
              <PanelBody>
                <p className="text-muted-foreground text-sm">
                  Nothing in the last week. Requests and events show up here as they happen.
                </p>
              </PanelBody>
            ) : (
              <PanelBody flush>
                <ol className="flex flex-col">
                  {groupActivity(logs.data)
                    .slice(0, 8)
                    .map((group) => (
                      <ActivityLine
                        count={group.count}
                        key={group.line.id}
                        line={group.line}
                        now={now}
                      />
                    ))}
                </ol>
              </PanelBody>
            )}
          </Panel>
        ) : null}
        <div className={logs ? "flex flex-col gap-6" : "flex flex-col gap-6 lg:col-span-3"}>
          {remaining > 0 ? (
            <Panel
              action={
                <span className="font-mono text-muted-foreground text-xs">
                  {steps.length - remaining}/{steps.length}
                </span>
              }
              title="Get started"
            >
              <PanelBody flush>
                <SetupSteps steps={steps} />
              </PanelBody>
            </Panel>
          ) : null}
          {discover.length > 0 ? (
            <Panel
              action={
                <Button render={<Link href={`${base}/products`} />} size="sm" variant="ghost">
                  All
                  <ArrowRightIcon />
                </Button>
              }
              description="Every product works with the same API key and SDK."
              title="Discover"
            >
              <PanelBody flush>
                <ul className="flex flex-col">
                  {discover.slice(0, 5).map((product) => (
                    <li className="border-t first:border-t-0" key={product.key}>
                      <Link
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
                        href={base + product.path}
                      >
                        <ProductGlyph icon={PRODUCT_ICONS[product.key]} tone={product.key} />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium text-sm">{product.name}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {product.description}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Log sources by the product they belong to (the rest are Developers' own). */
const SOURCE_PRODUCT: Partial<Record<string, ProductKey>> = {
  email: "email",
  smtp: "email",
  sms: "sms",
  sign: "sign",
  verify: "verify",
  risk: "risk",
  forms: "forms",
  hooks: "hooks",
};

const LEVEL_TONE: Record<LogEntryOutput["level"], StatusTone> = {
  info: "neutral",
  warning: "warning",
  error: "error",
};

/**
 * The week's lines by kind (source, event and level), newest kind first, each shown by its latest
 * line with how many there were: a burst of webhook attempts doesn't push everything else out.
 */
function groupActivity(lines: LogEntryOutput[]): { line: LogEntryOutput; count: number }[] {
  const groups = new Map<string, { line: LogEntryOutput; count: number }>();
  for (const line of lines) {
    const kind = `${line.source}|${line.type}|${line.level}|${line.method ? activityTitle(line) : ""}`;
    const group = groups.get(kind);
    if (group) group.count++;
    else groups.set(kind, { line, count: 1 });
  }
  return [...groups.values()];
}

/** An API line by its route, anything else by its message with URLs cut to their host. */
function activityTitle(line: LogEntryOutput): string {
  if (line.method && line.path) return `${line.method} ${line.route ?? line.path}`;
  return line.message.replace(/https?:\/\/([^/\s]+)\S*/g, "$1");
}

function ActivityLine(props: { line: LogEntryOutput; count: number; now: Date }) {
  const product = SOURCE_PRODUCT[props.line.source];
  const icon = product
    ? PRODUCT_ICONS[product]
    : props.line.source === "webhook"
      ? WebhookIcon
      : DEVELOPERS_ICON;
  return (
    <li className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0">
      <ProductGlyph icon={icon} tone={product ?? "neutral"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusDot className="min-w-0 text-sm" tone={LEVEL_TONE[props.line.level]}>
          <span className="truncate">{activityTitle(props.line)}</span>
          {props.count > 1 ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
              ×{props.count}
            </span>
          ) : null}
        </StatusDot>
        {props.line.type ? (
          <span className="truncate font-mono text-muted-foreground text-xs">
            {props.line.type}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        {formatRelative(props.line.occurred_at, props.now)}
      </span>
    </li>
  );
}

function countLabel(count: number, more: boolean): string {
  return more ? `${count}+` : String(count);
}

/** `["a", "b", "c"]` → `"a, b and c"`. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
