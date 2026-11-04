import type { GetEmailIdentityCommandOutput } from "@aws-sdk/client-sesv2";
import {
  type DomainIdentity,
  type DomainIdentityState,
  type DomainVerificationStatus,
  type EmailStream,
  type IdentityProvider,
  IdentityTakenError,
  type MailFromStatus,
  type ProviderTenant,
} from "../provider.ts";
import {
  accountOf,
  isSesError,
  requiredTlsSetFor,
  type SesApi,
  type SesConfig,
  TENANT_SUPPRESSION,
  tenantNameFor,
} from "./api.ts";

/**
 * Tag on every identity coss.com creates (value: the tenant prefix). coss.com only ever deletes or
 * recreates identities carrying its own tag, so identities managed outside coss.com in the same
 * account (e.g. the company's own domain) are never touched.
 */
export const MANAGED_TAG = "coss_managed";

const DKIM_STATUS: Record<string, DomainVerificationStatus> = {
  SUCCESS: "verified",
  PENDING: "pending",
  NOT_STARTED: "pending",
  TEMPORARY_FAILURE: "temporary_failure",
  FAILED: "failed",
};

const MAIL_FROM_STATUS: Record<string, MailFromStatus> = {
  SUCCESS: "success",
  PENDING: "pending",
  TEMPORARY_FAILURE: "temporary_failure",
  FAILED: "failed",
};

/** SES tenants (one per organization and stream) and domain identities with Easy DKIM + MAIL FROM. */
export class SesIdentityProvider implements IdentityProvider {
  readonly name = "ses";
  readonly #api: SesApi;
  readonly #config: SesConfig;

  constructor(api: SesApi, config: SesConfig) {
    this.#api = api;
    this.#config = config;
  }

