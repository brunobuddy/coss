/**
 * Creates (or updates) the shared AWS infrastructure for `EMAIL_PROVIDER=ses`, idempotently:
 *
 *   SES configuration sets ──events──▶ SNS topic ──raw──▶ SQS queue (+ dead-letter queue) ◀── worker
 *   EventBridge rule (tenant sending status) ──────────────▶ same queue
 *
 * One configuration set per stream: `<name>` (transactional) and `<name>-marketing`, each
 * optionally on a managed dedicated IP pool (`--transactional-pool`, `--marketing-pool`). Every
 * organization gets one SES tenant per stream; tenants missing for organizations set up before a
 * stream existed are created here (with their domains' identities associated).
 *
 * and, with `--managed-domain` (receiving):
 *
 *   SES receipt rule set (catch-all, spam/virus scan) ──S3 action──▶ bucket `landing/`
 *        └──notification──▶ SNS topic ──raw──▶ SQS inbound queue (+ dead-letter queue) ◀── worker
 *
 * The worker copies each received message to `orgs/<org>/…` and deletes the landing object; the
 * bucket's lifecycle rule expires both (received email retention + 1 day, landing after 21 days).
 * An account/region has one *active* receipt rule set: a different active one is only replaced
 * with `--replace-active-rule-set`. The managed domain's SES identity is printed with the DNS
 * records to publish (DKIM, and MX for the domain and `*.` its subdomains).
 *
 * plus least-privilege IAM policies for the api, dashboard and worker (`<name>-api`, …, under the
 * `/coss/` path) and, with `--alert-email`, CloudWatch alarms on the queues sent to that address.
 * Tenants, domain identities and their associations are created by the app at runtime. coss.com keeps
 * its own suppression lists, so SES suppression is turned off for the configuration set and for
 * every existing tenant of this stage, after importing existing suppressions into DATABASE_URL.
 * On upgrades, pause sends/domain changes and drain events before running (see README).
 *
 *   AWS_REGION=eu-west-1 bun run ses:bootstrap [--name coss] [--tenant-prefix coss] [--alert-email ops@…]
 *     [--managed-domain inbound.coss.com [--replace-active-rule-set]]
 *     [--transactional-pool coss-transactional] [--marketing-pool coss-marketing]
 *
 * Needs credentials allowed to manage SES, SNS, SQS, EventBridge and S3 (the default AWS credential
 * chain: env vars, profile or role). Prints the env vars the apps need. Use one AWS account (or at
 * least one region) per deployment stage: SES identities are account-wide.
 */

