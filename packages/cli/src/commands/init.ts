import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  fetchSetupReport,
  SETUP_PRODUCTS,
  type SetupProduct,
  type SetupReport,
  SIMULATOR_TO,
} from "coss";
import type { Flags } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { profileName, readConfig } from "../config.ts";
import {
  apiBaseUrl,
  clientFor,
  DEFAULT_BASE_URL,
  dashboardBaseUrl,
  describeEnvironment,
} from "../context.ts";
import { removeEnvVar, setEnvVar } from "../env-file.ts";
import { apiError, CliError } from "../errors.ts";
import type { CliIo } from "../io.ts";
import { type DetectedStack, detectProjectStack } from "../project-stack.ts";
import { oneOf } from "./list-output.ts";
import { browserLogin, isRemote } from "./login.ts";

export { removeEnvVar, setEnvVar };

type PackageJson = {
  name?: unknown;
  packageManager?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

const LOCKFILES: [file: string, manager: PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  let text: string;
  try {
    text = await readFile(join(dir, "package.json"), "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as PackageJson;
  } catch {
    throw new CliError(`${join(dir, "package.json")} isn't valid JSON.`);
  }
}

/**
 * The project's package manager: the nearest lockfile (in a workspace it's the root's), else
 * package.json's `packageManager`, else npm.
 */
export async function detectPackageManager(dir: string, pkg: PackageJson): Promise<PackageManager> {
  for (let current = resolve(dir); ; current = dirname(current)) {
    for (const [file, manager] of LOCKFILES) {
      if (await exists(join(current, file))) return manager;
    }
    if (dirname(current) === current) break;
  }
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  return LOCKFILES.find(([, manager]) => manager === declared)?.[1] ?? "npm";
}

export function installCommand(manager: PackageManager): [string, string[]] {
  return [manager, manager === "npm" ? ["install", "coss"] : ["add", "coss"]];
}

function dependsOn(pkg: PackageJson, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

const KEY_LINE = /^\s*(?:export\s+)?COSS_API_KEY\s*=\s*["']?([^"'\s#]*)/m;

const NOTES_BEGIN = "<!-- BEGIN:coss -->";
const NOTES_END = "<!-- END:coss -->";

/**
 * What a coding agent working in the project should know about coss.com, for its AGENTS.md
 * (on by default; `--no-agents` skips them). Keep it in step with the brief that opens
 * https://coss.com/llms.txt (apps/site/src/lib/llms.ts).
 */
export function agentNotes(envFile: string): string {
  return `${NOTES_BEGIN}
## coss.com

This project uses [coss.com](https://coss.com) through its SDK (email, SMS, Verify, Sign, Forms,
Scheduling, Hooks, Risk and webhooks, on one key).

- Docs: https://coss.com/llms.txt lists the guides and links each product's API operations, and
  every docs page is Markdown at its URL plus
  \`.md\` (e.g. https://coss.com/docs/email/sending.md). API reference pages give each operation's
  parameters, request body, responses and errors. Read the page before writing code against it.
- Develop and test with the development key (\`coss_test_…\`) in \`${envFile}\` as \`COSS_API_KEY\`:
  every API works and records what it would do, with events and webhooks, but nothing is
  delivered. A \`coss_live_…\` key there delivers for real: don't test with it, and never switch
  to one to try something (\`npx coss-cli init --force\` replaces it with a development key).
- SDK methods return \`{ data, error }\` and don't throw for API failures: always check \`error\`
  (and \`error.hint\`, which names the fix). Webhook handlers verify each request with
  \`verifyWebhook\`, which throws on a bad signature. \`npx coss-cli listen\` writes
  \`COSS_WEBHOOK_SECRET\` into \`${envFile}\` for that check. \`npx coss-cli webhooks add <url>\`
  creates an endpoint and writes that same variable (replacing a listen secret, so both sign
  the same way).
- Commands use \`COSS_API_KEY\` from the environment. \`npx coss-cli listen --forward-to
  localhost:3000/<path>\` forwards webhook events to a local handler, \`npx coss-cli trigger
  <event type>\` sends a test event, and \`npx coss-cli logs tail\` follows the API requests and
  events. Send email tests to \`bounce@simulator.amazonses.com\` and run \`npx coss-cli emails diagnose <id>\`;
  each product has a testing page in the docs. \`npx coss-cli --help\` lists the commands for each
  product (\`suppressions\`, \`subaccounts\`, \`contacts\`, \`audiences\`, \`segments\`, \`topics\`,
  \`broadcasts\`, \`sms\`, \`verify\`, \`sign\`, \`forms\`, \`scheduling\`, \`hooks\`, \`risk\`,
  \`log-drains\`), and \`npx coss-cli api\` calls any endpoint.
- What happened to something: \`npx coss-cli <emails|sms|verify|sign|forms|hooks|scheduling> diagnose\`
  gives a verdict, what it means and what to do next. A form's spam is answered like a success, so
  what a submitter saw proves nothing. \`npx coss-cli init --product <product>\` prints what a
  product still needs, and the MCP server's \`get_setup\` takes the same \`product\`.
${NOTES_END}
`;
}

/** `text` with the coss.com notes: an earlier copy replaced, else appended. */
export function setAgentNotes(text: string, notes: string): string {
  const begin = text.indexOf(NOTES_BEGIN);
  const end = text.indexOf(NOTES_END, begin);
  if (begin !== -1 && end !== -1) {
    const after = text.slice(end + NOTES_END.length).replace(/^\r?\n/, "");
    return `${text.slice(0, begin)}${notes}${after}`;
  }
  if (text.trim() === "") return notes;
  return `${text.replace(/\s*$/, "")}\n\n${notes}`;
}

/** The project's agent instructions: AGENTS.md, else an existing CLAUDE.md, else a new AGENTS.md. */
async function agentsFile(dir: string): Promise<string> {
  const agents = join(dir, "AGENTS.md");
  if (await exists(agents)) return agents;
  const claude = join(dir, "CLAUDE.md");
  return (await exists(claude)) ? claude : agents;
}

/** The project's name for the key: package.json's (without its scope), else the directory's. */
function projectName(dir: string, pkg: PackageJson | null): string {
  const name = typeof pkg?.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : "";
  return name || basename(resolve(dir));
}

const FLAGS = {
  "env-file": {
    type: "string",
    value: "<path>",
    description:
      "Where to write COSS_API_KEY (default: .env.local in a Next.js project, else .env)",
  },
  "no-install": { type: "boolean", description: "Don't install the coss package" },
  force: { type: "boolean", description: "Replace a COSS_API_KEY the env file already has" },
  agents: {
    type: "boolean",
    description: "Add notes for coding agents (the default; --no-agents skips them)",
  },
  "no-agents": {
    type: "boolean",
    description: "Don't add notes for coding agents to AGENTS.md",
  },
  "no-browser": {
    type: "boolean",
    description: "Don't open a browser: open the link yourself, then paste the code it shows",
  },
  product: {
    type: "string",
    value: "<product>",
    choices: SETUP_PRODUCTS,
    description: `What you're about to add: ${SETUP_PRODUCTS.join(", ")}. The closing step is that product's. Default: email`,
  },
  json: { type: "boolean", description: "Print what was done as one JSON object" },
} as const satisfies Flags;

export const initCommand: Command = defineCommand({
  name: "init",
  summary: "Set this project up: the SDK and a development API key",
  description:
    "Sets up the project in the current directory: installs the coss package with the project's " +
    "package manager, and writes a new development (sandbox) API key to its env file as " +
    "COSS_API_KEY, created in the dashboard like `coss login`'s and named after the project. It " +
    "is the project's key, not the CLI's: `coss login` signs the CLI in.\n\n" +
    "An env file that already has a key keeps it, unless --force. It also adds a short section on " +
    "coss.com (docs, the development key, testing) to the project's AGENTS.md, or its CLAUDE.md " +
    "when it has no AGENTS.md; running it again updates that section. --no-agents skips the notes." +
    "\n\nIt ends with the one next step for the key. --product says which product that's for: what it " +
    "still needs (an approved number for SMS and Verify, a host, schedule and event type for " +
    "Scheduling…) or, with a development key, how to try it. With no --product it answers for email " +
    "and lists the products in use.",
  flags: FLAGS,
  run: init,
});

async function init({ values, context }: CommandInput<typeof FLAGS>): Promise<number> {
  const { io, out, flags } = context;
  const product = oneOf("--product", values.product, SETUP_PRODUCTS);
  const dir = io.cwd;
  const pkg = await readPackageJson(dir);
  const next = pkg !== null && dependsOn(pkg, "next");
  const envFile = resolve(dir, values["env-file"] ?? (next ? ".env.local" : ".env"));
  const shownFile = relative(dir, envFile) || envFile;
  const existingText = await readFile(envFile, "utf8").catch(() => null);
  const existingKey = existingText ? (KEY_LINE.exec(existingText)?.[1] ?? "") : "";
  let apiKey = existingKey;

  // Where `coss login` pointed the CLI (a local stack, say) is where the project's key comes from.
  const config = await readConfig(io);
  const profile = config.profiles[profileName(io, config, flags.profile)] ?? null;
  const baseUrl = apiBaseUrl(io, profile);
  const dashboardUrl = dashboardBaseUrl(io, profile);

  let key: { id: string; name: string; environment: string } | null = null;
  if (existingKey && !values.force) {
    out.info(`${shownFile} already has COSS_API_KEY: kept it (--force replaces it).`);
    if (existingKey.startsWith("coss_live_")) {
      out.warn(
        `${shownFile}'s COSS_API_KEY is a live key: what you send with it is delivered. ` +
          "`coss init --force` replaces it with a development key.",
      );
    }
  } else {
    const token = await browserLogin(context, dashboardUrl, {
      pasteCode: values["no-browser"] === true || isRemote(io),
      project: projectName(dir, pkg),
    });
    const coss = clientFor(io, { apiKey: token.api_key, baseUrl });
    const { data: environment, error } = await coss.environment.get();
    if (error) throw apiError("Couldn't check the new API key", error);
    if (environment.mode === "live") {
      // The page offers sandbox environments only; never write a live key into project files.
      await coss.apiKey.revoke().catch(() => undefined);
      throw new CliError(
        `${describeEnvironment(environment)} is live, so its key was revoked: \`coss init\` only ` +
          "writes development keys. Pick a sandbox environment.",
      );
    }
    apiKey = token.api_key;
    const withKey = setEnvVar(existingText ?? "", "COSS_API_KEY", token.api_key);
    // The key only works against the API it came from: COSS_BASE_URL follows it (a key of the
    // default API drops one a local stack left).
    const text =
      baseUrl === DEFAULT_BASE_URL
        ? removeEnvVar(withKey, "COSS_BASE_URL")
        : setEnvVar(withKey, "COSS_BASE_URL", baseUrl);
    // A new file is readable by its owner only; an existing one keeps its mode.
    await mkdir(dirname(envFile), { recursive: true });
    await writeFile(envFile, text, { mode: 0o600 });
    key = {
      id: environment.api_key.id,
      name: token.name,
      environment: describeEnvironment(environment),
    };
    if (!out.json) {
      out.line(
        `${out.style("green", "✔")} Saved a development key of ${key.environment} to ${shownFile} as COSS_API_KEY.`,
      );
    }
  }

  const ignored = await ignoredByGit(io, dir, envFile);
  if (ignored === false) {
    out.warn(
      `${shownFile} isn't ignored by git: add it to .gitignore so the key is never committed.`,
    );
  }

  let installed: string | null = null;
  if (values["no-install"]) {
    // Nothing to do.
  } else if (pkg === null) {
    out.info("No package.json here: skipped installing the coss package.");
  } else if (dependsOn(pkg, "coss")) {
    if (!out.json) out.info("coss is already a dependency.");
  } else {
    const [command, args] = installCommand(await detectPackageManager(dir, pkg));
    installed = [command, ...args].join(" ");
    out.info(out.style("dim", `$ ${installed}`));
    const code = await io.exec(command, args, { cwd: dir });
    if (code !== 0) {
      throw new CliError(
        code === null
          ? `Couldn't run ${command}: install the coss package yourself.`
          : `\`${installed}\` failed (exit code ${code}): install the coss package yourself.`,
      );
    }
    if (!out.json) out.line(`${out.style("green", "✔")} Installed the coss package.`);
  }

  let notesFile: string | null = null;
  // --no-agents wins over --agents. Notes are on unless that flag is set.
  if (values["no-agents"] !== true) {
    notesFile = await agentsFile(dir);
    const before = await readFile(notesFile, "utf8").catch(() => "");
    await writeFile(notesFile, setAgentNotes(before, agentNotes(shownFile)));
    if (!out.json) {
      out.line(
        `${out.style("green", "✔")} ${before.includes(NOTES_BEGIN) ? "Updated" : "Added"} the coss.com notes for coding agents in ${relative(dir, notesFile)}.`,
      );
    }
  }

  const setup = await fetchSetupReport(
    clientFor(io, { apiKey, baseUrl }),
    product ? { product } : {},
  );
  const stack = await detectProjectStack(dir, pkg);
  if (setup.warning) out.warn(setup.warning);

  if (out.json) {
    out.data({
      env_file: envFile,
      key,
      installed,
      ignored_by_git: ignored,
      agents_file: notesFile,
      setup,
    });
    return 0;
  }
  out.line(closingMessage({ stack, shownFile, setup, product }));
  return 0;
}

function sdkSnippetText(from: string, to: string): string {
  return `  import { Coss } from "coss";

  const coss = new Coss(); // reads COSS_API_KEY
  const { data, error } = await coss.email.send({
    from: ${JSON.stringify(from)},
    to: ${JSON.stringify(to)},
    subject: "Hello from coss.com",
    text: "It works!",
  });`;
}

function nodemailerSnippet(from: string, to: string): string {
  return `  import { cossTransport } from "coss/nodemailer";
  import nodemailer from "nodemailer";

  const transport = nodemailer.createTransport(cossTransport());
  await transport.sendMail({
    from: ${JSON.stringify(from)},
    to: ${JSON.stringify(to)},
    subject: "Hello from coss.com",
    text: "It works!",
  });`;
}

function sdkSnippet(isNext: boolean, shownFile: string, from: string, to: string): string {
  return `Send an email from your server code${isNext ? " (a route handler or server action)" : ""}:

${sdkSnippetText(from, to)}

Development keys never deliver email, but every send has its events and webhooks.${
    isNext ? "" : `\nLoad ${shownFile} in your app, e.g. node --env-file=${shownFile} server.js.`
  }`;
}

/** The closing message: the drop-in this project already uses, then the one next step. */
function closingMessage(options: {
  stack: DetectedStack;
  shownFile: string;
  setup: SetupReport;
  product: SetupProduct | undefined;
}): string {
  const { stack, shownFile, setup, product } = options;
  const from = setup.from ?? "hello@example.com";
  const parts: string[] = [];
  if (product && product !== "email") {
    // Another product's step: the email drop-ins would be beside the point.
  } else if (stack.driver) {
    parts.push(`Install the ${stack.driver.kind} driver yourself:\n\n  ${stack.driver.install}`);
  }
  if (product && product !== "email") {
    parts.push(
      `See https://coss.com/docs/${product === "marketing" ? "email/broadcasts" : product}.md for the guide.`,
    );
  } else if (stack.integration === "nodemailer") {
    parts.push(`Send with Nodemailer:\n\n${nodemailerSnippet(from, SIMULATOR_TO)}`);
  } else if (stack.integration === "better-auth") {
    parts.push(
      "Send Better Auth's emails with `coss/better-auth` (https://coss.com/docs/integrations.md).",
    );
  } else if (stack.integration === "authjs") {
    parts.push("Send Auth.js emails with `coss/authjs` (https://coss.com/docs/integrations.md).");
  } else if (stack.javascript || !stack.driver) {
    parts.push(sdkSnippet(stack.next, shownFile, from, SIMULATOR_TO));
  }
  parts.push(setup.next);
  parts.push(`Next:
  coss listen --forward-to localhost:3000/webhooks   receive webhook events locally
  coss logs tail                                     follow the environment's log
  https://coss.com/docs                              guides and the API reference`);
  return `\n${parts.join("\n\n")}`;
}

/** Whether git ignores the file: `null` outside a repository (or without git). */
async function ignoredByGit(io: CliIo, dir: string, file: string): Promise<boolean | null> {
  const code = await io.exec("git", ["check-ignore", "-q", file], { cwd: dir, quiet: true });
  return code === 0 ? true : code === 1 ? false : null;
}
