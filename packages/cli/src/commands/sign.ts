/** `coss sign …`: PDFs, signature requests and templates, on the public API. */
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type {
  CreateSignTemplateParams,
  SignRequest,
  SignRequestStatus,
  SignSettings,
  SignSigningOrder,
  SignTemplate,
  SignTemplateRole,
  SignTheme,
  UpdateSignSettingsParams,
} from "coss";
import { type Flags, pairs, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output, Style } from "../output.ts";
import {
  client,
  integerOf,
  LIMIT,
  limitOf,
  oneOf,
  orNull,
  printList,
  printOne,
  when,
} from "./list-output.ts";

const STATUSES: readonly SignRequestStatus[] = [
  "draft",
  "sent",
  "completed",
  "declined",
  "canceled",
  "expired",
];

function statusStyle(status: SignRequestStatus): Style {
  if (status === "completed") return "green";
  return status === "draft" || status === "sent" ? "yellow" : "red";
}

function printRequest(out: Output, request: SignRequest): void {
  out.line(
    `${request.id} ${out.style(statusStyle(request.status), request.status)} ${printable(request.title)}${request.sandbox ? out.style("dim", " (sandbox)") : ""}`,
  );
  for (const signer of request.signers) {
    out.line(
      `  ${signer.id}  ${printable(signer.email)}  ${signer.status}${signer.decline_reason ? `: ${printable(signer.decline_reason)}` : ""}`,
    );
  }
  if (request.signed_document) {
    out.line(
      out.style(
        "dim",
        `  Sealed ${when(request.signed_document.sealed_at)}: coss sign download ${request.id}`,
      ),
    );
  }
}

const LIST_FLAGS = {
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: "draft, sent, completed, declined, canceled or expired",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One request per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "sign list",
  summary: "List signature requests",
  description: "Lists signature requests, newest first.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const status = oneOf("--status", values.status, STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.sign.requests.list({
      ...(status && { status }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the signature requests", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No signature requests.",
      header: ["ID", "STATUS", "TITLE", "SIGNED", "CREATED"],
      row: (item) => [
        item.id,
        out.style(statusStyle(item.status), item.status),
        printable(item.title),
        `${item.signers.filter((signer) => signer.status === "signed").length}/${item.signers.length}`,
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api sign/requests --paginate` lists them all.",
    });
    return 0;
  },
});

const ONE_FLAGS = {
  json: { type: "boolean", description: "Print the request as JSON" },
} as const satisfies Flags;

function requestCommand(
  name: string,
  summary: string,
  description: string,
  failure: string,
  call: (
    coss: Awaited<ReturnType<typeof client>>,
    id: string,
  ) => ReturnType<Awaited<ReturnType<typeof client>>["sign"]["requests"]["get"]>,
): Command {
  return defineCommand({
    name: `sign ${name}`,
    summary,
    usage: "<request>",
    description,
    flags: ONE_FLAGS,
    positionals: true,
    run: async ({ positionals, context }: CommandInput<typeof ONE_FLAGS>) => {
      const [id] = requireArgs(positionals, 1, `sign ${name} <request>`) as [string];
      const { data, error } = await call(await client(context), id);
      if (error) throw apiError(failure, error);
      if (context.out.json) context.out.data(data);
      else printRequest(context.out, data);
      return 0;
    },
  });
}

const get = requestCommand(
  "get",
  "Show a signature request and where each signer stands",
  "Shows a signature request and where each signer stands.",
  "Couldn't read the signature request",
  (coss, id) => coss.sign.requests.get(id),
);
const send = requestCommand(
  "send",
  "Send a draft to its signers",
  "Sends a draft: email signers get an invitation, in signing order.",
  "Couldn't send the signature request",
  (coss, id) => coss.sign.requests.send(id),
);
const remind = requestCommand(
  "remind",
  "Email a reminder to signers who haven't signed",
  "Emails a reminder to signers of a sent request who haven't signed.",
  "Couldn't send the reminder",
  (coss, id) => coss.sign.requests.remind(id),
);
const cancel = requestCommand(
  "cancel",
  "Cancel a sent request",
  "Cancels a sent request, so signers can't sign it any more.",
  "Couldn't cancel the signature request",
  (coss, id) => coss.sign.requests.cancel(id),
);

const UPLOAD_FLAGS = {
  json: { type: "boolean", description: "Print the document as JSON" },
} as const satisfies Flags;

const upload: Command = defineCommand({
  name: "sign upload",
  summary: "Upload a PDF, and list the anchors found in it",
  usage: "<file.pdf>",
  description:
    "Uploads a PDF (at most 25 MB and 500 pages) and prints its id and the text anchors found in it.",
  flags: UPLOAD_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof UPLOAD_FLAGS>) => {
    const [file] = requireArgs(positionals, 1, "sign upload <file.pdf>") as [string];
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(context.io.cwd, file));
    } catch {
      throw new UsageError(`Couldn't read ${file}.`);
    }
    const coss = await client(context);
    const { data, error } = await coss.sign.documents.upload({
      filename: basename(file),
      content: bytes.toString("base64"),
    });
    if (error) throw apiError("Couldn't upload the document", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(
      `${out.style("green", "✔")} ${data.id} ${printable(data.filename)}, ${data.page_count} pages`,
    );
    for (const anchor of data.anchors) out.line(`  ${printable(anchor.text)}`);
    return 0;
  },
});

