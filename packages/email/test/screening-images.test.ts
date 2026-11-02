import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import sharp from "sharp";
import { imageDominantEmail, loadEmailScreeningContent } from "../src/screening.ts";
import {
  MAX_SCREENING_IMAGE_BYTES,
  prepareScreeningImages,
  publicScreeningImageLoader,
} from "../src/screening-images.ts";

const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: "white" } })
  .png()
  .toBuffer();
const deadline = () => AbortSignal.timeout(2000);

describe("screening image downloads", () => {
  test("normalizes tracking pixels and inspects every animation frame within the shared cap", async () => {
    const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    const [prepared] = await prepareScreeningImages(
      { data: tiny, mediaType: "image/png" },
      deadline(),
      16,
    );
    expect(await sharp(prepared?.data).metadata()).toMatchObject({ width: 512, height: 512 });
    const raw = Buffer.alloc(512 * 1024 * 3, 255);
    raw.fill(0, 512 * 512 * 3);
    const animation = await sharp(raw, {
      raw: { width: 512, height: 1024, channels: 3, pageHeight: 512 },
    })
      .gif()
      .toBuffer();
    expect((await sharp(animation).metadata()).pages).toBe(2);
    const frames = await prepareScreeningImages(
      { data: animation, mediaType: "image/gif" },
      deadline(),
      16,
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.data).not.toEqual(frames[1]?.data);
    await expect(
      prepareScreeningImages(
        { data: animation, mediaType: "image/gif" },
        deadline(),
        16,
        frames[0]?.data.length,
      ),
    ).rejects.toThrow("Screening images are too large");
    await expect(
      prepareScreeningImages({ data: animation, mediaType: "image/gif" }, deadline(), 1),
    ).rejects.toThrow("Too many image frames");
  });

  test("alt text and hidden padding cannot exempt image-only mail from screening", () => {
    for (const padding of [
      `<img src="https://img.example/payload.png" alt="${"Innocent text ".repeat(100)}">`,
      `<p hidden>${"Innocent text ".repeat(100)}</p><img src="https://img.example/payload.png">`,
      `<p style="display:none">${"Innocent text ".repeat(100)}</p><img src="https://img.example/payload.png">`,
    ])
      expect(imageDominantEmail({ html: padding })).toBe(true);
    expect(
      imageDominantEmail({
        html: `<p>${"Visible body ".repeat(100)}</p><img src="https://img.example/logo.png">`,
      }),
    ).toBe(false);
  });

  test("Outlook conditional images are inspected too", async () => {
    const sources: string[] = [];
    const row = {
      from: "a@example.com",
      subject: "hi",
      text: null,
      html: '<!--[if mso]><img src="https://img.example/payload.png"><![endif]--><p>Unsubscribe</p>',
    };
    expect(imageDominantEmail(row)).toBe(true);
    await loadEmailScreeningContent(row, deadline(), async (source) => {
      sources.push(source);
      return { data: png, mediaType: "image/png" };
    });
    expect(sources).toEqual(["https://img.example/payload.png"]);
  });
  let server: Server;
  let base: string;
  let redirected = false;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/target" });
        res.end();
      } else if (req.url === "/target") {
        redirected = true;
        res.end(png);
      } else if (req.url === "/large") {
        res.writeHead(200, { "Content-Length": MAX_SCREENING_IMAGE_BYTES + 1 });
        res.end();
      } else if (req.url === "/stream") {
        res.end(Buffer.alloc(MAX_SCREENING_IMAGE_BYTES + 1));
      } else if (req.url === "/slow") {
        /* The abort signal must end this connection. */
      } else {
        res.end(png);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server address");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  test("pins DNS and refuses literal, mixed public/private, credential and non-HTTP targets", async () => {
    const load = publicScreeningImageLoader({
      resolve: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });
    for (const url of [
      "http://169.254.169.254/x",
      "http://[::1]/x",
      "http://image.example/x",
      "https://user:pass@example.com/x",
      "file:///etc/passwd",
    ]) {
      await expect(load(url, deadline())).rejects.toThrow();
    }
  });

  test("downloads bounded bytes, refuses redirects and sizes, and respects the deadline", async () => {
    const load = publicScreeningImageLoader({ allowPrivateNetworks: true });
    expect(await load(`${base}/image`, deadline())).toEqual({ data: png, mediaType: "image/png" });
    for (const path of ["redirect", "large", "stream"]) {
      await expect(load(`${base}/${path}`, deadline())).rejects.toThrow();
    }
    expect(redirected).toBe(false);
    await expect(load(`${base}/slow`, AbortSignal.timeout(20))).rejects.toThrow();
  });

  test("validates data images by bytes and refuses unsupported or oversized content", async () => {
    const load = publicScreeningImageLoader();
    expect(
      (await load(`data:image/png;base64,${png.toString("base64")}`, deadline())).data,
    ).toEqual(png);
    await expect(load("data:image/png;base64,aGVsbG8=", deadline())).rejects.toThrow();
    await expect(load("data:image/svg+xml;base64,PHN2Zz4=", deadline())).rejects.toThrow();
  });

  test("finds body images and backgrounds without letting alt text replace image bytes", async () => {
    const sources: string[] = [];
    const row = {
      from: "a@example.com",
      subject: "hi",
      text: null,
      html: '<style>.hero { background-image:url(https://img.example/background.png); }</style><img src="https://img.example/payload.png?private=token" alt="Account Notification"><p>Unsubscribe</p>',
    };
    expect(imageDominantEmail(row)).toBe(true);
    const content = await loadEmailScreeningContent(row, deadline(), async (source) => {
      sources.push(source);
      return { data: png, mediaType: "image/png" };
    });
    expect(sources).toHaveLength(2);
    expect(content.images).toHaveLength(2);
    expect(content.links).toContain("img.example/payload.png");
    expect(JSON.stringify(content)).not.toContain("private=token");
    expect(content.text).toBe("Account Notification\nUnsubscribe");
  });

  test("never silently drops images beyond the inspection limit", async () => {
    const row = {
      from: "a@example.com",
      subject: "hi",
      text: null,
      html: Array.from({ length: 17 }, (_, i) => `<img src="https://img.example/${i}.png">`).join(
        "",
      ),
    };
    await expect(loadEmailScreeningContent(row, deadline())).rejects.toThrow("Too many images");
  });

  test("also inspects picture alternatives and data images in CSS backgrounds", async () => {
    const sources: string[] = [];
    const data = `data:image/png;base64,${png.toString("base64")}`;
    await loadEmailScreeningContent(
      {
        from: "a@example.com",
        subject: "hi",
        text: null,
        html: `<picture><source srcset="https://img.example/payload.png 2x"><img src="https://img.example/fallback.png"></picture><div style="background-image:url('${data}')"></div>`,
      },
      deadline(),
      async (source) => {
        sources.push(source);
        return { data: png, mediaType: "image/png" };
      },
    );
    expect(sources).toEqual([
      "https://img.example/payload.png",
      "https://img.example/fallback.png",
      data,
    ]);
  });
});
