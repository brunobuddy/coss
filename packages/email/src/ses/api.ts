/**
 * The SES v2 operations coss.com uses, as a narrow port over `SESv2Client` (tests use a fake).
 * The client never retries on its own: `SendEmail` is not idempotent, so a retry after a timeout
 * could send twice. Callers retry only when SES certainly rejected the request (throttling).
 */
import {
  CreateConfigurationSetCommand,
  type CreateConfigurationSetCommandInput,
  CreateConfigurationSetEventDestinationCommand,
  type CreateConfigurationSetEventDestinationCommandInput,
  CreateDedicatedIpPoolCommand,
  type CreateDedicatedIpPoolCommandInput,
  CreateEmailIdentityCommand,
  type CreateEmailIdentityCommandInput,
  type CreateEmailIdentityCommandOutput,
  CreateTenantCommand,
  type CreateTenantCommandInput,
  type CreateTenantCommandOutput,
  CreateTenantResourceAssociationCommand,
  type CreateTenantResourceAssociationCommandInput,
  DeleteConfigurationSetCommand,
  DeleteDedicatedIpPoolCommand,
  DeleteEmailIdentityCommand,
  DeleteTenantCommand,
  DeleteTenantResourceAssociationCommand,
  type DeleteTenantResourceAssociationCommandInput,
  GetConfigurationSetEventDestinationsCommand,
  type GetConfigurationSetEventDestinationsCommandOutput,
  GetDedicatedIpsCommand,
  type GetDedicatedIpsCommandOutput,
  GetEmailIdentityCommand,
  type GetEmailIdentityCommandOutput,
  GetTenantCommand,
  type GetTenantCommandOutput,
  ListResourceTenantsCommand,
  type ListResourceTenantsCommandOutput,
  ListTagsForResourceCommand,
  type ListTagsForResourceCommandOutput,
  PutConfigurationSetDeliveryOptionsCommand,
  PutEmailIdentityMailFromAttributesCommand,
  type PutEmailIdentityMailFromAttributesCommandInput,
  PutTenantSuppressionAttributesCommand,
  type PutTenantSuppressionAttributesCommandInput,
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
  type SendEmailCommandOutput,
  type TenantSuppressionAttributes,
} from "@aws-sdk/client-sesv2";
import type { EmailStream } from "../provider.ts";

export type SesConfig = {
  region: string;
  /**
   * The shared configuration set of each stream (event publishing, optionally a dedicated IP
   * pool), created by `ses:bootstrap`: `<name>` and `<name>-marketing`.
   */
  configurationSets: Record<EmailStream, string>;
  /** Prefixes tenant names, `<prefix>-<organization id>`; separates stages in one account. */
  tenantPrefix: string;
};

/** Each stream's configuration set, derived from the transactional one (`SES_CONFIGURATION_SET`). */
export function configurationSetsFor(name: string): Record<EmailStream, string> {
  return { transactional: name, marketing: `${name}-marketing` };
}

/**
 * A shared set's twin that refuses unencrypted delivery (`TlsPolicy: REQUIRE`), for organizations
 * in HIPAA mode. `ses:bootstrap` creates these and associates every tenant with its stream's.
 */
export function requiredTlsSetFor(configurationSet: string): string {
  return `${configurationSet}-tls`;
}

/**
 * coss.com keeps the only suppression list (`email_suppression`): SES must never suppress an address
 * by itself, or removing a coss.com entry (or scoping one to a category) would not let mail through.
 * Tenants keep their own, empty, list rather than the account-wide one shared by every stage.
 */
export const TENANT_SUPPRESSION: TenantSuppressionAttributes = {
  SuppressionScope: "TENANT",
  SuppressedReasons: [],
};

