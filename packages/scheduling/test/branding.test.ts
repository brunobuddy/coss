import { describe, expect, test } from "bun:test";
import { createTestTenant } from "@coss/tenancy/testing";
import { accentColors, LOGO_MAX_BYTES } from "../src/branding.ts";
import { getSettings, parseLogo, SchedulingError, updateSettings } from "../src/index.ts";
import { TEST_PNG, testPng } from "../src/testing.ts";

function jpeg(width: number, height: number): string {
  const frame = Buffer.alloc(19);
  frame[0] = 0xff;
  frame[1] = 0xc0;
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  const comment = Buffer.from([0xff, 0xfe, 0x00, 0x04, 0x41, 0x42]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), comment, frame]).toString("base64");
}

function refusal(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof SchedulingError ? error.code : String(error);
  }
  return undefined;
}

describe("accentColors", () => {
  test("picks the text that reads, and refuses a color a white page would hide", () => {
    expect(accentColors("#2563eb")?.foreground).toBe("#ffffff");
    expect(accentColors("#fde047")?.foreground).toBe("#18181b");
    expect(accentColors("#f97316")?.foreground).toBe("#18181b");
    expect(accentColors("#ffffff")).toBeNull();
    expect(accentColors("#fafafa")).toBeNull();
    expect(accentColors("red; background:url(x)")).toBeNull();
  });
});

describe("parseLogo", () => {
  test("reads a PNG's and a JPEG's size from their bytes", () => {
    expect(parseLogo(testPng(400, 100))).toMatchObject({
      contentType: "image/png",
      width: 400,
      height: 100,
    });
    expect(parseLogo(jpeg(320, 80))).toMatchObject({
      contentType: "image/jpeg",
      width: 320,
      height: 80,
    });
  });

  test("refuses what isn't one, whatever it claims to be", () => {
    const svg = Buffer.from("<svg onload='alert(1)'></svg>").toString("base64");
    expect(refusal(() => parseLogo(svg))).toBe("invalid_logo");
    expect(refusal(() => parseLogo(Buffer.from("GIF89a").toString("base64")))).toBe("invalid_logo");
    // A signature with nothing after it.
    expect(refusal(() => parseLogo(TEST_PNG.slice(0, 16)))).toBe("invalid_logo");
    expect(refusal(() => parseLogo(Buffer.from([0xff, 0xd8, 0xff]).toString("base64")))).toBe(
      "invalid_logo",
    );
  });

  test("refuses a logo too big or too small to show", () => {
    expect(refusal(() => parseLogo(testPng(8, 8)))).toBe("invalid_logo");
    expect(refusal(() => parseLogo(testPng(9000, 100)))).toBe("invalid_logo");
    const huge = Buffer.concat([
      Buffer.from(testPng(400, 100), "base64"),
      Buffer.alloc(LOGO_MAX_BYTES),
    ]);
    expect(refusal(() => parseLogo(huge.toString("base64")))).toBe("invalid_logo");
  });
});

describe("settings", () => {
  test("a logo is stored, replaced, removed, and belongs to one environment", async () => {
    const tenant = await createTestTenant();
    const env = {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live" as const,
    };
    const other = { ...env, environmentId: tenant.development.id, mode: "sandbox" as const };

    expect((await getSettings(env)).logo).toBeNull();
    const saved = await updateSettings(env, { logo: { content: testPng(400, 100) } });
    expect(saved.logo).toMatchObject({ content_type: "image/png", width: 400, height: 100 });
    expect(saved.logo?.data_url).toBe(`data:image/png;base64,${testPng(400, 100)}`);
    expect((await getSettings(other)).logo).toBeNull();

    await updateSettings(env, { logo: { content: testPng(200, 50) } });
    expect((await getSettings(env)).logo?.width).toBe(200);

    // Another change leaves it alone.
    await updateSettings(env, { brand_name: "Acme" });
    expect((await getSettings(env)).logo?.width).toBe(200);

    await updateSettings(env, { logo: null });
    expect((await getSettings(env)).logo).toBeNull();
  });
});