const SIGNER = /^(?:([a-z0-9_]+):)?\s*(.+?)\s*<([^<>\s]+)>$/;

function parseSigner(value: string): { role?: string; name: string; email: string } {
  const match = SIGNER.exec(value.trim());
  if (!match) {
    throw new UsageError(
      `--signer takes "Name <email>" (with a template, "role:Name <email>"); got "${value}".`,
    );
  }
  return {
    ...(match[1] && { role: match[1] }),
    name: match[2] as string,
    email: match[3] as string,
  };
}

const CREATE_FLAGS = {
  title: { type: "string", value: "<title>", description: "The request's title" },
  message: { type: "string", value: "<text>", description: "The invitation's message" },
  document: {
    type: "string",
    multiple: true,
    value: "<document>",
    description: "An uploaded document's id (repeatable)",
  },
  template: { type: "string", value: "<template>", description: "Make it from this template" },
  signer: {
    type: "string",
    multiple: true,
    value: '"Name <email>"',
    description: 'A signer; with --template, "role:Name <email>" (repeatable)',
  },
  merge: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "A template's merge field (repeatable)",
  },
  send: { type: "boolean", description: "Send it now instead of keeping a draft" },
  json: { type: "boolean", description: "Print the request as JSON" },
} as const satisfies Flags;

const create: Command = defineCommand({
  name: "sign create",
  summary: "Create a signature request from documents or a template",
  description:
    "Creates a draft (--send sends it). With --document, each signer gets a signature field on the anchor {{signature:signer_1}}, {{signature:signer_2}}… in the PDF: `coss api` takes any other fields.",
  flags: CREATE_FLAGS,
  run: async ({ values, context }: CommandInput<typeof CREATE_FLAGS>) => {
    if (!values.signer?.length) throw new UsageError('Pass --signer "Name <email>".');
    if (Boolean(values.template) === Boolean(values.document?.length)) {
      throw new UsageError("Pass --document <document> or --template <template>, one of them.");
    }
    const signers = values.signer.map(parseSigner);
    const coss = await client(context);
    const shared = {
      ...(values.message !== undefined && { message: values.message }),
      send: values.send === true,
    };
    let result: Awaited<ReturnType<typeof coss.sign.requests.get>>;
    if (values.template) {
      const merge = Object.fromEntries(pairs(values.merge ?? [], "merge"));
      const missing = signers.find((signer) => !signer.role);
      if (missing)
        throw new UsageError(`--signer for ${missing.email} needs a role: "role:Name <email>".`);
      result = await coss.sign.templates.createRequest(values.template, {
        ...shared,
        ...(values.title !== undefined && { title: values.title }),
        signers: signers.map((signer) => ({
          role: signer.role as string,
          name: signer.name,
          email: signer.email,
        })),
        ...(Object.keys(merge).length > 0 && { merge_fields: merge }),
      });
    } else {
      if (!values.title) throw new UsageError("Pass --title <title>.");
      result = await coss.sign.requests.create({
        ...shared,
        title: values.title,
        documents: (values.document ?? []).map((document_id) => ({ document_id })),
        signers: signers.map((signer, index) => ({
          name: signer.name,
          email: signer.email,
          fields: [{ type: "signature", anchor: `{{signature:signer_${index + 1}}}` }],
        })),
      });
    }
    if (result.error) throw apiError("Couldn't create the signature request", result.error);
    if (context.out.json) context.out.data(result.data);
    else printRequest(context.out, result.data);
    return 0;
  },
});

const DOWNLOAD_FLAGS = {
  out: { type: "string", value: "<file>", description: "Where to save it (default <request>.pdf)" },
  json: { type: "boolean", description: "Print where it was saved as JSON" },
} as const satisfies Flags;

