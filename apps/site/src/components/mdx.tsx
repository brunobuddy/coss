import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@coss/ui/components/card";
import { cn } from "@coss/ui/lib/utils";
import Link from "fumadocs-core/link";
import * as Twoslash from "fumadocs-twoslash/ui";
import {
  CodeBlock,
  type CodeBlockProps,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  Pre,
} from "fumadocs-ui/components/codeblock";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { AlertCircleIcon, InfoIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps, ReactNode } from "react";
import { ApiChangelog } from "./api-changelog";
import { ApiKeyPermissionsTable } from "./api-key-permissions";
import {
  AddOns,
  BillingExample,
  CreditAmount,
  GraduatedExample,
  Included,
  Limit,
  PlanPrice,
  PlansWith,
  PlanTable,
  Rate,
  SupportTable,
  UsageRates,
} from "./billing";
import { DocsTable, DocsTd, DocsTh, DocsTr } from "./docs-table";
import { ApiRateLimits } from "./rate-limits";
import { ReputationThresholds, ReputationWindow } from "./reputation-thresholds";
import { RetentionPeriod, RetentionTable } from "./retention";
import { RiskReasonTable, RiskRuleFieldTable, RiskThreshold } from "./risk-reasons";

type CalloutType = "info" | "warn" | "warning" | "error" | "success" | "idea" | "tip";

const CALLOUT_VARIANTS: Record<CalloutType, ComponentProps<typeof Alert>["variant"]> = {
  info: "info",
  warn: "warning",
  warning: "warning",
  error: "error",
  success: "success",
  idea: "default",
  tip: "default",
};

