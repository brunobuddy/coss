/**
 * What an inbound message says about who sent it and whether a person did. `From` is whatever the
 * sender typed, so only a DMARC pass on a single From address counts as proof.
 */
export type ReceivedHeader = { name: string; value: string };

export function bareAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /<([^<>]+)>\s*$/.exec(value);
  const address = (match?.[1] ?? value).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1 || /\s/.test(address)) return null;
  return address;
}

export function displayNameOf(value: string | null | undefined): string | null {
  const match = /^\s*"?([^"<]*?)"?\s*<[^<>]+>\s*$/.exec(value ?? "");
  const name = match?.[1]?.trim();
  return name ? name.slice(0, 120) : null;
}

/** `support` and `support+<token>` at any domain routed to the support environment. */
export function supportRecipient(
  recipients: readonly string[],
): { address: string; token: string | null } | null {
  let plain: { address: string; token: null } | null = null;
  for (const recipient of recipients) {
    const address = bareAddress(recipient);
    if (!address) continue;
    const local = address.slice(0, address.lastIndexOf("@"));
    if (local === "support") plain ??= { address, token: null };
    else if (local.startsWith("support+") && local.length > "support+".length) {
      return { address, token: local.slice("support+".length) };
    }
  }
  return plain;
}

function headerValues(headers: readonly ReceivedHeader[], name: string): string[] {
  return headers.filter((header) => header.name.toLowerCase() === name).map((h) => h.value);
}

/** How many addresses the From header names: the parser keeps only the first. */
export function fromAddressCount(headers: readonly ReceivedHeader[]): number {
  return headerValues(headers, "from").reduce((count, value) => {
    const unquoted = value.replace(/"(?:[^"\\]|\\.)*"/g, "").replace(/\((?:[^()\\]|\\.)*\)/g, "");
    return count + (unquoted.match(/@/g)?.length ?? 0);
  }, 0);
}

export function isDmarcAuthenticated(input: {
  dmarcVerdict: string | null;
  headers: readonly ReceivedHeader[];
}): boolean {
  return input.dmarcVerdict === "pass" && fromAddressCount(input.headers) === 1;
}

const AUTOMATED_LOCAL_PARTS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "bounce",
  "bounces",
]);

/** Auto-responders, bounces and bulk mail: filed, but never answered and never reopening a ticket. */
export function isAutomated(input: {
  mailFrom: string;
  from: string;
  headers: readonly ReceivedHeader[];
}): boolean {
  if (input.mailFrom.trim() === "" || input.mailFrom.trim() === "<>") return true;
  const local = input.from.slice(0, input.from.lastIndexOf("@"));
  if (AUTOMATED_LOCAL_PARTS.has(local)) return true;
  const autoSubmitted = headerValues(input.headers, "auto-submitted")[0]?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = headerValues(input.headers, "precedence")[0]?.trim().toLowerCase();
  if (precedence && ["bulk", "junk", "list", "auto_reply"].includes(precedence)) return true;
  return (
    headerValues(input.headers, "list-id").length > 0 ||
    headerValues(input.headers, "x-autoreply").length > 0 ||
    headerValues(input.headers, "x-autorespond").length > 0
  );
}

/** `<id@host>`, the form stored and compared; `null` when it can't be one. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || id.length > 512) return null;
  const bare = id.replace(/^<|>$/g, "");
  return bare && !/[\s<>]/.test(bare) ? `<${bare}>` : null;
}
