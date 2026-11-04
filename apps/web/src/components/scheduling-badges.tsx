import type { BookingObjectOutput } from "@coss/scheduling/schemas";
import { StatusDot, type StatusTone } from "./status-dot";

type BookingStatus = BookingObjectOutput["status"];

const BOOKING_TONE = {
  confirmed: "success",
  held: "neutral",
  pending_approval: "warning",
  cancelled: "neutral",
  declined: "neutral",
} as const satisfies Record<BookingStatus, StatusTone>;

export const BOOKING_STATUS_LABEL = {
  confirmed: "Confirmed",
  held: "Held",
  pending_approval: "Awaiting approval",
  cancelled: "Cancelled",
  declined: "Declined",
} as const satisfies Record<BookingStatus, string>;

export function BookingStatusDot({ status }: { status: BookingStatus }) {
  return <StatusDot tone={BOOKING_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</StatusDot>;
}
