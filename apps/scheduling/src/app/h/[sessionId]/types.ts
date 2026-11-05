import type { Branding } from "@/lib/branding";

export type HostSession = Branding & {
  read_only: boolean;
  sandbox: boolean;
  host: { id: string; name: string; time_zone: string };
  zoom_available: boolean;
};