import { parseArgs } from "node:util";
import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  type PutMetricAlarmCommandInput,
} from "@aws-sdk/client-cloudwatch";
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import {
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  IAMClient,
  ListPolicyVersionsCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateReceiptRuleCommand,
  CreateReceiptRuleSetCommand,
  DescribeActiveReceiptRuleSetCommand,
  type ReceiptRule,
  SESClient,
  SetActiveReceiptRuleSetCommand,
  UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateDedicatedIpPoolCommand,
  CreateEmailIdentityCommand,
  CreateTenantResourceAssociationCommand,
  type EventDestinationDefinition,
  GetEmailIdentityCommand,
  PutConfigurationSetDeliveryOptionsCommand,
  PutConfigurationSetReputationOptionsCommand,
  SESv2Client,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import {
  CreateTopicCommand,
  SetTopicAttributesCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { closeDb, db, schema } from "@coss/db";
import { EMAIL_STREAMS, type EmailStream, ensureMissingStreamTenants } from "@coss/email";
import { SES_CONFIGURATION_SET_PATTERN, SES_TENANT_PREFIX_PATTERN } from "@coss/email/env";
import { sesInboundMxHost } from "@coss/email/runtime";
import {
  configurationSetsFor,
  createSesApi,
  LANDING_PREFIX,
  requiredTlsSetFor,
  SesIdentityProvider,
} from "@coss/email/ses";
import { RETENTION_DAYS } from "@coss/retention";
import { cossPolicies, type PolicyDocument } from "./ses-policies.ts";
import { migrateSesSuppressions } from "./ses-suppression-migration.ts";

const EVENT_DESTINATION = "coss-events";
const EVENT_TYPES = [
  "SEND",
  "REJECT",
  "BOUNCE",
  "COMPLAINT",
  "DELIVERY",
  "DELIVERY_DELAY",
  "RENDERING_FAILURE",
] as const;
const DAY_SECONDS = 24 * 60 * 60;

const { values } = parseArgs({
  options: {
    name: { type: "string", default: process.env.SES_CONFIGURATION_SET ?? "coss" },
    "tenant-prefix": { type: "string", default: process.env.SES_TENANT_PREFIX ?? "coss" },
    "alert-email": { type: "string" },
    "managed-domain": { type: "string" },
    "replace-active-rule-set": { type: "boolean", default: false },
    // Managed dedicated IP pools (billed per pool and volume; they warm up over weeks).
    "transactional-pool": { type: "string" },
    "marketing-pool": { type: "string" },
  },
});
const region = process.env.AWS_REGION;
const name = values.name;
const tenantPrefix = values["tenant-prefix"];
if (!region) throw new Error("Set AWS_REGION (e.g. AWS_REGION=eu-west-1).");
if (!SES_CONFIGURATION_SET_PATTERN.test(name) || name.length > 48) {
  throw new Error(`Invalid --name "${name}" (1-48 of A-Z a-z 0-9 _ -).`);
}
if (!SES_TENANT_PREFIX_PATTERN.test(tenantPrefix)) {
  throw new Error(`Invalid --tenant-prefix "${tenantPrefix}" (1-23 of A-Z a-z 0-9 _ -).`);
}
const configurationSets = configurationSetsFor(name);
const pools: Partial<Record<EmailStream, string>> = {
  ...(values["transactional-pool"] ? { transactional: values["transactional-pool"] } : {}),
  ...(values["marketing-pool"] ? { marketing: values["marketing-pool"] } : {}),
};
for (const pool of Object.values(pools)) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pool)) throw new Error(`Invalid IP pool name "${pool}".`);
}

const managedDomain = values["managed-domain"]?.trim().toLowerCase().replace(/\.$/, "");
if (
  managedDomain !== undefined &&
  !/^(?!-)[a-z0-9-]{1,63}(\.(?!-)[a-z0-9-]{1,63})+$/.test(managedDomain)
) {
  throw new Error(`Invalid --managed-domain "${managedDomain}".`);
}

const ses = new SESv2Client({ region });
const sesClassic = new SESClient({ region });
const s3 = new S3Client({ region });
const sns = new SNSClient({ region });
const sqs = new SQSClient({ region });
const events = new EventBridgeClient({ region });
const iam = new IAMClient({ region });
const cloudwatch = new CloudWatchClient({ region });

function step(message: string): void {
  console.info(`• ${message}`);
}

function isNamed(error: unknown, ...names: string[]): boolean {
  return names.includes((error as { name?: string }).name ?? "");
}

/** Returns the queue's URL and ARN, creating it if needed. */
async function ensureQueue(queueName: string): Promise<{ url: string; arn: string }> {
  let url: string | undefined;
  try {
    url = (await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }))).QueueUrl;
  } catch (error) {
    if (!isNamed(error, "QueueDoesNotExist", "AWS.SimpleQueueService.NonExistentQueue"))
      throw error;
    url = (await sqs.send(new CreateQueueCommand({ QueueName: queueName }))).QueueUrl;
  }
  if (!url) throw new Error(`No URL for queue ${queueName}.`);
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] }),
  );
  const arn = Attributes?.QueueArn;
  if (!arn) throw new Error(`No ARN for queue ${queueName}.`);
  return { url, arn };
}

