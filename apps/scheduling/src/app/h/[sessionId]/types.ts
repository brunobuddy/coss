import type { Branding } from "@/lib/branding";

export type HostSession = Branding & {
  read_only: boolean;
  sandbox: boolean;
  host: { id: string; name: string; time_zone: string };
  zoom_available: boolean;
  /** This environment has its own OAuth app, so what's said before a consent is the customer's. */
  own_oauth_app: boolean;
  privacy_url: string | null;
};
