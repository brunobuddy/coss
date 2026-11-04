import {
  type DedicatedIpProvider,
  DedicatedIpTakenError,
  EMAIL_STREAMS,
  type EmailStream,
  type ProviderTenant,
} from "../provider.ts";
import { accountOf, isSesError, type SesApi, type SesConfig, tenantNameFor } from "./api.ts";
import { MANAGED_TAG } from "./identity.ts";

/**
 * SES managed dedicated IPs: one managed pool per organization (SES leases, scales and warms up
 * its IPs, spilling to the shared pool while it does) and, per stream, a configuration set named
 * like the stream's tenant that sends through it. Each set copies its stream's shared set's event
 * destinations (so its events reach the worker like every other) and is associated with the
 * stream's tenant, which may only send with sets associated with it. All carry
 * `coss_managed=<prefix>`: coss.com never adopts or deletes a pool or set it didn't create.
 */
export class SesDedicatedIpProvider implements DedicatedIpProvider {
  readonly name = "ses";
  readonly #api: SesApi;
  readonly #config: SesConfig;

  constructor(api: SesApi, config: SesConfig) {
    this.#api = api;
    this.#config = config;
  }

  /** The pool's name (also the transactional set's). */
  #name(organizationId: string): string {
    return tenantNameFor(this.#config.tenantPrefix, organizationId);
  }

  /** The configuration set of a stream (named like the stream's tenant). */
  #setName(organizationId: string, stream: EmailStream): string {
    return tenantNameFor(this.#config.tenantPrefix, organizationId, stream);
  }