// 1. SNS topic that SES publishes events to. Its ARN also tells us the account id.
const { TopicArn: topicArn } = await sns.send(
  new CreateTopicCommand({ Name: `${name}-ses-events` }),
);
if (!topicArn) throw new Error("CreateTopic returned no ARN.");
const account = topicArn.split(":")[4] ?? "";
const configurationSetArns = EMAIL_STREAMS.flatMap((stream) =>
  [configurationSets[stream], requiredTlsSetFor(configurationSets[stream])].map(
    (setName) => `arn:aws:ses:${region}:${account}:configuration-set/${setName}`,
  ),
);
step(`SNS topic ${topicArn}`);
await sns.send(
  new SetTopicAttributesCommand({
    TopicArn: topicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "SesPublishesEvents",
          Effect: "Allow",
          Principal: { Service: "ses.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
          Condition: {
            StringEquals: { "AWS:SourceAccount": account },
            // The streams' shared sets, and organizations' dedicated IP sets
            // (`<tenant prefix>-<org id>[-marketing]`).
            ArnLike: {
              "AWS:SourceArn": [
                ...configurationSetArns,
                `arn:aws:ses:${region}:${account}:configuration-set/${tenantPrefix}-*`,
              ],
            },
          },
        },
      ],
    }),
  }),
);

// 2. Queues. The worker reads the main queue; messages failing 5 times move to the DLQ.
const dlq = await ensureQueue(`${name}-events-dlq`);
const queue = await ensureQueue(`${name}-events`);
step(`SQS queue ${queue.url} (dead letters: ${dlq.url})`);

// 3. EventBridge rule: tenant sending status changes for this deployment's tenants only.
const { RuleArn: ruleArn } = await events.send(
  new PutRuleCommand({
    Name: `${name}-tenant-status`,
    Description: "coss.com: SES tenant sending status changes",
    State: "ENABLED",
    EventPattern: JSON.stringify({
      source: ["aws.ses"],
      "detail-type": ["Sending Status Enabled", "Sending Status Disabled"],
      resources: [{ prefix: `arn:aws:ses:${region}:${account}:tenant/${tenantPrefix}-` }],
    }),
  }),
);
if (!ruleArn) throw new Error("PutRule returned no ARN.");
await events.send(
  new PutTargetsCommand({
    Rule: `${name}-tenant-status`,
    Targets: [{ Id: "coss-events-queue", Arn: queue.arn }],
  }),
);
step(`EventBridge rule ${ruleArn}`);

await sqs.send(
  new SetQueueAttributesCommand({
    QueueUrl: dlq.url,
    Attributes: {
      MessageRetentionPeriod: String(14 * DAY_SECONDS),
      SqsManagedSseEnabled: "true",
    },
  }),
);
await sqs.send(
  new SetQueueAttributesCommand({
    QueueUrl: queue.url,
    Attributes: {
      MessageRetentionPeriod: String(4 * DAY_SECONDS),
      VisibilityTimeout: "60",
      ReceiveMessageWaitTimeSeconds: "20",
      SqsManagedSseEnabled: "true",
      RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlq.arn, maxReceiveCount: 5 }),
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "SnsDeliversSesEvents",
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queue.arn,
            Condition: { ArnEquals: { "aws:SourceArn": topicArn } },
          },
          {
            Sid: "EventBridgeDeliversTenantStatus",
            Effect: "Allow",
            Principal: { Service: "events.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queue.arn,
            Condition: { ArnEquals: { "aws:SourceArn": ruleArn } },
          },
        ],
      }),
    },
  }),
);

// 4. Topic → queue, with raw delivery (the SQS body is the SES event itself). Idempotent.
await sns.send(
  new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: "sqs",
    Endpoint: queue.arn,
    Attributes: { RawMessageDelivery: "true" },
    ReturnSubscriptionArn: true,
  }),
);
step("SNS → SQS subscription (raw message delivery)");

