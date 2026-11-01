/**
 * What kind of abuse a takedown or a sign-up report is for, in the admin console. Client-safe (no
 * imports): the dialogs list it, the actions validate against it.
 *
 * Each category maps to the coarse outcome coss.com Risk records on the sign-up assessment
 * (`fraud` or `abuse`). Both teach the same memory (the mailbox, device, IP and network are
 * flagged on later sign-ups), so the mapping is a label for calibration, not a behaviour switch;
 * the category itself is kept in the admin audit log, on the suspension, and at the start of the
 * feedback's note.
 */
export const ABUSE_CATEGORIES = {
  spam: {
    label: "Spam",
    outcome: "abuse",
    description: "Unsolicited bulk email or SMS: bought, scraped or rented lists.",
  },
  phishing: {
    label: "Phishing",
    outcome: "fraud",
    description: "Harvesting credentials or payment details with a fake login page or form.",
  },
  malware: {
    label: "Malware",
    outcome: "abuse",
    description: "Malicious attachments or links to them.",
  },
  scam: {
    label: "Scam",
    outcome: "fraud",
    description: "Advance-fee, fake shop, investment, job or romance scams.",
  },
  impersonation: {
    label: "Impersonation",
    outcome: "fraud",
    description: "Posing as another company or person: spoofed brands, lookalike domains.",
  },
  payment_fraud: {
    label: "Payment fraud",
    outcome: "fraud",
    description: "Stolen cards, chargebacks, or signing up with no intention of paying.",
  },
  fake_accounts: {
    label: "Fake or bulk accounts",
    outcome: "abuse",
    description: "Throwaway accounts, or several accounts to farm free-tier limits or credits.",
  },
  ban_evasion: {
    label: "Ban evasion",
    outcome: "abuse",
    description: "Someone banned or taken down before, back under a new account.",
  },
  harmful_content: {
    label: "Illegal or harmful content",
    outcome: "abuse",
    description:
      "Harassment, threats, extremism. Child sexual abuse material must also be reported to NCMEC.",
  },
  sanctions: {
    label: "Sanctions",
    outcome: "abuse",
    description: "A sanctioned person or entity, or use from an embargoed region.",
  },
  other: {
    label: "Other terms violation",
    outcome: "abuse",
    description: "Anything else against the terms: say what in the reason.",
  },
} as const satisfies Record<
  string,
  { label: string; outcome: "fraud" | "abuse"; description: string }
>;

export type AbuseCategory = keyof typeof ABUSE_CATEGORIES;

export const ABUSE_CATEGORY_KEYS = Object.keys(ABUSE_CATEGORIES) as AbuseCategory[];

export function isAbuseCategory(value: string): value is AbuseCategory {
  return Object.hasOwn(ABUSE_CATEGORIES, value);
}

/** The label of a stored category; unknown (retired) keys show as they are. */
export function abuseCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return isAbuseCategory(value) ? ABUSE_CATEGORIES[value].label : value;
}
