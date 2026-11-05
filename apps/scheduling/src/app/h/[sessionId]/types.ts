import type { Branding } from "@/lib/branding";

export type HostSession = Branding & {
  read_only: boolean;
  sandbox: boolean;
  host: { id: string; name: string; time_zone: string };
  zoom_available: boolean;
  /** Whether this environment lets hosts give their own bookings to someone else. */
  can_reassign: boolean;
};
