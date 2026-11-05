import "server-only";
import {
  AccessAnalyzerClient,
  ListFindingsCommand as ListAccessFindingsCommand,
  ListAnalyzersCommand,
} from "@aws-sdk/client-accessanalyzer";
import { ArtifactClient, ListCustomerAgreementsCommand } from "@aws-sdk/client-artifact";
import {
  CloudTrailClient,
  DescribeTrailsCommand,
  GetTrailStatusCommand,
  LookupEventsCommand,
} from "@aws-sdk/client-cloudtrail";
import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  ConfigServiceClient,
  DescribeConfigurationRecorderStatusCommand,
} from "@aws-sdk/client-config-service";
import {
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  GetCoverageStatisticsCommand,
  GetDetectorCommand,
  GetFindingsCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListFindingsCommand,
} from "@aws-sdk/client-guardduty";
import { GetAccountSummaryCommand, IAMClient } from "@aws-sdk/client-iam";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
  DescribeHubCommand,
  GetEnabledStandardsCommand,
  GetFindingsCommand as GetHubFindingsCommand,
  SecurityHubClient,
} from "@aws-sdk/client-securityhub";
import {
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { db } from "@coss/db";
import { sql } from "drizzle-orm";
import { env } from "@/env";
import {
  type ControlFinding,
  type ControlScore,
  type DatabaseAuditEntry,
  type LogQueryRow,
  logQueryRows,
  logQueryTime,
  type PostureCheck,
  parseAuditLine,
  postureChecks,
  postureVerdict,
  type Reading,
  type Readings,
  ROUTINE_AUDIT_LINE,
  scoreControls,
  sortChecks,
  type Threat,
  type Verdict,
} from "./security-posture-rules";

/**
 * The admin console's security page: reads AWS's security services, in production with the
 * dashboard's own role and in the management account through SECURITY_MANAGEMENT_ROLE_ARN. Every
 * read can fail on its own, and a failed read is shown as unknown, never as fine.
 */

const REGION = "us-east-2";
/** Sign-ins and the agreement live here; every other service only runs in REGION. */
const GLOBAL_REGION = "us-east-1";
const ROOT_LOOKUP_DAYS = 90;
const MAX_HUB_PAGES = 10;
const LOG_QUERY_WAIT_MS = 20_000;
const LOG_QUERY_POLL_MS = 500;
const AUDIT_DAYS = 30;
const AUDIT_SHOWN = 25;
const TOPICS = ["coss-alerts", "coss-ses-events", "coss-ses-inbound"];
const CLIENT = {
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 3_000, requestTimeout: 8_000 },
};

export function securityPostureConfigured(): boolean {
  return Boolean(env.SECURITY_MANAGEMENT_ROLE_ARN);
}

async function read<T>(load: () => Promise<T>): Promise<Reading<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    console.error("security page read failed", error);
    return { ok: false, error: error instanceof Error ? error.name : "Unknown error" };
  }
}

type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
};
let managementCredentials: Credentials | undefined;

async function management(): Promise<Credentials> {
  const roleArn = env.SECURITY_MANAGEMENT_ROLE_ARN;
  if (!roleArn) throw new Error("SECURITY_MANAGEMENT_ROLE_ARN is unset");
  const fresh =
    managementCredentials && managementCredentials.expiration.getTime() - Date.now() > 300_000;
  if (managementCredentials && fresh) return managementCredentials;
  const { Credentials: issued } = await new STSClient({ region: REGION, ...CLIENT }).send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "coss-admin-security",
      DurationSeconds: 3600,
    }),
  );
  if (!issued?.AccessKeyId || !issued.SecretAccessKey || !issued.SessionToken) {
    throw new Error("AssumeRole returned no credentials");
  }
  managementCredentials = {
    accessKeyId: issued.AccessKeyId,
    secretAccessKey: issued.SecretAccessKey,
    sessionToken: issued.SessionToken,
    expiration: issued.Expiration ?? new Date(Date.now() + 3_000_000),
  };
  return managementCredentials;
}

async function detector(client: GuardDutyClient): Promise<string | null> {
  const { DetectorIds } = await client.send(new ListDetectorsCommand({}));
  const id = DetectorIds?.[0];
  if (!id) return null;
  const { Status } = await client.send(new GetDetectorCommand({ DetectorId: id }));
  return Status === "ENABLED" ? id : null;
}

