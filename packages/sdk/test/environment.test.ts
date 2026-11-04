/** The environment resource: request shape, and how results come back. */
import { describe, expect, test } from "bun:test";
import { Coss, type Environment } from "../src/index.ts";
import { apiError, json, mockFetch } from "./helpers.ts";

const API_KEY = "coss_test_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl";

const sampleEnvironment: Environment = {
  object: "environment",
  id: "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Development",
  slug: "development",
  mode: "sandbox",
  project: { id: "proj_01k7c8m4q2f3e9v6t5r1n0p8yz", name: "Default", slug: "default" },
  organization: {
    id: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
    name: "Acme",
    slug: "acme",
    api_version: "2026-10-01",
    hipaa_mode: false,
  },
  api_key: {
    id: "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
    name: "Backend",
    start: "coss_test_Ab",
    access: "restricted",
    permissions: ["email:send", "email:read"],
  },
};

function client(...handlers: Parameters<typeof mockFetch>) {
  const { fetch, calls } = mockFetch(...handlers);
  return { coss: new Coss({ apiKey: API_KEY, baseUrl: "https://api.test", fetch }), calls };
}

describe("coss.environment", () => {
  test("get reads the key's environment", async () => {
    const { coss, calls } = client(json(200, sampleEnvironment));

    const result = await coss.environment.get();

    expect(result).toEqual({ data: sampleEnvironment, error: null });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/v1/environment" });
    expect(calls[0]?.body).toBeNull();
  });

  test("an invalid key comes back as an error, never thrown", async () => {
    const { coss } = client(
      apiError(401, { type: "authentication_error", code: "invalid_api_key" }),
    );

    const result = await coss.environment.get();

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ type: "authentication_error", status: 401 });
  });
});