const download: Command = defineCommand({
  name: "sign download",
  summary: "Save a completed request's sealed PDF",
  usage: "<request> [--out <file>]",
  description: "Saves the documents as signed, with their certificate pages, sealed.",
  flags: DOWNLOAD_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof DOWNLOAD_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "sign download <request>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.sign.requests.signedDocument(id);
    if (error) throw apiError("Couldn't download the signed document", error);
    const file = resolve(context.io.cwd, values.out ?? `${id}.pdf`);
    await writeFile(file, data);
    if (context.out.json) context.out.data({ id, file, size: data.byteLength });
    else context.out.line(`${context.out.style("green", "✔")} Saved ${file}`);
    return 0;
  },
});

const AUDIT_FLAGS = {
  json: { type: "boolean", description: "One event per line, as JSON" },
} as const satisfies Flags;

const audit: Command = defineCommand({
  name: "sign audit",
  summary: "Show a request's audit trail",
  usage: "<request>",
  description: "Prints every step of a request, oldest first, with where it came from.",
  flags: AUDIT_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof AUDIT_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "sign audit <request>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.sign.requests.auditTrail(id);
    if (error) throw apiError("Couldn't read the audit trail", error);
    printList(context.out, data.data, {
      empty: "No events.",
      header: ["WHEN", "EVENT", "SIGNER", "IP"],
      row: (item) => [
        when(item.occurred_at),
        item.type,
        item.signer_id ?? "",
        item.ip_address ?? "",
      ],
    });
    return 0;
  },
});

const TEMPLATES_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One template per line, as JSON" },
} as const satisfies Flags;

const templates: Command = defineCommand({
  name: "sign templates",
  summary: "List signature templates and their roles",
  description:
    "Lists reusable templates; ready ones can make requests (`coss sign create --template`). " +
    "`coss sign templates create` makes one.",
  flags: TEMPLATES_FLAGS,
  run: async ({ values, context }: CommandInput<typeof TEMPLATES_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.sign.templates.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the templates", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No templates.",
      header: ["ID", "NAME", "READY", "ROLES"],
      row: (item) => [
        item.id,
        printable(item.name),
        item.ready ? "yes" : out.style("yellow", "no"),
        item.roles.map((role) => role.key).join(", "),
      ],
    });
    return 0;
  },
});

const SIGNING_ORDERS: readonly SignSigningOrder[] = ["parallel", "sequential"];

function printTemplate(out: Output, template: SignTemplate): void {
  out.line(
    `${template.id} ${printable(template.name)}${template.ready ? "" : out.style("yellow", " (not ready)")}`,
  );
  if (template.roles.length > 0) {
    out.line(`  Roles      ${printable(template.roles.map((role) => role.key).join(", "))}`);
  }
  for (const document of template.documents) {
    out.line(`  Document   ${document.id} ${printable(document.filename)}`);
  }
  if (!template.ready) {
    out.info(
      out.style(
        "dim",
        "Requests need documents and a signature field for every role: `coss api` updates it, or use the embedded builder.",
      ),
    );
  }
}

function parseRole(value: string): SignTemplateRole {
  const index = value.indexOf(":");
  if (index <= 0) throw new UsageError(`--role takes key:Name, got "${value}".`);
  return { key: value.slice(0, index), name: value.slice(index + 1).trim() };
}

const TEMPLATES_CREATE_FLAGS = {
  title: { type: "string", value: "<title>", description: "Requests' title (default: its name)" },
  message: { type: "string", value: "<text>", description: "The invitation's message" },
  "signing-order": {
    type: "string",
    value: "<order>",
    choices: SIGNING_ORDERS,
    description: "parallel or sequential",
  },
  document: {
    type: "string",
    multiple: true,
    value: "<document>",
    description: "An uploaded document's id (repeatable)",
  },
  role: {
    type: "string",
    multiple: true,
    value: "<key:Name>",
    description: "A signer's role: client:Client (repeatable)",
  },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (fields), as JSON: inline, @file or - for stdin; the flags above " +
      "win over it",
  },
  json: { type: "boolean", description: "Print the template as JSON" },
} as const satisfies Flags;

