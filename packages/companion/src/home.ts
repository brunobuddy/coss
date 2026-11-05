import type { MobileEnvironment } from "./index.ts";

type Product =
  | "email"
  | "marketing"
  | "inboxes"
  | "sms"
  | "verify"
  | "sign"
  | "forms"
  | "scheduling"
  | "hooks"
  | "risk";

export type HomeSeverity = "success" | "warning" | "error" | "info" | "neutral";

export type HomeAttention = {
  key: "risk" | "sign" | "email" | "webhooks" | "domains" | "scheduling";
  tone: Product | "neutral";
  severity: HomeSeverity;
  title: string;
  description: string;
};

export type HomeProduct = {
  key: Product;
  count: number;
  /** "email" / "emails". */
  one: string;
  many: string;
  /** The count covers `days` (else it's how many exist). */
  recent: boolean;
  daily: number[];
  /** "In use in Production": it's only used in another environment of the project. */
  elsewhere: string | null;
};

export type HomeActivityLine = {
  id: string;
  title: string;
  type: string | null;
  source: string;
  product: Product | null;
  severity: HomeSeverity;
  count: number;
  occurred_at: string;
};

export type EnvironmentHomeResponse = {
  project: { id: string; name: string; slug: string };
  environment: MobileEnvironment;
  days: number;
  summary: string;
  attention: HomeAttention[];
  products: HomeProduct[];
  discover: Product[];
  /** `null` when the member may not read logs. */
  activity: HomeActivityLine[] | null;
};
