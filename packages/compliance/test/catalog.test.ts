import { describe, expect, test } from "bun:test";
import {
  HIPAA_CONTROL_GROUPS,
  HIPAA_CONTROLS,
  HIPAA_RESPONSIBILITIES,
  HIPAA_VENDORS,
  hipaaVendorCovered,
} from "../src/catalog.ts";

describe("the HIPAA mode catalog", () => {
  test("every control is in a group the page shows", () => {
    for (const control of HIPAA_CONTROLS) {
      expect(HIPAA_CONTROL_GROUPS).toContain(control.group);
    }
    expect(new Set(HIPAA_CONTROLS.map((control) => control.id)).size).toBe(HIPAA_CONTROLS.length);
  });

  test("only a vendor marked under a BAA may receive PHI", () => {
    expect(hipaaVendorCovered("aws")).toBe(true);
    expect(hipaaVendorCovered("twilio_messaging")).toBe(true);
    expect(hipaaVendorCovered("ai_gateway")).toBe(false);
    expect(hipaaVendorCovered("twilio_lookup")).toBe(false);
    expect(hipaaVendorCovered("sentry")).toBe(false);
  });

  test("a vendor without a BAA says so plainly", () => {
    const unsigned = Object.values(HIPAA_VENDORS).filter((vendor) => vendor.status === "no_baa");
    for (const vendor of unsigned) expect("note" in vendor && vendor.note).toBeTruthy();
  });

  test("the copy never claims the customer is compliant", () => {
    const copy = [
      ...HIPAA_CONTROLS.flatMap((control) => [control.label, control.description]),
      ...HIPAA_RESPONSIBILITIES,
      ...Object.values(HIPAA_VENDORS).map((vendor) => vendor.purpose),
    ].join(" ");
    expect(copy.toLowerCase()).not.toContain("compliant");
  });
});
