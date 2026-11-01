import type { OrgRole } from "@coss/auth/permissions";

/** How each organization role is presented in the dashboard's role pickers. */
export const ROLE_DETAILS: Record<OrgRole, { label: string; description: string }> = {
  member: { label: "Member", description: "Read-only access to projects, API keys and emails." },
  admin: { label: "Admin", description: "Manages projects, API keys, invitations and roles." },
  owner: { label: "Owner", description: "Full access, including changing other owners." },
};
