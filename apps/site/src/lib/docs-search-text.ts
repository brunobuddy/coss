/**
 * How the docs' search reads words: both its indexes, and every query, go through `searchTokens`.
 * Search matches a query's words as prefixes of indexed ones ("webh" finds "webhook"), so a stray
 * "a" or "e" would match half the docs: short function words and single letters are dropped.
 */

const STOP_WORDS = new Set(
  (
    "an and are as at be but by can do does for from has have how i if in into is it its me my " +
    "not of on or our so than that the their them then there these this to us was we were what " +
    "when where which who why will with you your"
  ).split(" "),
);

const VOWEL = /[aeiouy]/;

/**
 * A light English stemmer, so plurals and verb forms meet: signatures/signature, bookings/booking,
 * delivered/deliver, scheduling/schedule, limits/limited/limiting. Names like `sms` and `dns` stay
 * whole. Nothing here needs to be a word, only the same for every form.
 */
export function stem(word: string): string {
  let out = word;
  if (out.length > 4 && out.endsWith("ies")) out = `${out.slice(0, -3)}y`;
  else if (out.length > 4 && out.endsWith("sses")) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith("s") && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);

  const suffix = /(ing|ed)$/.exec(out)?.[1];
  if (suffix) {
    const base = out.slice(0, -suffix.length);
    if (base.length >= 3 && VOWEL.test(base)) {
      if (base.endsWith("i")) out = `${base.slice(0, -1)}y`;
      else if (/([^aeiouls])\1$/.test(base)) out = base.slice(0, -1);
      else if (suffix === "ing" || base.length >= 4) out = base;
    }
  }
  return out.length > 4 && out.endsWith("e") ? out.slice(0, -1) : out;
}

const cache = new Map<string, string>();

function normalized(word: string): string | undefined {
  if (word.length < 2 || STOP_WORDS.has(word)) return undefined;
  let token = cache.get(word);
  if (token === undefined) {
    token = stem(word);
    cache.set(word, token);
  }
  return token;
}

/**
 * The tokens of some text, duplicates kept (the index counts them). Code splits into its words
 * (`reply_to`, `coss.sms.send`). A hyphenated or camelCase word counts as its parts and as one word,
 * so "e-signature" meets "signature" and "esignature", "sign-ups" meets "signups", `mountSigning`
 * meets "signing", and "SendGrid" meets "sendgrid".
 */
export function searchTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const chunk of text.split(/[^\p{L}\p{N}-]+/u)) {
    const parts = chunk
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .split("-")
      .filter(Boolean);
    for (const part of parts) {
      const token = normalized(part);
      if (token) tokens.push(token);
    }
    if (parts.length > 1) {
      const joined = normalized(parts.join(""));
      if (joined) tokens.push(joined);
    }
  }
  return tokens;
}

/**
 * Words people search for that a page doesn't use much. Only true synonyms and the job a page does,
 * for the pages someone starting on a product should land on; everything else ranks on its text.
 */
export const SEARCH_KEYWORDS: Readonly<Record<string, string>> = {
  "/docs/sms": "text message texting send texts",
  "/docs/verify": "one-time code otp passcode phone number verification two-factor",
  "/docs/sign": "e-signature esignature electronic signature collect signatures pdf documents",
  "/docs/sign/embedded-signing": "embed signing page iframe",
  "/docs/forms": "form endpoint form backend contact form spam",
  "/docs/scheduling": "booking appointment availability slots calendar",
  "/docs/scheduling/calendars": "connect google calendar outlook microsoft apple icloud",
  "/docs/scheduling/delegation": "domain-wide delegation service account organization-wide",
  "/docs/inboxes": "email address for an agent",
  "/docs/hooks": "send webhooks to customers users outbound webhooks as a service",
  "/docs/risk": "fraud abuse disposable email fake signups",
  "/docs/email/broadcasts": "marketing broadcast campaign newsletter",
};
