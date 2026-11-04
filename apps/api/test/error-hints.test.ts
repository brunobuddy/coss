import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HIPAA_MODE_RESTRICTION } from "@coss/compliance";
import { HookError } from "@coss/hooks";
import { SignError } from "@coss/sign";
import { WebhookError } from "@coss/webhooks";
import { DOCS, ERROR_HINTS, type HintProduct, hintForCode } from "../src/error-hints.ts";
import { type ApiError, hintFor, toApiError } from "../src/errors.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === "test") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const packages = join(ROOT, "packages");
const SOURCE = [
  ...sourceFiles(join(ROOT, "apps/api/src")),
  ...readdirSync(packages).flatMap((name) => {
    const src = join(packages, name, "src");
    try {
      return sourceFiles(src);
    } catch {
      return [];
    }
  }),
]
  .filter((path) => !path.endsWith("error-hints.ts"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const PRODUCT_CLASS: Record<HintProduct, string> = {
  hooks: "HookError",
  inboxes: "InboxError",
  sign: "SignError",
  sms: "SmsError",
  verify: "VerifyError",
  webhooks: "WebhookError",
};

/** A code is real when something throws it: `new XError("code"`, or `code: "code"` in an ApiError. */
function isThrown(code: string, errorClass = "\\w*Error"): boolean {
  if (new RegExp(`new ${errorClass}\\(\\s*"${code}"`).test(SOURCE)) return true;
  // A ternary picking the code, as `new VerifyError(cond ? "a" : "b", …)`.
  if (
    new RegExp(`new ${errorClass}\\(\\s*\\w+[^"]{0,40}\\?\\s*"[a-z_]+"\\s*:\\s*"${code}"`).test(
      SOURCE,
    )
  ) {
    return true;
  }
  return errorClass === "\\w*Error" && new RegExp(`code: "${code}"`).test(SOURCE);
}

/** `https://coss.com/docs/<path>.md` → a page under content/docs, whose `(group)` folders aren't in URLs. */
function docsPageExists(url: string): boolean {
  const match = /^https:\/\/coss\.com\/docs\/(.+)\.md$/.exec(url);
  if (!match?.[1]) return false;
  const wanted = match[1];
  const content = join(ROOT, "apps/site/content/docs");
  const pages = (dir: string, prefix: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        const group = entry.startsWith("(") && entry.endsWith(")");
        return pages(path, group ? prefix : `${prefix}${entry}/`);
      }
      if (!entry.endsWith(".mdx")) return [];
      const name = entry.slice(0, -".mdx".length);
      return [name === "index" ? prefix.slice(0, -1) : `${prefix}${name}`];
    });
  return pages(content, "").includes(wanted);
}

describe("error hints", () => {
  test("every code in the table is thrown somewhere", () => {
    const missing = Object.keys(ERROR_HINTS).filter((key) => {
      if (key === HIPAA_MODE_RESTRICTION) return false;
      const [first, second] = key.split(":");
      return second
        ? !isThrown(second, PRODUCT_CLASS[first as HintProduct])
        : !isThrown(first as string);
    });
    expect(missing).toEqual([]);
  });

  test("every docs URL is a real docs page", () => {
    for (const url of Object.values(DOCS)) {
      expect({ url, exists: docsPageExists(url) }).toEqual({ url, exists: true });
    }
    for (const [code, hint] of Object.entries(ERROR_HINTS)) {
      for (const url of hint.match(/https?:\/\/\S+/g) ?? []) {
        expect({ code, url, exists: docsPageExists(url) }).toEqual({ code, url, exists: true });
      }
    }
  });

  test("no hint is empty", () => {
    for (const hint of Object.values(ERROR_HINTS)) {
      expect(hint.trim().length).toBeGreaterThan(0);
      expect(hint).not.toContain("undefined");
    }
  });

  test("sign_unavailable only says to retry", () => {
    expect(ERROR_HINTS.sign_unavailable).toBe("Retry later.");
  });

  test("a product's own hint wins over the code's", () => {
    expect(hintForCode("receiving_unavailable")).toContain("/docs/email/receiving.md");
    expect(hintForCode("receiving_unavailable", "inboxes")).toContain("/docs/inboxes.md");
    expect(hintForCode("receiving_unavailable", "sign")).toContain("/docs/email/receiving.md");
    expect(hintForCode("no_such_code")).toBeUndefined();
  });

  test("toApiError marks where a shared code came from", () => {
    const fromHooks = toApiError(new HookError("too_many_endpoints", "Too many."));
    const fromWebhooks = toApiError(new WebhookError("too_many_endpoints", "Too many."));
    expect(hintFor(fromHooks as ApiError)).toContain("/docs/hooks.md");
    expect(hintFor(fromWebhooks as ApiError)).toContain("/docs/webhooks.md");
    const fields = toApiError(new SignError("invalid_fields", "Off the page."));
    expect(hintFor(fields as ApiError)).toContain("/docs/sign/fields-and-anchors.md");
  });

  test("an explicit hint and reserved headers keep their own", () => {
    expect(hintFor({ code: "slot_unavailable", hint: "Mine." })).toBe("Mine.");
    expect(
      hintFor({ code: "validation_error", issues: [{ message: "This is set by coss.com." }] }),
    ).toContain("/docs/email/sending.md");
    expect(
      hintFor({ code: "validation_error", issues: [{ message: "Too long." }] }),
    ).toBeUndefined();
  });
});