async function threatsIn(
  client: GuardDutyClient,
  detectorId: string | null,
  account: Threat["account"],
): Promise<Threat[]> {
  if (!detectorId) return [];
  const { FindingIds } = await client.send(
    new ListFindingsCommand({
      DetectorId: detectorId,
      MaxResults: 50,
      SortCriteria: { AttributeName: "severity", OrderBy: "DESC" },
      FindingCriteria: {
        Criterion: {
          severity: { GreaterThanOrEqual: 4 },
          "service.archived": { Equals: ["false"] },
        },
      },
    }),
  );
  if (!FindingIds?.length) return [];
  const { Findings } = await client.send(
    new GetFindingsCommand({ DetectorId: detectorId, FindingIds }),
  );
  return (Findings ?? []).map((finding) => ({
    id: finding.Id ?? "",
    account,
    title: finding.Title ?? finding.Type ?? "Unnamed finding",
    description: finding.Description ?? "",
    severity: finding.Severity ?? 0,
    lastSeen: finding.UpdatedAt ? new Date(finding.UpdatedAt) : null,
    count: Number(finding.Service?.Count ?? 1),
  }));
}

async function hubFindings(client: SecurityHubClient): Promise<ControlFinding[]> {
  const findings: ControlFinding[] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_HUB_PAGES; page += 1) {
    const response = await client.send(
      new GetHubFindingsCommand({
        MaxResults: 100,
        NextToken: token,
        Filters: {
          ProductName: [{ Value: "Security Hub", Comparison: "EQUALS" }],
          RecordState: [{ Value: "ACTIVE", Comparison: "EQUALS" }],
          ComplianceStatus: [
            { Value: "PASSED", Comparison: "EQUALS" },
            { Value: "FAILED", Comparison: "EQUALS" },
          ],
        },
      }),
    );
    for (const finding of response.Findings ?? []) {
      const controlId = finding.Compliance?.SecurityControlId;
      if (!controlId) continue;
      findings.push({
        controlId,
        title: finding.Title ?? controlId,
        severity: finding.Severity?.Label ?? "INFORMATIONAL",
        compliance: finding.Compliance?.Status === "FAILED" ? "FAILED" : "PASSED",
        remediationUrl: finding.Remediation?.Recommendation?.Url ?? null,
      });
    }
    token = response.NextToken;
    if (!token) break;
  }
  return findings;
}

/** Log delivery itself rather than its setting: a bucket policy mistake would pass a settings check. */
async function logsArrived(
  client: S3Client,
  bucket: string,
  prefixOf: (day: string) => string,
): Promise<boolean> {
  const days = [0, 1].map((ago) =>
    new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "/"),
  );
  for (const day of days) {
    const { KeyCount } = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefixOf(day),
        MaxKeys: 1,
      }),
    );
    if (KeyCount) return true;
  }
  return false;
}

