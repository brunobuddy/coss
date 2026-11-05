/**
 * Organization access control (client-safe: only imports Better Auth's `access` subpaths).
 *
 * - Custom roles REPLACE Better Auth's defaults on the server, so owner/admin/member are all
 *   defined here by spreading the default role *statements* (`ownerAc.statements`, not `ownerAc`).
 * - The `apiKey` resource name and its actions are required verbatim by @better-auth/api-key for
 *   organization-owned keys.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const orgStatements = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  // `create` is what @better-auth/api-key checks for whoever creates a key, so every role that may
  // create any key holds it; members only create personal keys, in environments open to them
  // (`keyCreationAllowed` in @coss/tenancy). `manage`: organization keys, keys of other members,
  // revoking anyone's key.
  apiKey: ["create", "read", "update", "delete", "manage"],
  email: ["send", "read"],
  // An environment's email templates; `publish` makes a draft what sends use.
  emailTemplate: ["create", "read", "update", "delete", "publish"],
  // Received emails: reading them is `email:read`; deleting one (its content too) is owners/admins.
  receivedEmail: ["delete"],
  domain: ["create", "read", "verify", "delete"],
  webhook: ["create", "read", "update", "delete"],
  suppression: ["create", "read", "delete"],
  contact: ["create", "read", "update", "delete"],
  broadcast: ["create", "read", "update", "delete", "send"],
  // Email sub-accounts (email for platforms): the customer's end users, each with their own
  // domains, suppressions, quotas and reputation; `update` also reinstates a paused one.
  subaccount: ["create", "read", "update", "delete"],
  // `require` turns the organization's SSO requirement on/off: owners only, because owners keep
  // password (break-glass) access while it is on.
  sso: ["read", "update", "require"],
  // Directory sync (SCIM): connect/disconnect the directory, its tokens and group → role mappings.
  scim: ["read", "update"],
  reputation: ["read"],
  // Environment logs (API requests, email events, webhook attempts).
  log: ["read"],
  // Log drains: an environment's log streamed to an HTTPS endpoint.
  logDrain: ["create", "read", "update", "delete"],
  // The organization's audit log: owners and admins.
  audit: ["read"],
  // Risk assessments: run them (API keys), read them, report outcomes (feedback, review
  // resolutions, forgetting a user) and change the environment's risk settings (`update`).
  risk: ["assess", "read", "feedback", "update"],
  // An environment's risk allow and block lists.
  riskList: ["create", "read", "delete"],
  // An environment's risk rules.
  riskRule: ["create", "read", "update", "delete"],
  // Plan, invoices, payment methods and spend controls: owners manage, admins read.
  billing: ["read", "update"],
  // Hooks (webhooks as a service): applications, event types, endpoints, messages, portal.
  hook: ["create", "read", "update", "delete", "send"],
  // SMS: send and read messages (received ones too), an environment's SMS suppression list.
  sms: ["send", "read"],
  smsSuppression: ["create", "read", "delete"],
  // The organization's SMS senders: phone numbers, carrier registrations, allowed countries.
  smsSender: ["create", "read", "update", "delete"],
  // Sign (e-signatures): documents and signature requests (create, send, cancel, delete, read).
  sign: ["create", "read", "update", "delete", "send"],
  // Inboxes (for agents): create, rename and delete them, read their threads, send and reply.
  inbox: ["create", "read", "update", "delete", "send"],
  // Verify (one-time codes): start, check and cancel verifications, read them; `update`: settings.
  verify: ["send", "check", "read", "update"],
  // Forms (hosted form endpoints): forms, their submissions (read, release from spam, delete).
  form: ["create", "read", "update", "delete"],
  // Scheduling: hosts, event types, bookings and settings.
  scheduling: ["create", "read", "update", "delete"],
} as const;

export const orgAc = createAccessControl(orgStatements);

const fullCossAccess = {
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "update", "delete", "manage"],
  email: ["send", "read"],
  emailTemplate: ["create", "read", "update", "delete", "publish"],
  receivedEmail: ["delete"],
  domain: ["create", "read", "verify", "delete"],
  webhook: ["create", "read", "update", "delete"],
  suppression: ["create", "read", "delete"],
  contact: ["create", "read", "update", "delete"],
  broadcast: ["create", "read", "update", "delete", "send"],
  subaccount: ["create", "read", "update", "delete"],
  reputation: ["read"],
  log: ["read"],
  logDrain: ["create", "read", "update", "delete"],
  hook: ["create", "read", "update", "delete", "send"],
  risk: ["assess", "read", "feedback", "update"],
  riskList: ["create", "read", "delete"],
  riskRule: ["create", "read", "update", "delete"],
  sms: ["send", "read"],
  smsSuppression: ["create", "read", "delete"],
  smsSender: ["create", "read", "update", "delete"],
  sign: ["create", "read", "update", "delete", "send"],
  inbox: ["create", "read", "update", "delete", "send"],
  verify: ["send", "check", "read", "update"],
  form: ["create", "read", "update", "delete"],
  scheduling: ["create", "read", "update", "delete"],
} as const;

const readOnlyCossAccess = {
  project: ["read"],
  environment: ["read"],
  apiKey: ["read"],
  email: ["read"],
  emailTemplate: ["read"],
  domain: ["read"],
  webhook: ["read"],
  suppression: ["read"],
  contact: ["read"],
  broadcast: ["read"],
  subaccount: ["read"],
  reputation: ["read"],
  log: ["read"],
  logDrain: ["read"],
  hook: ["read"],
  risk: ["read"],
  riskList: ["read"],
  riskRule: ["read"],
  sms: ["read"],
  smsSuppression: ["read"],
  smsSender: ["read"],
  sign: ["read"],
  inbox: ["read"],
  verify: ["read"],
  form: ["read"],
  scheduling: ["read"],
} as const;

export const orgRoles = {
  owner: orgAc.newRole({
    ...ownerAc.statements,
    ...fullCossAccess,
    sso: ["read", "update", "require"],
    scim: ["read", "update"],
    audit: ["read"],
    billing: ["read", "update"],
  }),
  admin: orgAc.newRole({
    ...adminAc.statements,
    ...fullCossAccess,
    sso: ["read", "update"],
    scim: ["read", "update"],
    audit: ["read"],
    billing: ["read"],
  }),
  // Read-only in the dashboard, plus personal API keys where an admin allows them.
  member: orgAc.newRole({
    ...memberAc.statements,
    ...readOnlyCossAccess,
    apiKey: ["create", "read"],
  }),
};

export type OrgRole = keyof typeof orgRoles;

export type OrgPermissions = {
  [Resource in keyof typeof orgStatements]?: (typeof orgStatements)[Resource][number][];
};

/** Every static role, least privileged first (the order role pickers use). */
export const ORG_ROLES = ["member", "admin", "owner"] as const satisfies readonly OrgRole[];

