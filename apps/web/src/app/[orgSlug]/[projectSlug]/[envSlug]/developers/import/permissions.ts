import "server-only";
import type { OrgPermissions } from "@coss/auth/permissions";
import { MIGRATION_KINDS, type MigrationKind } from "@coss/migrate";

/** What each kind creates, so starting an import needs the same permissions as doing it by hand. */
const KIND_PERMISSIONS: Record<MigrationKind, OrgPermissions> = {
  domains: { domain: ["create"] },
  templates: { emailTemplate: ["create", "publish"] },
  contacts: { contact: ["create", "update"] },
  // Unsubscribe groups' members are opted out of their topic.
  suppressions: { suppression: ["create"], contact: ["update"] },
  webhooks: { webhook: ["create"] },
};

/** Connecting and canceling need `environment:update`; starting also each chosen kind's permissions. */
export function importPermissions(kinds: readonly MigrationKind[]): OrgPermissions {
  const merged: Record<string, Set<string>> = { environment: new Set(["update"]) };
  for (const kind of kinds) {
    for (const [resource, actions] of Object.entries(KIND_PERMISSIONS[kind])) {
      merged[resource] ??= new Set();
      for (const action of actions ?? []) merged[resource].add(action);
    }
  }
  return Object.fromEntries(
    Object.entries(merged).map(([resource, actions]) => [resource, [...actions]]),
  ) as OrgPermissions;
}

/** The kinds a member may import (`can` from `requireOrgMember`). */
export function startableKinds(can: (permissions: OrgPermissions) => boolean): MigrationKind[] {
  return MIGRATION_KINDS.filter((kind) => can(importPermissions([kind])));
}