// 5. One configuration set per stream, each with event publishing to the topic and, when asked,
//    its own managed dedicated IP pool (left as is when the flag is omitted).
const destination: EventDestinationDefinition = {
  Enabled: true,
  MatchingEventTypes: [...EVENT_TYPES],
  SnsDestination: { TopicArn: topicArn },
};
for (const stream of EMAIL_STREAMS) {
  const setName = configurationSets[stream];
  try {
    await ses.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: setName,
        ReputationOptions: { ReputationMetricsEnabled: true },
        SendingOptions: { SendingEnabled: true },
      }),
    );
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException")) throw error;
    await ses.send(
      new PutConfigurationSetReputationOptionsCommand({
        ConfigurationSetName: setName,
        ReputationMetricsEnabled: true,
      }),
    );
  }
  try {
    await ses.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: EVENT_DESTINATION,
        EventDestination: destination,
      }),
    );
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException")) throw error;
    await ses.send(
      new UpdateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: setName,
        EventDestinationName: EVENT_DESTINATION,
        EventDestination: destination,
      }),
    );
  }
  const pool = pools[stream];
  if (pool) {
    try {
      await ses.send(new CreateDedicatedIpPoolCommand({ PoolName: pool, ScalingMode: "MANAGED" }));
    } catch (error) {
      if (!isNamed(error, "AlreadyExistsException")) throw error;
    }
    await ses.send(
      new PutConfigurationSetDeliveryOptionsCommand({
        ConfigurationSetName: setName,
        SendingPoolName: pool,
      }),
    );
  }
  step(
    `SES configuration set ${setName} (${stream}) → ${EVENT_TYPES.join(", ")}` +
      (pool ? `, dedicated IP pool ${pool}` : ""),
  );

  // Its twin for organizations in HIPAA mode: the same events, but never unencrypted delivery.
  const tlsSetName = requiredTlsSetFor(setName);
  const tlsDelivery = { TlsPolicy: "REQUIRE" as const, ...(pool ? { SendingPoolName: pool } : {}) };
  try {
    await ses.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: tlsSetName,
        DeliveryOptions: tlsDelivery,
        ReputationOptions: { ReputationMetricsEnabled: true },
        SendingOptions: { SendingEnabled: true },
        SuppressionOptions: { SuppressedReasons: [] },
      }),
    );
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException")) throw error;
    await ses.send(
      new PutConfigurationSetDeliveryOptionsCommand({
        ConfigurationSetName: tlsSetName,
        ...tlsDelivery,
      }),
    );
  }
  try {
    await ses.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: tlsSetName,
        EventDestinationName: EVENT_DESTINATION,
        EventDestination: destination,
      }),
    );
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException")) throw error;
    await ses.send(
      new UpdateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: tlsSetName,
        EventDestinationName: EVENT_DESTINATION,
        EventDestination: destination,
      }),
    );
  }
  step(`SES configuration set ${tlsSetName} (${stream}, TLS required)`);
}

// 5b. Receiving: bucket → topic → queues → receipt rule set (only with --managed-domain).
const INBOUND_RULE = "catch-all";
const inbound = managedDomain ? await ensureReceiving(managedDomain, region) : null;