export interface SesApi {
  sendEmail(input: SendEmailCommandInput): Promise<SendEmailCommandOutput>;
  createTenant(input: CreateTenantCommandInput): Promise<CreateTenantCommandOutput>;
  putTenantSuppressionAttributes(
    input: PutTenantSuppressionAttributesCommandInput,
  ): Promise<unknown>;
  getTenant(input: { TenantName: string }): Promise<GetTenantCommandOutput>;
  deleteTenant(input: { TenantName: string }): Promise<unknown>;
  createTenantResourceAssociation(
    input: CreateTenantResourceAssociationCommandInput,
  ): Promise<unknown>;
  deleteTenantResourceAssociation(
    input: DeleteTenantResourceAssociationCommandInput,
  ): Promise<unknown>;
  listResourceTenants(input: { ResourceArn: string }): Promise<ListResourceTenantsCommandOutput>;
  listTagsForResource(input: { ResourceArn: string }): Promise<ListTagsForResourceCommandOutput>;
  createEmailIdentity(
    input: CreateEmailIdentityCommandInput,
  ): Promise<CreateEmailIdentityCommandOutput>;
  getEmailIdentity(input: { EmailIdentity: string }): Promise<GetEmailIdentityCommandOutput>;
  deleteEmailIdentity(input: { EmailIdentity: string }): Promise<unknown>;
  putEmailIdentityMailFromAttributes(
    input: PutEmailIdentityMailFromAttributesCommandInput,
  ): Promise<unknown>;
  createDedicatedIpPool(input: CreateDedicatedIpPoolCommandInput): Promise<unknown>;
  deleteDedicatedIpPool(input: { PoolName: string }): Promise<unknown>;
  getDedicatedIps(input: {
    PoolName: string;
    NextToken?: string;
    PageSize?: number;
  }): Promise<GetDedicatedIpsCommandOutput>;
  createConfigurationSet(input: CreateConfigurationSetCommandInput): Promise<unknown>;
  putConfigurationSetDeliveryOptions(input: {
    ConfigurationSetName: string;
    SendingPoolName?: string;
    TlsPolicy: "REQUIRE" | "OPTIONAL";
  }): Promise<unknown>;
  deleteConfigurationSet(input: { ConfigurationSetName: string }): Promise<unknown>;
  getConfigurationSetEventDestinations(input: {
    ConfigurationSetName: string;
  }): Promise<GetConfigurationSetEventDestinationsCommandOutput>;
  createConfigurationSetEventDestination(
    input: CreateConfigurationSetEventDestinationCommandInput,
  ): Promise<unknown>;
}

export function createSesApi(region: string): SesApi {
  const client = new SESv2Client({
    region,
    maxAttempts: 1,
    requestHandler: { requestTimeout: 15_000, connectionTimeout: 5_000 },
  });
  return {
    sendEmail: (input) => client.send(new SendEmailCommand(input)),
    createTenant: (input) => client.send(new CreateTenantCommand(input)),
    putTenantSuppressionAttributes: (input) =>
      client.send(new PutTenantSuppressionAttributesCommand(input)),
    getTenant: (input) => client.send(new GetTenantCommand(input)),
    deleteTenant: (input) => client.send(new DeleteTenantCommand(input)),
    createTenantResourceAssociation: (input) =>
      client.send(new CreateTenantResourceAssociationCommand(input)),
    deleteTenantResourceAssociation: (input) =>
      client.send(new DeleteTenantResourceAssociationCommand(input)),
    listResourceTenants: (input) => client.send(new ListResourceTenantsCommand(input)),
    listTagsForResource: (input) => client.send(new ListTagsForResourceCommand(input)),
    createEmailIdentity: (input) => client.send(new CreateEmailIdentityCommand(input)),
    getEmailIdentity: (input) => client.send(new GetEmailIdentityCommand(input)),
    deleteEmailIdentity: (input) => client.send(new DeleteEmailIdentityCommand(input)),
    putEmailIdentityMailFromAttributes: (input) =>
      client.send(new PutEmailIdentityMailFromAttributesCommand(input)),
    createDedicatedIpPool: (input) => client.send(new CreateDedicatedIpPoolCommand(input)),
    deleteDedicatedIpPool: (input) => client.send(new DeleteDedicatedIpPoolCommand(input)),
    getDedicatedIps: (input) => client.send(new GetDedicatedIpsCommand(input)),
    createConfigurationSet: (input) => client.send(new CreateConfigurationSetCommand(input)),
    putConfigurationSetDeliveryOptions: (input) =>
      client.send(new PutConfigurationSetDeliveryOptionsCommand(input)),
    deleteConfigurationSet: (input) => client.send(new DeleteConfigurationSetCommand(input)),
    getConfigurationSetEventDestinations: (input) =>
      client.send(new GetConfigurationSetEventDestinationsCommand(input)),
    createConfigurationSetEventDestination: (input) =>
      client.send(new CreateConfigurationSetEventDestinationCommand(input)),
  };
}

/** True when `error` is the named SES exception (by name, robust to duplicate SDK copies). */
export function isSesError(error: unknown, name: string): boolean {
  return (error as { name?: string } | null)?.name === name;
}

/**
 * `<prefix>-<organization id>` (transactional) or `<prefix>-<organization id>-marketing`: at most
 * 64 characters of [A-Za-z0-9_-] (the prefix is at most 23, `SES_TENANT_PREFIX_PATTERN`). Also
 * names the organization's dedicated IP pool (the transactional name) and the configuration set of
 * each stream that sends through it. An email sub-account's tenant is named the same way after the
 * sub-account's id (`sub_…`, as long as an organization's): ids never collide.
 */
export function tenantNameFor(
  prefix: string,
  organizationId: string,
  stream: EmailStream = "transactional",
): string {
  return stream === "transactional"
    ? `${prefix}-${organizationId}`
    : `${prefix}-${organizationId}-${stream}`;
}

/** The account id from any SES ARN (`arn:aws:ses:<region>:<account>:…`). */
export function accountOf(arn: string): string {
  const account = arn.split(":")[4];
  if (!account) throw new Error(`Not an ARN: ${arn}`);
  return account;
}
