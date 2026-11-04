/** Who may send live SMS from which number, and the provider route a message takes. */
import { isOnBillingHold } from "@coss/billing/metering";
import { db, schema } from "@coss/db";
import { isSuspended } from "@coss/reputation";
import { and, eq } from "drizzle-orm";
import { isHighRiskSmsCountry, TOLL_FREE_SMS_COUNTRIES } from "./countries.ts";
import { SmsError } from "./errors.ts";
import type { OutboundSms } from "./provider.ts";

const { smsAccount, smsNumber, smsRegistration } = schema;

export type SmsRoute = NonNullable<OutboundSms["route"]>;

export type LiveSender = { numberId: string; route: SmsRoute };

/** The number, its registration and the organization's account, by number id or phone number. */
async function senderRows(organizationId: string, where: { id?: string; phoneNumber?: string }) {
  const [row] = await db
    .select({ number: smsNumber, registration: smsRegistration, account: smsAccount })
    .from(smsNumber)
    .leftJoin(
      smsRegistration,
      and(
        eq(smsRegistration.id, smsNumber.registrationId),
        eq(smsRegistration.organizationId, smsNumber.organizationId),
      ),
    )
    .leftJoin(smsAccount, eq(smsAccount.organizationId, smsNumber.organizationId))
    .where(
      and(
        eq(smsNumber.organizationId, organizationId),
        where.id ? eq(smsNumber.id, where.id) : undefined,
        where.phoneNumber ? eq(smsNumber.phoneNumber, where.phoneNumber) : undefined,
      ),
    )
    .limit(1);
  return row;
}

/**
 * Checks that a live message may go from `from` to a number in `toCountry`, in this order: the
 * organization isn't suspended or on a billing hold, `from` is one of its active numbers whose
 * registration is approved (with the live provider), and the country is allowed (toll-free numbers
 * only reach the US and Canada). Returns the route the provider sends it by.
 */
export async function authorizeLiveSmsSender(input: {
  organizationId: string;
  from: string;
  toCountry: string;
  provider: string;
}): Promise<LiveSender> {
  if (await isSuspended(input.organizationId)) {
    throw new SmsError(
      "account_suspended",
      "Live sending is suspended for this organization because of its sending reputation. " +
        "Sandbox keys still work. Contact support to resume.",
    );
  }
  if (await isOnBillingHold(input.organizationId)) {
    throw new SmsError(
      "billing_hold",
      "Live sending is paused for this organization: an invoice is overdue or its spend or " +
        "credit limit was reached. Sandbox keys still work. See the organization's billing settings.",
    );
  }
  const row = await senderRows(input.organizationId, { phoneNumber: input.from });
  if (!row) {
    throw new SmsError(
      "sender_not_found",
      `${input.from} isn't one of your organization's phone numbers. Add one in the dashboard, under SMS.`,
      { param: "from" },
    );
  }
  const { number, registration, account } = row;
  if (
    number.status !== "active" ||
    number.provider !== input.provider ||
    registration?.status !== "approved" ||
    !account ||
    account.status !== "active"
  ) {
    throw new SmsError(
      "sender_not_ready",
      `${input.from} can't send yet: its carrier registration isn't approved.`,
      { param: "from" },
    );
  }
  const allowed =
    account.allowedCountries.includes(input.toCountry) &&
    (!isHighRiskSmsCountry(input.toCountry) || account.unlockedCountries.includes(input.toCountry));
  if (!allowed) {
    throw new SmsError(
      "country_not_allowed",
      `SMS to ${input.toCountry} isn't allowed for your organization. Owners and admins can allow countries in the dashboard, under SMS.`,
      { param: "to" },
    );
  }
  if (number.kind === "toll_free" && !TOLL_FREE_SMS_COUNTRIES.includes(input.toCountry)) {
    throw new SmsError(
      "country_not_allowed",
      "Toll-free numbers can only send to the United States and Canada.",
      { param: "to" },
    );
  }
  return {
    numberId: number.id,
    route: {
      accountSid: account.subaccountSid ?? "",
      messagingServiceSid: registration.messagingServiceSid,
    },
  };
}

/** The route of a number, without the policy checks (a message already accepted). */
export async function senderRoute(
  organizationId: string,
  numberId: string,
): Promise<SmsRoute | null> {
  const row = await senderRows(organizationId, { id: numberId });
  if (!row?.account || row.number.status === "releasing") return null;
  return {
    accountSid: row.account.subaccountSid ?? "",
    messagingServiceSid: row.registration?.messagingServiceSid ?? null,
  };
}