async function ensureReceiving(domain: string, region: string) {
  // S3 bucket names are global, lower-case and without underscores.
  const bucket = `${name.toLowerCase().replaceAll("_", "-")}-inbound-${account}`;
  const ruleSet = `${name}-inbound`;
  const ruleArn = `arn:aws:ses:${region}:${account}:receipt-rule-set/${ruleSet}:receipt-rule/${INBOUND_RULE}`;
  try {
    await s3.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(region === "us-east-1"
          ? {}
          : { CreateBucketConfiguration: { LocationConstraint: region as never } }),
      }),
    );
  } catch (error) {
    if (!isNamed(error, "BucketAlreadyOwnedByYou")) throw error;
  }
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
  await s3.send(
    new PutBucketEncryptionCommand({
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
      },
    }),
  );
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "SesWritesReceivedMessages",
            Effect: "Allow",
            Principal: { Service: "ses.amazonaws.com" },
            Action: "s3:PutObject",
            Resource: `arn:aws:s3:::${bucket}/${LANDING_PREFIX}*`,
            Condition: {
              StringEquals: { "AWS:SourceAccount": account },
              ArnLike: { "AWS:SourceArn": ruleArn },
            },
          },
          {
            Sid: "TlsOnly",
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          },
        ],
      }),
    }),
  );
  // Landing objects outlive the dead-letter queue (14 days), so a redriven notification still
  // finds its message; content outlives its row by a day (the worker's retention purge).
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "expire-landing",
            Status: "Enabled",
            Filter: { Prefix: LANDING_PREFIX },
            Expiration: { Days: 21 },
          },
          {
            ID: "expire-received-emails",
            Status: "Enabled",
            Filter: { Prefix: "orgs/" },
            Expiration: { Days: RETENTION_DAYS.receivedEmails + 1 },
          },
        ],
      },
    }),
  );
  step(
    `S3 bucket ${bucket} (private, encrypted, lifecycle ${RETENTION_DAYS.receivedEmails + 1} days)`,
  );

  const { TopicArn: inboundTopicArn } = await sns.send(
    new CreateTopicCommand({ Name: `${name}-ses-inbound` }),
  );
  if (!inboundTopicArn) throw new Error("CreateTopic returned no ARN.");
  await sns.send(
    new SetTopicAttributesCommand({
      TopicArn: inboundTopicArn,
      AttributeName: "Policy",
      AttributeValue: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "SesPublishesReceipts",
            Effect: "Allow",
            Principal: { Service: "ses.amazonaws.com" },
            Action: "sns:Publish",
            Resource: inboundTopicArn,
            Condition: {
              StringEquals: { "AWS:SourceAccount": account },
              ArnLike: { "AWS:SourceArn": ruleArn },
            },
          },
        ],
      }),
    }),
  );
  const inboundDlq = await ensureQueue(`${name}-inbound-dlq`);
  const inboundQueue = await ensureQueue(`${name}-inbound`);
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: inboundDlq.url,
      Attributes: {
        MessageRetentionPeriod: String(14 * DAY_SECONDS),
        SqsManagedSseEnabled: "true",
      },
    }),
  );
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: inboundQueue.url,
      Attributes: {
        MessageRetentionPeriod: String(4 * DAY_SECONDS),
        // A message can be 40 MB: parsing and storing it takes longer than an event.
        VisibilityTimeout: "300",
        ReceiveMessageWaitTimeSeconds: "20",
        SqsManagedSseEnabled: "true",
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: inboundDlq.arn, maxReceiveCount: 5 }),
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "SnsDeliversReceipts",
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: inboundQueue.arn,
              Condition: { ArnEquals: { "aws:SourceArn": inboundTopicArn } },
            },
          ],
        }),
      },
    }),
  );
  await sns.send(
    new SubscribeCommand({
      TopicArn: inboundTopicArn,
      Protocol: "sqs",
      Endpoint: inboundQueue.arn,
      Attributes: { RawMessageDelivery: "true" },
      ReturnSubscriptionArn: true,
    }),
  );
  step(`SQS inbound queue ${inboundQueue.url} (dead letters: ${inboundDlq.url})`);

  // One catch-all rule: SES receives for every verified domain of the account, and the worker
  // routes by envelope recipient (unrouted mail is dropped there, never bounced).
  try {
    await sesClassic.send(new CreateReceiptRuleSetCommand({ RuleSetName: ruleSet }));
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException", "AlreadyExists")) throw error;
  }
  const rule: ReceiptRule = {
    Name: INBOUND_RULE,
    Enabled: true,
    ScanEnabled: true,
    TlsPolicy: "Optional",
    Actions: [
      {
        S3Action: {
          BucketName: bucket,
          ObjectKeyPrefix: LANDING_PREFIX,
          TopicArn: inboundTopicArn,
        },
      },
    ],
  };
  try {
    await sesClassic.send(new CreateReceiptRuleCommand({ RuleSetName: ruleSet, Rule: rule }));
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException", "AlreadyExists")) throw error;
    await sesClassic.send(new UpdateReceiptRuleCommand({ RuleSetName: ruleSet, Rule: rule }));
  }
  const active = (await sesClassic.send(new DescribeActiveReceiptRuleSetCommand({}))).Metadata
    ?.Name;
  if (active && active !== ruleSet && !values["replace-active-rule-set"]) {
    throw new Error(
      `The active receipt rule set of ${region} is "${active}", not "${ruleSet}". Only one can be ` +
        "active: rerun with --replace-active-rule-set to switch (mail its rules handle stops).",
    );
  }
  if (active !== ruleSet) {
    await sesClassic.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: ruleSet }));
  }
  step(
    `SES receipt rule set ${ruleSet} (active, rule ${INBOUND_RULE}: scan, S3 ${LANDING_PREFIX})`,
  );

  // The managed domain is coss.com's own identity: tagged so the apps' policies can't delete it.
  let dkimTokens: string[] = [];
  try {
    const created = await ses.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: domain,
        Tags: [{ Key: "coss_inbound", Value: name }],
      }),
    );
    dkimTokens = created.DkimAttributes?.Tokens ?? [];
  } catch (error) {
    if (!isNamed(error, "AlreadyExistsException")) throw error;
    const existing = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    dkimTokens = existing.DkimAttributes?.Tokens ?? [];
  }
  step(`SES identity ${domain} (managed inbound domain)`);
  return {
    bucket,
    queueUrl: inboundQueue.url,
    queueArn: inboundQueue.arn,
    domain,
    dkimTokens,
    mxHost: sesInboundMxHost(region),
  };
}

