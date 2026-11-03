# packages/support — coss.com's support desk

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

Customers email `support@coss.com` or raise a ticket in the dashboard (`/<org>/support`); reps answer
from the admin console (`/admin/support`). Tables in `packages/db/src/schema/support.ts` (ids `ticket_`,
`tmsg_`, `tatt_`, `tsaved_`). Reps are platform admins.

- **Mail route.** `coss.com`'s MX is Google Workspace and stays there: a Workspace routing rule rewrites
  the envelope of `support@coss.com` to `support@<SUPPORT_REPLY_DOMAIN>` (a receiving domain of
  `SUPPORT_ENVIRONMENT_ID`, a live environment of coss.com's own organization). Sends go through
  `apps/worker/src/support-mailer.ts` from `SUPPORT_FROM_ADDRESS`, with `Reply-To:
  support+<reply_token>@<SUPPORT_REPLY_DOMAIN>`, so replies reach SES directly with their signatures
  intact. It's its own environment because suppressions are per environment: a complaint about a reply
  must never block password resets.
- **Intake** (`intake.ts`, the worker's `support` loop). Reads `received_email` rows of that environment
  and records each in `support_intake`; it never hooks into `receiveEmail`, so nothing here can affect
  another customer's mail. A message that keeps failing is retried `MAX_INTAKE_ATTEMPTS` times, reported
  and set aside. A ticket keeps its own copy of the text and attachments: `received_email` is purged
  after 30 days, emails after 45, and `support_message` holds plain references to them, no FKs.
- **Threading.** `reply_token` in the envelope recipient, then `In-Reply-To`/`References` against stored
  Message-IDs, else a new ticket. Never by subject, and never by the `[#1042]` in a subject: that is
  display, and matching on it would let anyone write into a ticket.
- **Identity: a match never grants access by itself.** `From` is whatever the sender typed.
  - `organization_id` is a **confirmed** link and controls what customers see. `suggested_organization_id`
    is provisional: it sets the SLA and tells the rep who it might be, nothing more.
  - Confirmed only by a session, or a DMARC pass on a single From address from a **verified** account
    in exactly one organization (`matching.ts`), or a rep. Anyone can sign up with someone else's address,
    so an unverified account matches nothing. Domains and prior tickets only suggest.
  - Trust is per message (`sender_auth`). An unverified message, or one from someone who isn't on the
    ticket, stays rep-only (`customer_visible`) even on a confirmed ticket: a leaked token or Message-ID
    must not let someone post into it.
  - Always reply to `From`; inbound `Reply-To` is ignored. Inbound Cc joins replies only from an
    authenticated participant; otherwise it waits in `suggested_cc` for a rep. Otherwise a forged message
    could copy an attacker on the reply.
  - Acknowledgements go only to authenticated, non-spam senders: no backscatter.
- **Customers' reads** (`tickets.ts`) always go through `visibleTo`: the organization, and the requester
  unless the role is owner or admin. Notes, internal events and rep-only messages never leave that module,
  and a rep is only a first name. `@coss/support/admin` is platform-level: call it only after
  `requirePlatformAdmin*`, and record `support.*` admin audit events.
- **The clock.** Targets are `SUPPORT_TIERS` (`@coss/billing/catalog`), the one source for pricing, docs,
  dashboard and SLA. `responseDueAt` (`sla.ts`) counts `SUPPORT_HOURS` in `America/Chicago`; a contract's
  `terms.support.allHours` runs it 24x7 (no paging exists: don't sell that until it does). It starts when
  a customer speaks (`awaiting_since`), stops on a rep's reply, and recalculates from `awaiting_since` when
  the plan, organization or severity changes. No holiday calendar. The plan is copied onto the ticket, so
  the queue needs no billing reads. `@coss/support` imports only `@coss/billing/catalog`; the plan lookup
  (`supportPlanAt`) is injected.
- **Sending** (`delivery.ts`). `support_message.delivery_status` is the outbox: `pending` → `accepted`
  (the email exists) → `delivered`/`bounced`/`failed`. `send` only queues, so `syncSupportDeliveries`
  follows the email row and copies its outcome and Message-ID while it exists. Sends carry a stable
  `requestHash`, since `References` can grow between retries. `screeningExempt`: a flagged rep reply must
  not raise scrutiny on coss.com's own mail. Bodies are `parseSupportText` blocks (`format.ts`): text,
  never markup. Rep alerts are `SUPPORT_NOTIFICATION_KINDS` on `@coss/notifications`.
- **Attachments** (`store.ts`): S3 (`SUPPORT_FILES_BUCKET`), the fake store outside production. Uploads go
  through `/api/support/attachments` (a route handler: server actions stop at 3 MB, and
  `proxyClientMaxBodySize` is 11 MB) and are claimed by the message sent with them, only by their uploader.
  Downloads are always `attachment` + `nosniff` + `CSP: sandbox` (`RECEIVED_CONTENT_PATHS`). Received
  attachments are copied in by the loop, since their bytes expire with the received email.
- **Deletion and retention.** Organization and user FKs are `ON DELETE SET NULL` and the organization's
  name is copied: tickets outlive both until `RETENTION_DAYS.supportTickets` after they're resolved
  (`supportSpam` for filtered mail). Purges run in the `support` loop, not `retention`: they need the file
  store. Bytes go first, so a crash can't orphan them.
- **Before relying on the Google hop in production**, send test mail from Gmail, Workspace, Microsoft 365
  and an SPF-only domain: rerouting breaks SPF, so DMARC has to pass on DKIM. Check the system
  organization's `email.inbound.day` too: it's charged before the spam verdict and overflow is dropped.
