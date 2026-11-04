/**
 * What an API key may do (client-safe): the labelled catalog of `API_KEY_PERMISSIONS`, the
 * access presets the dashboard offers, and the checks a key's permissions pass at creation.
 *
 * A key has `full` access (every permission, including ones added later: they are resolved from
 * `API_KEY_PERMISSIONS` on every request) or `restricted` access (exactly the permissions it was
 * created with; never backfilled).
 */
import { API_KEY_PERMISSIONS } from "./constants.ts";
import { type OrgPermissions, orgRoleCan } from "./permissions.ts";

export type KeyPermissions = Record<string, string[]>;

export const API_KEY_ACCESS = ["full", "restricted"] as const;
export type ApiKeyAccess = (typeof API_KEY_ACCESS)[number];

export function isApiKeyAccess(value: unknown): value is ApiKeyAccess {
  return (API_KEY_ACCESS as readonly unknown[]).includes(value);
}

export type ApiKeyPermissionGroup =
  | "Email"
  | "SMS"
  | "Sign"
  | "Verify"
  | "Forms"
  | "Scheduling"
  | "Platform"
  | "Risk"
  | "Hooks"
  | "Account";

export type ApiKeyResourceInfo = {
  resource: string;
  label: string;
  group: ApiKeyPermissionGroup;
  /** What the resource's permissions cover, in a sentence. */
  description: string;
};

/** Every resource of `API_KEY_PERMISSIONS`, in the order the dashboard lists them. */
export const API_KEY_RESOURCES: readonly ApiKeyResourceInfo[] = [
  {
    resource: "email",
    label: "Emails",
    group: "Email",
    description:
      "Send, schedule and cancel emails (API, SDK and SMTP), change tracking and content storage settings; read sent and received emails, their events and those settings.",
  },
  {
    resource: "emailTemplate",
    label: "Templates",
    group: "Email",
    description: "Manage email templates and publish their versions.",
  },
  {
    resource: "receivedEmail",
    label: "Received emails",
    group: "Email",
    description: "Delete received emails (reading them needs Emails: Read).",
  },
  {
    resource: "inbox",
    label: "Inboxes",
    group: "Email",
    description:
      "Create, rename and delete inboxes; read their threads and messages, send and reply from them.",
  },
  {
    resource: "domain",
    label: "Domains",
    group: "Email",
    description: "Add, verify and remove sending domains; read them and dedicated IPs.",
  },
  {
    resource: "suppression",
    label: "Suppressions",
    group: "Email",
    description: "Manage the suppression list.",
  },
  {
    resource: "contact",
    label: "Contacts",
    group: "Email",
    description: "Manage contacts, audiences, segments and topics.",
  },
  {
    resource: "broadcast",
    label: "Broadcasts",
    group: "Email",
    description: "Manage broadcasts and send them.",
  },
  {
    resource: "subaccount",
    label: "Sub-accounts",
    group: "Email",
    description:
      "Manage sub-accounts (your users' own domains, suppressions, quotas and reputation) and reinstate paused ones; read them and their stats.",
  },
  {
    resource: "reputation",
    label: "Reputation",
    group: "Email",
    description: "Read the organization's sending reputation.",
  },
  {
    resource: "sms",
    label: "SMS",
    group: "SMS",
    description:
      "Send, schedule and cancel text messages; read sent and received messages, their events and the organization's numbers.",
  },
  {
    resource: "smsSuppression",
    label: "SMS suppressions",
    group: "SMS",
    description: "Manage the SMS suppression list.",
  },
  {
    resource: "sign",
    label: "Signature requests",
    group: "Sign",
    description:
      "Upload documents, create, send and cancel signature requests; read them, their signers and audit trails.",
  },
  {
    resource: "verify",
    label: "Verifications",
    group: "Verify",
    description:
      "Start, check and cancel verifications (one-time codes by SMS or email); read them; change Verify's settings.",
  },
  {
    resource: "form",
    label: "Forms",
    group: "Forms",
    description:
      "Create and change forms; read their submissions and files, release submissions held as spam and delete them.",
  },
  {
    resource: "scheduling",
    label: "Scheduling",
    group: "Scheduling",
    description:
      "Manage hosts, event types and settings; read availability; create, change and cancel bookings.",
  },
  {
    resource: "webhook",
    label: "Webhooks",
    group: "Platform",
    description: "Manage webhook endpoints and listeners and send test events; read deliveries.",
  },
  {
    resource: "log",
    label: "Logs",
    group: "Platform",
    description: "Read the environment's logs.",
  },
  {
    resource: "logDrain",
    label: "Log drains",
    group: "Platform",
    description: "Manage log drains.",
  },
  {
    resource: "audit",
    label: "Audit log",
    group: "Platform",
    description: "Read the organization's audit log.",
  },
  {
    resource: "risk",
    label: "Risk",
    group: "Risk",
    description:
      "Assess events and run lookups, report feedback, read assessments and change risk settings and rate limits.",
  },
  {
    resource: "riskList",
    label: "Risk lists",
    group: "Risk",
    description: "Manage allow and block lists.",
  },
  {
    resource: "riskRule",
    label: "Risk rules",
    group: "Risk",
    description: "Manage risk rules.",
  },
  {
    resource: "hook",
    label: "Hooks",
    group: "Hooks",
    description: "Manage Hooks applications, event types and endpoints; send messages.",
  },
  {
    resource: "billing",
    label: "Billing",
    group: "Account",
    description: "Read the plan, usage, invoices and credits.",
  },
];

