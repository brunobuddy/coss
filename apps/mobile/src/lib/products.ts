import type { HomeAttention, OrganizationResponse } from "@coss/companion";
import type { ProductKey } from "@coss/dashboard-routes";
import {
  Ban,
  Bookmark,
  Bot,
  Boxes,
  Cable,
  CalendarClock,
  ClipboardList,
  ContactRound,
  Database,
  Filter,
  Gauge,
  Globe,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  ListFilter,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageSquare,
  MessageSquareReply,
  MessageSquareX,
  MousePointerClick,
  Network,
  PanelsTopLeft,
  Phone,
  Scale,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Signature,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  UsersRound,
  Waypoints,
  Webhook,
} from "lucide-react-native";

export type ProductPage = {
  label: string;
  /** Below the environment, or from the organization with `organization`. */
  path: string;
  icon: LucideIcon;
  can: keyof OrganizationResponse["can"];
  organization?: boolean;
};

// apps/web/src/lib/navigation.ts.
export const PRODUCT_ICONS: Record<ProductKey, LucideIcon> = {
  email: Mail,
  marketing: Megaphone,
  inboxes: Bot,
  sms: MessageSquare,
  verify: ShieldCheck,
  sign: Signature,
  forms: ClipboardList,
  scheduling: CalendarClock,
  hooks: Waypoints,
  risk: ShieldAlert,
};

/** Each product's pages the app has. A product with none opens on coss.com. */
export const PRODUCT_PAGES: Partial<Record<ProductKey, ProductPage[]>> = {
  email: [
    { label: "Emails", path: "emails", icon: Mail, can: "read_email" },
    { label: "Templates", path: "templates", icon: LayoutTemplate, can: "read_template" },
    { label: "Received", path: "received", icon: Inbox, can: "read_email" },
    { label: "Suppressions", path: "suppressions", icon: Ban, can: "read_suppression" },
    { label: "Tracking", path: "tracking", icon: MousePointerClick, can: "read_environment" },
    { label: "Content storage", path: "content-storage", icon: Database, can: "read_environment" },
    { label: "Domains", path: "domains", icon: Globe, can: "read_domain", organization: true },
    {
      label: "Dedicated IPs",
      path: "dedicated-ips",
      icon: Network,
      can: "read_domain",
      organization: true,
    },
    {
      label: "Reputation",
      path: "reputation",
      icon: TrendingUp,
      can: "read_reputation",
      organization: true,
    },
  ],
  sms: [
    { label: "Messages", path: "sms", icon: MessageSquare, can: "read_sms" },
    { label: "Received", path: "sms/received", icon: MessageSquareReply, can: "read_sms" },
    {
      label: "Suppressions",
      path: "sms/suppressions",
      icon: MessageSquareX,
      can: "read_sms_suppression",
    },
    { label: "Numbers", path: "sms", icon: Phone, can: "read_sms_sender", organization: true },
  ],
  marketing: [
    { label: "Broadcasts", path: "broadcasts", icon: Send, can: "read_broadcast" },
    { label: "Contacts", path: "contacts", icon: ContactRound, can: "read_contact" },
    { label: "Audiences", path: "audiences", icon: UsersRound, can: "read_contact" },
    { label: "Segments", path: "segments", icon: Filter, can: "read_contact" },
    { label: "Topics", path: "topics", icon: Bookmark, can: "read_contact" },
    { label: "Settings", path: "marketing", icon: Megaphone, can: "read_contact" },
  ],
  risk: [
    { label: "Assessments", path: "risk", icon: ShieldAlert, can: "read_risk" },
    { label: "Rules", path: "risk/rules", icon: ListFilter, can: "read_risk_rule" },
    { label: "Lists", path: "risk/lists", icon: ListChecks, can: "read_risk_list" },
    { label: "Rate limits", path: "risk/limits", icon: Gauge, can: "read_risk" },
    { label: "Calibration", path: "risk/calibration", icon: Scale, can: "read_risk" },
    { label: "Settings", path: "risk/settings", icon: SlidersHorizontal, can: "read_risk" },
  ],
  hooks: [
    { label: "Applications", path: "hooks", icon: Boxes, can: "read_hook" },
    { label: "Event types", path: "hooks/event-types", icon: Tags, can: "read_hook" },
    { label: "Portal settings", path: "hooks/settings", icon: PanelsTopLeft, can: "read_hook" },
  ],
  scheduling: [
    { label: "Bookings", path: "scheduling", icon: CalendarClock, can: "read_scheduling" },
  ],
};

export const DEVELOPER_PAGES: ProductPage[] = [
  { label: "API keys", path: "api-keys", icon: KeyRound, can: "read_api_key" },
  { label: "Webhooks", path: "webhooks", icon: Webhook, can: "read_webhook" },
  { label: "Logs", path: "logs", icon: ScrollText, can: "read_log" },
  { label: "Log drains", path: "log-drains", icon: Cable, can: "read_log_drain" },
];

/** The products whose first page is itself: they skip the hub. */
const DIRECT: Partial<Record<ProductKey, string>> = { scheduling: "scheduling" };

export function pagesFor(
  product: ProductKey,
  can: OrganizationResponse["can"] | undefined,
): ProductPage[] {
  return (PRODUCT_PAGES[product] ?? []).filter((page) => can?.[page.can] ?? false);
}

/** Where a product opens in the app, or `null` when only coss.com has it (or the member can't). */
export function productHref(
  product: ProductKey,
  base: string,
  can: OrganizationResponse["can"] | undefined,
): string | null {
  if (!PRODUCT_PAGES[product] || pagesFor(product, can).length === 0) return null;
  const direct = DIRECT[product];
  return direct ? `${base}/${direct}` : `${base}/products/${product}`;
}

export function pageHref(page: ProductPage, org: string, base: string): string {
  return page.organization ? `/${org}/${page.path}` : `${base}/${page.path}`;
}

export const ATTENTION_ICONS: Record<HomeAttention["key"], LucideIcon> = {
  risk: ShieldAlert,
  sign: Signature,
  email: Mail,
  webhooks: Webhook,
  domains: Globe,
  scheduling: CalendarClock,
};

/** Where an attention item leads in the app; Sign has no pages here and opens on coss.com. */
export function attentionHref(key: HomeAttention["key"], org: string, base: string): string | null {
  switch (key) {
    case "risk":
      return `${base}/risk`;
    case "email":
      return `${base}/emails`;
    case "webhooks":
      return `${base}/webhooks`;
    case "domains":
      return `/${org}/domains`;
    case "scheduling":
      return `${base}/scheduling`;
    case "sign":
      return null;
  }
}
