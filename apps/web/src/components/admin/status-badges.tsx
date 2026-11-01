import { Badge } from "@coss/ui/components/badge";
import { StatusDot } from "../status-dot";

export function UserStatusBadge({ banned }: { banned: boolean }) {
  return banned ? (
    <StatusDot tone="error">Banned</StatusDot>
  ) : (
    <StatusDot tone="success">Active</StatusDot>
  );
}

export function PlatformRoleBadge({ role }: { role: string | null }) {
  const isAdmin = (role ?? "").split(",").some((name) => name.trim() === "admin");
  return <Badge variant={isAdmin ? "info" : "outline"}>{isAdmin ? "admin" : "user"}</Badge>;
}

/** The account suspension (`organization_suspension`); live-sending standing is `StandingBadge`. */
export function OrganizationStatusBadge(props: { suspended: boolean; deleting?: boolean }) {
  if (props.deleting) return <StatusDot tone="error">Deleting</StatusDot>;
  return props.suspended ? (
    <StatusDot tone="error">Account suspended</StatusDot>
  ) : (
    <StatusDot tone="success">Active</StatusDot>
  );
}
