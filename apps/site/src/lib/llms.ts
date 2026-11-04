import "server-only";
import { COMPARE_ROUTE, COMPETITORS, compareMarkdown } from "./compare";
import { type DocsSection, type NavGroup, sectionsOf } from "./docs-tree";
import { marketingMarkdown, productPages, solutionPages } from "./marketing";
import { aboutMarkdown, pricingMarkdown } from "./page-markdown";
import { markdownResponse, SITE_URL } from "./site";
import { type DocsPage, markdownUrl, operationOf, pageMarkdown, source } from "./source";
import { FREE_TOOLS, TOOLS_ROUTE } from "./tools";

const link = (path: string) => `${SITE_URL}${markdownUrl(path)}`;

/** Every API operation, by product. */
const API_INDEX = `${SITE_URL}/docs/api-reference/llms.txt`;
/** A product's guides with their summaries, and its API operations. */
const productIndexUrl = (slug: string) => `${SITE_URL}/docs/${slug}/llms.txt`;
/** The API reference's sidebar groups that belong to a section of another name. */
const API_GROUP_SECTIONS: Readonly<Record<string, string>> = { Marketing: "Email" };

/**
 * What a coding agent needs before it reads any page: how to read the docs, how to get a key
 * without a person pasting one, and the few conventions every integration depends on. It opens
 * /llms.txt and /llms-full.txt. Keep its facts in step with the pages it links (and with the CLI's
 * `coss init` notes, packages/cli/src/commands/init.ts, and plugins/coss/skills).
 */
export const AGENT_BRIEF = `# coss.com

> One API key and one SDK for transactional and marketing email, inboxes for AI agents, SMS, Verify (one-time codes by SMS or email), Forms (hosted form endpoints), Scheduling (bookings and calendars), Hooks (webhooks as a service for your own users) and Risk (sign-up, login and payment risk decisions, and rate limiting). These docs are written for people and coding agents alike.

## Reading these docs

- Every page is Markdown at its URL plus \`.md\`, as linked below (the docs home is ${link("/docs")}). Fetch the pages you need rather than guessing.
- API reference pages (${SITE_URL}/docs/api-reference/…) give each operation's method and URL, parameters, request body, responses and errors, with TypeScript, HTTP, Python, Go, Ruby, PHP, Java and .NET examples. The OpenAPI 3.1 document is https://api.coss.com/openapi.json.
- This file lists the guides. API operations have indexes of their own: each product below links its own, and ${API_INDEX} has them all.
- ${SITE_URL}/llms-full.txt is every guide in one file (over 1 MB), with one short entry per API operation.
- Claude Code plugin, an Agent Skill for other agents, and the MCP server: ${link("/docs/agents")}.

## Adding coss.com to a project

1. **Get a development API key.** In the project's directory, run \`npx coss-cli init\` and tell the user to expect a browser window: it opens the coss.com dashboard, where they sign in and approve a key for this project (it waits up to 5 minutes). It then writes the key to \`.env.local\` (Next.js) or \`.env\` as \`COSS_API_KEY\`, and installs the \`coss\` package in JavaScript projects. A key already in that file is kept: check it starts with \`coss_test_\` (\`--force\` replaces it). Where no browser can open (over SSH, in a container or a cloud sandbox) it prints a link and waits for a code typed into the terminal, so ask the user to run it there themselves. It writes a short version of these notes into the project's AGENTS.md (\`--no-agents\` skips that) and prints the one next step for this key, including the drop-in when the project already uses Nodemailer, Better Auth, Auth.js, Laravel, Rails or Django. See ${link("/docs/cli")}.
2. **Build and test with that key.** Development keys (\`coss_test_…\`) work with every API, record every email and SMS with their events and webhooks, and deliver nothing; the simulator addresses and numbers produce bounces, complaints and failures (${link("/docs/environments")}). Never ask for a live key (\`coss_live_…\`) to develop with: going live (a verified domain, a registered number, a production key) is the user's step, in the dashboard.
3. **Use the SDK.** TypeScript: \`import { Coss } from "coss"\`; \`new Coss()\` reads \`COSS_API_KEY\`. Every method returns \`{ data, error }\` and never throws for API or network failures, so check \`error\` (\`type\`, \`code\`, \`message\`, and \`hint\` when it names the fix); retries are automatic and safe (an \`Idempotency-Key\` on every POST). See ${link("/docs/quickstart")} and ${link("/docs/sdk")}. Python, Go, Ruby, PHP, Java and .NET SDKs: ${link("/docs/sdks")}. Nodemailer, Better Auth, Auth.js, Laravel, Rails and Django: ${link("/docs/integrations")}. An agent that needs its own email address gets one with \`coss.inboxes.create()\`: mail to it arrives as threads with an \`inbox.message.received\` webhook, and it replies with \`coss.inboxes.messages.reply()\` (${link("/docs/inboxes")}).
4. **Receive webhooks.** Verify every request with \`verifyWebhook(rawBody, headers, secret)\`, which throws on a bad signature (${link("/docs/sdk/webhooks")}; events: ${link("/docs/webhooks")}). Locally, \`npx coss-cli listen --forward-to localhost:3000/<path>\` forwards the environment's events to the handler and writes \`COSS_WEBHOOK_SECRET\` into the same env file as the key. \`npx coss-cli webhooks add <url>\` registers an endpoint and writes that secret (replacing a listen secret, so both sign the same way). \`npx coss-cli trigger <event type>\` sends a sample one. These commands use the CLI's own sign-in (\`npx coss-cli login\`, approved like \`init\`) or \`COSS_API_KEY\` in their environment.
5. **Check what happened.** \`npx coss-cli logs tail\` follows the environment's API requests and events, and \`npx coss-cli emails diagnose <id>\` explains a delivery. The MCP server (\`npx -y coss-mcp\`, ${link("/docs/mcp")}) reads a development key from the project env file when its own environment has none. Call \`get_setup\` before writing send code, and \`diagnose_email\` to explain a delivery. It also searches these docs, and has tools for marketing, Verify, Sign, Forms, Scheduling, Hooks and Risk; \`npx coss-cli --help\` lists the same products' commands.

`;

