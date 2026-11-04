/**
 * What an agent should do next with this API key, for email or for one product. `describeSetup` is
 * pure: the CLI (`coss init`) and the MCP server (`get_setup`) both call `fetchSetupReport`, so the
 * answer is one shape. It describes the project's setup state, never whether a product is on in a
 * deployment. The sandbox steps follow each product's docs testing page: change them together.
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";

/** A from address a sandbox key can send with. Live keys need a verified domain instead. */
export const SANDBOX_FROM = "hello@example.com";

/** A recipient whose delivery the sandbox simulates, so `diagnose_email` has an event to explain. */
export const SIMULATOR_TO = "bounce@simulator.amazonses.com";

/** One DNS record that still blocks sending. */
export interface SetupDnsRecord {
  domain: string;
  type: string;
  name: string;
  value: string;
  status: string;
  required: boolean;
}

/** A webhook endpoint the key's environment already has. */
export interface SetupWebhookEndpoint {
  id: string;
  url: string;
  enabled: boolean;
}

/** The domain fields `describeSetup` reads. A full `Domain` is assignable to this. */
export interface SetupDomain {
  name: string;
  can_send: boolean;
  records: {
    type: string;
    name: string;
    value: string;
    status: string;
    required: boolean;
  }[];
}

/** The products `get_setup` and `coss init` can answer for. */
export const SETUP_PRODUCTS = [
  "email",
  "sms",
  "verify",
  "sign",
  "forms",
  "scheduling",
  "inboxes",
  "hooks",
  "risk",
  "marketing",
] as const;
export type SetupProduct = (typeof SETUP_PRODUCTS)[number];

/** A number's fields that decide whether it can send. A full `SmsNumber` is assignable to this. */
export interface SetupSmsNumber {
  phone_number: string;
  status: string;
  registration_status: string | null;
  can_send: boolean;
}

/** What one product's answer read. `null`: the read failed (and `warning` says so). */
export interface SetupFacts {
  sms?: { numbers: SetupSmsNumber[] | null };
  verify?: {
    settings: { sms_from: string | null; email_from: string | null } | null;
    numbers: SetupSmsNumber[] | null;
  };
  sign?: { settings: { allowed_origins: string[]; email_from: string | null } | null };
  forms?: { forms: { id: string; name: string; endpoint: string; enabled: boolean }[] | null };
  scheduling?: {
    hosts: { id: string; name: string; status: string }[] | null;
    eventTypes: { id: string; title: string; status: string }[] | null;
    /** Whether the first active host has a schedule; `null`: no host, or the read failed. */
    hostHasSchedule: boolean | null;
  };
  inboxes?: { inboxes: { id: string; address: string; can_send: boolean }[] | null };
  hooks?: {
    applications: { id: string; uid: string | null; name: string }[] | null;
    /** The first application's endpoints. */
    endpoints: { id: string; url: string; enabled: boolean }[] | null;
  };
  marketing?: {
    settings: { mailing_address: string | null } | null;
    hasContacts: boolean | null;
  };
}

/** What `describeSetup` needs. List failures stay out of here and arrive as `warning`. */
export interface SetupInput {
  mode: "sandbox" | "live" | "unknown";
  domains: SetupDomain[];
  webhookEndpoints: SetupWebhookEndpoint[];
  /** The product asked about: `next` is its step. Default: email. */
  product?: SetupProduct;
  facts?: SetupFacts;
  /** Without `product`: the products this environment has anything in. */
  productsInUse?: SetupProduct[];
  /** A list call failed. The report is still returned. */
  warning?: string;
}

/** Where one product stands in this environment. */
export interface ProductSetup {
  /** `ready`: it can be used now. `needs_setup`: `next` says what's missing. `unknown`: a read failed. */
  status: "ready" | "needs_setup" | "unknown";
  /** The single thing to do now for this product. */
  next: string;
  /** What was read: its numbers, forms, hosts… */
  details?: Record<string, unknown>;
}

/**
 * The setup answer: a from address that will succeed, DNS still missing, webhook endpoints, one
 * `next` sentence (the asked product's, else email's), and each product's readiness.
 */
