import type { ReassignmentObjectOutput } from "@coss/scheduling/schemas";

export const REASSIGNMENT_STATUS: Record<
  ReassignmentObjectOutput["status"],
  { label: string; variant: "secondary" | "success" | "warning" | "outline" }
> = {
  pending: { label: "Waiting", variant: "secondary" },
  running: { label: "Running", variant: "warning" },
  completed: { label: "Finished", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const runDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
});
