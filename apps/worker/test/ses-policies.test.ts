import { describe, expect, test } from "bun:test";
import { cossPolicies } from "../scripts/ses-policies.ts";

const policies = cossPolicies({
  region: "us-east-2",
  account: "123456789012",
  name: "coss",
  tenantPrefix: "coss",
  queueArn: "arn:aws:sqs:us-east-2:123456789012:coss-events",
});

const statements = Object.values(policies).flatMap((policy) => policy.Statement);

describe("cossPolicies", () => {
  test("never grant wildcard actions or account-wide resources", () => {
    for (const statement of statements) {
      expect(statement.Action.every((action) => !action.includes("*"))).toBe(true);
      expect(statement.Resource).not.toContain("*");
      for (const resource of statement.Resource) {
        expect(resource).toMatch(/^arn:aws:(ses|sqs):us-east-2:123456789012:/);
      }
    }
  });

  test("the api can only send, with the coss.com configuration sets", () => {
    // SES authorizes sends against the sender address, which carries no tags (verified live).
    expect(policies.api.Statement).toEqual([
      expect.objectContaining({
        Action: ["ses:SendEmail"],
        Resource: ["arn:aws:ses:us-east-2:123456789012:identity/*"],
      }),
      expect.objectContaining({
        Action: ["ses:SendEmail"],
        Resource: [
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-tls",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-marketing",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-marketing-tls",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-*",
        ],
      }),
    ]);
  });

  test("identity changes require the coss_managed tag; tenants are limited to the prefix", () => {
    const destructive = ["ses:DeleteEmailIdentity", "ses:PutEmailIdentityMailFromAttributes"];
    for (const statement of statements) {
      if (statement.Action.some((action) => destructive.includes(action))) {
        expect(statement.Condition).toEqual({
          StringEquals: { "aws:ResourceTag/coss_managed": "coss" },
        });
      }
      if (statement.Action.includes("ses:CreateEmailIdentity")) {
        expect(statement.Condition).toEqual({
          StringEquals: { "aws:RequestTag/coss_managed": "coss" },
        });
      }
      for (const resource of statement.Resource.filter((r) => r.includes(":tenant/"))) {
        expect(resource).toEndWith(":tenant/coss-*");
      }
    }
  });

  test("the worker can send scheduled emails with only the coss.com configuration sets", () => {
    const sends = policies.worker.Statement.filter((statement) =>
      statement.Action.includes("ses:SendEmail"),
    );
    expect(sends).toEqual([
      {
        Sid: "SendFromIdentities",
        Effect: "Allow",
        Action: ["ses:SendEmail"],
        Resource: ["arn:aws:ses:us-east-2:123456789012:identity/*"],
      },
      {
        Sid: "SendWithCossConfigurationSet",
        Effect: "Allow",
        Action: ["ses:SendEmail"],
        Resource: [
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-tls",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-marketing",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-marketing-tls",
          "arn:aws:ses:us-east-2:123456789012:configuration-set/coss-*",
        ],
      },
    ]);
    // Sender addresses aren't tagged resources; send grants must have no tag condition.
    for (const statement of sends) expect(statement.Condition).toBeUndefined();
  });

  test("only the worker manages dedicated IPs, created tagged and changed only when tagged", () => {
    const dedicated = (app: keyof typeof policies) =>
      policies[app].Statement.flatMap((statement) => statement.Action).filter((action) =>
        /DedicatedIp|ConfigurationSet(?!EventDestinations)/.test(action),
      );
    expect(dedicated("api")).toEqual([]);
    expect(dedicated("dashboard")).toEqual([]);
    for (const statement of policies.worker.Statement) {
      const creates = statement.Action.some((action) =>
        ["ses:CreateDedicatedIpPool", "ses:CreateConfigurationSet"].includes(action),
      );
      const deletes = statement.Action.some((action) =>
        ["ses:DeleteDedicatedIpPool", "ses:DeleteConfigurationSet"].includes(action),
      );
      if (creates) {
        expect(statement.Condition).toEqual({
          StringEquals: { "aws:RequestTag/coss_managed": "coss" },
        });
      }
      if (deletes) {
        expect(statement.Condition).toEqual({
          StringEquals: { "aws:ResourceTag/coss_managed": "coss" },
        });
      }
      for (const resource of statement.Resource) {
        if (resource.includes(":dedicated-ip-pool/")) expect(resource).toEndWith("/coss-*");
      }
    }
  });

  test("the worker reads only the events queue and cannot create identities", () => {
    const actions = policies.worker.Statement.flatMap((statement) => statement.Action);
    expect(actions).not.toContain("ses:CreateEmailIdentity");
    expect(
      policies.worker.Statement.find((statement) => statement.Sid === "ConsumeSesEvents"),
    ).toMatchObject({
      Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
      Resource: ["arn:aws:sqs:us-east-2:123456789012:coss-events"],
    });
  });
});

describe("cossPolicies with receiving", () => {
  const inbound = cossPolicies({
    region: "us-east-2",
    account: "123456789012",
    name: "coss",
    tenantPrefix: "coss",
    queueArn: "arn:aws:sqs:us-east-2:123456789012:coss-events",
    inbound: {
      bucket: "coss-inbound-123456789012",
      queueArn: "arn:aws:sqs:us-east-2:123456789012:coss-inbound",
    },
  });
  const s3 = (app: keyof typeof inbound) =>
    inbound[app].Statement.filter((statement) =>
      statement.Action.some((action) => action.startsWith("s3:")),
    );

  test("the api only reads and deletes received email content", () => {
    for (const app of ["api"] as const) {
      expect(s3(app)).toEqual([
        expect.objectContaining({
          Action: ["s3:GetObject", "s3:DeleteObject"],
          Resource: ["arn:aws:s3:::coss-inbound-123456789012/orgs/*"],
        }),
      ]);
    }
  });

  test("the dashboard can store simulations only under the content prefix", () => {
    expect(s3("dashboard")).toEqual([
      expect.objectContaining({
        Action: ["s3:GetObject", "s3:DeleteObject"],
        Resource: ["arn:aws:s3:::coss-inbound-123456789012/orgs/*"],
      }),
      expect.objectContaining({
        Action: ["s3:PutObject"],
        Resource: ["arn:aws:s3:::coss-inbound-123456789012/orgs/*"],
      }),
    ]);
  });

  test("only the worker reads landed messages and lists organizations", () => {
    const resources = s3("worker").flatMap((statement) => statement.Resource);
    expect(resources).toEqual([
      "arn:aws:s3:::coss-inbound-123456789012/landing/*",
      "arn:aws:s3:::coss-inbound-123456789012/orgs/*",
      "arn:aws:s3:::coss-inbound-123456789012",
    ]);
    const list = s3("worker").find((statement) => statement.Action.includes("s3:ListBucket"));
    expect(list?.Condition).toEqual({ StringLike: { "s3:prefix": "orgs/*" } });
    expect(
      inbound.worker.Statement.find((statement) => statement.Sid === "ConsumeReceiptNotifications")
        ?.Resource,
    ).toEqual(["arn:aws:sqs:us-east-2:123456789012:coss-inbound"]);
  });
});
