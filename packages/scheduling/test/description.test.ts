import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { descriptionParts } from "../src/description-links.ts";
import {
  createEventType,
  createHost,
  getEventType,
  isWithinDomains,
  linkedHosts,
  type SchedulingEnvironment,
  SchedulingError,
  updateEventType,
} from "../src/index.ts";

describe("what a description links to", () => {
  test.each([
    ["Bring your ID. Parking is free.", []],
    ["Takes 30 min, at 1.5x the usual rate. a.m. only, e.g. Mondays.", []],
    ["See https://acme.com/intake.", ["acme.com"]],
    ["See acme.com/intake or www.acme.com.", ["acme.com", "www.acme.com"]],
    ["Questions? help@acme.com", ["acme.com"]],
    ["https://acme.com/report.pdf", ["acme.com"]],
    ["HTTPS://ACME.COM", ["acme.com"]],
    ["https://evil.com/acme.com", ["evil.com"]],
    ["https://%65vil.com", ["evil.com"]],
    ["evil.de and evil.xyz", ["evil.de", "evil.xyz"]],
  ])("%s", (text, hosts) => {
    expect(linkedHosts(text)).toEqual(hosts);
  });

  test("what a reader could follow counts, whatever's hiding in it", () => {
    expect(linkedHosts("See аcme.com")).toEqual(["xn--cme-5cd.com"]);
    expect(linkedHosts("acme。com")).toEqual(["acme.com"]);
    expect(linkedHosts("evil\u200b.com")).toEqual(["evil.com"]);
    expect(linkedHosts("e\u200dvil.com")).toEqual(["evil.com"]);
    expect(linkedHosts("evil.xn--p1ai")).toEqual(["evil.xn--p1ai"]);
    expect(linkedHosts("https://acme.com/ Visit evil.c\u034fom/login")).toEqual([
      "acme.com",
      "evil.com",
    ]);
    expect(linkedHosts("evil.c\ufe0fom")).toEqual(["evil.com"]);
    expect(linkedHosts("evil.c\tom")).toEqual(["evil.com"]);
    expect(linkedHosts("https://acme.com/ Continue here...evil.com/login")).toEqual([
      "acme.com",
      "evil.com",
    ]);
    expect(linkedHosts("See you there...bring your ID.\nThanks")).toEqual([]);
    expect(linkedHosts("Ends here.\nNext line.")).toEqual([]);
    expect(linkedHosts("Dr. Reyes 👩\u200d⚕️ sees you soon.")).toEqual([]);
  });

  test("a nested link is checked as the outer one, and that's what's rendered", () => {
    const text = "HTTPS://acme.com/https://evil.com/login";
    expect(linkedHosts(text)).toEqual(["acme.com"]);
    expect(descriptionParts(text)).toEqual([
      { kind: "link", text, href: "https://acme.com/https://evil.com/login" },
    ]);
  });

  test.each([
    "http://acme.com",
    "javascript://acme.com/%0aalert(1)",
    "ftp://acme.com",
    "https://[broken",
    "https://acme.com@evil.com/",
    "https://acme.com＃@evil.com/login",
    "https://acme.com／@evil.com/login",
    "https://acme.com？@evil.com/login",
    "https://аcme.com",
    "https://acme。com",
    "https://ac\u200bme.com",
  ])("%s isn't a link it can allow", (text) => {
    expect(linkedHosts(text)).toBeNull();
  });

  test("a domain covers its subdomains, and nothing that only looks like them", () => {
    expect(isWithinDomains("acme.com", ["acme.com"])).toBe(true);
    expect(isWithinDomains("book.acme.com", ["acme.com"])).toBe(true);
    expect(isWithinDomains("notacme.com", ["acme.com"])).toBe(false);
    expect(isWithinDomains("acme.com.evil.com", ["acme.com"])).toBe(false);
    expect(isWithinDomains("com", ["acme.com"])).toBe(false);
    expect(isWithinDomains("acme.com", [])).toBe(false);
  });
});

async function setUp() {
  const tenant = await createTestTenant();
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
  };
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
  const suffix = uniqueSuffix();
  const verified = `verified-${suffix}.example`;
  const addDomain = (values: {
    name: string;
    status?: "pending" | "verified";
    organizationId?: string;
    subaccountId?: string;
  }) =>
    db.insert(schema.domain).values({
      organizationId: tenant.organization.id,
      status: "verified",
      provider: "fake",
      mailFromDomain: `mail.${values.name}`,
      ...values,
    });
  await addDomain({ name: verified });
  const create = (description: string | null | undefined, overrides = {}) =>
    createEventType(env, {
      title: "Consultation",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
      description,
      ...overrides,
    } as never);
  return { env, verified, suffix, addDomain, create };
}

async function refusal(run: Promise<unknown>): Promise<{ code: string; param?: string } | "ok"> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return { code: error.code, param: error.param };
    throw error;
  }
}

const refused = { code: "content_refused", param: "description" };

