import { GLOBAL_FLAGS, parseFlags } from "./args.ts";
import { type Command, commandHelp, flagTable } from "./command.ts";
import { apiCommand } from "./commands/api.ts";
import { completionCommand } from "./commands/completion.ts";
import {
  domainsAddCommand,
  domainsGetCommand,
  domainsListCommand,
  domainsVerifyCommand,
} from "./commands/domains.ts";
import { emailsSendCommand } from "./commands/emails.ts";
import {
  emailsDiagnoseCommand,
  emailsEventsCommand,
  emailsGetCommand,
  emailsListCommand,
} from "./commands/emails-read.ts";
import { FORMS_COMMANDS } from "./commands/forms.ts";
import { HOOKS_COMMANDS } from "./commands/hooks.ts";
import { inboxCommand, inboxGetCommand } from "./commands/inbox.ts";
import { INBOXES_COMMANDS } from "./commands/inboxes.ts";
import { initCommand } from "./commands/init.ts";
import { listenCommand } from "./commands/listen.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand } from "./commands/logout.ts";
import { logsTailCommand } from "./commands/logs.ts";
import { MARKETING_COMMANDS } from "./commands/marketing.ts";
import { openCommand } from "./commands/open.ts";
import { profilesListCommand, useCommand } from "./commands/profiles.ts";
import { RISK_COMMANDS } from "./commands/risk.ts";
import { SCHEDULING_COMMANDS } from "./commands/scheduling.ts";
import { SIGN_COMMANDS } from "./commands/sign.ts";
import { SMS_COMMANDS } from "./commands/sms.ts";
import {
  templatesListCommand,
  templatesPreviewCommand,
  templatesPullCommand,
  templatesPushCommand,
} from "./commands/templates.ts";
import { triggerCommand } from "./commands/trigger.ts";
import { VERIFY_COMMANDS } from "./commands/verify.ts";
import {
  webhooksAddCommand,
  webhooksDeliveriesCommand,
  webhooksListCommand,
  webhooksRetryCommand,
} from "./commands/webhooks.ts";
import { whoamiCommand } from "./commands/whoami.ts";
import { complete, findCommand } from "./completion.ts";
import { createContext } from "./context.ts";
import { CliError } from "./errors.ts";
import type { CliIo } from "./io.ts";
import { Output } from "./output.ts";
import { checkForUpdate, updateCheckAllowed } from "./update-check.ts";
import { VERSION } from "./version.ts";

/** Every command, in the order `coss --help` lists them. */
export const COMMANDS: readonly Command[] = [
  loginCommand,
  logoutCommand,
  whoamiCommand,
  profilesListCommand,
  useCommand,
  initCommand,
  openCommand,
  emailsSendCommand,
  emailsListCommand,
  emailsGetCommand,
  emailsEventsCommand,
  emailsDiagnoseCommand,
  ...MARKETING_COMMANDS,
  ...SMS_COMMANDS,
  ...VERIFY_COMMANDS,
  logsTailCommand,
  inboxCommand,
  inboxGetCommand,
  ...INBOXES_COMMANDS,
  listenCommand,
  triggerCommand,
  webhooksListCommand,
  webhooksAddCommand,
  webhooksDeliveriesCommand,
  webhooksRetryCommand,
  ...HOOKS_COMMANDS,
  ...RISK_COMMANDS,
  ...SIGN_COMMANDS,
  ...FORMS_COMMANDS,
  ...SCHEDULING_COMMANDS,
  domainsListCommand,
  domainsAddCommand,
  domainsGetCommand,
  domainsVerifyCommand,
  templatesListCommand,
  templatesPullCommand,
  templatesPushCommand,
  templatesPreviewCommand,
  apiCommand,
  completionCommand,
];

/**
 * The longest group (`hooks`, `hooks apps`) the leading words of `argv` name, and the word after
 * it, for "needs a command" and "unknown command" errors.
 */
function groupOf(argv: string[]): { group: string; next: string | undefined } | null {
  const words: string[] = [];
  for (const word of argv) {
    if (word.startsWith("-")) break;
    words.push(word);
  }
  for (let length = words.length; length > 0; length--) {
    const group = words.slice(0, length).join(" ");
    if (COMMANDS.some((command) => command.name.startsWith(`${group} `))) {
      return { group, next: words[length] };
    }
  }
  return null;
}

function topHelp(): string {
  const column = Math.max(...COMMANDS.map((command) => command.name.length)) + 4;
  return `coss ${VERSION}: the coss.com command line

Usage: coss <command> [options]

Commands:
${COMMANDS.map((command) => `  ${command.name.padEnd(column - 2)}${command.summary}`).join("\n")}

Global options:
${flagTable({
  ...GLOBAL_FLAGS,
  version: { type: "boolean", short: "v", description: "The CLI's version" },
}).join("\n")}

Environment: COSS_API_KEY (use this key instead of a saved one), COSS_BASE_URL (another API,
e.g. http://localhost:3001), COSS_DASHBOARD_URL (another dashboard, for login).
Docs: https://coss.com/docs/cli
`;
}

export const HELP: string = topHelp();

/** Runs one invocation (`argv` without node and the script) and returns the exit code. */
export async function run(argv: string[], io: CliIo): Promise<number> {
  const out = new Output(io, {
    json: argv.includes("--json"),
    color: !argv.includes("--no-color"),
  });
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    out.line(HELP);
    return 0;
  }
  if (name === "--version" || name === "-v" || name === "version") {
    out.line(VERSION);
    return 0;
  }
  // What the completion scripts call; not a command anyone types.
  if (name === "__complete") {
    for (const candidate of await complete(COMMANDS, rest, io)) out.line(candidate);
    return 0;
  }
  const found = findCommand(COMMANDS, argv);
  if (!found) {
    const grouped = groupOf(argv);
    if (grouped) {
      const { group, next } = grouped;
      const depth = group.split(" ").length;
      // The group's own commands and subgroups: `coss hooks apps`, `coss hooks send`, …
      const entries = new Set(
        COMMANDS.filter((command) => command.name.startsWith(`${group} `)).map(
          (command) =>
            `\`coss ${command.name
              .split(" ")
              .slice(0, depth + 1)
              .join(" ")}\``,
        ),
      );
      out.error(
        `${next ? `Unknown command "${group} ${next}"` : `"${group}" needs a command`}: try ${[...entries].join(", ")}.`,
      );
    } else {
      out.error(`Unknown command "${name}". Run \`coss --help\` to see the commands.`);
    }
    return 2;
  }
  const { command } = found;
  // Alongside the command; printed after it only if it has its answer by then.
  const update: { notice: string | null } = { notice: null };
  if (
    !command.noUpdateNotice &&
    !argv.includes("--help") &&
    !argv.includes("-h") &&
    updateCheckAllowed(io, argv)
  ) {
    void checkForUpdate(io).then((notice) => {
      update.notice = notice;
    });
  }
  const code = await runCommand(command, argv.slice(found.length), io, out);
  if (update.notice) out.info(out.style("dim", update.notice));
  return code;
}

async function runCommand(
  command: Command,
  argv: string[],
  io: CliIo,
  out: Output,
): Promise<number> {
  try {
    const parsed = parseFlags(argv, command.flags, command.positionals);
    const context = createContext(io, parsed.global);
    if (parsed.global.help) {
      context.out.line(commandHelp(command));
      return 0;
    }
    return await command.run({ values: parsed.values, positionals: parsed.positionals, context });
  } catch (error) {
    if (error instanceof CliError) {
      out.error(error.message);
      return error.exitCode;
    }
    out.error(
      `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    return 1;
  }
}
