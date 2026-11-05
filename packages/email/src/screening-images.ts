/** Bounded image downloads for screening. Never let the AI SDK fetch sender-controlled URLs. */
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress, publicAddressLookup, type SenderOptions } from "@coss/webhooks";
import sharp from "sharp";

export const MAX_SCREENING_IMAGES = 16;
export const MAX_SCREENING_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_SCREENING_IMAGE_TOTAL_BYTES = 8 * 1024 * 1024;
/** The pinned vision endpoint rejects smaller dimensions (verified with synthetic live requests). */
export const MIN_SCREENING_IMAGE_DIMENSION = 512;

export type ScreeningImage = { data: Uint8Array; mediaType: string };
export type ScreeningImageLoader = (source: string, signal: AbortSignal) => Promise<ScreeningImage>;

/** Tiny tracking pixels/icons need padding for the vision endpoint; animations need every frame. */
export async function prepareScreeningImages(
  image: ScreeningImage,
  signal: AbortSignal,
  remaining: number,
  remainingBytes = MAX_SCREENING_IMAGE_TOTAL_BYTES,
): Promise<ScreeningImage[]> {
  signal.throwIfAborted();
  const limitInputPixels = 16 * 1024 * 1024;
  const metadata = await sharp(image.data, { limitInputPixels }).metadata();
  const frames = metadata.pages ?? 1;
  if (frames > remaining) throw new Error("Too many image frames to screen safely.");
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;
  const outputWidth = Math.max(MIN_SCREENING_IMAGE_DIMENSION, width);
  const outputHeight = Math.max(MIN_SCREENING_IMAGE_DIMENSION, height);
  if (!width || !height || outputWidth * outputHeight > limitInputPixels) {
    throw new Error("Screening image dimensions are unsupported.");
  }
  if (
    frames === 1 &&
    width >= MIN_SCREENING_IMAGE_DIMENSION &&
    height >= MIN_SCREENING_IMAGE_DIMENSION
  ) {
    if (image.data.length > remainingBytes) throw new Error("Screening images are too large.");
    return [image];
  }
  const result: ScreeningImage[] = [];
  let totalBytes = 0;
  for (let page = 0; page < frames; page++) {
    signal.throwIfAborted();
    const data = await sharp(image.data, { limitInputPixels, page, pages: 1 })
      .resize({ width: outputWidth, height: outputHeight, fit: "contain" })
      .png()
      .timeout({ seconds: 5 })
      .toBuffer();
    signal.throwIfAborted();
    totalBytes += data.length;
    if (totalBytes > remainingBytes) throw new Error("Screening images are too large.");
    result.push(screeningImage(data));
  }
  return result;
}

/** Check bytes, not a customer-controlled Content-Type header. SVG and other files fail closed. */
export function screeningImage(data: Uint8Array): ScreeningImage {
  if (!data.length || data.length > MAX_SCREENING_IMAGE_BYTES) {
    throw new Error("Screening image is empty or too large.");
  }
  const bytes = Buffer.from(data);
  const mediaType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
        ? "image/gif"
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
  if (!mediaType) throw new Error("Screening image format is unsupported.");
  if (mediaType === "image/png") {
    // libvips exposes GIF/WebP frames, but not APNG frames. Never inspect just the cover frame.
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset);
      const kind = bytes.toString("ascii", offset + 4, offset + 8);
      if (kind === "acTL") throw new Error("Animated PNG screening is unsupported.");
      if (kind === "IEND") break;
      offset += length + 12;
    }
  }
  return { data, mediaType };
}

export function publicScreeningImageLoader(options: SenderOptions = {}): ScreeningImageLoader {
  const lookup = publicAddressLookup(options);
  return async (source, signal) => {
    signal.throwIfAborted();
    if (source.startsWith("data:")) {
      const match = /^data:image\/(?:png|jpeg|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(source);
      if (!match || source.length > MAX_SCREENING_IMAGE_BYTES * 1.4 + 100) {
        throw new Error("Screening image data URL is invalid or too large.");
      }
      return screeningImage(Buffer.from(match[1] ?? "", "base64"));
    }
    const url = new URL(source);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port) && !options.allowPrivateNetworks) ||
      (isIP(host) && isBlockedAddress(host) && !options.allowPrivateNetworks)
    ) {
      throw new Error("Screening image URL must use public HTTP(S) without credentials.");
    }
    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.get(
        url,
        { lookup, signal, headers: { "Accept-Encoding": "identity" } },
        (response) => {
          // No redirects: every request must pass the public-address check, and the sender
          // cannot point us at a public redirect to the task's credentials endpoint.
          if (
            response.statusCode !== 200 ||
            (response.headers["content-encoding"] &&
              response.headers["content-encoding"] !== "identity") ||
            Number(response.headers["content-length"] ?? 0) > MAX_SCREENING_IMAGE_BYTES
          ) {
            response.destroy();
            reject(new Error("Screening image download was refused."));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_SCREENING_IMAGE_BYTES) {
              request.destroy(new Error("Screening image is too large."));
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            try {
              resolve(screeningImage(Buffer.concat(chunks)));
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      request.on("error", reject);
    });
  };
}