export const API_KEY_PERMISSION_GROUPS: readonly ApiKeyPermissionGroup[] = [
  "Email",
  "SMS",
  "Sign",
  "Verify",
  "Forms",
  "Scheduling",
  "Platform",
  "Risk",
  "Hooks",
  "Account",
];

const ACTION_LABELS: Record<string, string> = {
  read: "Read",
  create: "Create",
  update: "Update",
  delete: "Delete",
  send: "Send",
  publish: "Publish",
  verify: "Verify",
  check: "Check",
  assess: "Assess",
  feedback: "Feedback",
};

export function apiKeyActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function apiKeyResourceLabel(resource: string): string {
  return API_KEY_RESOURCES.find((info) => info.resource === resource)?.label ?? resource;
}

/** The dashboard's choices. Every one but `full` creates a `restricted` key. */
export const API_KEY_PRESETS = ["full", "sending", "read_only", "custom"] as const;
export type ApiKeyPreset = (typeof API_KEY_PRESETS)[number];

export function isApiKeyPreset(value: unknown): value is ApiKeyPreset {
  return (API_KEY_PRESETS as readonly unknown[]).includes(value);
}

/** Sending only: the API's and SDK's sends and the SMTP relay. */
export const SENDING_PERMISSIONS: KeyPermissions = { email: ["send"] };

/**
 * Every `read` action of the catalog. For a personal key, pass its owner's role: the reads that
 * cover the whole organization and that the role lacks (billing, the audit log) are left out, so
 * the preset stays one the key may hold.
 */
export function readOnlyPermissions(ownerRole?: string | null): KeyPermissions {
  const reads: KeyPermissions = Object.fromEntries(
    Object.entries(API_KEY_PERMISSIONS)
      .filter(([, actions]) => actions.includes("read"))
      .map(([resource]) => [resource, ["read"]]),
  );
  return ownerRole === undefined ? reads : personalKeyPermissions(reads, ownerRole);
}