  #configurationSetArn(account: string, stream: EmailStream): string {
    return `arn:aws:ses:${this.#config.region}:${account}:configuration-set/${this.#config.configurationSets[stream]}`;
  }

  #identityArn(account: string, domain: string): string {
    return `arn:aws:ses:${this.#config.region}:${account}:identity/${domain}`;
  }

  async #tenantArn(tenant: ProviderTenant): Promise<string> {
    if (tenant.tenantArn) return tenant.tenantArn;
    const { Tenant } = await this.#api.getTenant({ TenantName: tenant.tenantName });
    if (!Tenant?.TenantArn) throw new Error(`SES tenant ${tenant.tenantName} has no ARN.`);
    return Tenant.TenantArn;
  }

  async #associate(tenantName: string, resourceArn: string): Promise<void> {
    try {
      await this.#api.createTenantResourceAssociation({
        TenantName: tenantName,
        ResourceArn: resourceArn,
      });
    } catch (error) {
      if (!isSesError(error, "AlreadyExistsException")) throw error;
    }
  }

  async ensureTenant(input: {
    organizationId: string;
    stream: EmailStream;
    subaccountId?: string | null;
  }): Promise<ProviderTenant> {
    const tenantName = tenantNameFor(
      this.#config.tenantPrefix,
      input.subaccountId ?? input.organizationId,
      input.stream,
    );
    let tenantArn: string | undefined;
    try {
      const created = await this.#api.createTenant({
        TenantName: tenantName,
        SuppressionAttributes: TENANT_SUPPRESSION,
        Tags: [
          { Key: "coss_organization_id", Value: input.organizationId },
          ...(input.subaccountId ? [{ Key: "coss_subaccount_id", Value: input.subaccountId }] : []),
        ],
      });
      tenantArn = created.TenantArn;
    } catch (error) {
      if (!isSesError(error, "AlreadyExistsException")) throw error;
      // Existing tenants are migrated by ses:bootstrap before their protection is disabled.
    }
    tenantArn ??= await this.#tenantArn({ tenantName, tenantArn: null });
    // A tenant can only send with configuration sets associated with it: only its stream's, and
    // that set's required-TLS twin, so turning on HIPAA mode needs no call to SES.
    const configurationSetArn = this.#configurationSetArn(accountOf(tenantArn), input.stream);
    await this.#associate(tenantName, configurationSetArn);
    try {
      await this.#associate(tenantName, requiredTlsSetFor(configurationSetArn));
    } catch (error) {
      // Between a deploy and `ses:bootstrap` the set or its IAM may not exist yet, and only an
      // organization in HIPAA mode needs it: bootstrap associates every tenant that missed it.
      if (!isSesError(error, "NotFoundException") && !isSesError(error, "AccessDeniedException")) {
        throw error;
      }
      console.warn(`[email:ses] ${tenantName} has no required-TLS set yet: run ses:bootstrap.`);
    }
    return { tenantName, tenantArn };
  }

  async #create(domain: string): Promise<GetEmailIdentityCommandOutput["DkimAttributes"]> {
    const created = await this.#api.createEmailIdentity({
      EmailIdentity: domain,
      // Only a default: every send names its stream's configuration set.
      ConfigurationSetName: this.#config.configurationSets.transactional,
      DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
      Tags: [{ Key: MANAGED_TAG, Value: this.#config.tenantPrefix }],
    });
    return created.DkimAttributes;
  }

  /** Whether this deployment created the identity (`null`: it doesn't exist). */
  async #managedByUs(identityArn: string): Promise<boolean | null> {
    try {
      const { Tags = [] } = await this.#api.listTagsForResource({ ResourceArn: identityArn });
      return Tags.some((tag) => tag.Key === MANAGED_TAG && tag.Value === this.#config.tenantPrefix);
    } catch (error) {
      if (isSesError(error, "NotFoundException")) return null;
      throw error;
    }
  }

  async createDomainIdentity(input: {
    tenants: ProviderTenant[];
    domain: string;
    mailFromDomain: string;
  }): Promise<DomainIdentity> {
    const [first] = input.tenants;
    if (!first) throw new Error(`No tenant to associate ${input.domain} with.`);
    const own = new Set(input.tenants.map((tenant) => tenant.tenantName));
    const account = accountOf(await this.#tenantArn(first));
    const identityArn = this.#identityArn(account, input.domain);
    let dkim: GetEmailIdentityCommandOutput["DkimAttributes"];
    try {
      dkim = await this.#create(input.domain);
    } catch (error) {
      if (!isSesError(error, "AlreadyExistsException")) throw error;
      // Never adopt an identity another organization's tenant holds, nor one managed outside
      // coss.com. An orphan coss.com created (e.g. a released claim) is recreated, so its DKIM keys (and
      // so its DNS records) are new and can only be published by whoever controls DNS now.
      const { ResourceTenants = [] } = await this.#api.listResourceTenants({
        ResourceArn: identityArn,
      });
      if (ResourceTenants.some((t) => !own.has(t.TenantName ?? ""))) {
        throw new IdentityTakenError(input.domain);
      }
      if (ResourceTenants.length > 0) {
        dkim = (await this.#api.getEmailIdentity({ EmailIdentity: input.domain })).DkimAttributes;
      } else if (await this.#managedByUs(identityArn)) {
        await this.#api.deleteEmailIdentity({ EmailIdentity: input.domain });
        dkim = await this.#create(input.domain);
      } else {
        throw new IdentityTakenError(input.domain);
      }
    }
    await this.#api.putEmailIdentityMailFromAttributes({
      EmailIdentity: input.domain,
      MailFromDomain: input.mailFromDomain,
      // Without the MX record, mail still goes out with SES's own MAIL FROM (DKIM keeps DMARC).
      BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
    });
    // A shared assignment: every stream of the organization sends from the domain.
    for (const tenant of input.tenants) await this.#associate(tenant.tenantName, identityArn);
    return {
      dkimTokens: dkim?.Tokens ?? [],
      dkimHostedZone: dkim?.SigningHostedZone ?? "dkim.amazonses.com",
      region: this.#config.region,
    };
  }

  async associateDomainIdentity(input: { tenant: ProviderTenant; domain: string }): Promise<void> {
    const account = accountOf(await this.#tenantArn(input.tenant));
    try {
      await this.#associate(input.tenant.tenantName, this.#identityArn(account, input.domain));
    } catch (error) {
      if (!isSesError(error, "NotFoundException")) throw error;
    }
  }

  async getDomainIdentity(domain: string): Promise<DomainIdentityState | null> {
    let identity: GetEmailIdentityCommandOutput;
    try {
      identity = await this.#api.getEmailIdentity({ EmailIdentity: domain });
    } catch (error) {
      if (isSesError(error, "NotFoundException")) return null;
      throw error;
    }
    const dkim = identity.DkimAttributes;
    return {
      dkimTokens: dkim?.Tokens ?? [],
      dkimHostedZone: dkim?.SigningHostedZone ?? "dkim.amazonses.com",
      region: this.#config.region,
      status: DKIM_STATUS[dkim?.Status ?? "PENDING"] ?? "pending",
      canSend: identity.VerifiedForSendingStatus ?? false,
      mailFromStatus:
        MAIL_FROM_STATUS[identity.MailFromAttributes?.MailFromDomainStatus ?? "PENDING"] ??
        "pending",
    };
  }

  async deleteDomainIdentity(input: { tenants: ProviderTenant[]; domain: string }): Promise<void> {
    const tenants = input.tenants.filter((tenant) => tenant.tenantName);
    const [first] = tenants;
    if (!first) return;
    const identityArn = this.#identityArn(accountOf(await this.#tenantArn(first)), input.domain);
    for (const tenant of tenants) {
      try {
        await this.#api.deleteTenantResourceAssociation({
          TenantName: tenant.tenantName,
          ResourceArn: identityArn,
        });
      } catch (error) {
        if (!isSesError(error, "NotFoundException")) throw error;
      }
    }
    // Only identities this deployment created are deleted; others merely lose the associations.
    if (!(await this.#managedByUs(identityArn))) return;
    try {
      await this.#api.deleteEmailIdentity({ EmailIdentity: input.domain });
    } catch (error) {
      if (!isSesError(error, "NotFoundException")) throw error;
    }
  }

  async deleteTenant(tenant: ProviderTenant): Promise<void> {
    // Only this deployment's tenants (`<prefix>-…`): stages may share an account.
    if (!tenant.tenantName.startsWith(`${this.#config.tenantPrefix}-`)) return;
    try {
      await this.#api.deleteTenant({ TenantName: tenant.tenantName });
    } catch (error) {
      if (!isSesError(error, "NotFoundException")) throw error;
    }
  }
}
