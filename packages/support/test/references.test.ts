import { beforeAll, describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { createVerifiedDomain } from "@coss/email/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import {
  recentEmailReferences,
  resolveSupportReference,
  supportReferenceLabel,
} from "../src/references.ts";

async function insertEmail(tenant: TestTenant, environmentId: string, subject: string) {
  const [row] = await db
    .insert(schema.email)
    .values({
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId,
      from: "hello@example.test",
      to: ["someone@example.test"],
      subject,
    })
    .returning({ id: schema.email.id });
  if (!row) throw new Error("No email row.");
  return row.id;
}

describe("support references", () => {
  let mine: TestTenant;
  let other: TestTenant;

  beforeAll(async () => {
    mine = await createTestTenant();
    other = await createTestTenant();
  });

  test("an item of the organization resolves to its type", async () => {
    const emailId = await insertEmail(mine, mine.production.id, "Invoice");
    const domain = await createVerifiedDomain(mine.organization.id);
    const organizationId = mine.organization.id;
    expect(await resolveSupportReference({ organizationId, id: ` ${emailId} ` })).toEqual({
      type: "email",
      id: emailId,
    });
    expect(await resolveSupportReference({ organizationId, id: domain.id })).toEqual({
      type: "domain",
      id: domain.id,
    });
    expect(supportReferenceLabel("email")).toBe("Email");
    expect(supportReferenceLabel("form")).toBe("Form");
  });

  test("another organization's item doesn't resolve", async () => {
    const emailId = await insertEmail(other, other.production.id, "Theirs");
    const domain = await createVerifiedDomain(other.organization.id);
    const organizationId = mine.organization.id;
    expect(await resolveSupportReference({ organizationId, id: emailId })).toBeNull();
    expect(await resolveSupportReference({ organizationId, id: domain.id })).toBeNull();
  });

  test("ids that name nothing don't resolve", async () => {
    const organizationId = mine.organization.id;
    for (const id of ["", "email", "nope_01k", newId("email"), "user_01k", `'; drop table email`]) {
      expect(await resolveSupportReference({ organizationId, id })).toBeNull();
    }
  });

  test("recent emails are only the environment's own, newest first", async () => {
    const first = await insertEmail(mine, mine.development.id, "First");
    const second = await insertEmail(mine, mine.development.id, "");
    await insertEmail(mine, mine.production.id, "Another environment");
    await insertEmail(other, other.development.id, "Another organization");

    const items = await recentEmailReferences({
      organizationId: mine.organization.id,
      environmentId: mine.development.id,
    });
    expect(items.map((item) => item.id).sort()).toEqual([first, second].sort());
    expect(items.find((item) => item.id === second)?.label).toBe("(no subject)");
    expect(items[0]?.detail).toBe("someone@example.test");

    // An environment id alone never crosses organizations.
    expect(
      await recentEmailReferences({
        organizationId: other.organization.id,
        environmentId: mine.development.id,
      }),
    ).toEqual([]);
  });
});
