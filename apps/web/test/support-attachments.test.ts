import { beforeEach, expect, mock, test } from "bun:test";

let session: unknown;
let store: unknown = {};
const stored: { filename: string; uploadedByUserId: string }[] = [];

mock.module("@/env", () => ({ env: { BETTER_AUTH_URL: "https://coss.test" } }));
mock.module("@/lib/session", () => ({ getSession: async () => session }));
mock.module("@/lib/support", () => ({ supportStore: () => store }));
mock.module("@coss/support", () => ({
  SupportError: class extends Error {},
  storeSupportUpload: async (input: { filename: string; uploadedByUserId: string }) => {
    stored.push(input);
    return { id: "upload_1", filename: input.filename };
  },
}));

const { POST } = await import("../src/app/api/support/attachments/route");

function upload(file: File | null, origin: string | null = "https://coss.test") {
  const form = new FormData();
  if (file) form.set("file", file);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return POST(
    new Request("https://coss.test/api/support/attachments", {
      method: "POST",
      headers,
      body: form,
    }) as never,
  );
}

const member = { user: { id: "user_1" }, session: { impersonatedBy: null } };

beforeEach(() => {
  session = member;
  store = {};
  stored.length = 0;
});

test("refuses another origin before reading the session", async () => {
  session = null;
  expect((await upload(new File(["x"], "a.txt"), "https://evil.test")).status).toBe(403);
  expect((await upload(new File(["x"], "a.txt"), null)).status).toBe(403);
});

test("needs a session, and refuses impersonation", async () => {
  session = null;
  expect((await upload(new File(["x"], "a.txt"))).status).toBe(401);
  session = { user: { id: "user_1" }, session: { impersonatedBy: "admin_1" } };
  expect((await upload(new File(["x"], "a.txt"))).status).toBe(403);
  expect(stored).toEqual([]);
});

test("answers 503 without a store and 400 without a file", async () => {
  store = null;
  expect((await upload(new File(["x"], "a.txt"))).status).toBe(503);
  store = {};
  expect((await upload(null)).status).toBe(400);
});

test("refuses a file that could never be sent by email", async () => {
  expect((await upload(new File(["x"], "virus.exe"))).status).toBe(422);
  expect(stored).toEqual([]);
});

test("stores the file as the signed-in user", async () => {
  const response = await upload(new File(["hello"], "notes.txt", { type: "text/plain" }));
  expect(response.status).toBe(200);
  expect(stored[0]?.uploadedByUserId).toBe("user_1");
  expect(stored[0]?.filename).toBe("notes.txt");
});