/** Roles an organization admin may grant through invitations (owner is never invitable). */
export const INVITABLE_ORG_ROLES = ["admin", "member"] as const;
export type InvitableOrgRole = (typeof INVITABLE_ORG_ROLES)[number];

export function isOrgRole(name: string): name is OrgRole {
  return Object.hasOwn(orgRoles, name);
}

/** Whether a (possibly comma-joined) role string includes `name`, matched exactly. */
function hasOrgRole(role: string, name: OrgRole): boolean {
  return role.split(",").includes(name);
}

/**
 * Local permission check for a member's role string (Better Auth stores multiple roles
 * comma-joined). Static roles only — use this when the member row is already loaded.
 * Role names must match exactly: Better Auth trims them, but a padded value it never wrote
 * must gain nothing here.
 */
export function orgRoleCan(role: string | null | undefined, permissions: OrgPermissions): boolean {
  if (!role) return false;
  return role
    .split(",")
    .some((name) => isOrgRole(name) && orgRoles[name].authorize(permissions).success);
}

/**
 * Roles that a member with `actorRole` may give a member whose role is `targetRole` (empty when
 * they may not change it at all). Mirrors Better Auth's update-member-role rules so the dashboard
 * only offers what the server accepts: it needs `member:update`, and only an owner may change an
 * owner or grant owner. Better Auth additionally refuses to demote the last owner; that needs the
 * member list, so it is left to Better Auth.
 */
export function assignableOrgRoles(actorRole: string, targetRole: string): OrgRole[] {
  if (!orgRoleCan(actorRole, { member: ["update"] })) return [];
  if (hasOrgRole(actorRole, "owner")) return [...ORG_ROLES];
  if (hasOrgRole(targetRole, "owner")) return [];
  return ORG_ROLES.filter((role) => role !== "owner");
}

/**
 * Whether a member with `actorRole` may remove a member whose role is `targetRole` (someone else —
 * leaving is separate). Mirrors Better Auth's remove-member rules: it needs `member:delete`, and
 * only an owner may remove an owner. Better Auth additionally refuses to remove the last owner.
 */
export function canRemoveOrgMember(actorRole: string, targetRole: string): boolean {
  if (!orgRoleCan(actorRole, { member: ["delete"] })) return false;
  return hasOrgRole(actorRole, "owner") || !hasOrgRole(targetRole, "owner");
}