export interface SetupReport {
  mode: "sandbox" | "live" | "unknown";
  /** Sandbox: `hello@example.com`. Live: `hello@<verified domain>`, or `null` until one can send. */
  from: string | null;
  missing_dns: SetupDnsRecord[];
  webhook_endpoints: SetupWebhookEndpoint[];
  next: string;
  /** Readiness of email and of the product asked about. */
  products: Partial<Record<SetupProduct, ProductSetup>>;
  /** The product `next` is about, when one was asked for. */
  product?: SetupProduct;
  /** With no product asked: the products this environment has anything in, as far as the key can read. */
  products_in_use?: SetupProduct[];
  warning?: string;
}

/**
 * The reads `get_setup` and `coss init` make. Structural for the three every answer needs, so a
 * `Coss` client satisfies it; a client without a product's resource answers `unknown` for it.
 */
export interface SetupClient
  extends Partial<
    Pick<
      Coss,
      "email" | "sms" | "verify" | "sign" | "forms" | "scheduling" | "inboxes" | "hooks" | "risk"
    >
  > {
  environment: {
    get: () => Promise<
      CossResult<{ mode: "live" | "sandbox"; api_key?: { permissions: string[] } }>
    >;
  };
  domains: {
    list: () => Promise<CossResult<{ data: SetupDomain[] }>>;
  };
  webhookEndpoints: {
    list: () => Promise<CossResult<{ data: SetupWebhookEndpoint[] }>>;
  };
}

type SetupListResult = CossResult<{ data: unknown[] }>;

/** Required DNS records that are not verified, on domains that cannot send yet. */
function missingDns(domains: SetupDomain[]): SetupDnsRecord[] {
  const missing: SetupDnsRecord[] = [];
  for (const domain of domains) {
    if (domain.can_send) continue;
    for (const record of domain.records) {
      if (!record.required || record.status === "verified") continue;
      missing.push({
        domain: domain.name,
        type: record.type,
        name: record.name,
        value: record.value,
        status: record.status,
        required: record.required,
      });
    }
  }
  return missing;
}

function chooseFrom(mode: SetupInput["mode"], domains: SetupDomain[]): string | null {
  if (mode === "sandbox" || mode === "unknown") return SANDBOX_FROM;
  const ready = domains.find((domain) => domain.can_send);
  return ready ? `hello@${ready.name}` : null;
}

function listenNote(endpoints: SetupWebhookEndpoint[]): string {
  if (endpoints.length > 0) return "";
  return (
    " No webhook endpoints yet: `npx coss-cli webhooks add <url>` registers one and saves its " +
    "signing secret, or `npx coss-cli listen` forwards events to localhost."
  );
}

function nextAction(input: SetupInput, from: string | null, missing: SetupDnsRecord[]): string {
  const listen = listenNote(input.webhookEndpoints);
  if (input.mode === "sandbox" || input.mode === "unknown") {
    return (
      `Any from address works (example ${SANDBOX_FROM}). Send to ${SIMULATOR_TO} and run ` +
      `diagnose_email (or \`npx coss-cli emails diagnose\`).${listen}`
    );
  }
  if (from) return `Ready to send from ${from}.${listen}`;
  if (missing.length > 0) {
    const names = [...new Set(missing.map((record) => record.domain))].join(", ");
    return (
      `Publish the missing required DNS records for ${names}, then verify the domain. ` +
      `A production key is a dashboard step after a domain is verified.${listen}`
    );
  }
  return (
    "Add a sending domain and publish its DNS records. A production key is a dashboard step " +
    `after a domain is verified.${listen}`
  );
}

function smsNumberFact(number: SetupSmsNumber): SetupSmsNumber {
  return {
    phone_number: number.phone_number,
    status: number.status,
    registration_status: number.registration_status,
    can_send: number.can_send,
  };
}

const unknown = (next: string): ProductSetup => ({ status: "unknown", next });

