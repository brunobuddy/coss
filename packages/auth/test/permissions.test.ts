import { describe, expect, test } from "bun:test";
import {
  assignableOrgRoles,
  canRemoveOrgMember,
  orgRoleCan,
  orgRoles,
} from "../src/permissions.ts";

describe("org roles", () => {
  test("owner keeps Better Auth defaults and gets full coss.com access", () => {
    expect(
      orgRoles.owner.authorize({
        organization: ["update", "delete"],
        member: ["create", "update", "delete"],
        invitation: ["create", "cancel"],
        apiKey: ["create", "delete"],
        project: ["create"],
        email: ["send"],
      }).success,
    ).toBe(true);
  });

  test("admin cannot delete the organization but can manage keys", () => {
    expect(orgRoles.admin.authorize({ organization: ["delete"] }).success).toBe(false);
    expect(
      orgRoles.admin.authorize({ invitation: ["create"], apiKey: ["create", "manage"] }).success,
    ).toBe(true);
  });

  test("member is read-only, apart from personal API keys", () => {
    expect(orgRoles.member.authorize({ apiKey: ["read"], project: ["read"] }).success).toBe(true);
    // Better Auth checks `apiKey:create` for every key; which keys a member may create is
    // `keyCreationAllowed`'s call.
    expect(orgRoles.member.authorize({ apiKey: ["create"] }).success).toBe(true);
    expect(orgRoles.member.authorize({ apiKey: ["manage"] }).success).toBe(false);
    expect(orgRoles.member.authorize({ apiKey: ["delete"] }).success).toBe(false);
    expect(orgRoles.member.authorize({ project: ["create"] }).success).toBe(false);
    expect(orgRoles.member.authorize({ invitation: ["create"] }).success).toBe(false);
  });

  test("members can read suppressions; admins can also add and remove them", () => {
    expect(orgRoles.member.authorize({ suppression: ["read"] }).success).toBe(true);
    expect(orgRoles.member.authorize({ suppression: ["create"] }).success).toBe(false);
    expect(orgRoles.member.authorize({ suppression: ["delete"] }).success).toBe(false);
    expect(orgRoles.admin.authorize({ suppression: ["create", "read", "delete"] }).success).toBe(
      true,
    );
  });

  test("owners and admins configure SSO; only owners require it; members see nothing", () => {
    expect(orgRoles.owner.authorize({ sso: ["read", "update", "require"] }).success).toBe(true);
    expect(orgRoles.admin.authorize({ sso: ["read", "update"] }).success).toBe(true);
    expect(orgRoles.admin.authorize({ sso: ["require"] }).success).toBe(false);
    expect(orgRoles.member.authorize({ sso: ["read"] }).success).toBe(false);
    expect(orgRoles.owner.authorize({ scim: ["read", "update"] }).success).toBe(true);
    expect(orgRoles.admin.authorize({ scim: ["read", "update"] }).success).toBe(true);
    expect(orgRoles.member.authorize({ scim: ["read"] }).success).toBe(false);
  });
});

describe("orgRoleCan", () => {
  test("handles comma-joined roles and unknown roles", () => {
    expect(orgRoleCan("member,admin", { apiKey: ["manage"] })).toBe(true);
    expect(orgRoleCan("member", { apiKey: ["manage"] })).toBe(false);
    expect(orgRoleCan("nope", { project: ["read"] })).toBe(false);
    expect(orgRoleCan(null, { project: ["read"] })).toBe(false);
  });

  test("role names must match exactly", () => {
    expect(orgRoleCan(" owner", { apiKey: ["create"] })).toBe(false);
    expect(orgRoleCan("owner ", { apiKey: ["create"] })).toBe(false);
    expect(orgRoleCan("constructor", { project: ["read"] })).toBe(false);
  });
});

describe("assignableOrgRoles", () => {
  test("owners may assign every role to anyone, including other owners and themselves", () => {
    expect(assignableOrgRoles("owner", "member")).toEqual(["member", "admin", "owner"]);
    expect(assignableOrgRoles("owner", "owner")).toEqual(["member", "admin", "owner"]);
  });

  test("admins may switch non-owners between member and admin, but never touch an owner", () => {
    expect(assignableOrgRoles("admin", "member")).toEqual(["member", "admin"]);
    expect(assignableOrgRoles("admin", "admin")).toEqual(["member", "admin"]);
    expect(assignableOrgRoles("admin", "owner")).toEqual([]);
    expect(assignableOrgRoles("admin", "member,owner")).toEqual([]);
  });

  test("members and unknown roles may not change anyone", () => {
    expect(assignableOrgRoles("member", "member")).toEqual([]);
    expect(assignableOrgRoles("nope", "member")).toEqual([]);
    expect(assignableOrgRoles(" owner", "member")).toEqual([]);
  });

  test("comma-joined actor roles use their most privileged role", () => {
    expect(assignableOrgRoles("member,owner", "owner")).toEqual(["member", "admin", "owner"]);
    expect(assignableOrgRoles("member,admin", "member")).toEqual(["member", "admin"]);
  });
});

describe("canRemoveOrgMember", () => {
  test("owners may remove anyone, including other owners", () => {
    expect(canRemoveOrgMember("owner", "member")).toBe(true);
    expect(canRemoveOrgMember("owner", "admin")).toBe(true);
    expect(canRemoveOrgMember("owner", "owner")).toBe(true);
  });

  test("admins may remove non-owners only", () => {
    expect(canRemoveOrgMember("admin", "member")).toBe(true);
    expect(canRemoveOrgMember("admin", "admin")).toBe(true);
    expect(canRemoveOrgMember("admin", "owner")).toBe(false);
    expect(canRemoveOrgMember("admin", "member,owner")).toBe(false);
  });

  test("members and unknown roles may not remove anyone", () => {
    expect(canRemoveOrgMember("member", "member")).toBe(false);
    expect(canRemoveOrgMember("nope", "member")).toBe(false);
    expect(canRemoveOrgMember(" owner", "member")).toBe(false);
  });
});
