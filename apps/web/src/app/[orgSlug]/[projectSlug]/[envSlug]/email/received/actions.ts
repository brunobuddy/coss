"use server";

import {
  buildTestMessage,
  deleteReceivedEmail,
  emailAddressProblem,
  inboundAddressFor,
  listEnvironmentReceivingDomains,
  receiveFakeEmail,
} from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { emailRuntime } from "@/lib/email-runtime";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { canSimulateReceiving } from "./simulate";

const MAX_TEST_SUBJECT = 200;
const MAX_TEST_BODY = 10_000;

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found;
}

function requireInbound() {
  const inbound = emailRuntime().inbound;
  if (!inbound) throw new ActionError("This deployment does not receive email.");
  return inbound;
}

/**
 * Receives a test message through the fake provider, as if it arrived for `to` (an address at
 * one of the environment's receiving domains or its inbound address). Sandbox environments, or
 * any environment while the dashboard runs the fake provider (local development).
 */
export async function simulateReceivedEmailAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      email: ["send"],
    });
    const { project, environment } = await environmentFromForm(context, formData);
    if (!canSimulateReceiving(environment.mode)) {
      throw new ActionError("Test emails can only be received by sandbox environments.");
    }
    const inbound = requireInbound();
    const to = formString(formData, "to").toLowerCase();
    const from = formString(formData, "from") || "sender@example.com";
    const subject = formString(formData, "subject").slice(0, MAX_TEST_SUBJECT) || "Test email";
    const text = formString(formData, "text").slice(0, MAX_TEST_BODY);
    for (const [field, value] of [
      ["From", from],
      ["To", to],
    ] as const) {
      const problem = emailAddressProblem(value);
      if (problem) throw new ActionError(`${field}: ${problem}`);
    }
    // Only this environment's own addresses: the simulator never writes into another one.
    const target = { organizationId: context.organization.id, environmentId: environment.id };
    const [address, receiving] = await Promise.all([
      inboundAddressFor(target, inbound.managedDomain),
      listEnvironmentReceivingDomains(target),
    ]);
    const domain = to.slice(to.lastIndexOf("@") + 1);
    if (domain !== address.domain && !receiving.some((row) => row.hostname === domain)) {
      throw new ActionError(`Send it to an address at ${address.domain}.`);
    }
    const raw = buildTestMessage({
      from,
      to: [to],
      subject,
      text: text || "This is a test email received by coss.com.",
      html: `<p>${(text || "This is a test email received by coss.com.")
        .replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
        .replaceAll("\n", "<br>")}</p>`,
    });
    const [outcome] = await receiveFakeEmail(
      { raw, mailFrom: from, recipients: [to], subject },
      { store: inbound.store, managedDomain: inbound.managedDomain },
    );
    if (!outcome) throw new ActionError(`${domain} doesn't receive email right now.`);
    if (outcome.kind === "over_limit") {
      throw new ActionError("The organization reached its daily limit of received emails.");
    }
    if (outcome.environmentId !== environment.id) {
      throw new ActionError("That address belongs to another environment.");
    }
    redirect(
      `/${context.organization.slug}/${project.slug}/${environment.slug}/email/received/${outcome.receivedEmailId}`,
    );
  });
}

/** Deletes a received email with its content right away. */
export async function deleteReceivedEmailAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      receivedEmail: ["delete"],
    });
    const { project, environment } = await environmentFromForm(context, formData);
    const id = formString(formData, "receivedEmailId");
    const deleted = await deleteReceivedEmail(
      { organizationId: context.organization.id, environmentId: environment.id, id },
      requireInbound().store,
    );
    if (!deleted) throw new ActionError("Received email not found.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      projectId: project.id,
      environmentId: environment.id,
      action: "received_email.deleted",
      target: { type: "received_email", id },
    });
    redirect(`/${context.organization.slug}/${project.slug}/${environment.slug}/email/received`);
  });
}