/**
 * What an index says of a page: its title (the tree's names aren't text: an API operation's carries
 * its method badge), and its summary or an API operation's method and path.
 */
const PAGE_LINES = new Map(
  source.getPages().map((page) => {
    const title = page.data.title ?? page.url;
    if (page.type !== "openapi") {
      const summary = (page.data.description ?? "").replace(/\s*\n\s*/g, " ").trim();
      return [page.url, { title, summary }];
    }
    const { method, path } = operationOf(page);
    return [page.url, { title, summary: `${method.toUpperCase()} ${path}` }];
  }),
);

function pageLine({ url }: { url: string }, { summary }: { summary: boolean }): string {
  const page = PAGE_LINES.get(url);
  if (!page) throw new Error(`The docs' tree links ${url}, which isn't a page.`);
  return `- [${page.title}](${link(url)})${summary && page.summary ? `: ${page.summary}` : ""}`;
}

/** A section's guides, under the sidebar's group names (an API resource's folder isn't a guide). */
function guideLines(section: DocsSection, options: { summary: boolean }): string[] {
  return section.groups.flatMap((group) => {
    const pages = group.entries.flatMap((entry) =>
      entry.type === "page" ? [pageLine(entry, options)] : [],
    );
    if (pages.length === 0) return [];
    return [...(group.label ? [`**${String(group.label)}**`, ""] : []), ...pages, ""];
  });
}

/** A group of API operations, one heading per resource. */
function operationLines(group: NavGroup, heading: string): string[] {
  return group.entries.flatMap((entry) =>
    entry.type === "folder"
      ? [
          `${heading} ${String(entry.name)}`,
          "",
          ...entry.pages.map((page) => pageLine(page, { summary: true })),
          "",
        ]
      : [],
  );
}

/** The docs' sections, and the API reference's groups of operations (its sidebar's products). */
function docsTree(): { sections: DocsSection[]; apiGroups: NavGroup[] } {
  const sections = sectionsOf(source.getPageTree());
  const api = sections.find((section) => section.url === "/docs/api-reference");
  if (!api) throw new Error("The docs have no API reference section.");
  return { sections, apiGroups: api.groups.filter((group) => group.label) };
}

/** The sections with API operations, each named by its index's path. */
function productSections(): { slug: string; section: DocsSection; apiGroups: NavGroup[] }[] {
  const { sections, apiGroups } = docsTree();
  return sections.flatMap((section) => {
    const owned = apiGroups.filter((group) => {
      const label = String(group.label);
      return (API_GROUP_SECTIONS[label] ?? label) === section.name;
    });
    if (owned.length === 0) return [];
    return [{ slug: String(section.name).toLowerCase(), section, apiGroups: owned }];
  });
}

/** Every `/docs/<slug>/llms.txt`. */
export function productIndexSlugs(): string[] {
  return productSections().map(({ slug }) => slug);
}

/**
 * /llms.txt: the brief, each section's guides with where its API operations are, then the other
 * pages. `AGENT_PROMPT` sends every agent here first, so it stays small (test/llms.test.ts):
 * summaries and operations are one link further, in `productIndex`.
 */
