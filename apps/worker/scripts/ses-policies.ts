/**
 * Least-privilege IAM policies for the apps when `EMAIL_PROVIDER=ses`, created by `ses:bootstrap`
 * as customer-managed policies to attach to whatever identity each app runs as.
 *
 * Identities coss.com creates are tagged `coss_managed=<tenant prefix>`; destructive identity operations
 * are only allowed on identities with that tag, so domains managed outside coss.com in the same account
 * (e.g. the company's own) can't be changed or deleted by the apps. Sending can't be limited by tag:
 * SES authorizes `SendEmail` against the sender *address* (`identity/hello@acme.com`), which is not
 * a tagged resource. Sends are confined by the configuration sets instead (verified live: another
 * configuration set, or none so the identity's default applies, is denied), and the app always
 * sends with a `<prefix>-…` tenant, which SES only allows with identities associated with it.
 * Each stream has its configuration set (`<name>`, `<name>-marketing`); both are allowed.
 * Dedicated IPs add one managed pool per organization and a configuration set per stream sending
 * through it, named `<prefix>-<organization id>[-marketing]` and tagged `coss_managed`; only the
 * worker manages them.
 */
import { configurationSetsFor, MANAGED_TAG, requiredTlsSetFor } from "@coss/email/ses";

export type PolicyContext = {
  region: string;
  account: string;
  /** The transactional configuration set (and resource name prefix), e.g. `coss`. */
  name: string;
  tenantPrefix: string;
  queueArn: string;
  /** Receiving (`--managed-domain`): the inbound bucket and the receipt notification queue. */
  inbound?: { bucket: string; queueArn: string };
};

export type PolicyDocument = {
  Version: "2012-10-17";
  Statement: {
    Sid: string;
    Effect: "Allow";
    Action: string[];
    Resource: string[];
    Condition?: Record<string, Record<string, string | string[]>>;
  }[];
};

