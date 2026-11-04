/** Building and reading DMARC records (RFC 7489) as text, for the DMARC tool. No DNS, no imports. */

export const DMARC_POLICIES = ["none", "quarantine", "reject"] as const;
export type DmarcPolicy = (typeof DMARC_POLICIES)[number];

export function buildDmarcRecord({
  policy,
  rua,
  subdomainPolicy,
  strictAlignment = false,
}: {
  policy: DmarcPolicy;
  /** An address for aggregate reports, without `mailto:`. */
  rua?: string;
  subdomainPolicy?: DmarcPolicy;
  strictAlignment?: boolean;
}): string {
  return [
    "v=DMARC1",
    `p=${policy}`,
    subdomainPolicy && subdomainPolicy !== policy ? `sp=${subdomainPolicy}` : null,
    rua?.trim() ? `rua=mailto:${rua.trim()}` : null,
    strictAlignment ? "adkim=s" : null,
    strictAlignment ? "aspf=s" : null,
  ]
    .filter(Boolean)
    .join("; ")
    .concat(";");
}

const IN_POLICIES = (value: string) => (DMARC_POLICIES as readonly string[]).includes(value);
const IS_ALIGNMENT = (value: string) => value === "r" || value === "s";
const IS_MAILTO_LIST = (value: string) =>
  value.split(",").every((uri) => /^mailto:[^@\s]+@[^@\s]+(!\d+[kmgt]?)?$/i.test(uri.trim()));
const IS_INTEGER = (value: string) => /^\d+$/.test(value);

const TAGS: Record<string, { meaning: string; valid: (value: string) => boolean; expect: string }> =
  {
    v: { meaning: "The version.", valid: (v) => v === "DMARC1", expect: "DMARC1" },
    p: {
      meaning: "What receivers should do with mail that fails DMARC.",
      valid: IN_POLICIES,
      expect: "none, quarantine or reject",
    },
    sp: {
      meaning: "The same policy, for subdomains.",
      valid: IN_POLICIES,
      expect: "none, quarantine or reject",
    },
    rua: {
      meaning: "Where to send daily aggregate reports.",
      valid: IS_MAILTO_LIST,
      expect: "comma-separated mailto: addresses",
    },
    ruf: {
      meaning: "Where to send failure reports (few providers send them).",
      valid: IS_MAILTO_LIST,
      expect: "comma-separated mailto: addresses",
    },
    adkim: {
      meaning: "DKIM alignment: r allows subdomains, s needs an exact match.",
      valid: IS_ALIGNMENT,
      expect: "r or s",
    },
    aspf: {
      meaning: "SPF alignment: r allows subdomains, s needs an exact match.",
      valid: IS_ALIGNMENT,
      expect: "r or s",
    },
    pct: {
      meaning: "The percentage of failing mail the policy applies to.",
      valid: (v) => IS_INTEGER(v) && Number(v) <= 100,
      expect: "a whole number from 0 to 100",
    },
    fo: {
      meaning: "When to send failure reports.",
      valid: (v) => v.split(":").every((o) => ["0", "1", "d", "s"].includes(o.trim())),
      expect: "colon-separated 0, 1, d or s",
    },
    rf: { meaning: "The failure report format.", valid: (v) => v === "afrf", expect: "afrf" },
    ri: {
      meaning: "Seconds between aggregate reports, as a request.",
      valid: IS_INTEGER,
      expect: "a whole number of seconds",
    },
  };

export interface DmarcTag {
  name: string;
  value: string;
  meaning: string;
  problem?: string;
}

export interface DmarcReading {
  tags: DmarcTag[];
  /** What makes receivers ignore the record. */
  errors: string[];
  /** A valid record that could do more. */
  advice: string[];
}

export function readDmarcRecord(text: string): DmarcReading {
  const record = text.trim().replace(/^"|"$/g, "").replace(/"\s*"/g, "").trim();
  const parts = record
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const errors: string[] = [];
  const advice: string[] = [];
  const seen = new Set<string>();
  const tags = parts.map((part): DmarcTag => {
    const equals = part.indexOf("=");
    if (equals === -1) {
      errors.push(`"${part}" isn't a tag=value pair.`);
      return { name: part, value: "", meaning: "Not a tag=value pair." };
    }
    const name = part.slice(0, equals).trim().toLowerCase();
    const value = part.slice(equals + 1).trim();
    const known = TAGS[name];
    if (seen.has(name)) errors.push(`${name} appears twice.`);
    seen.add(name);
    if (!known) return { name, value, meaning: "Not a DMARC tag, so receivers ignore it." };
    const problem = known.valid(value) ? undefined : `Should be ${known.expect}.`;
    if (problem) errors.push(`${name}: ${problem}`);
    return { name, value, meaning: known.meaning, ...(problem ? { problem } : {}) };
  });

  if (tags[0]?.name !== "v") errors.push("A record must start with v=DMARC1.");
  if (!seen.has("p")) errors.push("A record needs a p tag.");
  else if (tags[1]?.name !== "p") errors.push("The p tag must come straight after v.");

  const value = (name: string) => tags.find((tag) => tag.name === name)?.value;
  if (value("p") === "none") {
    advice.push(
      "p=none only monitors: failing mail is still delivered. Move to quarantine, then reject, once reports show your own mail passes.",
    );
  }
  if (!seen.has("rua")) {
    advice.push("Without rua you get no reports, so you can't tell who sends as your domain.");
  }
  if (seen.has("pct") && value("pct") !== "100") {
    advice.push("pct below 100 leaves part of the failing mail outside the policy.");
  }
  return { tags, errors, advice };
}