/** `<Callout type="warn">` in MDX, as a coss ui alert. */
function Callout({
  type = "info",
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Alert>, "title"> & { type?: CalloutType; title?: ReactNode }) {
  const Icon =
    type === "error"
      ? AlertCircleIcon
      : type === "warn" || type === "warning"
        ? TriangleAlertIcon
        : type === "idea" || type === "tip"
          ? LightbulbIcon
          : InfoIcon;
  return (
    <Alert className={cn("my-6", className)} variant={CALLOUT_VARIANTS[type]} {...props}>
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="[&_p]:m-0">{children}</AlertDescription>
    </Alert>
  );
}

/** `<Cards>` with `<Card title href>` children: a grid of linked cards. */
function Cards({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("my-6 grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

function LinkCard({
  title,
  description,
  icon,
  href,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title: ReactNode;
  /** The text; the children otherwise. */
  description?: ReactNode;
  icon?: ReactNode;
  href?: string;
}) {
  const text = description ?? children;
  return (
    <Card
      className={cn("transition-colors hover:bg-accent/50", className)}
      data-card
      render={href ? <Link href={href} /> : undefined}
      {...props}
    >
      <CardHeader className="p-5">
        {icon && <span className="mb-1 block text-muted-foreground [&_svg]:size-4.5">{icon}</span>}
        <CardTitle className="text-base">{title}</CardTitle>
        {text && <CardDescription className="[&_p]:m-0">{text}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

function heading(as: "h2" | "h3", className: string) {
  return function Heading({ className: own, children, ...props }: ComponentProps<"h2">) {
    const Tag = as;
    return (
      <Tag className={cn(className, own)} {...props}>
        {props.id ? (
          <a className="no-underline underline-offset-4 hover:underline" href={`#${props.id}`}>
            {children}
          </a>
        ) : (
          children
        )}
      </Tag>
    );
  };
}

/** Components available in every MDX page without an import (the coss ui docs' typography). */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...Twoslash,
    ApiChangelog,
    Callout,
    Card: LinkCard,
    Cards,
    CodeBlockTab,
    // The tab's code block sits flush under the tab list (the `pre` override's margin and
    // `figure.shiki`'s radius are for standalone blocks), on the same surface as the frame.
    CodeBlockTabs: ({ className, ...props }: ComponentProps<typeof CodeBlockTabs>) => (
      <CodeBlockTabs
        className={cn(
          "my-6 overflow-hidden rounded-xl bg-code shadow-none [&_figure.shiki]:my-0 [&_figure.shiki]:rounded-none [&_figure.shiki]:bg-code",
          className,
        )}
        {...props}
      />
    ),
    CodeBlockTabsList,
    CodeBlockTabsTrigger,
    AddOns,
    ApiKeyPermissionsTable,
    ApiRateLimits,
    BillingExample,
    GraduatedExample,
    Included,
    CreditAmount,
    Limit,
    PlanPrice,
    PlansWith,
    PlanTable,
    SupportTable,
    Rate,
    ReputationThresholds,
    ReputationWindow,
    RetentionPeriod,
    RetentionTable,
    RiskReasonTable,
    RiskRuleFieldTable,
    RiskThreshold,
    Step,
    Steps,
    Tab,
    Tabs,
    UsageRates,
    a: ({ className, ...props }: ComponentProps<typeof Link>) => (
      <Link
        className={cn("font-medium text-foreground underline underline-offset-4", className)}
        {...props}
      />
    ),
    blockquote: ({ className, ...props }: ComponentProps<"blockquote">) => (
      <blockquote className={cn("mt-6 border-l-2 ps-6 italic", className)} {...props} />
    ),
    code: ({ className, ...props }: ComponentProps<"code">) =>
      typeof props.children === "string" ? (
        <code
          className={cn(
            "relative rounded-md bg-muted px-[0.3rem] py-[0.2rem] font-mono text-[.8125rem] text-muted-foreground outline-none",
            className,
          )}
          {...props}
        />
      ) : (
        <code className={className} {...props} />
      ),
    h1: ({ className, ...props }: ComponentProps<"h1">) => (
      <h1
        className={cn("mt-2 scroll-m-20 font-heading font-semibold text-3xl", className)}
        {...props}
      />
    ),
    h2: heading(
      "h2",
      "mt-12 scroll-m-20 font-heading font-semibold text-2xl first:mt-0 lg:mt-16 [&+p]:mt-4! *:[code]:text-2xl",
    ),
    h3: heading("h3", "mt-8 scroll-m-20 font-semibold text-lg *:[code]:text-lg"),
    h4: ({ className, ...props }: ComponentProps<"h4">) => (
      <h4 className={cn("mt-8 scroll-m-20 font-medium tracking-tight", className)} {...props} />
    ),
    h5: ({ className, ...props }: ComponentProps<"h5">) => (
      <h5
        className={cn("mt-8 scroll-m-20 font-medium text-lg tracking-tight", className)}
        {...props}
      />
    ),
    h6: ({ className, ...props }: ComponentProps<"h6">) => (
      <h6
        className={cn("mt-8 scroll-m-20 font-medium text-base tracking-tight", className)}
        {...props}
      />
    ),
    hr: (props: ComponentProps<"hr">) => <hr className="my-4 md:my-8" {...props} />,
    img: ({ className, alt, ...props }: ComponentProps<"img">) => (
      // biome-ignore lint/performance/noImgElement: content images of unknown size
      <img alt={alt} className={cn("rounded-md", className)} {...props} />
    ),
    li: ({ className, ...props }: ComponentProps<"li">) => (
      <li className={cn("mt-2", className)} {...props} />
    ),
    ol: ({ className, ...props }: ComponentProps<"ol">) => (
      <ol className={cn("my-6 ms-6 list-decimal text-muted-foreground", className)} {...props} />
    ),
    p: ({ className, ...props }: ComponentProps<"p">) => (
      <p
        className={cn("not-first:mt-6 text-muted-foreground leading-relaxed", className)}
        {...props}
      />
    ),
    pre: ({ className, children, ...props }: CodeBlockProps) => (
      <CodeBlock className={cn("my-6", className)} {...props}>
        <Pre>{children}</Pre>
      </CodeBlock>
    ),
    strong: ({ className, ...props }: ComponentProps<"strong">) => (
      <strong className={cn("font-medium text-foreground", className)} {...props} />
    ),
    table: DocsTable,
    td: DocsTd,
    th: DocsTh,
    tr: DocsTr,
    ul: ({ className, ...props }: ComponentProps<"ul">) => (
      <ul className={cn("my-6 ms-6 list-disc text-muted-foreground", className)} {...props} />
    ),
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
