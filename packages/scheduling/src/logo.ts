/** A customer's logo: bytes we hold, so emails can carry it and pages load nothing from elsewhere. */
import { db, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";
import { LOGO_MAX_BYTES } from "./branding.ts";
import { SchedulingError } from "./errors.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingLogo } = schema;

export type SchedulingLogoRow = typeof schedulingLogo.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

export const LOGO_CONTENT_ID = "logo@scheduling.coss.com";

const MIN_SIDE = 16;
const MAX_SIDE = 4000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function refused(message: string): SchedulingError {
  return new SchedulingError("invalid_logo", message, { param: "logo" });
}

function pngSize(image: Buffer): { width: number; height: number } | null {
  if (image.length < 24 || image.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

function jpegSize(image: Buffer): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 <= image.length) {
    if (image[at] !== 0xff) return null;
    const marker = image[at + 1] as number;
    // Fill bytes, then markers that have no length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    // A start of frame, leaving out DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: image.readUInt16BE(at + 5), width: image.readUInt16BE(at + 7) };
    }
    at += 2 + image.readUInt16BE(at + 2);
  }
  return null;
}

/** By its bytes, never a claimed type: SVG can hold scripts and mail clients don't show it. */
export function parseLogo(content: string): {
  contentType: "image/png" | "image/jpeg";
  image: Buffer;
  width: number;
  height: number;
} {
  const image = Buffer.from(content, "base64");
  if (image.length > LOGO_MAX_BYTES) throw refused("A logo can be 200 KB at most.");
  const png = image.subarray(0, 8).equals(PNG_SIGNATURE);
  const jpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  if (!png && !jpeg) throw refused("A logo must be a PNG or a JPEG.");
  const size = png ? pngSize(image) : jpegSize(image);
  if (!size) throw refused("That image looks damaged. Try exporting it again.");
  const smallest = Math.min(size.width, size.height);
  if (smallest < MIN_SIDE || Math.max(size.width, size.height) > MAX_SIDE) {
    throw refused(`A logo's sides must be between ${MIN_SIDE} and ${MAX_SIDE} pixels.`);
  }
  return { contentType: png ? "image/png" : "image/jpeg", image, ...size };
}

export async function getLogoRow(scope: Scope): Promise<SchedulingLogoRow | null> {
  const [row] = await db
    .select()
    .from(schedulingLogo)
    .where(
      and(
        eq(schedulingLogo.organizationId, scope.organizationId),
        eq(schedulingLogo.environmentId, scope.environmentId),
      ),
    );
  return row ?? null;
}

export function logoDataUrl(logo: Pick<SchedulingLogoRow, "contentType" | "image">): string {
  return `data:${logo.contentType};base64,${logo.image.toString("base64")}`;
}

export async function saveLogo(env: Scope, content: string): Promise<void> {
  const parsed = parseLogo(content);
  await db
    .insert(schedulingLogo)
    .values({ organizationId: env.organizationId, environmentId: env.environmentId, ...parsed })
    .onConflictDoUpdate({
      target: [schedulingLogo.environmentId],
      set: { ...parsed, updatedAt: new Date() },
    });
}

export async function removeLogo(env: Scope): Promise<void> {
  await db
    .delete(schedulingLogo)
    .where(
      and(
        eq(schedulingLogo.organizationId, env.organizationId),
        eq(schedulingLogo.environmentId, env.environmentId),
      ),
    );
}
