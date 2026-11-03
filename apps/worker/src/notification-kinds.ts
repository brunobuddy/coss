import type { NotificationKinds } from "@coss/notifications";
import { SMS_NOTIFICATION_KINDS } from "@coss/sms";
import { SUPPORT_NOTIFICATION_KINDS } from "@coss/support";

/** Every product's notification kinds (`@coss/notifications`): what the `notifications` loop sends. */
export const NOTIFICATION_KINDS: NotificationKinds = {
  ...SMS_NOTIFICATION_KINDS,
  ...SUPPORT_NOTIFICATION_KINDS,
};
