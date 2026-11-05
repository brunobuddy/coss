/**
 * Emails to the organization's owners and admins about a calendar delegation (`@coss/notifications`):
 * hosts have stopped being offered because access was refused, or a client secret is about to expire.
 * Hosts can't fix either, so they aren't told. Read again when sent, so stale news is skipped.
 */
import { environmentHref } from "@coss/dashboard-routes";
import { db, schema } from "@coss/db";
import type { NotificationContext, NotificationKinds } from "@coss/notifications";
import { and, eq } from "drizzle-orm";

const { environment, project, schedulingCalendarDelegation, schedulingOauthApp } = schema;

/** How long before a client secret expires its owners are warned. */
export const SECRET_WARNING_MS = 14 * 86_400_000;

async function delegationOf(context: NotificationContext) {
  const id = context.payload.delegationId;
  if (typeof id !== "string") return null;
  const [row] = await db
    .select({
      delegation: schedulingCalendarDelegation,
      projectSlug: project.slug,
      environmentSlug: environment.slug,
    })
    .from(schedulingCalendarDelegation)
    .innerJoin(environment, eq(environment.id, schedulingCalendarDelegation.environmentId))
    .innerJoin(project, eq(project.id, schedulingCalendarDelegation.projectId))
    .where(
      and(
        eq(schedulingCalendarDelegation.id, id),
        eq(schedulingCalendarDelegation.organizationId, context.organizationId),
      ),
    );
  return row ?? null;
}

async function oauthAppOf(context: NotificationContext) {
  const id = context.payload.oauthAppId;
  if (typeof id !== "string") return null;
  const [row] = await db
    .select({
      app: schedulingOauthApp,
      projectSlug: project.slug,
      environmentSlug: environment.slug,
    })
    .from(schedulingOauthApp)
    .innerJoin(environment, eq(environment.id, schedulingOauthApp.environmentId))
    .innerJoin(project, eq(project.id, schedulingOauthApp.projectId))
    .where(
      and(
        eq(schedulingOauthApp.id, id),
        eq(schedulingOauthApp.organizationId, context.organizationId),
      ),
    );
  return row ?? null;
}

const PROVIDER_NAMES = { google: "Google", microsoft: "Microsoft", zoom: "Zoom" };

const oauthAppPage = (
  context: NotificationContext,
  row: { projectSlug: string; environmentSlug: string },
) =>
  context.url(
    environmentHref(
      {
        organization: context.organization.slug,
        project: row.projectSlug,
        environment: row.environmentSlug,
      },
      "/scheduling/oauth-apps",
    ),
  );

const pageOf = (
  context: NotificationContext,
  row: { projectSlug: string; environmentSlug: string },
) =>
  context.url(
    environmentHref(
      {
        organization: context.organization.slug,
        project: row.projectSlug,
        environment: row.environmentSlug,
      },
      "/scheduling/calendar-delegation",
    ),
  );

export const SCHEDULING_NOTIFICATION_KINDS: NotificationKinds = {
  "scheduling.delegation_failing": {
    async render(context) {
      const row = await delegationOf(context);
      if (!row) return { skip: "the delegation is gone" };
      if (row.delegation.status !== "failing") return { skip: "access came back" };
      const { domain, provider } = row.delegation;
      const admin = provider === "google" ? "Google Workspace" : "Microsoft 365";
      return {
        subject: `Calendar access for ${domain} was refused`,
        blocks: [
          {
            paragraph: `${admin} refused coss.com's access to calendars on ${domain}, so hosts on that domain aren't being offered for new bookings. Existing bookings stay as they are.`,
          },
          {
            paragraph:
              "They come back by themselves once access is restored. Nobody has to reconnect anything.",
          },
          { button: { label: "See what's wrong", url: pageOf(context, row) } },
        ],
      };
    },
  },
  "scheduling.delegation_secret_expiring": {
    async render(context) {
      const row = await delegationOf(context);
      if (!row) return { skip: "the delegation is gone" };
      const expires = row.delegation.secretExpiresAt;
      // Rotated since this was queued, the secret it was about is gone.
      if (
        !expires ||
        expires < context.now ||
        expires.getTime() - context.now.getTime() > SECRET_WARNING_MS
      ) {
        return { skip: "no secret about to expire" };
      }
      const { domain } = row.delegation;
      return {
        subject: `The client secret for ${domain}'s calendars expires soon`,
        blocks: [
          {
            paragraph: `The Microsoft Entra client secret coss.com uses for calendars on ${domain} expires on ${expires.toISOString().slice(0, 10)}. When it does, hosts on that domain stop being offered for new bookings.`,
          },
          { paragraph: "Create a new secret in Entra, then paste it into coss.com." },
          { button: { label: "Update the secret", url: pageOf(context, row) } },
        ],
      };
    },
  },
  "scheduling.oauth_app_failing": {
    async render(context) {
      const row = await oauthAppOf(context);
      if (!row) return { skip: "the app is gone" };
      if (row.app.status !== "failing") return { skip: "it works again" };
      const provider = PROVIDER_NAMES[row.app.provider];
      return {
        subject: `${provider} refused your OAuth app's credentials`,
        blocks: [
          {
            paragraph: `${provider} refused the client ID and secret of your own OAuth app, so calendars connected through it can't be read. Hosts stop being offered once what's known of their calendars is out of date, and new connections are refused. Existing bookings stay as they are.`,
          },
          {
            paragraph:
              "Update the client secret, and they come back by themselves. Nobody has to reconnect anything.",
          },
          { button: { label: "Update the secret", url: oauthAppPage(context, row) } },
        ],
      };
    },
  },
  "scheduling.oauth_app_secret_expiring": {
    async render(context) {
      const row = await oauthAppOf(context);
      if (!row) return { skip: "the app is gone" };
      const expires = row.app.secretExpiresAt;
      if (
        !expires ||
        expires < context.now ||
        expires.getTime() - context.now.getTime() > SECRET_WARNING_MS
      ) {
        return { skip: "no secret about to expire" };
      }
      const provider = PROVIDER_NAMES[row.app.provider];
      return {
        subject: `The client secret of your ${provider} OAuth app expires soon`,
        blocks: [
          {
            paragraph: `The client secret of your own ${provider} OAuth app expires on ${expires.toISOString().slice(0, 10)}. When it does, calendars connected through it can't be read, and hosts stop being offered for new bookings.`,
          },
          { paragraph: `Create a new secret at ${provider}, then paste it into coss.com.` },
          { button: { label: "Update the secret", url: oauthAppPage(context, row) } },
        ],
      };
    },
  },
};