// 6. Create the stream tenants organizations set up before a stream existed are missing, with
//    their domains' identities associated (born without SES suppression and stored as migrated,
//    so 6b never imports into them), then (6b) commit historical protection to coss.com before
//    disabling any SES lists. In this order a tenant a failed run created without its row gets
//    the row on the rerun, before the migration requires every tenant to have one.
let tenantsUpdated: number;
let tenantsCreated: number;
try {
  tenantsCreated = await ensureMissingStreamTenants(
    new SesIdentityProvider(createSesApi(region), { region, configurationSets, tenantPrefix }),
  );
  tenantsUpdated = await migrateSesSuppressions(ses, {
    configurationSets: Object.values(configurationSets).flatMap((setName) => [
      setName,
      requiredTlsSetFor(setName),
    ]),
    tenantPrefix,
  });
  // New tenants get theirs from `ensureTenant`; a live send needs the association before the mode.
  const tenants = (await db.select().from(schema.emailTenant)).filter(
    (tenant) => tenant.provider === "ses",
  );
  for (const tenant of tenants) {
    try {
      await ses.send(
        new CreateTenantResourceAssociationCommand({
          TenantName: tenant.tenantName,
          ResourceArn: `arn:aws:ses:${region}:${account}:configuration-set/${requiredTlsSetFor(configurationSets[tenant.stream])}`,
        }),
      );
    } catch (error) {
      if (!isNamed(error, "AlreadyExistsException")) throw error;
    }
  }
  step(`SES required-TLS sets associated with ${tenants.length} tenants`);
} finally {
  await closeDb();
}
step(`SES stream tenants: ${tenantsCreated} created for existing organizations`);
step(`SES suppression off (configuration sets and ${tenantsUpdated} existing tenants)`);

