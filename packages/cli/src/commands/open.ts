import type { Flags } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Credentials, clientFor, resolveCredentials } from "../context.ts";
import { apiError, UsageError } from "../errors.ts";

/**
 * Dashboard pages by name: the environment's (under `/<org>/<project>/<env>`) and the
 * organization's (under `/<org>/settings`), as in `@coss/dashboard-routes`.
 */
const ENVIRONMENT_PAGES: Record<string, string> = {
  overview: "",
  home: "",
  products: "/products",
  email: "/email",
  emails: "/email/messages",
  templates: "/email/templates",
  received: "/email/received",
  suppressions: "/email/suppressions",
  subaccounts: "/email/subaccounts",
  tracking: "/email/tracking",
  storage: "/email/storage",
  domains: "/email/domains",
  "dedicated-ips": "/email/dedicated-ips",
  reputation: "/email/reputation",
  broadcasts: "/marketing",
  contacts: "/marketing/contacts",
  audiences: "/marketing/audiences",
  segments: "/marketing/segments",
  topics: "/marketing/topics",
  marketing: "/marketing/settings",
  inboxes: "/inboxes",
  sms: "/sms",
  "sms-received": "/sms/received",
  "sms-suppressions": "/sms/suppressions",
  "sms-numbers": "/sms/numbers",
  verify: "/verify",
  "verify-settings": "/verify/settings",
  sign: "/sign",
  "sign-templates": "/sign/templates",
  "sign-settings": "/sign/settings",
  forms: "/forms",
  scheduling: "/scheduling",
  "scheduling-hosts": "/scheduling/hosts",
  "scheduling-event-types": "/scheduling/event-types",
  "scheduling-reminders": "/scheduling/reminders",
  "scheduling-settings": "/scheduling/settings",
  hooks: "/hooks",
  "hooks-event-types": "/hooks/event-types",
  "hooks-settings": "/hooks/settings",
  risk: "/risk",
  "risk-rules": "/risk/rules",
  "risk-lists": "/risk/lists",
  "risk-limits": "/risk/limits",
  "risk-calibration": "/risk/calibration",
  "risk-settings": "/risk/settings",
  developers: "/developers",
  "api-keys": "/developers/api-keys",
  webhooks: "/developers/webhooks",
  logs: "/developers/logs",
  "log-drains": "/developers/log-drains",
  import: "/developers/import",
};

const ORGANIZATION_PAGES: Record<string, string> = {
  settings: "/settings",
  projects: "/settings/projects",
  members: "/settings/members",
  billing: "/settings/billing",
  spend: "/settings/spend",
  budgets: "/settings/spend/budgets",
  sso: "/settings/sso",
  scim: "/settings/scim",
  "audit-log": "/settings/audit",
  compliance: "/settings/compliance",
};

export const PAGES: readonly string[] = [
  ...Object.keys(ENVIRONMENT_PAGES),
  ...Object.keys(ORGANIZATION_PAGES),
];

type Slugs = { organization: string; project: string; environment: string };

/** The dashboard URL of `page` for the environment `slugs` names. */
export function dashboardPageUrl(dashboardUrl: string, slugs: Slugs, page: string): string {
  const org = `${dashboardUrl}/${encodeURIComponent(slugs.organization)}`;
  const organizationPage = ORGANIZATION_PAGES[page];
  if (organizationPage !== undefined) return `${org}${organizationPage}`;
  const environment = `${org}/${encodeURIComponent(slugs.project)}/${encodeURIComponent(slugs.environment)}`;
  return `${environment}${ENVIRONMENT_PAGES[page] ?? ""}`;
}

/**
 * The environment's slugs, asked of the API (slugs can be renamed since login), or else the ones
 * the profile saved.
 */
async function slugsOf(
  context: CommandInput<Flags>["context"],
  credentials: Credentials,
): Promise<Slugs> {
  const { data, error } = await clientFor(context.io, credentials).environment.get({
    signal: context.io.signal,
  });
  if (data) {
    return {
      organization: data.organization.slug,
      project: data.project.slug,
      environment: data.slug,
    };
  }
  const { organization, project, environment } = credentials.profile ?? {};
  if (organization && project && environment) {
    context.out.warn(`Couldn't check the environment (${error.message}); using the profile's.`);
    return {
      organization: organization.slug,
      project: project.slug,
      environment: environment.slug,
    };
  }
  throw apiError("Couldn't read the environment", error);
}

const FLAGS = {
  print: { type: "boolean", description: "Print the URL instead of opening it" },
  json: { type: "boolean", description: "Print the URL as JSON ({ url }) instead of opening it" },
} as const satisfies Flags;

export const openCommand: Command = defineCommand({
  name: "open",
  summary: "Open the environment's page in the dashboard",
  usage: "[page] [options]",
  description:
    "Opens a page of the dashboard for the API key's environment in your browser: overview (the " +
    `default), ${Object.keys(ENVIRONMENT_PAGES)
      .filter((page) => page !== "overview")
      .join(", ")}, or one of its organization's: ${Object.keys(ORGANIZATION_PAGES).join(", ")}.`,
  flags: FLAGS,
  positionals: true,
  positionalChoices: PAGES,
  run: open,
});

async function open({ values, positionals, context }: CommandInput<typeof FLAGS>): Promise<number> {
  const { io, out } = context;
  const [page = "overview", ...extra] = positionals;
  if (extra.length > 0 || !PAGES.includes(page)) {
    throw new UsageError(`\`coss open\` takes one page: ${PAGES.join(", ")}.`);
  }
  const credentials = await resolveCredentials(context);
  const slugs = await slugsOf(context, credentials);
  const url = dashboardPageUrl(credentials.dashboardUrl, slugs, page);
  if (out.json) {
    out.data({ url });
    return 0;
  }
  if (values.print) {
    out.line(url);
    return 0;
  }
  if (await io.openBrowser(url)) out.info(`Opened ${url}`);
  else out.line(url);
  return 0;
}
