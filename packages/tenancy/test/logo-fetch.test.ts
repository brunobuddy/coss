import { describe, expect, test } from "bun:test";
import {
  findLogo,
  imageSize,
  type LogoHttp,
  type LogoResponse,
  parseIconLinks,
  publicLogoHttp,
  sniffImage,
} from "../src/logo-fetch.ts";
import { png } from "./logo-images.ts";

function ico(sizes: number[]): Buffer {
  const body = Buffer.alloc(6 + sizes.length * 16);
  body.writeUInt16LE(0, 0);
  body.writeUInt16LE(1, 2);
  body.writeUInt16LE(sizes.length, 4);
  sizes.forEach((size, index) => {
    body[6 + index * 16] = size === 256 ? 0 : size;
    body[7 + index * 16] = size === 256 ? 0 : size;
  });
  return body;
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>',
);

type Route = Omit<Partial<LogoResponse>, "body"> & { body: Buffer | string };

/** An in-memory web: URL → response; anything else is unreachable. */
function fakeHttp(routes: Record<string, Route>): LogoHttp & { requested: string[] } {
  const requested: string[] = [];
  const http = async (url: URL) => {
    requested.push(url.href);
    const route = routes[url.href];
    if (!route) return null;
    const body = typeof route.body === "string" ? Buffer.from(route.body) : route.body;
    return {
      status: route.status ?? 200,
      url: route.url ?? url.href,
      contentType: route.contentType ?? "text/html",
      body,
    };
  };
  return Object.assign(http, { requested });
}

describe("findLogo", () => {
  test("prefers an SVG icon, then the largest raster", async () => {
    const http = fakeHttp({
      "https://acme.io/": {
        body: `<html><head>
          <link rel="icon" href="/favicon-32.png" sizes="32x32">
          <link rel="apple-touch-icon" href="/touch.png">
          <link rel="icon" type="image/svg+xml" href="/logo.svg">
        </head><body></body></html>`,
      },
      "https://acme.io/logo.svg": { body: SVG, contentType: "image/svg+xml" },
      "https://acme.io/touch.png": { body: png(180, 180), contentType: "image/png" },
    });
    const logo = await findLogo("acme.io", { http });
    expect(logo).toMatchObject({
      sourceUrl: "https://acme.io/logo.svg",
      contentType: "image/svg+xml",
      width: null,
    });
    expect(logo?.sha256).toHaveLength(64);
  });

  test("uses the web manifest's icons, skipping maskable ones", async () => {
    const http = fakeHttp({
      "https://acme.io/": {
        body: '<head><link rel="manifest" href="/site.webmanifest"></head>',
        url: "https://acme.io/",
      },
      "https://acme.io/site.webmanifest": {
        contentType: "application/manifest+json",
        body: JSON.stringify({
          icons: [
            { src: "/maskable-512.png", sizes: "512x512", purpose: "maskable" },
            { src: "icons/icon-192.png", sizes: "192x192" },
          ],
        }),
      },
      "https://acme.io/icons/icon-192.png": { body: png(192, 192), contentType: "image/png" },
    });
    const logo = await findLogo("acme.io", { http });
    expect(logo).toMatchObject({ sourceUrl: "https://acme.io/icons/icon-192.png", width: 192 });
    expect(http.requested).not.toContain("https://acme.io/maskable-512.png");
  });

  test("falls back to /favicon.ico when the page links nothing, and keeps a small one only then", async () => {
    const http = fakeHttp({
      "https://acme.io/": { body: "<html><head><title>Acme</title></head></html>" },
      "https://acme.io/favicon.ico": { body: ico([16, 32]), contentType: "image/x-icon" },
    });
    expect(await findLogo("acme.io", { http })).toMatchObject({
      sourceUrl: "https://acme.io/favicon.ico",
      contentType: "image/x-icon",
      width: 32,
    });
  });

  test("trusts the bytes, not the Content-Type, and refuses SVGs that script", async () => {
    const http = fakeHttp({
      "https://acme.io/": {
        body: '<head><link rel="icon" href="/a.png" sizes="512x512"><link rel="icon" href="/b.svg"></head>',
      },
      "https://acme.io/a.png": { body: "<html>not found</html>", contentType: "image/png" },
      "https://acme.io/b.svg": {
        body: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
        contentType: "image/svg+xml",
      },
    });
    expect(await findLogo("acme.io", { http })).toBeNull();
  });

  test("follows to www. when the bare domain doesn't answer, and gives up when neither does", async () => {
    const http = fakeHttp({
      "https://www.acme.io/": { body: '<head><link rel="apple-touch-icon" href="/t.png"></head>' },
      "https://www.acme.io/t.png": { body: png(180, 180), contentType: "image/png" },
    });
    expect((await findLogo("acme.io", { http }))?.sourceUrl).toBe("https://www.acme.io/t.png");
    expect(await findLogo("nowhere.io", { http: fakeHttp({}) })).toBeNull();
  });
});

describe("parseIconLinks", () => {
  test("resolves against the page, ignores the body and non-HTTPS links", () => {
    const { icons, manifest } = parseIconLinks(
      `<head>
        <link href='/i.png?v=1&amp;x=2' rel='icon shortcut' sizes='48x48 96x96'>
        <link rel="icon" href="http://insecure.example/i.png">
        <link rel="manifest" href="manifest.json">
      </head><body><link rel="icon" href="/late.png"></body>`,
      new URL("https://acme.io/en/"),
    );
    expect(icons).toEqual([{ url: "https://acme.io/i.png?v=1&x=2", score: 96 }]);
    expect(manifest?.href).toBe("https://acme.io/en/manifest.json");
  });
});

describe("images", () => {
  test("sniffs and measures each format", () => {
    expect(sniffImage(png(64, 32))).toBe("png");
    expect(imageSize("png", png(64, 32))).toEqual({ width: 64, height: 32 });
    expect(imageSize("ico", ico([16, 256, 48]))).toEqual({ width: 256, height: 256 });
    const gif = Buffer.from("GIF89a\x40\x00\x20\x00", "latin1");
    expect(sniffImage(gif)).toBe("gif");
    expect(imageSize("gif", gif)).toEqual({ width: 64, height: 32 });
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30,
      0x00, 0x40, 0x03,
    ]);
    expect(sniffImage(jpeg)).toBe("jpeg");
    expect(imageSize("jpeg", jpeg)).toEqual({ width: 64, height: 48 });
    expect(sniffImage(Buffer.from('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"/>'))).toBe("svg");
    expect(sniffImage(Buffer.from("<!doctype html><html>"))).toBeNull();
  });
});

describe("publicLogoHttp", () => {
  test("refuses hosts that resolve to private addresses, and plain HTTP", async () => {
    const http = publicLogoHttp({
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    const options = { maxBytes: 1024, accept: "*/*" };
    expect(await http(new URL("https://internal.example/"), options)).toBeNull();
    expect(await http(new URL("http://acme.io/"), options)).toBeNull();
    expect(await http(new URL("https://169.254.169.254/latest/meta-data"), options)).toBeNull();
  });
});