/** Sandbox steps, from each product's docs testing page. */
function smsAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  if (mode !== "live") {
    return {
      status: mode === "unknown" ? "unknown" : "ready",
      next:
        "A sandbox key sends from any number and delivers nothing. Send to the simulator: " +
        "+15005550006 (delivered), +15005550001 (invalid number), +15005550004 (filtered by the " +
        "carrier), +15005550009 (opted out) or +15005550008 (a reply); `npx coss-cli sms send " +
        "--simulate filtered` does it for you. Then run diagnose_sms (or `npx coss-cli sms " +
        "diagnose <id>`).",
    };
  }
  const numbers = facts.sms?.numbers;
  if (!numbers)
    return unknown(
      "Check the organization's numbers: list_sms_numbers (or `npx coss-cli sms numbers`).",
    );
  const ready = numbers.find((number) => number.can_send);
  const details = { numbers };
  if (ready) {
    return { status: "ready", next: `Ready to send from ${ready.phone_number}.`, details };
  }
  if (numbers.length > 0) {
    const pending = numbers
      .map(
        (n) => `${n.phone_number} (${n.status}, registration ${n.registration_status ?? "none"})`,
      )
      .join(", ");
    return {
      status: "needs_setup",
      next: `No number can send live messages yet: ${pending}. A number sends once its carrier registration is approved; registration is done in the dashboard, under SMS.`,
      details,
    };
  }
  return {
    status: "needs_setup",
    next: "Live SMS need one of the organization's numbers with an approved carrier registration. Buy and register one in the dashboard, under SMS. Develop with a sandbox key until it's approved.",
    details,
  };
}

function verifyAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  if (mode !== "live") {
    return {
      status: mode === "unknown" ? "unknown" : "ready",
      next:
        "In a sandbox the code is always zeros (000000 with the default length) and nothing is " +
        "delivered. start_verification to +15005550006 or any email address (or `npx coss-cli " +
        "verify start +15005550006`), then check_verification. +19005551234 shows the fraud guard " +
        "blocking one; diagnose_verification (or `npx coss-cli verify diagnose <id>`) explains " +
        "each outcome.",
    };
  }
  const settings = facts.verify?.settings;
  const numbers = facts.verify?.numbers;
  if (!settings) {
    return unknown(
      "Check the senders: get_verify_settings (or `npx coss-cli verify settings get`).",
    );
  }
  const details = { sms_from: settings.sms_from, email_from: settings.email_from };
  const approved = numbers?.find((number) => number.can_send);
  if (settings.sms_from === null) {
    return {
      status: "needs_setup",
      next:
        "Email codes work now. For SMS codes, set `sms_from` to one of your approved numbers " +
        `(update_verify_settings, or \`npx coss-cli verify settings set\`${approved ? `; ${approved.phone_number} can send` : "; approved numbers come from the dashboard, under SMS"}): ` +
        "with no number of its own, a live environment uses coss.com's shared numbers, which may answer `shared_sender_unavailable`.",
      details,
    };
  }
  const sender = numbers?.find((number) => number.phone_number === settings.sms_from);
  if (numbers && !sender?.can_send) {
    return {
      status: "needs_setup",
      next: `\`sms_from\` is ${settings.sms_from}, which can't send live messages now. Pick an approved number (list_sms_numbers, or \`npx coss-cli sms numbers\`) with update_verify_settings.`,
      details,
    };
  }
  return {
    status: "ready",
    next: `Ready: SMS codes go from ${settings.sms_from}. start_verification, then check_verification; pass the end user's IP address for the fraud guard.`,
    details,
  };
}

function signAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  const steps =
    "Upload a PDF (upload_sign_document, or `npx coss-cli sign upload <file.pdf>`) with anchors " +
    "like {{signature:signer_1}} to place fields, create a draft (create_sign_request, or `npx " +
    "coss-cli sign create`), then send it (send_sign_request) after the user confirms the signers.";
  if (mode !== "live") {
    return {
      status: mode === "unknown" ? "unknown" : "ready",
      next: `${steps} In a sandbox no emails reach anyone (read them in the dashboard's emails page), requests are sealed with no legal effect, and allowed_origins can include http://localhost. diagnose_sign_request (or \`npx coss-cli sign diagnose <id>\`) says who hasn't signed.`,
    };
  }
  const settings = facts.sign?.settings;
  const embedding = settings && settings.allowed_origins.length === 0;
  return {
    status: "ready",
    next: `${steps}${embedding ? " To embed the signing page, add your site to `allowed_origins` first (update_sign_settings)." : ""}`,
    ...(settings
      ? { details: { allowed_origins: settings.allowed_origins, email_from: settings.email_from } }
      : {}),
  };
}

function formsAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  const testing =
    mode === "live"
      ? ""
      : " In a sandbox a filled `_gotcha` field is marked spam (`honeypot`), and text with [coss-test:spam] is marked spam (`content`); notification and verification emails stay in the dashboard's emails page.";
  const forms = facts.forms?.forms;
  if (!forms) {
    return {
      status: "unknown",
      next: `Create a form (save_form, or \`npx coss-cli forms create <name>\`) and point a <form action> at its endpoint.${testing}`,
    };
  }
  const usable = forms.find((form) => form.enabled);
  const details = {
    forms: forms.map(({ id, name, endpoint, enabled }) => ({ id, name, endpoint, enabled })),
  };
  if (!usable) {
    return {
      status: "needs_setup",
      next:
        (forms.length > 0
          ? "Every form is disabled. Enable one, or create another"
          : "Create a form") +
        ` (save_form, or \`npx coss-cli forms create <name>\`) and point a <form action> at its endpoint.${testing}`,
      details,
    };
  }
  return {
    status: "ready",
    next: `Post to ${usable.endpoint}. diagnose_form_submission (or \`npx coss-cli forms diagnose <form> <submission>\`) explains what happened to a submission; spam is answered like a success, so the response alone doesn't tell.${testing}`,
    details,
  };
}

function schedulingAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  const testing =
    mode === "live"
      ? ""
      : " In a sandbox, nobody is emailed, and a `simulated` calendar connection (https://coss.com/docs/scheduling/testing.md) sets busy times by hand.";
  const scheduling = facts.scheduling;
  if (!scheduling?.hosts || !scheduling.eventTypes) {
    return unknown(
      `Scheduling needs a host, a schedule and an event type: list_scheduling_hosts and list_scheduling_event_types show what's there.${testing}`,
    );
  }
  const { hosts, eventTypes, hostHasSchedule } = scheduling;
  const active = hosts.filter((host) => host.status === "active");
  const details = { hosts, event_types: eventTypes, host_has_schedule: hostHasSchedule };
  if (active.length === 0) {
    return {
      status: "needs_setup",
      next: `Create a host: save_scheduling_host, then save_scheduling_schedule for their working hours and save_scheduling_event_type.${testing}`,
      details,
    };
  }
  if (hostHasSchedule === false) {
    return {
      status: "needs_setup",
      next: `${active[0]?.name} has no working hours: save_scheduling_schedule, then save_scheduling_event_type.${testing}`,
      details,
    };
  }
  const eventType = eventTypes.find((candidate) => candidate.status === "active");
  if (!eventType) {
    return {
      status: "needs_setup",
      next: `Create an event type that names the host: save_scheduling_event_type.${testing}`,
      details,
    };
  }
  return {
    status: "ready",
    next: `Ready: list_scheduling_slots for "${eventType.title}" (or \`npx coss-cli scheduling slots ${eventType.id}\`), then create_scheduling_booking. diagnose_scheduling_slots (or \`npx coss-cli scheduling diagnose ${eventType.id}\`) explains an empty list.${testing}`,
    details,
  };
}

function inboxesAnswer(mode: SetupInput["mode"], facts: SetupFacts): ProductSetup {
  const inboxes = facts.inboxes?.inboxes;
  const create = "Create one: create_inbox (or `npx coss-cli inboxes create`).";
  if (!inboxes) return unknown(create);
  const details = {
    inboxes: inboxes.map(({ id, address, can_send }) => ({ id, address, can_send })),
  };
  const [first] = inboxes;
  if (!first) {
    return {
      status: "needs_setup",
      next:
        mode === "live"
          ? `${create} An inbox at coss.com's inbound domain only receives in a live environment: to reply from it, create it at a receiving domain under a verified domain.`
          : `${create} Mail sent to a sandbox inbox is still received, so you can test the whole loop with your own mail client; sends from it deliver nothing.`,
      details,
    };
  }
  if (mode === "live" && !inboxes.some((inbox) => inbox.can_send)) {
    return {
      status: "needs_setup",
      next: `${first.address} receives but can't send: live inboxes at coss.com's inbound domain only receive. To reply, create an inbox at a receiving domain under a verified domain.`,
      details,
    };
  }
  return {
    status: "ready",
    next: `Mail to ${first.address} arrives as threads: list_inbox_threads, get_inbox_thread, then reply_to_inbox_message.`,
    details,
  };
}

