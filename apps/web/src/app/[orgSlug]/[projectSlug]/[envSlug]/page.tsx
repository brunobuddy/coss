import { API_KEY_PREFIX } from "@coss/auth/constants";
import { environmentHref, PRODUCTS, type ProductKey, settingsHref } from "@coss/dashboard-routes";
import type { LogEntryOutput } from "@coss/logs/schemas";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
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
import { CountUp } from "@/components/count-up";
import { ModeBadge } from "@/components/email-badges";
import { Panel, PanelBody } from "@/components/panel";
import { ProductElsewhere } from "@/components/product-elsewhere";
import { PRODUCT_TEXT, ProductGlyph } from "@/components/product-glyph";
import { ProductCell, ProductGrid } from "@/components/product-grid";
import { SectionHeading } from "@/components/section-heading";
import { SetupSteps } from "@/components/setup-steps";
import { Sparkline } from "@/components/sparkline";
import { StatusDot } from "@/components/status-dot";
import {
  activityTitle,
  groupActivity,
  HOME_DAYS,
  type HomeAttentionItem,
  LEVEL_SEVERITY,
  loadEnvironmentHome,
  SOURCE_PRODUCT,
} from "@/lib/environment-home";
import { formatCompact, formatRelative } from "@/lib/format";
import { environmentSetupSteps } from "@/lib/home-setup";
import { DEVELOPERS_ICON, PRODUCT_ICONS } from "@/lib/navigation";
import { PRODUCT_FIGURES } from "@/lib/products";
import { listProjectsWithDefaultEnvironment } from "@/lib/projects";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

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
  const now = new Date();
  const base = environmentHref({
    organization: organization.slug,
    project: project.slug,
    environment: environment.slug,
  });

  const [home, projects] = await Promise.all([
    loadEnvironmentHome({
      organizationId: organization.id,
      projectId: project.id,
      userId: session.user.id,
      environment,
      can,
      now,
    }),
    listProjectsWithDefaultEnvironment(organization.id),
  ]);
  const { use, yours, figures, daily, domains, logs, attention, yourProducts, summary } = home;
  const { hasKey, hasActivity, firstVisit } = home;
  const uses = (key: ProductKey) => use.here.includes(key);
  const attentionLinks: Record<HomeAttentionItem["key"], { icon: LucideIcon; href: string }> = {
    risk: { icon: PRODUCT_ICONS.risk, href: `${base}/risk?view=review` },
    scheduling: { icon: PRODUCT_ICONS.scheduling, href: `${base}/scheduling` },
    sign: { icon: PRODUCT_ICONS.sign, href: `${base}/sign` },
    email: { icon: PRODUCT_ICONS.email, href: `${base}/email/messages?status=failed` },
    webhooks: { icon: WebhookIcon, href: `${base}/developers/webhooks` },
    domains: { icon: GlobeIcon, href: `${base}/email/domains` },
  };

  const liveEnvironment = projects
    .find((row) => row.project.id === project.id)
    ?.environments.find((env) => env.mode === "live");
  const steps = environmentSetupSteps({
    base,
    keyPrefix: API_KEY_PREFIX[environment.mode],
    live,
    hasKey,
    hasActivity,
    domains,
    liveBase: liveEnvironment
      ? environmentHref({
          organization: organization.slug,
          project: project.slug,
          environment: liveEnvironment.slug,
        })
      : null,
  });
  const remaining = steps.filter((step) => !step.done).length;
  // Nothing has happened yet, so "all clear" would mean nothing: what to do first takes its place.
  const startHere = attention.length === 0 && !hasActivity && remaining > 0;
  const setup =
    remaining > 0 ? (
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
    ) : null;

  const inUseHere = PRODUCTS.filter((product) => uses(product.key));
  const discover = PRODUCTS.filter((product) => !yours.includes(product.key));
  const firstName = session.user.name?.trim().split(/\s+/)[0];

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
              {firstVisit ? "Welcome" : "Welcome back"}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-pretty text-muted-foreground">{summary}</p>
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
          {inUseHere.length > 0 ? (
            <div className="flex items-center gap-3 lg:flex-col lg:items-end">
              <div className="flex -space-x-2">
                {inUseHere.slice(0, 6).map((product) => (
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
                {inUseHere.length} {inUseHere.length === 1 ? "product" : "products"} in use
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {startHere ? (
        setup
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Needs your attention" />
          {attention.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
              {attention.map((item) => (
                <Link
                  className="group/row flex items-center gap-4 border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-accent/40"
                  href={attentionLinks[item.key].href}
                  key={item.key}
                >
                  <ProductGlyph
                    className="size-9 rounded-xl"
                    icon={attentionLinks[item.key].icon}
                    tone={item.tone}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <StatusDot className="font-medium text-sm" tone={item.severity}>
                      {item.title}
                    </StatusDot>
                    <span className="truncate text-muted-foreground text-sm">
                      {item.description}
                    </span>
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
      )}

      {yourProducts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            action={
              <Button render={<Link href={`${base}/products`} />} size="sm" variant="ghost">
                <LayoutGridIcon />
                All products
              </Button>
            }
            description={`The last ${HOME_DAYS} days of the products this project uses, and the ones you pinned.`}
            title="Your products"
          />
          <ProductGrid>
            {yourProducts.map((product) => {
              const figure = PRODUCT_FIGURES[product.key];
              const count = figures[product.key];
              const elsewhere = use.elsewhere[product.key];
              return (
                <ProductCell
                  detail={
                    elsewhere ? (
                      <ProductElsewhere
                        environments={elsewhere}
                        organization={organization.slug}
                        product={product}
                        project={project.slug}
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-heading font-semibold text-lg tabular-nums">
                            <CountUp value={formatCompact(count)} />
                          </span>
                          <span className="text-muted-foreground">
                            {count === 1 ? figure.one : figure.many}
                            {figure.recent ? ` in ${HOME_DAYS} days` : ""}
                          </span>
                        </span>
                        <Sparkline
                          className={PRODUCT_TEXT[product.key]}
                          id={product.key}
                          values={daily[product.key]}
                        />
                      </div>
                    )
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
          {startHere ? null : setup}
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
        <StatusDot className="min-w-0 text-sm" tone={LEVEL_SEVERITY[props.line.level]}>
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