  #arn(account: string, resource: "dedicated-ip-pool" | "configuration-set", name: string) {
    return `arn:aws:ses:${this.#config.region}:${account}:${resource}/${name}`;
  }

  #tags(organizationId: string) {
    return [
      { Key: MANAGED_TAG, Value: this.#config.tenantPrefix },
      { Key: "coss_organization_id", Value: organizationId },
    ];
  }

  /** Whether this deployment created the resource (`null`: it doesn't exist). */
  async #managedByUs(arn: string): Promise<boolean | null> {
    try {
      const { Tags = [] } = await this.#api.listTagsForResource({ ResourceArn: arn });
      return Tags.some((tag) => tag.Key === MANAGED_TAG && tag.Value === this.#config.tenantPrefix);
    } catch (error) {
      if (isSesError(error, "NotFoundException")) return null;
      throw error;
    }
  }

  /** Runs `create`; an existing resource is fine only if this deployment created it. */
  async #create(arn: string, label: string, create: () => Promise<unknown>): Promise<void> {
    try {
      await create();
    } catch (error) {
      if (!isSesError(error, "AlreadyExistsException")) throw error;
      if (!(await this.#managedByUs(arn))) throw new DedicatedIpTakenError(label);
    }
  }

  async ensurePool(input: {
    organizationId: string;
    tenants: Partial<Record<EmailStream, ProviderTenant>>;
  }): Promise<void> {
    const streams = EMAIL_STREAMS.filter((stream) => input.tenants[stream]);
    const first = streams[0] && input.tenants[streams[0]];
    if (!first) throw new Error(`No SES tenant to set up dedicated IPs for.`);
    const firstArn = await this.#tenantArn(first);
    if (!firstArn) throw new Error(`SES tenant ${first.tenantName} doesn't exist.`);
    const account = accountOf(firstArn);
    const name = this.#name(input.organizationId);
    const tags = this.#tags(input.organizationId);

    await this.#create(
      this.#arn(account, "dedicated-ip-pool", name),
      `Dedicated IP pool ${name}`,
      () => this.#api.createDedicatedIpPool({ PoolName: name, ScalingMode: "MANAGED", Tags: tags }),
    );
    for (const stream of streams) {
      const tenant = input.tenants[stream];
      if (!tenant) continue;
      if (!(await this.#tenantArn(tenant))) {
        throw new Error(`SES tenant ${tenant.tenantName} doesn't exist.`);
      }
      await this.#ensureSet(account, name, stream, input.organizationId, tenant, tags);
    }
  }

  /** The stream's configuration set on the pool, with its events, associated with its tenant. */
  async #ensureSet(
    account: string,
    pool: string,
    stream: EmailStream,
    organizationId: string,
    tenant: ProviderTenant,
    tags: { Key: string; Value: string }[],
  ): Promise<void> {
    const setName = this.#setName(organizationId, stream);
    const configurationSetArn = this.#arn(account, "configuration-set", setName);
    await this.#create(configurationSetArn, `Configuration set ${setName}`, () =>
      this.#api.createConfigurationSet({
        ConfigurationSetName: setName,
        DeliveryOptions: { SendingPoolName: pool },
        ReputationOptions: { ReputationMetricsEnabled: true },
        SendingOptions: { SendingEnabled: true },
        // coss.com keeps the only suppression list (see `TENANT_SUPPRESSION`).
        SuppressionOptions: { SuppressedReasons: [] },
        Tags: tags,
      }),
    );
    const { EventDestinations = [] } = await this.#api.getConfigurationSetEventDestinations({
      ConfigurationSetName: this.#config.configurationSets[stream],
    });
    for (const destination of EventDestinations) {
      if (!destination.Name) continue;
      try {
        await this.#api.createConfigurationSetEventDestination({
          ConfigurationSetName: setName,
          EventDestinationName: destination.Name,
          EventDestination: {
            Enabled: destination.Enabled,
            MatchingEventTypes: destination.MatchingEventTypes,
            SnsDestination: destination.SnsDestination,
            EventBridgeDestination: destination.EventBridgeDestination,
            CloudWatchDestination: destination.CloudWatchDestination,
            KinesisFirehoseDestination: destination.KinesisFirehoseDestination,
          },
        });
      } catch (error) {
        if (!isSesError(error, "AlreadyExistsException")) throw error;
      }
    }
    try {
      await this.#api.createTenantResourceAssociation({
        TenantName: tenant.tenantName,
        ResourceArn: configurationSetArn,
      });
    } catch (error) {
      if (!isSesError(error, "AlreadyExistsException")) throw error;
    }
  }

  async setRequireTls(input: {
    organizationId: string;
    streams: readonly EmailStream[];
    require: boolean;
  }): Promise<void> {
    for (const stream of input.streams) {
      await this.#api.putConfigurationSetDeliveryOptions({
        ConfigurationSetName: this.#setName(input.organizationId, stream),
        // The whole of the delivery options: leaving the pool out would take the set off it.
        SendingPoolName: this.#name(input.organizationId),
        TlsPolicy: input.require ? "REQUIRE" : "OPTIONAL",
      });
    }
  }

  async poolIps(organizationId: string): Promise<string[]> {
    const ips: string[] = [];
    let NextToken: string | undefined;
    do {
      let page: Awaited<ReturnType<SesApi["getDedicatedIps"]>>;
      try {
        page = await this.#api.getDedicatedIps({
          PoolName: this.#name(organizationId),
          PageSize: 100,
          ...(NextToken ? { NextToken } : {}),
        });
      } catch (error) {
        if (isSesError(error, "NotFoundException")) return [];
        throw error;
      }
      for (const ip of page.DedicatedIps ?? []) if (ip.Ip) ips.push(ip.Ip);
      NextToken = page.NextToken;
    } while (NextToken);
    return ips.sort();
  }

  async releasePool(input: {
    organizationId: string;
    tenants: Partial<Record<EmailStream, ProviderTenant>>;
  }): Promise<void> {
    const name = this.#name(input.organizationId);
    // Resources are named by the tenants' account; without a tenant nothing was ever created.
    let account: string | null = null;
    for (const stream of EMAIL_STREAMS) {
      const tenant = input.tenants[stream];
      const tenantArn = tenant && (await this.#tenantArn(tenant));
      if (tenantArn) account ??= accountOf(tenantArn);
    }
    if (!account) return;
    for (const stream of EMAIL_STREAMS) {
      const setName = this.#setName(input.organizationId, stream);
      const configurationSetArn = this.#arn(account, "configuration-set", setName);
      // SES refuses to delete a configuration set that is still associated with a tenant.
      const tenant = input.tenants[stream];
      if (tenant) {
        try {
          await this.#api.deleteTenantResourceAssociation({
            TenantName: tenant.tenantName,
            ResourceArn: configurationSetArn,
          });
        } catch (error) {
          if (!isSesError(error, "NotFoundException")) throw error;
        }
      }
      if (await this.#managedByUs(configurationSetArn)) {
        try {
          await this.#api.deleteConfigurationSet({ ConfigurationSetName: setName });
        } catch (error) {
          if (!isSesError(error, "NotFoundException")) throw error;
        }
      }
    }
    if (await this.#managedByUs(this.#arn(account, "dedicated-ip-pool", name))) {
      try {
        await this.#api.deleteDedicatedIpPool({ PoolName: name });
      } catch (error) {
        if (!isSesError(error, "NotFoundException")) throw error;
      }
    }
  }

  /** The tenant's ARN (`null`: the tenant doesn't exist). */
  async #tenantArn(tenant: ProviderTenant): Promise<string | null> {
    if (tenant.tenantArn) return tenant.tenantArn;
    try {
      const { Tenant } = await this.#api.getTenant({ TenantName: tenant.tenantName });
      return Tenant?.TenantArn ?? null;
    } catch (error) {
      if (isSesError(error, "NotFoundException")) return null;
      throw error;
    }
  }
}