function hooksAnswer(facts: SetupFacts): ProductSetup {
  const hooks = facts.hooks;
  if (!hooks?.applications) {
    return unknown(
      "Check the applications: list_hook_applications (or `npx coss-cli hooks apps list`).",
    );
  }
  const { applications, endpoints } = hooks;
  const details = { applications, endpoints };
  const [application] = applications;
  if (!application) {
    return {
      status: "needs_setup",
      next: "Hooks has no applications yet. Create one per customer: create_hook_application (or `npx coss-cli hooks apps create <name>`), then an endpoint for it (create_hook_endpoint).",
      details,
    };
  }
  if (endpoints !== null && endpoints.length === 0) {
    return {
      status: "needs_setup",
      next: `${application.name} has no endpoints, so its messages go nowhere: create_hook_endpoint (or \`npx coss-cli hooks endpoints add ${application.uid ?? application.id} --url <url>\`), or give its users the portal (create_hook_portal_session).`,
      details,
    };
  }
  return {
    status: "ready",
    next: `Send a message: send_hook_message (or \`npx coss-cli hooks send ${application.uid ?? application.id} <event-type>\`). diagnose_hook_delivery (or \`npx coss-cli hooks diagnose <app> <delivery>\`) explains a delivery.`,
    details,
  };
}

function riskAnswer(mode: SetupInput["mode"]): ProductSetup {
  return {
    status: mode === "unknown" ? "unknown" : "ready",
    next:
      mode === "live"
        ? "Ready: assess_risk (or `npx coss-cli risk assess --event signup`) on each sign-up or login, and act on `decision`. list_risk_assessments shows the review queue."
        : "In a sandbox, test inputs produce each decision: IP 192.0.2.1 (Tor), email x@disposable.test (a disposable domain), content with [coss-test:phishing], captcha token test-fail. Run assess_risk (or `npx coss-cli risk assess --event signup --ip 192.0.2.1`).",
  };
}

function marketingAnswer(
  mode: SetupInput["mode"],
  from: string | null,
  facts: SetupFacts,
): ProductSetup {
  const marketing = facts.marketing;
  if (!marketing?.settings) {
    return unknown(
      "Check the settings: get_marketing_settings. A broadcast needs a mailing address and contacts.",
    );
  }
  const details = {
    mailing_address: marketing.settings.mailing_address,
    has_contacts: marketing.hasContacts,
  };
  if (!marketing.settings.mailing_address) {
    return {
      status: "needs_setup",
      next: "Set the postal address every marketing email carries: update_marketing_settings with `mailing_address`. Broadcasts are refused without it (`mailing_address_required`).",
      details,
    };
  }
  if (mode === "live" && !from) {
    return {
      status: "needs_setup",
      next: "Broadcasts send from a verified domain: add one and publish its DNS records (add_domain, or `npx coss-cli domains add <domain>`).",
      details,
    };
  }
  if (marketing.hasContacts === false) {
    return {
      status: "needs_setup",
      next: "Add contacts: upsert_contact (or `npx coss-cli contacts add <email>`), then save_audience.",
      details,
    };
  }
  return {
    status: "ready",
    next: "save_broadcast makes a draft, send_test_broadcast tries it, and send_broadcast sends it after the user confirms the audience.",
    details,
  };
}

function describeProduct(
  product: Exclude<SetupProduct, "email">,
  mode: SetupInput["mode"],
  from: string | null,
  facts: SetupFacts,
): ProductSetup {
  switch (product) {
    case "sms":
      return smsAnswer(mode, facts);
    case "verify":
      return verifyAnswer(mode, facts);
    case "sign":
      return signAnswer(mode, facts);
    case "forms":
      return formsAnswer(mode, facts);
    case "scheduling":
      return schedulingAnswer(mode, facts);
    case "inboxes":
      return inboxesAnswer(mode, facts);
    case "hooks":
      return hooksAnswer(facts);
    case "risk":
      return riskAnswer(mode);
    case "marketing":
      return marketingAnswer(mode, from, facts);
  }
}