export function llmsIndex(): string {
  const products = new Map(productSections().map(({ section, slug }) => [section.url, slug]));
  const docs = docsTree().sections.flatMap((section) => {
    const slug = products.get(section.url);
    const pointer = slug
      ? `API operations, and a summary of each guide: ${productIndexUrl(slug)}`
      : section.url === "/docs/api-reference"
        ? `Every API operation, by product: ${API_INDEX}`
        : undefined;
    return [
      `### ${String(section.name)}`,
      "",
      String(section.description ?? ""),
      "",
      ...(pointer ? [pointer, ""] : []),
      ...guideLines(section, { summary: false }),
    ];
  });
  return `${AGENT_BRIEF}## Docs\n\n${docs.join("\n")}\n${marketingIndex()}`;
}

/** /docs/<slug>/llms.txt: one product's guides with their summaries, and its API operations. */
export function productIndex(slug: string): string | undefined {
  const product = productSections().find((candidate) => candidate.slug === slug);
  if (!product) return undefined;
  const { section, apiGroups } = product;
  return [
    `# coss.com: ${String(section.name)}`,
    "",
    `> ${String(section.description ?? "")}`,
    "",
    `Every link is a page as Markdown. How to get a key and use the SDK: ${SITE_URL}/llms.txt`,
    "",
    "## Guides",
    "",
    ...guideLines(section, { summary: true }),
    "## API operations",
    "",
    ...apiGroups.flatMap((group) => operationLines(group, "###")),
  ].join("\n");
}

/** /docs/api-reference/llms.txt: every API operation, by product. */
export function apiIndex(): string {
  return [
    "# coss.com API operations",
    "",
    `> Every operation of the HTTP API, by product. Each link is the operation's page as Markdown: method and URL, parameters, request body, responses, errors and examples in each SDK. Base URL, authentication and conventions: ${link("/docs/api-reference")}. The OpenAPI 3.1 document: https://api.coss.com/openapi.json`,
    "",
    ...docsTree().apiGroups.flatMap((group) => [
      `## ${String(group.label)}`,
      "",
      ...operationLines(group, "###"),
    ]),
  ].join("\n");
}

/**
 * The product, solution and comparison pages, after the docs, for agents asked to choose rather
 * than to build: names only, since each page opens by saying what it is.
 */
function marketingIndex(): string {
  const entry = (title: string, url: string, description = "") =>
    `- [${title}](${SITE_URL}${url}.md)${description ? `: ${description}` : ""}`;
  return [
    "## Products",
    "",
    ...productPages().map((page) => entry(page.data.title, page.url)),
    "",
    "## Solutions",
    "",
    ...solutionPages().map((page) => entry(page.data.title, page.url)),
    "",
    "## Comparisons",
    "",
    ...COMPETITORS.map((c) => entry(`coss.com vs ${c.name}`, `${COMPARE_ROUTE}/${c.slug}`)),
    "",
    "## Company",
    "",
    entry("Pricing", "/pricing", "Plans, usage rates, add-ons and what each plan includes."),
    entry("About", "/about", "What coss.com is and who builds it."),
    `- [Changelog](${SITE_URL}/changelog/index.md): What shipped, newest first.`,
    "",
    "## Free tools",
    "",
    ...FREE_TOOLS.map((tool) => `- [${tool.name}](${SITE_URL}${TOOLS_ROUTE}/${tool.slug})`),
    "",
    "## More from coss.com",
    "",
    `- [kloq](${SITE_URL}/kloq/llms.txt): a React calendar component, with its own llms.txt.`,
    `- [Shipyard](${SITE_URL}/shipyard/docs): coding agents on your own machines, with its own docs.`,
    "",
  ].join("\n");
}

/** /llms-full.txt: the brief, then every page (API operations as one short entry each). */
export async function llmsFull(): Promise<string> {
  const pages = await Promise.all([
    ...source.getPages().map((page) => pageMarkdown(page, { compact: true })),
    ...[...productPages(), ...solutionPages()].map((page) => marketingMarkdown(page)),
  ]);
  const comparisons = COMPETITORS.map((c) =>
    compareMarkdown(c, `${SITE_URL}${COMPARE_ROUTE}/${c.slug}`),
  );
  const company = [pricingMarkdown(), aboutMarkdown()];
  return `${AGENT_BRIEF}${[...pages, ...comparisons, ...company].join("\n\n")}\n`;
}

/** A docs page's `.md` (src/app/docs/md). */
export async function docsMarkdownResponse(page: DocsPage): Promise<Response> {
  return markdownResponse(await pageMarkdown(page), page.url);
}
