"use server";

import { isProductKey } from "@coss/dashboard-routes";
import {
  createDashboardTicket,
  reopenAsCustomer,
  replyAsCustomer,
  resolveAsCustomer,
  resolveSupportReference,
} from "@coss/support";
import { newTicketSchema, supportBodySchema } from "@coss/support/schemas";
import { listProjectsWithEnvironments } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { requireOrgMember } from "@/lib/session";
import { attachmentIdsOf, refuseImpersonation, supportAuthor, supportDeps } from "@/lib/support";

// Not `requireOrgPermission`: a suspended or held organization must still be able to reach us.
async function member(formData: FormData) {
  const context = await requireOrgMember(formString(formData, "orgSlug"));
  refuseImpersonation(context.session);
  return {
    context,
    author: supportAuthor(context.session),
    scope: {
      organizationId: context.organization.id,
      userId: context.session.user.id,
      role: context.member.role,
    },
  };
}

/** Only a page of this organization is kept as where the ticket was raised from. */
function contextPath(value: string, orgSlug: string): string | undefined {
  return value.startsWith(`/${orgSlug}/`) && value.length <= 300 ? value : undefined;
}

/** What the customer says the ticket is about, checked against their own organization. */
async function ticketContext(formData: FormData, organization: { id: string; slug: string }) {
  const path = contextPath(formString(formData, "from"), organization.slug);
  const environmentId = formString(formData, "environmentId");
  const product = formString(formData, "product");
  const referenceId = formString(formData, "reference");
  const projects = environmentId
    ? await listProjectsWithEnvironments({ organizationId: organization.id })
    : [];
  const owner = projects.find(({ environments }) =>
    environments.some((environment) => environment.id === environmentId),
  );
  const environment = owner?.environments.find((item) => item.id === environmentId);
  if (environmentId && !environment) throw new ActionError("Choose one of your projects.");
  if (product && !isProductKey(product)) throw new ActionError("Choose one of the products.");
  const reference = referenceId
    ? await resolveSupportReference({ organizationId: organization.id, id: referenceId })
    : null;
  if (referenceId && !reference) {
    throw new ActionError(
      "We couldn't find that item in this organization. Check the ID, or leave it out.",
    );
  }
  return {
    ...(path ? { path } : {}),
    ...(environment && owner
      ? {
          environmentId,
          projectName: owner.project.name,
          environmentName: environment.name,
        }
      : {}),
    ...(product ? { product } : {}),
    ...(reference ? { resourceType: reference.type, resourceId: reference.id } : {}),
  };
}

export async function createTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let href = "";
  const result = await runAction(async () => {
    const { context, author } = await member(formData);
    const parsed = newTicketSchema.safeParse({
      subject: formString(formData, "subject"),
      category: formString(formData, "category"),
      severity: formString(formData, "severity") || "normal",
      body: formString(formData, "body"),
    });
    if (!parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "Check the form.");
    }
    const ticket = await createDashboardTicket(
      {
        organizationId: context.organization.id,
        organizationName: context.organization.name,
        author,
        ...parsed.data,
        attachmentIds: attachmentIdsOf(formData),
        context: await ticketContext(formData, context.organization),
      },
      supportDeps,
    );
    href = `/${context.organization.slug}/support/${ticket.id}`;
    return null;
  });
  if (result.ok) redirect(href);
  return result;
}

export async function replyToTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { author, scope } = await member(formData);
    const body = supportBodySchema.safeParse(formString(formData, "body"));
    if (!body.success) throw new ActionError(body.error.issues[0]?.message ?? "Write a message.");
    await replyAsCustomer(
      {
        scope,
        ticketId: formString(formData, "ticketId"),
        author,
        body: body.data,
        attachmentIds: attachmentIdsOf(formData),
      },
      supportDeps,
    );
    refresh();
    return null;
  });
}

export async function resolveTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { author, scope } = await member(formData);
    await resolveAsCustomer({ scope, ticketId: formString(formData, "ticketId"), author });
    refresh();
    return null;
  });
}

export async function reopenTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { scope } = await member(formData);
    await reopenAsCustomer({ scope, ticketId: formString(formData, "ticketId") }, supportDeps);
    refresh();
    return null;
  });
}