/** The report for one environment. List failures belong in `warning`. */
export function describeSetup(input: SetupInput): SetupReport {
  const missing = missingDns(input.domains);
  const from = chooseFrom(input.mode, input.domains);
  const emailNext = nextAction(input, from, missing);
  const products: SetupReport["products"] = {
    email: {
      status:
        input.mode === "unknown"
          ? "unknown"
          : input.mode === "sandbox" || from
            ? "ready"
            : "needs_setup",
      next: emailNext,
      details: { domains: input.domains.length, can_send: from !== null },
    },
  };
  let next = emailNext;
  if (input.product && input.product !== "email") {
    const asked = describeProduct(input.product, input.mode, from, input.facts ?? {});
    products[input.product] = asked;
    next = asked.next;
  }
  const report: SetupReport = {
    mode: input.mode,
    from,
    missing_dns: missing,
    webhook_endpoints: input.webhookEndpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      enabled: endpoint.enabled,
    })),
    next,
    products,
  };
  if (input.product) report.product = input.product;
  if (input.productsInUse) report.products_in_use = input.productsInUse;
  if (input.warning) report.warning = input.warning;
  return report;
}

/** Runs one read; a failure becomes a warning and `null`. */
async function read<T>(
  what: string,
  warnings: string[],
  call: () => Promise<CossResult<T>> | undefined,
): Promise<T | null> {
  const result = await call();
  if (!result) return null;
  if (result.error) {
    warnings.push(`Couldn't read ${what} (${result.error.message}).`);
    return null;
  }
  return result.data;
}

/** The reads one product's answer needs: at most three, none for what the mode already settles. */
async function readFacts(
  coss: SetupClient,
  product: SetupProduct,
  mode: "live" | "sandbox",
  warnings: string[],
): Promise<SetupFacts> {
  const live = mode === "live";
  const numbers = () =>
    read("the SMS numbers", warnings, () => coss.sms?.numbers.list()).then((list) =>
      list ? list.data.map(smsNumberFact) : null,
    );
  switch (product) {
    case "sms":
      return live ? { sms: { numbers: await numbers() } } : {};
    case "verify":
      if (!live) return {};
      {
        const [settings, list] = await Promise.all([
          read("the Verify settings", warnings, () => coss.verify?.settings.get()),
          numbers(),
        ]);
        return { verify: { settings, numbers: list } };
      }
    case "sign":
      if (!live) return {};
      return {
        sign: {
          settings: await read("the Sign settings", warnings, () => coss.sign?.settings.get()),
        },
      };
    case "forms": {
      const list = await read("the forms", warnings, () => coss.forms?.list({ limit: 5 }));
      return { forms: { forms: list ? list.data : null } };
    }
    case "scheduling": {
      const [hosts, eventTypes] = await Promise.all([
        read("the Scheduling hosts", warnings, () => coss.scheduling?.hosts.list({ limit: 5 })),
        read("the event types", warnings, () => coss.scheduling?.eventTypes.list({ limit: 5 })),
      ]);
      const host = hosts?.data.find((candidate) => candidate.status === "active");
      const schedules = host
        ? await read("the host's schedules", warnings, () =>
            coss.scheduling?.schedules.list(host.id),
          )
        : null;
      return {
        scheduling: {
          hosts: hosts ? hosts.data.map(({ id, name, status }) => ({ id, name, status })) : null,
          eventTypes: eventTypes
            ? eventTypes.data.map(({ id, title, status }) => ({ id, title, status }))
            : null,
          hostHasSchedule: host && schedules ? schedules.data.length > 0 : null,
        },
      };
    }
    case "inboxes": {
      const list = await read("the inboxes", warnings, () => coss.inboxes?.list({ limit: 5 }));
      return { inboxes: { inboxes: list ? list.data : null } };
    }
    case "hooks": {
      const applications = await read("the Hooks applications", warnings, () =>
        coss.hooks?.applications.list({ limit: 5 }),
      );
      const application = applications?.data[0];
      const endpoints = application
        ? await read("the application's endpoints", warnings, () =>
            coss.hooks?.endpoints.list(application.id),
          )
        : null;
      return {
        hooks: {
          applications: applications
            ? applications.data.map(({ id, uid, name }) => ({ id, uid, name }))
            : null,
          endpoints: endpoints
            ? endpoints.data.map(({ id, url, enabled }) => ({ id, url, enabled }))
            : null,
        },
      };
    }
    case "marketing": {
      const [settings, contacts] = await Promise.all([
        read("the marketing settings", warnings, () => coss.email?.marketingSettings.get()),
        read("the contacts", warnings, () => coss.email?.contacts.list({ limit: 1 })),
      ]);
      return {
        marketing: {
          settings,
          hasContacts: contacts ? contacts.data.length > 0 : null,
        },
      };
    }
    default:
      return {};
  }
}

