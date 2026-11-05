import type {
  SMS_NUMBER_KINDS,
  SMS_NUMBER_STATUSES,
  SMS_REGISTRATION_STATUSES,
} from "@coss/sms/schemas";

type NumberLike = {
  id: string;
  kind: (typeof SMS_NUMBER_KINDS)[number];
  status: (typeof SMS_NUMBER_STATUSES)[number];
  providerSid: string | null;
};

type RegistrationStatus = (typeof SMS_REGISTRATION_STATUSES)[number];

/**
 * Whether a number still needs its sender registered: it has no registration, or only a rejected
 * or failed one. A number being released never does.
 */
export function needsSenderRegistration(
  number: NumberLike,
  registrationStatus: RegistrationStatus | null,
): boolean {
  if (number.status === "releasing") return false;
  return (
    registrationStatus === null ||
    registrationStatus === "rejected" ||
    registrationStatus === "failed"
  );
}

/**
 * Where to register the number's sender (a path below the environment), or `null` when there is
 * nothing to register yet: local numbers send under the organization's US A2P 10DLC registration,
 * a toll-free number under its own verification (which needs the purchase settled first).
 */
export function registerSenderHref(
  number: NumberLike,
  registrationStatus: RegistrationStatus | null,
): string | null {
  if (!needsSenderRegistration(number, registrationStatus)) return null;
  if (number.kind === "local") return `/sms/numbers/register?kind=us_10dlc`;
  if (number.providerSid === null) return null;
  return `/sms/numbers/register?number=${encodeURIComponent(number.id)}`;
}

/** Where to register again after a registration was refused: the same sender it was for. */
export function registerAgainHref(registration: {
  kind: "us_10dlc" | "toll_free";
  numberId: string | null;
}): string {
  return registration.kind === "toll_free" && registration.numberId
    ? `/sms/numbers/register?number=${encodeURIComponent(registration.numberId)}`
    : `/sms/numbers/register?kind=us_10dlc`;
}
