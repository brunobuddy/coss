import { API_KEY_PREFIX } from "@coss/auth/constants";
import { environmentHref, PRODUCTS, visibleProducts } from "@coss/dashboard-routes";
import { listDomains } from "@coss/email";
import { getEnvironment, listEnvironmentApiKeys, productFigures } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import { ArrowRightIcon, LayoutGridIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { ProductCell, ProductGrid } from "@/components/product-grid";
import { ProductPinButton } from "@/components/product-pin-button";
import { SectionHeading } from "@/components/section-heading";
import { type SetupStep, SetupSteps } from "@/components/setup-steps";
import { formatCompact } from "@/lib/format";
import { PRODUCT_FIGURES, productActivity, productPreferences } from "@/lib/products";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

/** The window of the busy products' figures. */
const FIGURE_DAYS = 14;

/**
 * An environment's home: what's left to set up, the member's products with one figure each, and
 * the products it doesn't use yet.
 */
export default async function EnvironmentHomePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, session } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const live = environment.mode === "live";
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const [activity, preferences, figures, keys, domains] = await Promise.all([
    productActivity(organization.id),
    productPreferences(organization.id, session.user.id),
    productFigures({ ...scope, since: new Date(Date.now() - FIGURE_DAYS * 86_400_000) }),
    listEnvironmentApiKeys(scope),
    live ? listDomains({ organizationId: organization.id }) : null,
  ]);
  const inUse = activity.get(environment.id) ?? [];
  const yours = visibleProducts(inUse, preferences);
  const base = environmentHref({
    organization: organization.slug,
    project: project.slug,
    environment: environment.slug,
  });

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
  const discover = PRODUCTS.filter((product) => !yours.includes(product.key));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Button render={<Link href={`${base}/products`} />} size="sm" variant="outline">
            <LayoutGridIcon />
            All products
          </Button>
        }
        description={
          live
            ? "Production: real emails, texts and signatures go out from here."
            : "Development: everything runs through every check, but nothing is delivered."
        }
        meta={<ModeBadge mode={environment.mode} />}
        title={`${project.name} · ${environment.name}`}
      />

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

      <section className="flex flex-col gap-3">
        <SectionHeading
          description="The products this environment uses, and the ones you pinned."
          title="Your products"
        />
        <ProductGrid>
          {PRODUCTS.filter((product) => yours.includes(product.key)).map((product) => {
            const figure = PRODUCT_FIGURES[product.key];
            const count = figures[product.key];
            return (
              <ProductCell
                detail={
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-heading font-semibold text-lg tabular-nums">
                      {formatCompact(count)}
                    </span>
                    <span className="text-muted-foreground">
                      {count === 1 ? figure.one : figure.many}
                      {figure.recent ? ` in ${FIGURE_DAYS} days` : ""}
                    </span>
                  </span>
                }
                href={base + product.path}
                key={product.key}
                product={product}
              />
            );
          })}
        </ProductGrid>
      </section>

      {discover.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            action={
              <Button render={<Link href={`${base}/products`} />} size="sm" variant="ghost">
                All products
                <ArrowRightIcon />
              </Button>
            }
            description="Every product works with the same API key and SDK."
            title="Discover"
          />
          <ProductGrid>
            {discover.map((product) => (
              <ProductCell
                action={
                  <ProductPinButton
                    inUse={inUse.includes(product.key)}
                    orgSlug={organization.slug}
                    preference={preferences[product.key]}
                    product={{ key: product.key, name: product.name }}
                    visible={false}
                  />
                }
                docs
                href={base + product.path}
                key={product.key}
                product={product}
              />
            ))}
          </ProductGrid>
        </section>
      ) : null}
    </div>
  );
}
