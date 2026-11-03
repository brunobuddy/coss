/**
 * Creates (or updates) the ElastiCache Serverless for Valkey cache that holds rate limit counters,
 * idempotently:
 *
 *   user `<name>-ratelimit` (password, keys `<prefix>:*` only) ─┐
 *   user `<name>-default` (the `default` user, disabled)        ├─▶ user group ─▶ serverless cache
 *
 *   AWS_REGION=eu-west-1 bun run valkey:bootstrap --subnet-ids subnet-a,subnet-b \
 *     --security-group-ids sg-123 [--name coss] [--key-prefix coss] [--max-ecpu 5000] \
 *     [--max-storage-gb 1] [--rotate-password]
 *
 * The cache lives in a VPC: the api, dashboard (and anything else that rate limits) must run in it,
 * and the security group must allow inbound TCP 6379 from them. Prints the env vars to set. The
 * app user's password is written to a private temporary file only when it is created or rotated (`--rotate-password`); rotating
 * breaks running processes until they get the new VALKEY_URL.
 *
 * Needs credentials allowed to manage ElastiCache (the default AWS credential chain).
 */

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  CreateServerlessCacheCommand,
  CreateUserCommand,
  CreateUserGroupCommand,
  DescribeServerlessCachesCommand,
  DescribeUserGroupsCommand,
  DescribeUsersCommand,
  ElastiCacheClient,
  ModifyServerlessCacheCommand,
  ModifyUserCommand,
  type ServerlessCache,
} from "@aws-sdk/client-elasticache";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "coss" },
    "key-prefix": { type: "string", default: process.env.RATE_LIMIT_KEY_PREFIX ?? "coss" },
    "subnet-ids": { type: "string" },
    "security-group-ids": { type: "string" },
    "max-ecpu": { type: "string" },
    "max-storage-gb": { type: "string" },
    "rotate-password": { type: "boolean", default: false },
  },
});
const region = process.env.AWS_REGION;
const name = values.name;
const keyPrefix = values["key-prefix"];
if (!region) throw new Error("Set AWS_REGION (e.g. AWS_REGION=eu-west-1).");
if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) {
  throw new Error(`Invalid --name "${name}" (lower-case letters, digits and -).`);
}
if (!/^[a-z0-9_-]{1,32}$/.test(keyPrefix)) throw new Error(`Invalid --key-prefix "${keyPrefix}".`);

function list(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

function positive(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`--${flag} must be a number.`);
  return parsed;
}

const subnetIds = list(values["subnet-ids"]);
const securityGroupIds = list(values["security-group-ids"]);
const maxEcpu = positive("max-ecpu", values["max-ecpu"]);
const maxStorageGb = positive("max-storage-gb", values["max-storage-gb"]);
const usageLimits =
  maxEcpu || maxStorageGb
    ? {
        ...(maxEcpu ? { ECPUPerSecond: { Maximum: maxEcpu } } : {}),
        ...(maxStorageGb ? { DataStorage: { Maximum: maxStorageGb, Unit: "GB" as const } } : {}),
      }
    : undefined;

const cacheName = `${name}-ratelimit`;
const appUserId = `${name}-ratelimit`;
const defaultUserId = `${name}-default`;
const userGroupId = `${name}-ratelimit`;
// Only the rate limiter's own keys and the commands it (and the cluster client) needs.
const APP_ACCESS = `on ~${keyPrefix}:* -@all +get +set +del +pttl +hincrby +hgetall +hdel +pexpire +eval +evalsha +ping +info +time +cluster|slots +cluster|shards +cluster|info +client|setname +hello`;

const elasticache = new ElastiCacheClient({ region });

function step(message: string): void {
  console.info(`• ${message}`);
}

function isNamed(error: unknown, ...names: string[]): boolean {
  return names.includes((error as { name?: string }).name ?? "");
}

function newPassword(): string {
  // 43 URL-safe characters: valid in a redis:// URL without escaping.
  return randomBytes(32).toString("base64url");
}