// FilterLogEvents answers with pages of nothing long before it reaches recent lines.
async function queryLogs(
  client: CloudWatchLogsClient,
  logGroupName: string,
  queryString: string,
  days: number,
): Promise<LogQueryRow[]> {
  const now = Date.now();
  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      queryString,
      startTime: Math.floor((now - days * 86_400_000) / 1000),
      endTime: Math.ceil(now / 1000),
    }),
  );
  while (Date.now() - now < LOG_QUERY_WAIT_MS) {
    const { status, results } = await client.send(new GetQueryResultsCommand({ queryId }));
    if (status === "Complete") return logQueryRows(results ?? []);
    if (status !== "Scheduled" && status !== "Running") {
      throw new Error(`Log query ended as ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOG_QUERY_POLL_MS));
  }
  throw new Error("Log query timed out");
}

export type DatabaseActivity = {
  entries: DatabaseAuditEntry[];
  failedLoginsToday: number;
};

export type OutsideAccessFinding = {
  id: string;
  resource: string;
  resourceType: string;
  isPublic: boolean;
  account: string;
};

export type SecurityPosture = {
  checkedAt: Date;
  verdict: Verdict;
  checks: PostureCheck[];
  threats: Reading<Threat[]>;
  score: Reading<ControlScore>;
  outsideAccess: Reading<OutsideAccessFinding[]>;
  database: Reading<DatabaseActivity>;
};

export async function getSecurityPosture(): Promise<SecurityPosture> {
  const region = { region: REGION, ...CLIENT };
  const guardDuty = new GuardDutyClient(region);
  const hub = new SecurityHubClient(region);
  const s3 = new S3Client(region);

  const productionDetector = read(() => detector(guardDuty));
  const managementGuardDuty = read(
    async () => new GuardDutyClient({ ...region, credentials: await management() }),
  );
  const managementDetector = managementGuardDuty.then((client) =>
    client.ok ? read(() => detector(client.value)) : client,
  );
  const analyzer = read(async () => {
    const client = new AccessAnalyzerClient({ ...region, credentials: await management() });
    const { analyzers } = await client.send(new ListAnalyzersCommand({ type: "ORGANIZATION" }));
    const active = analyzers?.find((candidate) => candidate.status === "ACTIVE");
    return { client, arn: active?.arn ?? null };
  });

  const [
    baa,
    rootMfa,
    lastRootSignIn,
    trail,
    securityHub,
    configRecording,
    alerts,
    accessLogs,
    databaseAudit,
    encryption,
    database,
    production,
    managementId,
    analyzerState,
  ] = await Promise.all([
    read(async () => {
      const { customerAgreements } = await new ArtifactClient({
        region: GLOBAL_REGION,
        ...CLIENT,
      }).send(new ListCustomerAgreementsCommand({}));
      return {
        active: (customerAgreements ?? []).some(
          (agreement) =>
            agreement.state === "ACTIVE" && agreement.name?.includes("Business Associate"),
        ),
      };
    }),
    read(async () => {
      const client = new IAMClient({
        region: GLOBAL_REGION,
        ...CLIENT,
        credentials: await management(),
      });
      const { SummaryMap } = await client.send(new GetAccountSummaryCommand({}));
      return SummaryMap?.AccountMFAEnabled === 1;
    }),
    read(async () => {
      const client = new CloudTrailClient({
        region: GLOBAL_REGION,
        ...CLIENT,
        credentials: await management(),
      });
      const { Events } = await client.send(
        new LookupEventsCommand({
          LookupAttributes: [{ AttributeKey: "EventName", AttributeValue: "ConsoleLogin" }],
          StartTime: new Date(Date.now() - ROOT_LOOKUP_DAYS * 86_400_000),
          MaxResults: 50,
        }),
      );
      const root = Events?.find(
        (event) => event.Username === "root" || event.CloudTrailEvent?.includes('"type":"Root"'),
      );
      return root?.EventTime ?? null;
    }),
    read(async () => {
      const client = new CloudTrailClient({ ...region, credentials: await management() });
      const { trailList } = await client.send(new DescribeTrailsCommand({}));
      const organization = trailList?.find((candidate) => candidate.IsOrganizationTrail);
      if (!organization?.TrailARN) return null;
      const status = await client.send(new GetTrailStatusCommand({ Name: organization.TrailARN }));
      return {
        logging: status.IsLogging === true,
        latestDelivery: status.LatestDeliveryTime ?? null,
        error: status.LatestDeliveryError ?? null,
      };
    }),
    read(async () => {
      try {
        const { HubArn } = await hub.send(new DescribeHubCommand({}));
        if (!HubArn) return { enabled: false, standardStatuses: [] };
        const { StandardsSubscriptions } = await hub.send(new GetEnabledStandardsCommand({}));
        return {
          enabled: true,
          standardStatuses: (StandardsSubscriptions ?? []).map(
            (standard) => standard.StandardsStatus ?? "UNKNOWN",
          ),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "InvalidAccessException") {
          return { enabled: false, standardStatuses: [] };
        }
        throw error;
      }
    }),
    read(async () => {
      const { ConfigurationRecordersStatus } = await new ConfigServiceClient(region).send(
        new DescribeConfigurationRecorderStatusCommand({}),
      );
      return (ConfigurationRecordersStatus ?? []).some((recorder) => recorder.recording);
    }),
    read(async () => {
      if (!env.SECURITY_ALERTS_TOPIC_ARN) throw new Error("SECURITY_ALERTS_TOPIC_ARN is unset");
      const { Subscriptions } = await new SNSClient(region).send(
        new ListSubscriptionsByTopicCommand({ TopicArn: env.SECURITY_ALERTS_TOPIC_ARN }),
      );
      const emails = (Subscriptions ?? []).filter((subscription) =>
        subscription.Protocol?.startsWith("email"),
      );
      const pending = emails.filter(
        (subscription) => !subscription.SubscriptionArn?.startsWith("arn:"),
      ).length;
      return { confirmed: emails.length - pending, pending };
    }),
    read(async () => {
      const bucket = env.SECURITY_ACCESS_LOGS_BUCKET;
      if (!bucket) throw new Error("SECURITY_ACCESS_LOGS_BUCKET is unset");
      const account = env.SECURITY_ALERTS_TOPIC_ARN?.split(":")[4];
      const [loadBalancer, network] = await Promise.all([
        logsArrived(
          s3,
          bucket,
          (day) => `alb/AWSLogs/${account}/elasticloadbalancing/${REGION}/${day}/`,
        ),
        logsArrived(
          s3,
          bucket,
          (day) => `vpc-flow/AWSLogs/${account}/vpcflowlogs/${REGION}/${day}/`,
        ),
      ]);
      return { loadBalancer, network };
    }),
    read(async () => {
      const [row] = (
        await db.execute<{ extension: boolean; classes: string | null }>(
          sql`select exists(select 1 from pg_extension where extname = 'pgaudit') as extension,
                     current_setting('pgaudit.log', true) as classes`,
        )
      ).rows;
      return { extension: row?.extension === true, classes: row?.classes ?? null };
    }),
    read(async () => {
      if (!env.SECURITY_ALERTS_TOPIC_ARN) throw new Error("SECURITY_ALERTS_TOPIC_ARN is unset");
      const prefix = env.SECURITY_ALERTS_TOPIC_ARN.replace(/[^:]+$/, "");
      const sns = new SNSClient(region);
      const [groups, topics] = await Promise.all([
        new ElasticLoadBalancingV2Client(region).send(new DescribeTargetGroupsCommand({})),
        Promise.all(
          TOPICS.map((topic) =>
            sns.send(new GetTopicAttributesCommand({ TopicArn: `${prefix}${topic}` })),
          ),
        ),
      ]);
      const routes = (groups.TargetGroups ?? []).filter((group) =>
        group.Protocol?.startsWith("HTTP"),
      );
      return {
        targetGroups: {
          total: routes.length,
          encrypted: routes.filter((group) => group.Protocol === "HTTPS").length,
        },
        topics: {
          total: topics.length,
          encrypted: topics.filter((topic) => topic.Attributes?.KmsMasterKeyId).length,
        },
      };
    }),
    read(async () => {
      const group = env.SECURITY_DATABASE_LOG_GROUP;
      if (!group) throw new Error("SECURITY_DATABASE_LOG_GROUP is unset");
      const logs = new CloudWatchLogsClient(region);
      const [audit, failed] = await Promise.all([
        queryLogs(
          logs,
          group,
          `filter @message like "AUDIT: " and @message not like /${ROUTINE_AUDIT_LINE.source}/ | fields @timestamp, @message | sort @timestamp desc | limit ${AUDIT_SHOWN}`,
          AUDIT_DAYS,
        ),
        queryLogs(
          logs,
          group,
          'filter @message like "password authentication failed" | stats count() as failed',
          1,
        ),
      ]);
      return {
        entries: audit.flatMap(
          (row) =>
            parseAuditLine(row["@message"] ?? "", logQueryTime(row["@timestamp"] ?? "")) ?? [],
        ),
        failedLoginsToday: Number(failed[0]?.failed ?? 0),
      };
    }),
    productionDetector,
    managementDetector,
    analyzer,
  ]);

  const containerMonitoring = await read(async () => {
    if (!production.ok) throw new Error(production.error);
    if (!production.value) return { healthy: 0, unhealthy: 0 };
    const { CoverageStatistics } = await guardDuty.send(
      new GetCoverageStatisticsCommand({
        DetectorId: production.value,
        StatisticsType: ["COUNT_BY_COVERAGE_STATUS"],
      }),
    );
    const counts = CoverageStatistics?.CountByCoverageStatus;
    return { healthy: counts?.HEALTHY ?? 0, unhealthy: counts?.UNHEALTHY ?? 0 };
  });

  const threatDetection: Reading<{ production: boolean; management: boolean }> = !production.ok
    ? production
    : !managementId.ok
      ? managementId
      : {
          ok: true,
          value: {
            production: production.value !== null,
            management: managementId.value !== null,
          },
        };

  const [threats, score, outsideAccess] = await Promise.all([
    read(async () => {
      if (!production.ok) throw new Error(production.error);
      if (!managementId.ok) throw new Error(managementId.error);
      const managementClient = await managementGuardDuty;
      if (!managementClient.ok) throw new Error(managementClient.error);
      const [own, theirs] = await Promise.all([
        threatsIn(guardDuty, production.value, "production"),
        threatsIn(managementClient.value, managementId.value, "management"),
      ]);
      return [...own, ...theirs].sort((a, b) => b.severity - a.severity);
    }),
    read(async () => scoreControls(await hubFindings(hub))),
    read(async () => {
      if (!analyzerState.ok) throw new Error(analyzerState.error);
      const { client, arn } = analyzerState.value;
      if (!arn) return [];
      const { findings } = await client.send(
        new ListAccessFindingsCommand({
          analyzerArn: arn,
          maxResults: 50,
          filter: { status: { eq: ["ACTIVE"] } },
        }),
      );
      return (findings ?? []).map((finding) => ({
        id: finding.id ?? "",
        resource: finding.resource ?? "Unknown resource",
        resourceType: finding.resourceType ?? "",
        isPublic: finding.isPublic === true,
        account: finding.resourceOwnerAccount ?? "",
      }));
    }),
  ]);

  const readings: Readings = {
    baa,
    rootMfa,
    lastRootSignIn,
    trail,
    threatDetection,
    containerMonitoring,
    securityHub,
    configRecording,
    outsideAccess: analyzerState.ok
      ? { ok: true, value: analyzerState.value.arn !== null }
      : analyzerState,
    alerts,
    accessLogs,
    databaseAudit,
    encryption,
  };
  const checks = sortChecks(postureChecks(readings));
  return {
    checkedAt: new Date(),
    verdict: postureVerdict(checks, threats),
    checks,
    threats,
    score,
    outsideAccess,
    database,
  };
}
