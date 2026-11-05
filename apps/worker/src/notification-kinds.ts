import type { NotificationKinds } from "@coss/notifications";
import { SCHEDULING_NOTIFICATION_KINDS } from "@coss/scheduling";
import { SMS_NOTIFICATION_KINDS } from "@coss/sms";
import { SUPPORT_NOTIFICATION_KINDS } from "@coss/support";

/** Every product's notification kinds (`@coss/notifications`): what the `notifications` loop sends. */
export const NOTIFICATION_KINDS: NotificationKinds = {
  ...SCHEDULING_NOTIFICATION_KINDS,
  ...SMS_NOTIFICATION_KINDS,
  ...SUPPORT_NOTIFICATION_KINDS,
};
