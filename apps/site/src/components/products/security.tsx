import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { RetentionPeriod } from "@/components/retention";
import type { ProductShowcase } from "./types";

function SignIn() {
  return (
    <Tray flush title="Sign-in">
      <ul className="flex flex-col divide-y text-sm">
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Single sign-on</span>
            <span className="truncate text-muted-foreground">Okta, OIDC, for acme.com</span>
          </span>
          <Badge variant="success">Required</Badge>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Directory sync</span>
            <span className="truncate text-muted-foreground">SCIM 2.0, from Okta</span>
          </span>
          <StatusDot tone="success">Connected</StatusDot>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Deactivated in Okta</span>
            <span className="truncate text-muted-foreground">linus@acme.com</span>
          </span>
          <StatusDot tone="neutral">Removed, sessions ended</StatusDot>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Two-factor</span>
            <span className="truncate text-muted-foreground">Authenticator app or SSO session</span>
          </span>
          <Badge variant="success">Required</Badge>
        </li>
      </ul>
    </Tray>
  );
}

const ROLES = [
  ["Change billing, require SSO", true, false, false],
  ["Manage domains, keys and webhooks", true, true, false],
  ["Read the dashboard", true, true, true],
] as const;

function Can({ yes }: { yes: boolean }) {
  return yes ? (
    <CheckIcon aria-label="Yes" className="ms-auto size-4 text-success-foreground" />
  ) : (
    <MinusIcon aria-label="No" className="ms-auto size-4 text-muted-foreground/56" />
  );
}

function Roles() {
  return (
    <Tray flush title="Roles">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Can</TableHead>
            <TableHead className="text-right">Owner</TableHead>
            <TableHead className="text-right">Admin</TableHead>
            <TableHead className="pe-4 text-right">Member</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROLES.map(([what, owner, admin, member]) => (
            <TableRow key={what}>
              <TableCell className="whitespace-normal ps-4">{what}</TableCell>
              <TableCell>
                <Can yes={owner} />
              </TableCell>
              <TableCell>
                <Can yes={admin} />
              </TableCell>
              <TableCell className="pe-4">
                <Can yes={member} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

const STANDING = [
  ["good", "bg-success/12 text-success-foreground"],
  ["warning", "bg-warning/12 text-warning-foreground"],
  ["suspended", "bg-destructive/12 text-destructive-foreground"],
] as const;

function Standing() {
  return (
    <Tray title="Reputation">
      <div className="flex flex-col gap-3">
        <ol className="grid grid-cols-3 gap-1.5">
          {STANDING.map(([label, style]) => (
            <li
              className={cn("rounded-md px-2 py-2 text-center font-mono text-xs", style)}
              key={label}
            >
              {label}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">account.reputation_warning</Badge>
          <Badge variant="outline">account.suspended</Badge>
          <Badge variant="outline">account.reinstated</Badge>
        </div>
      </div>
    </Tray>
  );
}

const KEPT = [
  ["Sent emails", "emails"],
  ["Attachment bytes", "attachment_content"],
  ["Received emails", "received_emails"],
  ["Webhook deliveries", "webhook_deliveries"],
  ["Risk emails and IP addresses", "risk_personal_data"],
  ["Screening verdicts", "content_screenings"],
] as const;

function Retention() {
  return (
    <Tray flush title="Kept for">
      <Table>
        <TableBody>
          {KEPT.map(([label, id]) => (
            <TableRow key={id}>
              <TableCell className="ps-4">{label}</TableCell>
              <TableCell className="whitespace-normal pe-4 text-right font-mono text-xs">
                <RetentionPeriod of={id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

export const security: ProductShowcase = {
  close: "Build on a platform your security team can sign off.",
  lede: "Decide who gets in, see every change they make, and know exactly how long data is kept.",
  call: "coss.auditEvents.list()",
  stage: (
    <Replay
      events={[
        {
          name: "scim_connection.created",
          tone: "info",
          at: "09:12:40",
          detail: "jane@acme.com, in the dashboard",
        },
        {
          name: "member.role_changed",
          tone: "info",
          at: "09:14:02",
          detail: "jane@acme.com made ada@acme.com an admin",
        },
        {
          name: "api_key.created",
          tone: "info",
          at: "09:31:55",
          detail: "ada@acme.com created Mailer",
        },
        {
          name: "domain.deleted",
          tone: "warning",
          at: "10:02:17",
          detail: "the API key Backend deleted old.acme.com",
        },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Audit log</p>
          <p className="truncate text-muted-foreground text-sm">
            Every change, with its request id
          </p>
        </div>
        <Badge variant="outline">acme</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Sign-in your IT team can manage",
      body: "Connect OIDC or SAML, let your directory add and remove members, and require two-factor for everyone.",
      href: "/docs/sso",
      demo: <SignIn />,
    },
    {
      title: "Roles that are easy to explain",
      body: "Owners, admins and members, with API keys scoped to one environment.",
      href: "/docs/members-and-roles",
      demo: <Roles />,
    },
    {
      title: "Abuse watched for every sender",
      body: "Bounces and complaints set a standing, and webhooks tell your systems when it changes.",
      href: "/docs/reputation",
      demo: <Standing />,
    },
    {
      title: "A published retention policy",
      body: "Each kind of data has a period, enforced by the worker's purges.",
      href: "/docs/data-retention",
      demo: <Retention />,
    },
  ],
};
