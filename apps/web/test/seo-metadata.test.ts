import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { publicPageMetadata } from "../src/lib/public-metadata";

const APP = path.resolve(import.meta.dir, "../src/app");
const read = (file: string) => readFileSync(path.join(APP, file), "utf8");

describe("search engines and the dashboard", () => {
  test("every dashboard page is noindex unless it says otherwise", () => {
    expect(read("layout.tsx")).toContain("robots: { index: false, follow: false }");
  });

  test("the sign-in and sign-up pages are listed, whatever redirected to them", () => {
    for (const page of ["(auth)/sign-in/page.tsx", "(auth)/sign-up/page.tsx"]) {
      expect(read(page)).toContain("publicPageMetadata(");
    }
    const metadata = publicPageMetadata({
      origin: "https://coss.com",
      path: "/sign-in",
      title: "Sign in",
      description: "Sign in.",
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("https://coss.com/sign-in");
  });
});