/**
 * Which products this environment has anything in, by one small read each (the API has no single
 * read that says). Only products the key may read, and a failed read just leaves that product out:
 * a restricted key or a product that answers 503 isn't news on an email-first answer.
 */
async function readProductsInUse(
  coss: SetupClient,
  permissions: string[] | undefined,
  warnings: string[],
): Promise<SetupProduct[]> {
  const page = { limit: 1 };
  const probes: [SetupProduct, string, Promise<SetupListResult> | undefined][] = (
    [
      ["email", "email:read", () => coss.email?.list(page)],
      ["sms", "sms:read", () => coss.sms?.list(page)],
      ["verify", "verify:read", () => coss.verify?.list(page)],
      ["sign", "sign:read", () => coss.sign?.requests.list(page)],
      ["forms", "form:read", () => coss.forms?.list(page)],
      ["scheduling", "scheduling:read", () => coss.scheduling?.eventTypes.list(page)],
      ["inboxes", "inbox:read", () => coss.inboxes?.list(page)],
      ["hooks", "hook:read", () => coss.hooks?.applications.list(page)],
      ["risk", "risk:read", () => coss.risk?.assessments.list(page)],
      ["marketing", "contact:read", () => coss.email?.contacts.list(page)],
    ] as [SetupProduct, string, () => Promise<SetupListResult> | undefined][]
  )
    .filter(([, permission]) => !permissions || permissions.includes(permission))
    .map(([product, permission, call]) => [product, permission, call()]);
  const results = await Promise.all(probes.map(([, , call]) => call));
  const inUse: SetupProduct[] = [];
  let failed = 0;
  results.forEach((result, index) => {
    const product = probes[index]?.[0];
    if (result?.data && result.data.data.length > 0 && product) inUse.push(product);
    const error = result?.error;
    if (
      error &&
      error.type !== "not_found_error" &&
      error.type !== "permission_error" &&
      error.status !== 503
    ) {
      failed += 1;
    }
  });
  if (failed > 0) warnings.push("Couldn't tell which products are in use: some reads failed.");
  return inUse;
}

/**
 * Reads the environment, the first page of domains and of webhook endpoints, and what `product`
 * needs (at most three more reads); without `product`, one small read per product to list the ones
 * in use. A failed read becomes `warning` and a sandbox-shaped `next` when the mode is unknown; it
 * does not throw.
 */
export async function fetchSetupReport(
  coss: SetupClient,
  options: { product?: SetupProduct } = {},
): Promise<SetupReport> {
  const { product } = options;
  const environment = await coss.environment.get();
  if (environment.error) {
    return describeSetup({
      mode: "unknown",
      domains: [],
      webhookEndpoints: [],
      ...(product ? { product } : {}),
      warning: `Couldn't read the environment (${environment.error.message}).`,
    });
  }
  const { mode } = environment.data;
  const warnings: string[] = [];
  const [domains, endpoints, facts, productsInUse] = await Promise.all([
    coss.domains.list(),
    coss.webhookEndpoints.list(),
    product ? readFacts(coss, product, mode, warnings) : undefined,
    product ? undefined : readProductsInUse(coss, environment.data.api_key?.permissions, warnings),
  ]);
  if (domains.error) warnings.unshift(`Couldn't list domains (${domains.error.message}).`);
  if (endpoints.error) {
    warnings.splice(
      domains.error ? 1 : 0,
      0,
      `Couldn't list webhook endpoints (${endpoints.error.message}).`,
    );
  }
  return describeSetup({
    mode,
    domains: domains.data?.data ?? [],
    webhookEndpoints: (endpoints.data?.data ?? []).map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      enabled: endpoint.enabled,
    })),
    ...(product ? { product } : {}),
    ...(facts ? { facts } : {}),
    ...(productsInUse ? { productsInUse } : {}),
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
  });
}