const templatesCreate: Command = defineCommand({
  name: "sign templates create",
  summary: "Create a signature template",
  usage: "<name> [options]",
  description:
    "Creates a template, which may start empty and be built in the embedded builder. Requests can " +
    "be made from it once it has documents and a signature field for every role. Creation is " +
    "never retried, since the API doesn't deduplicate it.",
  flags: TEMPLATES_CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof TEMPLATES_CREATE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "sign templates create <name>") as [string];
    const order = oneOf("--signing-order", values["signing-order"], SIGNING_ORDERS);
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const params = {
      ...base,
      name,
      ...(values.title !== undefined && { title: values.title }),
      ...(values.message !== undefined && { message: values.message }),
      ...(order && { signing_order: order }),
      ...(values.document && {
        documents: values.document.map((document_id) => ({ document_id })),
      }),
      ...(values.role && { roles: values.role.map(parseRole) }),
    } as CreateSignTemplateParams;
    const coss = await client(context);
    const { data, error } = await coss.sign.templates.create(params);
    if (error) throw apiError("Couldn't create the template", error);
    printOne(context.out, data, printTemplate);
    return 0;
  },
});

function printSettings(out: Output, settings: SignSettings): void {
  out.line(`Display name  ${printable(settings.display_name ?? "the organization's name")}`);
  out.line(`Email from    ${printable(settings.email_from ?? "coss.com's sender")}`);
  out.line(`Theme         ${settings.theme}`);
  out.line(`Accent color  ${printable(settings.accent_color ?? "the default")}`);
  out.line(
    `Reminders     ${settings.reminder_interval_days === null ? "none" : `every ${settings.reminder_interval_days} days`}`,
  );
  out.line(
    `Origins       ${settings.allowed_origins.length > 0 ? printable(settings.allowed_origins.join(", ")) : "none"}`,
  );
  out.line(`Consent text  ${settings.disclosure ? printable(settings.disclosure) : "the default"}`);
}

const SETTINGS_FLAGS = {
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsGet: Command = defineCommand({
  name: "sign settings get",
  summary: "Show the environment's Sign settings",
  description: "Shows the name signers see, the sender, branding, reminders and embedding origins.",
  flags: SETTINGS_FLAGS,
  run: async ({ context }: CommandInput<typeof SETTINGS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.sign.settings.get();
    if (error) throw apiError("Couldn't read the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

const THEMES: readonly SignTheme[] = ["system", "light", "dark"];

const SETTINGS_SET_FLAGS = {
  "display-name": {
    type: "string",
    value: "<name>",
    description: "The requester's name signers see (default: the organization's)",
  },
  "email-from": {
    type: "string",
    value: "<address>",
    description: "The sender of signing emails, on a verified domain (default: coss.com's)",
  },
  "accent-color": { type: "string", value: "<#rrggbb>", description: "The signing page's accent" },
  theme: {
    type: "string",
    value: "<theme>",
    choices: THEMES,
    description: "system, light or dark",
  },
  disclosure: {
    type: "string",
    value: "<text>",
    description: "Your own consent text (default: coss.com's)",
  },
  "reminder-days": {
    type: "string",
    value: "<n>",
    description: "Default days between reminders for new requests, 1-30 (default: none)",
  },
  origin: {
    type: "string",
    multiple: true,
    value: "<origin>",
    description: "An origin that may embed the signing page, replacing the list (repeatable)",
  },
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsSet: Command = defineCommand({
  name: "sign settings set",
  summary: "Change the environment's Sign settings",
  description: "Changes the settings given; the word default goes back to the default value.",
  flags: SETTINGS_SET_FLAGS,
  run: async ({ values, context }: CommandInput<typeof SETTINGS_SET_FLAGS>) => {
    const theme = oneOf("--theme", values.theme, THEMES);
    const reminder = values["reminder-days"];
    const params: UpdateSignSettingsParams = {
      ...(values["display-name"] !== undefined && {
        display_name: orNull(values["display-name"]),
      }),
      ...(values["email-from"] !== undefined && { email_from: orNull(values["email-from"]) }),
      ...(values["accent-color"] !== undefined && { accent_color: orNull(values["accent-color"]) }),
      ...(theme && { theme }),
      ...(values.disclosure !== undefined && { disclosure: orNull(values.disclosure) }),
      ...(reminder !== undefined && {
        reminder_interval_days:
          reminder === "default" ? null : integerOf("--reminder-days", reminder),
      }),
      ...(values.origin && { allowed_origins: values.origin }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one setting to change (coss sign settings set --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.sign.settings.update(params);
    if (error) throw apiError("Couldn't change the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

export const SIGN_COMMANDS: readonly Command[] = [
  list,
  get,
  upload,
  create,
  send,
  remind,
  cancel,
  download,
  audit,
  templates,
  { ...templates, name: "sign templates list" },
  templatesCreate,
  settingsGet,
  settingsSet,
];