export function cossPolicies(
  ctx: PolicyContext,
): Record<"api" | "dashboard" | "worker", PolicyDocument> {
  const ses = `arn:aws:ses:${ctx.region}:${ctx.account}`;
  const identities = `${ses}:identity/*`;
  const tenants = `${ses}:tenant/${ctx.tenantPrefix}-*`;
  const configurationSets = Object.values(configurationSetsFor(ctx.name)).flatMap((name) => [
    `${ses}:configuration-set/${name}`,
    `${ses}:configuration-set/${requiredTlsSetFor(name)}`,
  ]);
  // Organizations' dedicated IP configuration sets and pools (`<prefix>-<organization id>…`).
  const dedicatedSets = `${ses}:configuration-set/${ctx.tenantPrefix}-*`;
  const dedicatedPools = `${ses}:dedicated-ip-pool/${ctx.tenantPrefix}-*`;
  const managed = { StringEquals: { [`aws:ResourceTag/${MANAGED_TAG}`]: ctx.tenantPrefix } };
  // Identities, dedicated IP pools and their configuration sets are created with the tag.
  const tagsNewResources = {
    StringEquals: { [`aws:RequestTag/${MANAGED_TAG}`]: ctx.tenantPrefix },
  };

  // Received emails' content lives under `orgs/`; SES writes raw messages under `landing/`,
  // which only the worker reads (and deletes once recorded).
  const bucket = ctx.inbound ? `arn:aws:s3:::${ctx.inbound.bucket}` : null;
  const contentReads = bucket
    ? [
        {
          Sid: "ReadAndDeleteReceivedEmailContent",
          Effect: "Allow" as const,
          Action: ["s3:GetObject", "s3:DeleteObject"],
          Resource: [`${bucket}/orgs/*`],
        },
      ]
    : [];

  // `/v1/domains` and the dashboard's domain pages run the same code (`SesIdentityProvider`), so
  // both need the same permissions.
  const manageDomains: PolicyDocument["Statement"] = [
    {
      Sid: "ManageCossTenants",
      Effect: "Allow",
      Action: ["ses:CreateTenant", "ses:GetTenant", "ses:TagResource"],
      Resource: [tenants],
    },
    {
      Sid: "AssociateTenantResources",
      Effect: "Allow",
      Action: ["ses:CreateTenantResourceAssociation", "ses:DeleteTenantResourceAssociation"],
      Resource: [tenants, identities, ...configurationSets],
    },
    {
      Sid: "InspectIdentities",
      Effect: "Allow",
      Action: ["ses:GetEmailIdentity", "ses:ListResourceTenants", "ses:ListTagsForResource"],
      Resource: [identities],
    },
    {
      Sid: "CreateTaggedIdentities",
      Effect: "Allow",
      Action: ["ses:CreateEmailIdentity", "ses:TagResource"],
      Resource: [identities],
      Condition: tagsNewResources,
    },
    {
      Sid: "ChangeCossIdentities",
      Effect: "Allow",
      Action: ["ses:DeleteEmailIdentity", "ses:PutEmailIdentityMailFromAttributes"],
      Resource: [identities],
      Condition: managed,
    },
  ];

  return {
    api: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "SendFromIdentities",
          Effect: "Allow",
          Action: ["ses:SendEmail"],
          Resource: [identities],
        },
        {
          Sid: "SendWithCossConfigurationSet",
          Effect: "Allow",
          Action: ["ses:SendEmail"],
          Resource: [...configurationSets, dedicatedSets],
        },
        ...manageDomains,
        ...contentReads,
      ],
    },
    dashboard: {
      Version: "2012-10-17",
      Statement: [
        ...manageDomains,
        ...contentReads,
        ...(bucket
          ? [
              {
                Sid: "StoreSimulatedReceivedEmailContent",
                Effect: "Allow" as const,
                Action: ["s3:PutObject"],
                Resource: [`${bucket}/orgs/*`],
              },
            ]
          : []),
      ],
    },
    worker: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "SendFromIdentities",
          Effect: "Allow",
          Action: ["ses:SendEmail"],
          Resource: [identities],
        },
        {
          Sid: "SendWithCossConfigurationSet",
          Effect: "Allow",
          Action: ["ses:SendEmail"],
          Resource: [...configurationSets, dedicatedSets],
        },
        {
          Sid: "ConsumeSesEvents",
          Effect: "Allow",
          Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
          Resource: [ctx.queueArn],
        },
        {
          Sid: "InspectIdentities",
          Effect: "Allow",
          Action: ["ses:GetEmailIdentity", "ses:ListTagsForResource"],
          Resource: [identities],
        },
        {
          Sid: "ReleaseFailedDomains",
          Effect: "Allow",
          Action: ["ses:DeleteTenantResourceAssociation"],
          Resource: [tenants, identities],
        },
        {
          Sid: "DeleteCossIdentities",
          Effect: "Allow",
          Action: ["ses:DeleteEmailIdentity"],
          Resource: [identities],
          Condition: managed,
        },
        {
          // `GetTenant` while releasing domains; `DeleteTenant` when an organization is deleted.
          Sid: "ReadAndDeleteCossTenants",
          Effect: "Allow",
          Action: ["ses:GetTenant", "ses:DeleteTenant"],
          Resource: [tenants],
        },
        {
          // Dedicated IP sets copy their stream's shared set's event destinations.
          Sid: "ReadCossEventDestinations",
          Effect: "Allow",
          Action: ["ses:GetConfigurationSetEventDestinations"],
          Resource: configurationSets,
        },
        {
          Sid: "CreateTaggedDedicatedIps",
          Effect: "Allow",
          Action: ["ses:CreateDedicatedIpPool", "ses:CreateConfigurationSet", "ses:TagResource"],
          Resource: [dedicatedPools, dedicatedSets],
          Condition: tagsNewResources,
        },
        {
          Sid: "InspectDedicatedIps",
          Effect: "Allow",
          Action: ["ses:GetDedicatedIps", "ses:ListTagsForResource"],
          Resource: [dedicatedPools, dedicatedSets],
        },
        {
          Sid: "AssociateDedicatedIpSets",
          Effect: "Allow",
          Action: ["ses:CreateTenantResourceAssociation", "ses:DeleteTenantResourceAssociation"],
          Resource: [tenants, dedicatedSets],
        },
        {
          Sid: "ChangeCossDedicatedIps",
          Effect: "Allow",
          Action: [
            "ses:CreateConfigurationSetEventDestination",
            "ses:PutConfigurationSetDeliveryOptions",
            "ses:DeleteConfigurationSet",
            "ses:DeleteDedicatedIpPool",
          ],
          Resource: [dedicatedPools, dedicatedSets],
          Condition: managed,
        },
        ...(ctx.inbound && bucket
          ? [
              {
                Sid: "ConsumeReceiptNotifications",
                Effect: "Allow" as const,
                Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
                Resource: [ctx.inbound.queueArn],
              },
              {
                Sid: "ReadAndDeleteLandedMessages",
                Effect: "Allow" as const,
                Action: ["s3:GetObject", "s3:DeleteObject"],
                Resource: [`${bucket}/landing/*`],
              },
              {
                Sid: "StoreReceivedEmailContent",
                Effect: "Allow" as const,
                Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
                Resource: [`${bucket}/orgs/*`],
              },
              {
                // Organization deletion lists an organization's objects to delete them.
                Sid: "ListReceivedEmailContent",
                Effect: "Allow" as const,
                Action: ["s3:ListBucket"],
                Resource: [bucket],
                Condition: { StringLike: { "s3:prefix": "orgs/*" } },
              },
            ]
          : []),
      ],
    },
  };
}
