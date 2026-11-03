import {
  ApiIcon,
  CalendarCheckIn01Icon,
  ClipboardPenLineIcon,
  InboxIcon,
  Layers01Icon,
  Mail01Icon,
  Message01Icon,
  PasswordValidationIcon,
  RocketIcon,
  Shield01Icon,
  SignatureIcon,
  SourceCodeIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** The icons a docs section's meta.json can name (`"icon": "Mail"`). */
const SECTION_ICONS = {
  Api: ApiIcon,
  Calendar: CalendarCheckIn01Icon,
  Code: SourceCodeIcon,
  Form: ClipboardPenLineIcon,
  Inbox: InboxIcon,
  Layers: Layers01Icon,
  Mail: Mail01Icon,
  Message: Message01Icon,
  Otp: PasswordValidationIcon,
  Rocket: RocketIcon,
  Shield: Shield01Icon,
  Signature: SignatureIcon,
  Webhook: WebhookIcon,
} as const;

export function SectionIcon({ name, className }: { name?: string; className?: string }) {
  const icon =
    name && name in SECTION_ICONS ? SECTION_ICONS[name as keyof typeof SECTION_ICONS] : null;
  if (!icon) return null;
  return <HugeiconsIcon aria-hidden className={className} icon={icon} strokeWidth={2} />;
}
