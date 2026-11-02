import { describe, expect, test } from "bun:test";
import { run } from "../src/run.ts";
import { fakeFetch, SANDBOX_KEY, testIo } from "./helpers.ts";

const env = { COSS_API_KEY: SANDBOX_KEY };
const list = (data: unknown[]) => ({ object: "list", data, has_more: false });

const host = {
  object: "scheduling.host",
  id: "host_1",
  uid: "doctor_1",
  name: "Dr. Reyes",
  email: null,
  time_zone: "UTC",
  attributes: {},
  metadata: {},
  status: "active",
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

const booking = {
  object: "scheduling.booking",
  id: "book_1",
  title: "Consultation",
  status: "confirmed",
  start: "2027-01-04T15:00:00.000Z",
  end: "2027-01-04T15:30:00.000Z",
  hosts: ["host_1"],
  attendees: [],
};

describe("coss scheduling", () => {
  test("hosts", async () => {
    const api = fakeFetch({ "GET /v1/scheduling/hosts": list([host]) });
    const io = testIo({ env, fetch: api.fetch });
    expect(await run(["scheduling", "hosts"], io)).toBe(0);
    expect(io.output()).toContain("Dr. Reyes");
  });

  test("bookings, filtered, and a bad status is a usage error", async () => {
    const api = fakeFetch({ "GET /v1/scheduling/bookings": list([booking]) });
    const io = testIo({ env, fetch: api.fetch });
    expect(await run(["scheduling", "bookings", "--status", "confirmed"], io)).toBe(0);
    expect(io.output()).toContain("Consultation");
    expect(io.output()).toContain("2027-01-04 15:00");
    const bad = testIo({ env, fetch: api.fetch });
    expect(await run(["scheduling", "bookings", "--status", "nope"], bad)).toBe(2);
  });
});
