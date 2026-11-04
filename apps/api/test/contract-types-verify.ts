/**
 * Compile-time contract for Verify (see contract-types.ts): the SDK's hand-written wire types are
 * exactly the API's zod schemas.
 */
import type {
  CheckVerificationRequest,
  ListVerificationsQuery,
  StartVerificationRequest,
  UpdateVerifySettingsRequest,
  VerificationCheckObject,
  VerificationList,
  VerificationObject,
  VerificationWebhookEvent,
  VerifySettingsObject,
} from "@coss/verify/schemas";
import type {
  CheckVerificationParams,
  List,
  ListVerificationsParams,
  VerificationWebhookEvent as SdkVerificationWebhookEvent,
  StartVerificationParams,
  UpdateVerifySettingsParams,
  Verification,
  VerificationCheck,
  VerifySettings,
} from "coss";
import type { z } from "zod";

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? Equals<keyof A, keyof B>
    : false
  : false;
type Assert<T extends true> = T;

export type VerifyContract = [
  Assert<MutuallyAssignable<z.input<typeof StartVerificationRequest>, StartVerificationParams>>,
  Assert<MutuallyAssignable<z.input<typeof CheckVerificationRequest>, CheckVerificationParams>>,
  Assert<MutuallyAssignable<z.output<typeof VerificationObject>, Verification>>,
  Assert<MutuallyAssignable<z.output<typeof VerificationCheckObject>, VerificationCheck>>,
  Assert<MutuallyAssignable<z.output<typeof VerificationList>, List<Verification>>>,
  Assert<MutuallyAssignable<z.output<typeof VerifySettingsObject>, VerifySettings>>,
  Assert<
    MutuallyAssignable<z.input<typeof UpdateVerifySettingsRequest>, UpdateVerifySettingsParams>
  >,
  // List queries arrive as strings (the SDK sends numbers): only their keys must match.
  Assert<Equals<keyof z.input<typeof ListVerificationsQuery>, keyof ListVerificationsParams>>,
  Assert<
    MutuallyAssignable<z.output<typeof VerificationWebhookEvent>, SdkVerificationWebhookEvent>
  >,
];
