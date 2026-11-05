/** What a team page reaches: never more than it was given, whatever's in the row. */
import { describe, expect, test } from "bun:test";
import { createTestTenant } from "@coss/tenancy/testing";
import {
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  getBooking,
  managedHosts,
  reassignBooking,
  type SchedulingEnvironment,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const START = Date.parse("2031-01-06T10:00:00Z");
const plain = testSchedulingDeps({ now: () => new Date("2031-01-06T00:00:00Z") });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };

async function environment(): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
}

describe("managedHosts", () => {
  test("an empty filter reaches nobody, though it would match everyone", async () => {
    const env = await environment();
    await createHost(env, { name: "A", time_zone: "UTC" });
    const hosts = await managedHosts(env, {
      managerHostIds: null,
      managerHostFilter: {},
      createdByUserId: null,
    });
    expect(hosts).toEqual([]);
  });

  test("an empty filter with a dashboard member behind it reaches this environment", async () => {
    const env = await environment();
    const other = await environment();
    const mine = await createHost(env, { name: "Mine", time_zone: "UTC" });
    await createHost(other, { name: "Theirs", time_zone: "UTC" });
    const hosts = await managedHosts(env, {
      managerHostIds: null,
      managerHostFilter: {},
      createdByUserId: "user_1",
    });
    expect(hosts.map((host) => host.id)).toEqual([mine.id]);
  });

  test("neither reaches nobody", async () => {
    const env = await environment();
    await createHost(env, { name: "A", time_zone: "UTC" });
    const hosts = await managedHosts(env, {
      managerHostIds: null,
      managerHostFilter: null,
      createdByUserId: null,
    });
    expect(hosts).toEqual([]);
  });

  test("a named host of another environment isn't reached", async () => {
    const env = await environment();
    const other = await environment();
    const theirs = await createHost(other, { name: "Theirs", time_zone: "UTC" });
    const hosts = await managedHosts(env, {
      managerHostIds: [theirs.id],
      managerHostFilter: null,
      createdByUserId: null,
    });
    expect(hosts).toEqual([]);
  });

  test("a filter only reaches this environment", async () => {
    const env = await environment();
    const other = await environment();
    const mine = await createHost(env, {
      name: "Mine",
      time_zone: "UTC",
      attributes: { team: "heart" },
    });
    await createHost(other, { name: "Theirs", time_zone: "UTC", attributes: { team: "heart" } });
    const hosts = await managedHosts(env, {
      managerHostIds: null,
      managerHostFilter: { team: "heart" },
      createdByUserId: null,
    });
    expect(hosts.map((host) => host.id)).toEqual([mine.id]);
  });
});

describe("a group session, moved from a team page", () => {
  async function session() {
    const env = await environment();
    const add = async (name: string) => {
      const host = await createHost(env, { name, time_zone: "UTC" });
      await createSchedule(env, host.id, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
      return host;
    };
    const [lead, peer, outsider] = [await add("Lead"), await add("Peer"), await add("Outsider")];
    const type = await createEventType(env, {
      title: "Class",
      kind: "group",
      duration_minutes: 30,
      capacity: 3,
      hosts: [{ host: lead.id, role: "member", weight: 100, schedule: null }],
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: type.id, startMs: START, attendee },
      plain,
      actor,
    );
    const move = (toHost: string, fromHosts: string[], toHosts: string[]) =>
      reassignBooking(
        env,
        booking.id,
        { changes: [{ to_host: toHost }], reason_code: "other", overrides: ["any_host"] },
        plain,
        actor,
        { fromHosts: new Set(fromHosts), toHosts: new Set(toHosts) },
      );
    return { env, booking, lead, peer, outsider, move };
  }

  test("someone else's session doesn't exist", async () => {
    const { peer, outsider, move } = await session();
    await expect(move(peer.id, [outsider.id], [peer.id])).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("it can't go off the team", async () => {
    const { lead, peer, outsider, move } = await session();
    await expect(move(outsider.id, [lead.id], [lead.id, peer.id])).rejects.toMatchObject({
      code: "invalid_reassignment",
    });
  });

  test("it can go to someone on it", async () => {
    const { env, booking, lead, peer, move } = await session();
    await move(peer.id, [lead.id], [lead.id, peer.id]);
    expect((await getBooking(env, booking.id, plain)).hosts).toEqual([peer.id]);
  });
});