// 7. Least-privilege IAM policies. A changed document becomes the new default version (IAM keeps
//    at most 5, so the oldest non-default one is dropped first).
const POLICY_PATH = "/coss/";
async function ensurePolicy(policyName: string, document: PolicyDocument): Promise<string> {
  const arn = `arn:aws:iam::${account}:policy${POLICY_PATH}${policyName}`;
  const json = JSON.stringify(document);
  let defaultVersion: string | undefined;
  try {
    defaultVersion = (await iam.send(new GetPolicyCommand({ PolicyArn: arn }))).Policy
      ?.DefaultVersionId;
  } catch (error) {
    if (!isNamed(error, "NoSuchEntityException", "NoSuchEntity")) throw error;
    await iam.send(
      new CreatePolicyCommand({
        PolicyName: policyName,
        Path: POLICY_PATH,
        PolicyDocument: json,
        Description: "coss.com email (SES) least-privilege access, managed by ses:bootstrap",
      }),
    );
    return `${arn} (created)`;
  }
  const { PolicyVersion } = await iam.send(
    new GetPolicyVersionCommand({ PolicyArn: arn, VersionId: defaultVersion }),
  );
  const current = JSON.parse(decodeURIComponent(PolicyVersion?.Document ?? "{}"));
  if (JSON.stringify(current) === json) return `${arn} (unchanged)`;
  const { Versions = [] } = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: arn }));
  if (Versions.length >= 5) {
    const oldest = Versions.filter((v) => !v.IsDefaultVersion).sort(
      (a, b) => (a.CreateDate?.getTime() ?? 0) - (b.CreateDate?.getTime() ?? 0),
    )[0];
    if (oldest?.VersionId) {
      await iam.send(
        new DeletePolicyVersionCommand({ PolicyArn: arn, VersionId: oldest.VersionId }),
      );
    }
  }
  await iam.send(
    new CreatePolicyVersionCommand({ PolicyArn: arn, PolicyDocument: json, SetAsDefault: true }),
  );
  return `${arn} (updated)`;
}
const policies = cossPolicies({
  region,
  account,
  name,
  tenantPrefix,
  queueArn: queue.arn,
  ...(inbound ? { inbound: { bucket: inbound.bucket, queueArn: inbound.queueArn } } : {}),
});
for (const [app, document] of Object.entries(policies)) {
  step(`IAM policy for the ${app}: ${await ensurePolicy(`${name}-${app}`, document)}`);
}

