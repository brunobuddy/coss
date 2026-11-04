import { describe, expect, test } from "bun:test";
import { maskSecrets } from "../lambda/mask-access-logs.mjs";

const SECRET = "s3cr3t-Value_123";

function albLine(url: string): string {
  return `https 2026-11-03T14:00:00Z app/coss 1.2.3.4:5 10.0.0.1:4000 0.001 0.002 0.000 200 200 10 20 "GET ${url} HTTP/1.1" "Mozilla/5.0" TLS_AES TLSv1.3 arn "Root=1" "coss.com" "arn" 0`;
}

describe("maskSecrets", () => {
  test.each([
    ["open pixel", `https://track.cosslinks.com:443/t/o/${SECRET}`],
    ["click, keeping the position", `https://track.cosslinks.com:443/t/c/${SECRET}/2`],
    ["unsubscribe", `https://api.coss.com:443/t/u/${SECRET}`],
    ["double opt-in", `https://api.coss.com:443/t/u/confirm/${SECRET}`],
    ["form confirmation", `https://cossforms.com:443/f/c/${SECRET}`],
    ["password reset", `https://coss.com:443/api/auth/reset-password/${SECRET}?callbackURL=%2Fx`],
    ["invitation", `https://coss.com:443/accept-invitation/${SECRET}`],
    ["email verification", `https://coss.com:443/api/auth/verify-email?token=${SECRET}&a=1`],
    ["OAuth", `https://coss.com:443/api/auth/callback/google?state=${SECRET}&code=${SECRET}`],
    [
      "calendar OAuth",
      `https://api.coss.com:443/scheduling/oauth/microsoft/callback?code=${SECRET}`,
    ],
    [
      "Microsoft's check",
      `https://api.coss.com:443/scheduling/push/microsoft?validationToken=${SECRET}`,
    ],
    [
      "nested",
      `https://coss.com:443/sign-in?next=%2Fapi%2Fauth%2Fverify-email%3Ftoken%3D${SECRET}`,
    ],
    ["nested path", `https://coss.com:443/sign-in?next=%2Freset-password%2F${SECRET}`],
    ["double encoded", `https://coss.com:443/sign-in?next=%252Fa%253Fcode%253D${SECRET}`],
  ])("masks %s", (_name, url) => {
    const masked = maskSecrets(albLine(url));
    expect(masked).not.toContain(SECRET);
    expect(masked).toContain("[masked]");
  });

  test("masks an API key someone put in a URL, under any parameter", () => {
    // Built at runtime: key-shaped literals trip secret scanners.
    const key = ["coss", "live", "a".repeat(64)].join("_");
    const masked = maskSecrets(albLine(`https://api.coss.com:443/mcp?api_key=${key}`));
    expect(masked).not.toContain(key);
    expect(masked).toContain("api_key=coss_live_[masked]");
  });

  test("masks CloudFront's separate query field and referrer", () => {
    const line = [
      "2026-11-03",
      "14:00:00",
      "IAD",
      "100",
      "1.2.3.4",
      "GET",
      "x.cloudfront.net",
      "/api/auth/verify-email",
      "200",
      `https://coss.com/reset-password/${SECRET}`,
      "Mozilla",
      `token=${SECRET}&callbackURL=/x`,
    ].join("\t");
    const masked = maskSecrets(line);
    expect(masked).not.toContain(SECRET);
    expect(masked).toContain("callbackURL=/x");
  });

  test("keeps what an investigation needs", () => {
    const urls = [
      "https://coss.com:443/docs/search.json?query=hello",
      "https://coss.com:443/app/authorize?code_challenge=abc&mode=code2",
      "https://coss.com:443/t/pricing",
      "https://coss.com:443/f/form_01abc",
      "https://coss.com:443/wp-admin/install.php?step=1",
    ];
    for (const url of urls) expect(maskSecrets(albLine(url))).toBe(albLine(url));
  });

  test("leaves the click's position and is idempotent", () => {
    const once = maskSecrets(albLine(`https://t.co:443/t/c/${SECRET}/2`));
    expect(once).toContain("/t/c/[masked]/2");
    expect(maskSecrets(once)).toBe(once);
  });
});