describe("what the page makes clickable", () => {
  const hrefs = (text: string) =>
    descriptionParts(text).flatMap((part) => (part.kind === "link" ? [part.href] : []));

  test("keeps the text around a link, and the punctuation after it", () => {
    expect(descriptionParts("See https://acme.com/a, then call.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://acme.com/a", href: "https://acme.com/a" },
      { kind: "text", text: ", then call." },
    ]);
  });

  test("keeps a bracket that belongs to the link, and drops one that doesn't", () => {
    expect(hrefs("Read https://acme.com/intake_(new_patient).")).toEqual([
      "https://acme.com/intake_(new_patient)",
    ]);
    expect(hrefs("(see https://acme.com/a)")).toEqual(["https://acme.com/a"]);
    expect(hrefs("[https://acme.com/a[1]]")).toEqual(["https://acme.com/a[1]"]);
  });

  test("a very long scheme is still refused, and quickly", () => {
    const text = `${"a".repeat(1990)}://x`;
    expect(linkedHosts(text)).toBeNull();
    expect(linkedHosts(`${"a".repeat(40)}https://acme.com`)).toBeNull();
    expect(hrefs(`${"!".repeat(2000)}`)).toEqual([]);
  });

  test.each([
    "http://evil.com",
    "https://user@evil.com",
    "javascript://evil.com/%0aalert(1)",
    "https://аcme.com",
    "plain evil.com",
  ])("never links %s", (text) => {
    expect(hrefs(text)).toEqual([]);
  });

  test("anything it would link passes the same check", () => {
    for (const text of [
      "See https://acme.com.",
      "(https://acme.com/a?b=c#d)",
      "https://ACME.com",
    ]) {
      const hosts = linkedHosts(text);
      expect(hosts).toEqual(["acme.com"]);
      for (const href of hrefs(text)) expect(new URL(href).hostname).toBe("acme.com");
    }
  });
});

describe("an event type's description", () => {
  test("is optional, and can be set, changed and removed", async () => {
    const { env, create } = await setUp();
    const eventType = await create(undefined);
    expect(eventType.description).toBeNull();

    const set = await updateEventType(env, eventType.id, { description: "Bring your ID." });
    expect(set.description).toBe("Bring your ID.");

    const other = await updateEventType(env, eventType.id, { min_notice_minutes: 60 });
    expect(other.description).toBe("Bring your ID.");

    const cleared = await updateEventType(env, eventType.id, { description: null });
    expect(cleared.description).toBeNull();
    expect((await getEventType(env, eventType.id)).description).toBeNull();
  });

  test("links to a verified domain or its subdomains", async () => {
    const { create, verified } = await setUp();
    const text = `Read https://${verified}/intake or book.${verified} first.`;
    expect((await create(text)).description).toBe(text);
  });

  test("refuses links anywhere else, on create and on update", async () => {
    const { env, create, verified } = await setUp();
    const shapes = [
      "See https://evil.example/login",
      "See evil.example",
      `See https://${verified}.evil.example`,
      `See https://${verified}@evil.example`,
      `See https://${verified}＃@evil.example`,
      `HTTPS://evil.example/https://${verified}`,
      "evil\u200b.example",
      `See http://${verified}`,
    ];
    for (const text of shapes) {
      expect(await refusal(create(text))).toEqual(refused);
    }
    const eventType = await create("Fine.");
    expect(
      await refusal(updateEventType(env, eventType.id, { description: shapes[0] as string })),
    ).toEqual(refused);
    expect((await getEventType(env, eventType.id)).description).toBe("Fine.");
  });

  test("a pending domain, a sub-account's and another organization's don't count", async () => {
    const { env, create, addDomain, suffix } = await setUp();
    await addDomain({ name: `pending-${suffix}.example`, status: "pending" });
    const [subaccount] = await db
      .insert(schema.emailSubaccount)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        name: "A customer of theirs",
      })
      .returning({ id: schema.emailSubaccount.id });
    await addDomain({ name: `sub-${suffix}.example`, subaccountId: subaccount?.id as string });
    const other = await createTestTenant();
    await addDomain({ name: `other-${suffix}.example`, organizationId: other.organization.id });

    for (const name of ["pending", "sub", "other"]) {
      expect(await refusal(create(`See https://${name}-${suffix}.example`))).toEqual(refused);
    }
  });

  test("says which link it refused, but a title still can't have one at all", async () => {
    const { create, verified } = await setUp();
    let message = "";
    await create("See evil.example").catch((error: Error) => {
      message = error.message;
    });
    expect(message).toContain("evil.example");
    expect(verified).toContain(".example");
    expect(await refusal(create(null, { title: "See acme.com" }))).toMatchObject({
      code: "content_refused",
      param: "title",
    });
  });

  test("goes through screening with the title", async () => {
    const { env, create } = await setUp();
    const eventType = await create("Fine.");
    const texts: string[] = [];
    const screen = async ({ text }: { text: string }) => {
      texts.push(text);
      return !text.includes("wire money");
    };
    const live = { ...env, mode: "live" as const };
    expect(
      await refusal(
        updateEventType(live, eventType.id, { description: "Please wire money" }, { screen }),
      ),
    ).toMatchObject({ code: "content_refused" });
    expect(texts.join(" ")).toContain("wire money");
  });
});