// 8. Alarms: anything in the dead-letter queue is a delivery event that was never recorded, and an
//    old message in the main queue means the worker isn't consuming.
const alertEmail = values["alert-email"];
if (alertEmail) {
  const { TopicArn: alertsArn } = await sns.send(
    new CreateTopicCommand({ Name: `${name}-alerts` }),
  );
  if (!alertsArn) throw new Error("CreateTopic returned no ARN.");
  // Idempotent for the same address; AWS emails a confirmation link until it is confirmed.
  await sns.send(
    new SubscribeCommand({
      TopicArn: alertsArn,
      Protocol: "email",
      Endpoint: alertEmail,
      ReturnSubscriptionArn: true,
    }),
  );
  const alarm = (
    input: Omit<PutMetricAlarmCommandInput, "Namespace" | "AlarmActions" | "OKActions">,
  ) =>
    cloudwatch.send(
      new PutMetricAlarmCommand({
        Namespace: "AWS/SQS",
        AlarmActions: [alertsArn],
        OKActions: [alertsArn],
        TreatMissingData: "notBreaching",
        ...input,
      }),
    );
  await alarm({
    AlarmName: `${name}-events-dead-letters`,
    AlarmDescription:
      "coss.com: SES delivery events failed to be recorded 5 times and were dead-lettered. Inspect " +
      `${name}-events-dlq, fix the cause, then redrive the messages to ${name}-events.`,
    MetricName: "ApproximateNumberOfMessagesVisible",
    Dimensions: [{ Name: "QueueName", Value: `${name}-events-dlq` }],
    Statistic: "Maximum",
    Period: 300,
    EvaluationPeriods: 1,
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
  });
  await alarm({
    AlarmName: `${name}-events-backlog`,
    AlarmDescription:
      `coss.com: the oldest SES event in ${name}-events is over 15 minutes old; the worker is not ` +
      "consuming (down, or missing SQS permissions). Recipient statuses and webhooks are stale.",
    MetricName: "ApproximateAgeOfOldestMessage",
    Dimensions: [{ Name: "QueueName", Value: `${name}-events` }],
    Statistic: "Maximum",
    Period: 300,
    EvaluationPeriods: 2,
    Threshold: 900,
    ComparisonOperator: "GreaterThanThreshold",
  });
  step(`Alarms ${name}-events-dead-letters, ${name}-events-backlog → ${alertEmail}`);
  if (inbound) {
    await alarm({
      AlarmName: `${name}-inbound-dead-letters`,
      AlarmDescription:
        "coss.com: received emails failed to be recorded 5 times and were dead-lettered (their raw " +
        `messages stay in landing/ for 21 days). Inspect ${name}-inbound-dlq, fix the cause, then ` +
        `redrive the messages to ${name}-inbound.`,
      MetricName: "ApproximateNumberOfMessagesVisible",
      Dimensions: [{ Name: "QueueName", Value: `${name}-inbound-dlq` }],
      Statistic: "Maximum",
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: 0,
      ComparisonOperator: "GreaterThanThreshold",
    });
    await alarm({
      AlarmName: `${name}-inbound-backlog`,
      AlarmDescription:
        `coss.com: the oldest receipt in ${name}-inbound is over 15 minutes old; the worker is not ` +
        "consuming it. Received emails and their webhooks are delayed.",
      MetricName: "ApproximateAgeOfOldestMessage",
      Dimensions: [{ Name: "QueueName", Value: `${name}-inbound` }],
      Statistic: "Maximum",
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 900,
      ComparisonOperator: "GreaterThanThreshold",
    });
    step(`Alarms ${name}-inbound-dead-letters, ${name}-inbound-backlog → ${alertEmail}`);
  }
}

console.info(
  [
    "",
    "Done. Set these for the api, dashboard and worker:",
    "",
    "EMAIL_PROVIDER=ses",
    `AWS_REGION=${region}`,
    `# The marketing stream uses ${configurationSets.marketing}, derived from this.`,
    `SES_CONFIGURATION_SET=${name}`,
    `SES_TENANT_PREFIX=${tenantPrefix}`,
    `SES_EVENTS_QUEUE_URL=${queue.url}`,
    ...(inbound
      ? [
          `INBOUND_MANAGED_DOMAIN=${inbound.domain}`,
          `SES_INBOUND_BUCKET=${inbound.bucket}`,
          `SES_INBOUND_QUEUE_URL=${inbound.queueUrl}   (worker only)`,
          "",
          `Publish these records for ${inbound.domain} (Cloudflare holds the coss.com zone):`,
          ...inbound.dkimTokens.map(
            (token) =>
              `  CNAME ${token}._domainkey.${inbound.domain} → ${token}.dkim.amazonses.com`,
          ),
          `  MX 10 ${inbound.domain} → ${inbound.mxHost}`,
          `  MX 10 *.${inbound.domain} → ${inbound.mxHost}`,
          // Authorizes DMARC aggregate reports for any domain to dmarc-<token>@<managed domain>.
          `  TXT *._report._dmarc.${inbound.domain} → "v=DMARC1"`,
        ]
      : []),
    "",
    `Attach the IAM policies under ${POLICY_PATH}: ${name}-api, ${name}-dashboard, ${name}-worker.`,
    alertEmail
      ? `Confirm the alert subscription from the email AWS sent to ${alertEmail}.`
      : "Pass --alert-email to get alarms when SES events fail or the worker stops consuming.",
    "New AWS accounts start in the SES sandbox: request production access in the SES console.",
  ].join("\n"),
);