async function userExists(userId: string): Promise<boolean> {
  try {
    await elasticache.send(new DescribeUsersCommand({ UserId: userId }));
    return true;
  } catch (error) {
    if (isNamed(error, "UserNotFoundFault")) return false;
    throw error;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Users. The `default` user every connection starts as is disabled; the app authenticates.
if (!(await userExists(defaultUserId))) {
  await elasticache.send(
    new CreateUserCommand({
      UserId: defaultUserId,
      UserName: "default",
      Engine: "valkey",
      AccessString: "off -@all",
      AuthenticationMode: { Type: "password", Passwords: [newPassword()] },
    }),
  );
  step(`Created the disabled default user ${defaultUserId}`);
} else {
  step(`Default user ${defaultUserId} exists`);
}

let password: string | undefined;
if (!(await userExists(appUserId))) {
  password = newPassword();
  await elasticache.send(
    new CreateUserCommand({
      UserId: appUserId,
      UserName: appUserId,
      Engine: "valkey",
      AccessString: APP_ACCESS,
      AuthenticationMode: { Type: "password", Passwords: [password] },
    }),
  );
  step(`Created user ${appUserId}`);
} else {
  if (values["rotate-password"]) password = newPassword();
  await elasticache.send(
    new ModifyUserCommand({
      UserId: appUserId,
      AccessString: APP_ACCESS,
      ...(password ? { AuthenticationMode: { Type: "password", Passwords: [password] } } : {}),
    }),
  );
  step(`Updated user ${appUserId}${password ? " with a new password" : ""}`);
}

// 2. User group.
try {
  await elasticache.send(new DescribeUserGroupsCommand({ UserGroupId: userGroupId }));
  step(`User group ${userGroupId} exists`);
} catch (error) {
  if (!isNamed(error, "UserGroupNotFoundFault")) throw error;
  await elasticache.send(
    new CreateUserGroupCommand({
      UserGroupId: userGroupId,
      Engine: "valkey",
      UserIds: [defaultUserId, appUserId],
    }),
  );
  step(`Created user group ${userGroupId}`);
}

// A cache can only be associated with an active (or modifying) user group, and a new one starts
// out `creating`.
async function waitForUserGroup(): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const { UserGroups } = await elasticache.send(
      new DescribeUserGroupsCommand({ UserGroupId: userGroupId }),
    );
    const status = UserGroups?.[0]?.Status;
    if (status === "active" || status === "modifying") return;
    if (Date.now() > deadline) throw new Error(`User group ${userGroupId} is still ${status}.`);
    await sleep(10_000);
  }
}
await waitForUserGroup();

// 3. The serverless cache (TLS is always on).
async function describeCache(): Promise<ServerlessCache | undefined> {
  try {
    const { ServerlessCaches } = await elasticache.send(
      new DescribeServerlessCachesCommand({ ServerlessCacheName: cacheName }),
    );
    return ServerlessCaches?.[0];
  } catch (error) {
    if (isNamed(error, "ServerlessCacheNotFoundFault")) return undefined;
    throw error;
  }
}

let cache = await describeCache();
if (!cache) {
  if (!subnetIds || !securityGroupIds) {
    throw new Error("Creating the cache needs --subnet-ids and --security-group-ids.");
  }
  await elasticache.send(
    new CreateServerlessCacheCommand({
      ServerlessCacheName: cacheName,
      Description: "coss.com rate limit counters",
      Engine: "valkey",
      MajorEngineVersion: "8",
      SubnetIds: subnetIds,
      SecurityGroupIds: securityGroupIds,
      UserGroupId: userGroupId,
      ...(usageLimits ? { CacheUsageLimits: usageLimits } : {}),
      Tags: [{ Key: "coss_managed", Value: name }],
    }),
  );
  step(`Creating serverless cache ${cacheName} (this takes a few minutes)`);
} else {
  if (cache.UserGroupId !== userGroupId || usageLimits) {
    await waitUntilAvailable();
    await elasticache.send(
      new ModifyServerlessCacheCommand({
        ServerlessCacheName: cacheName,
        UserGroupId: userGroupId,
        ...(usageLimits ? { CacheUsageLimits: usageLimits } : {}),
      }),
    );
    step(`Updated serverless cache ${cacheName}`);
  } else {
    step(`Serverless cache ${cacheName} exists`);
  }
}

async function waitUntilAvailable(): Promise<ServerlessCache> {
  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    const current = await describeCache();
    if (current?.Status === "available") return current;
    if (current?.Status === "create-failed") throw new Error(`${cacheName} failed to create.`);
    if (Date.now() > deadline) throw new Error(`${cacheName} is still ${current?.Status}.`);
    await sleep(15_000);
  }
}

cache = await waitUntilAvailable();
const endpoint = cache.Endpoint;
if (!endpoint?.Address) throw new Error(`${cacheName} has no endpoint.`);

console.info("\nSet these for the api and the dashboard:\n");
const valkeyUrl = (secret: string) =>
  `rediss://${appUserId}:${secret}@${endpoint.Address}:${endpoint.Port ?? 6379}`;
if (password) {
  // Never on stdout: this also runs where output is kept, such as a one-off task's logs.
  const file = join(mkdtempSync(join(tmpdir(), "coss-valkey-")), "valkey-url");
  writeFileSync(file, valkeyUrl(password), { mode: 0o600 });
  console.info(`VALKEY_URL is in ${file}. Move it to the stage secret, then delete it.`);
} else {
  console.info(`VALKEY_URL=${valkeyUrl("<password>")}`);
}
console.info("VALKEY_CLUSTER=true");
console.info(`RATE_LIMIT_KEY_PREFIX=${keyPrefix}`);
if (!password) {
  console.info(
    "\nThe password is only shown when the user is created; rerun with --rotate-password for a new one.",
  );
}
console.info(
  "\nAlso set CLIENT_IP_HEADER (e.g. x-forwarded-for) and TRUSTED_PROXY_COUNT to match your load " +
    "balancers, or per-IP limits stay off.",
);
