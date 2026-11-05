import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";

const PASSWORD = "a-long-e2e-password-1234";

// The verification link goes out by email; nothing in a browser can follow it.
async function markEmailVerified(email: string): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`update "user" set email_verified = true where email = $1`, [email]);
  } finally {
    await client.end();
  }
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Smoke Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeHidden();
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a new customer goes from sign-up to an API key and a domain", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const email = `e2e-${id}@gmail.com`;

  await signUp(page, email);
  await markEmailVerified(email);
  await signIn(page, email);

  await page.waitForURL("**/onboarding**");
  await page.getByLabel("Name").fill(`Smoke ${id}`);
  await page.getByRole("button", { name: "Create organization" }).click();

  // A new organization opens in its first project's sandbox, not an empty settings page.
  await expect(page.getByRole("heading", { name: /^Welcome/ })).toBeVisible();
  const goLive = page.getByRole("link", { name: /Go live/ });
  await expect(goLive).toBeVisible();
  const home = new URL(page.url()).pathname;

  await page.goto(`${home}/developers/api-keys`);
  await page.getByRole("button", { name: "Create API key" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Smoke key");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("dialog").getByText(/coss_test_/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Smoke key", { exact: true })).toBeVisible();

  await page.goto(home);
  await goLive.click();
  await page.waitForURL("**/email/domains");
  await page.getByRole("button", { name: "Add domain" }).first().click();
  const domain = `e2e-${id}.example.com`;
  await page.getByRole("dialog").getByLabel("Domain").fill(domain);
  await page.getByRole("dialog").getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(domain).first()).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/sign-in**");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("a wrong password stays on the sign-in page with an error", async ({ page }) => {
  await signIn(page, `e2e-${randomUUID().slice(0, 8)}@gmail.com`);
  await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/sign-in");
});
