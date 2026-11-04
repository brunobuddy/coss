import {
  BotIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  GaugeIcon,
  InboxIcon,
  LayersIcon,
  type LucideIcon,
  MailIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PlugIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SignatureIcon,
  SparklesIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react";

/** A product's colour: the same tones as the dashboard's product tiles (`product-glyph.tsx`). */
export type ProductTone =
  | "email"
  | "marketing"
  | "inboxes"
  | "sms"
  | "verify"
  | "sign"
  | "forms"
  | "scheduling"
  | "hooks"
  | "risk"
  | "neutral";

export const TILE_TONES: Record<ProductTone, string> = {
  email: "bg-orange-500/12 text-orange-600 ring-orange-500/20 dark:text-orange-400",
  marketing: "bg-pink-500/12 text-pink-600 ring-pink-500/20 dark:text-pink-400",
  inboxes: "bg-violet-500/12 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  sms: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  verify: "bg-sky-500/12 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  sign: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/20 dark:text-indigo-400",
  forms: "bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  scheduling: "bg-blue-500/12 text-blue-600 ring-blue-500/20 dark:text-blue-400",
  hooks: "bg-teal-500/12 text-teal-600 ring-teal-500/20 dark:text-teal-400",
  risk: "bg-rose-500/12 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  neutral: "bg-muted text-muted-foreground ring-border",
};

/** Every product page's tile: its icon and tone, the dashboard's where it has one. */
export const PRODUCT_VISUALS: Record<string, { icon: LucideIcon; tone: ProductTone }> = {
  email: { icon: MailIcon, tone: "email" },
  "marketing-email": { icon: MegaphoneIcon, tone: "marketing" },
  inboxes: { icon: BotIcon, tone: "inboxes" },
  "inbound-email": { icon: InboxIcon, tone: "email" },
  subaccounts: { icon: UsersIcon, tone: "email" },
  smtp: { icon: ServerIcon, tone: "email" },
  sms: { icon: MessageSquareIcon, tone: "sms" },
  verify: { icon: ShieldCheckIcon, tone: "verify" },
  sign: { icon: SignatureIcon, tone: "sign" },
  forms: { icon: ClipboardListIcon, tone: "forms" },
  scheduling: { icon: CalendarClockIcon, tone: "scheduling" },
  hooks: { icon: WaypointsIcon, tone: "hooks" },
  risk: { icon: ShieldAlertIcon, tone: "risk" },
  "rate-limiting": { icon: GaugeIcon, tone: "risk" },
  platform: { icon: LayersIcon, tone: "neutral" },
  security: { icon: ShieldIcon, tone: "neutral" },
  agents: { icon: SparklesIcon, tone: "neutral" },
  sdks: { icon: CodeXmlIcon, tone: "neutral" },
};

const FALLBACK = { icon: PlugIcon, tone: "neutral" as const };

export function productVisual(slug: string): { icon: LucideIcon; tone: ProductTone } {
  return PRODUCT_VISUALS[slug] ?? FALLBACK;
}