/** A key's permissions as `resource:action` strings (as in `insufficient_permissions` errors). */
export function permissionStrings(permissions: KeyPermissions): string[] {
  return Object.entries(permissions).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}`),
  );
}

/** A key's permissions to show: one line per resource, in catalog order, with action labels. */
export function permissionLines(
  permissions: KeyPermissions,
): { resource: string; label: string; actions: string[] }[] {
  const known = new Set(API_KEY_RESOURCES.map((info) => info.resource));
  return [
    ...API_KEY_RESOURCES.map((info) => info.resource),
    // Resources the catalog no longer has still show (a restricted key keeps what it stored).
    ...Object.keys(permissions).filter((resource) => !known.has(resource)),
  ]
    .filter((resource) => (permissions[resource]?.length ?? 0) > 0)
    .map((resource) => ({
      resource,
      label: apiKeyResourceLabel(resource),
      actions: (permissions[resource] ?? []).map(apiKeyActionLabel),
    }));
}

/**
 * Permissions over the whole organization rather than the key's environment. A personal key (one
 * assigned to a member) holds them only while its owner's role grants them in the dashboard, so a
 * member's key can't remove the organization's domains or read its billing.
 */
export const ORG_SCOPED_KEY_PERMISSIONS: KeyPermissions = {
  domain: ["create", "verify", "delete"],
  audit: ["read"],
  billing: ["read"],
};

function isOrgScoped(resource: string, action: string): boolean {
  return ORG_SCOPED_KEY_PERMISSIONS[resource]?.includes(action) ?? false;
}

function roleGrants(role: string | null, resource: string, action: string): boolean {
  return orgRoleCan(role, { [resource]: [action] } as OrgPermissions);
}

/**
 * What a personal key may do: its permissions without the organization-wide ones its owner's
 * current role (`null`: no longer a member) doesn't grant. Organization keys hold theirs as is.
 */
export function personalKeyPermissions(
  permissions: KeyPermissions,
  ownerRole: string | null,
): KeyPermissions {
  const limited: KeyPermissions = {};
  for (const [resource, actions] of Object.entries(permissions)) {
    const kept = actions.filter(
      (action) => !isOrgScoped(resource, action) || roleGrants(ownerRole, resource, action),
    );
    if (kept.length > 0) limited[resource] = kept;
  }
  return limited;
}

/**
 * The organization-wide permissions among `permissions` that a personal key of a member with
 * `ownerRole` could never use, as `resource:action` strings (empty when there are none).
 */
export function personalKeyExcess(permissions: KeyPermissions, ownerRole: string | null): string[] {
  return Object.entries(permissions).flatMap(([resource, actions]) =>
    actions
      .filter((action) => isOrgScoped(resource, action) && !roleGrants(ownerRole, resource, action))
      .map((action) => `${resource}:${action}`),
  );
}

export class InvalidKeyPermissionsError extends Error {}

/**
 * Checks requested permissions against the catalog and returns them deduplicated, in catalog
 * order, without empty resources. Throws `InvalidKeyPermissionsError` for an unknown resource or
 * action, or when nothing is granted (a key that can do nothing is a mistake).
 */
export function normalizeKeyPermissions(requested: KeyPermissions): KeyPermissions {
  for (const [resource, actions] of Object.entries(requested)) {
    const known = API_KEY_PERMISSIONS[resource];
    if (!known) throw new InvalidKeyPermissionsError(`Unknown permission resource: ${resource}.`);
    for (const action of actions) {
      if (!known.includes(action)) {
        throw new InvalidKeyPermissionsError(`Unknown permission: ${resource}:${action}.`);
      }
    }
  }
  const normalized: KeyPermissions = {};
  for (const [resource, known] of Object.entries(API_KEY_PERMISSIONS)) {
    const granted = known.filter((action) => requested[resource]?.includes(action));
    if (granted.length > 0) normalized[resource] = granted;
  }
  if (Object.keys(normalized).length === 0) {
    throw new InvalidKeyPermissionsError("Choose at least one permission.");
  }
  return normalized;
}

/** Parses `resource:action` strings (form values) into permissions; unknown ones are kept for validation. */
export function parsePermissionStrings(values: readonly string[]): KeyPermissions {
  const permissions: KeyPermissions = {};
  for (const value of values) {
    const [resource, action, ...rest] = value.split(":");
    if (!resource || !action || rest.length > 0) {
      throw new InvalidKeyPermissionsError(`Unknown permission: ${value}.`);
    }
    permissions[resource] = [...(permissions[resource] ?? []), action];
  }
  return permissions;
}

/**
 * How the dashboard names a key's access: `full`, or for a restricted key `sending` (exactly
 * `email:send`), `read_only` (nothing but reads) or `custom`.
 */
export function summarizeKeyAccess(
  access: ApiKeyAccess,
  permissions: KeyPermissions,
): ApiKeyPreset {
  if (access === "full") return "full";
  const granted = permissionStrings(permissions);
  if (granted.length === 1 && granted[0] === "email:send") return "sending";
  if (granted.length > 0 && granted.every((permission) => permission.endsWith(":read"))) {
    return "read_only";
  }
  return "custom";
}

export const API_KEY_PRESET_LABELS: Record<ApiKeyPreset, string> = {
  full: "Full access",
  sending: "Sending access",
  read_only: "Read only",
  custom: "Custom",
};
