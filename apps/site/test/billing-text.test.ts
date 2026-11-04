import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PLAN_KEYS } from "@coss/billing/catalog";
import { renderBillingComponents } from "../src/lib/billing-text";

describe("renderBillingComponents", () => {
  test("renders the plans and the usage rates from the catalog", () => {
    const text = renderBillingComponents("<PlanTable />\n\n<UsageRates />");
    expect(text).toContain(
      "| Price | Free | $25/month | $250/month | From $2,000/month, annual commitment |",
    );
    // A label that names its unit isn't followed by it again.
    expect(text).toContain("1,000 form submissions a month");
    expect(text).not.toContain("submissions submissions");
    expect(text).toContain("| Form submissions | $1.00 per 1,000 submissions | |");
    expect(text).toContain("1,000 MB of form uploads a month");
    expect(text).toContain(
      "| Form uploads | $0.25 per 1,000 MB | The files of accepted submissions, kept 90 days; rounded up to the MB per submission |",
    );
    expect(text).toContain(
      "| Sending rate | 2 emails a second, 3,000 a day | 14 emails a second, 100,000 a day | 50 emails a second, 1,000,000 a day | Custom |",
    );
    expect(text).toContain(
      "| Marketing rate | 2 marketing emails a second | 10 marketing emails a second | 50 marketing emails a second | Custom |",
    );
    expect(text).toContain(
      "| Email | $0.40 per 1,000 recipients for the first 1,000,000; $0.30 per 1,000 recipients from 1,000,001 to 10,000,000; $0.22 per 1,000 recipients beyond 10,000,000 | |",
    );
    expect(text).toContain("| SMS (US) | $0.0142 per segment | |");
    expect(text).toContain(
      "| SMS (other countries) | $0.022 to $0.1134 per segment | By country: coss.com/pricing#sms |",
    );
    expect(text).toContain("| SMS received (US) | $0.016 per segment | |");
    expect(text).toContain("| SMS phone numbers (toll-free) | $2.15 per number-month | |");
    expect(text).toContain(
      "| SMS registration fees (campaign vetting) | $15.00 | Passed through at cost |",
    );
    expect(text).toContain(
      "| SMS rate | Sandbox only | 10 SMS segments a second, 10,000 a day | 30 SMS segments a second, 100,000 a day | Custom |",
    );
    expect(text).not.toContain("Video");
    expect(text).toContain("| Scheduling | $0.10 per booking | |");
    expect(text.split("\n")[0]?.split("|").length).toBe(PLAN_KEYS.length + 3);
  });

  test("renders add-ons, and where a plan can have one", () => {
    const text = renderBillingComponents("<PlanTable />\n\n<UsageRates />\n\n<AddOns />");
    expect(text).toContain("| Dedicated IPs | — | — | Add-on | Add-on |");
    expect(text).toContain("| Dedicated IPs | $50/month | Scale, Enterprise |");
    expect(text).toContain(
      "| Email via dedicated IPs | $0.10 per 1,000 recipients | With the Dedicated IPs add-on, on top of Email |",
    );
  });

  test("renders one product's rates", () => {
    const text = renderBillingComponents('<UsageRates product="sms" />');
    expect(text).toContain("| SMS (US) | $0.0142 per segment | |");
    expect(text).toContain("| SMS phone numbers (toll-free) | $2.15 per number-month | |");
    expect(text).not.toContain("| Email |");
    expect(text).not.toContain("<UsageRates");
  });

  test("renders the billing guide's worked example from the rate card", () => {
    const text = renderBillingComponents("<GraduatedExample />\n\n<BillingExample />");
    expect(text).toContain(
      "With 2,000,000 emails in a month, the first 1,000,000 cost $0.40 per 1,000 and the next 1,000,000 $0.30 per 1,000: $700.",
    );
    expect(text).toContain("For example, on Pro with 2,000,000 emails in October:");
    expect(text).toContain("| October fee (charged October 1) | $25.00 |");
    expect(text).toContain("| October usage | $700.00 |");
    expect(text).toContain("| October credit | -$25.00 |");
    expect(text).toContain("| **Charged November 1 (with November's $25 fee)** | **$675.00** |");
    expect(text).toContain("Over the month you paid $700: the larger of the fee and the usage.");
  });

  test("the docs never type a price in", () => {
    // Prices come from the catalog's components; code samples and a bare $0 aren't prices.
    const dir = `${import.meta.dir}/../content/docs`;
    const typed = [...new Bun.Glob("**/*.mdx").scanSync(dir)].filter((file) =>
      /\$\s?(?:[1-9]|0\.\d)/.test(
        readFileSync(`${dir}/${file}`, "utf8").replace(/^```[\s\S]*?^```/gm, ""),
      ),
    );
    expect(typed).toEqual([]);
  });
});
