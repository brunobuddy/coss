import { createHash } from "node:crypto";
import {
  CloudFrontClient,
  CreateDistributionTenantCommand,
  DeleteDistributionTenantCommand,
  type DistributionTenant,
  GetDistributionTenantCommand,
  GetManagedCertificateDetailsCommand,
  UpdateDistributionTenantCommand,
} from "@aws-sdk/client-cloudfront";
import {
  type TrackingHostnameProvider,
  type TrackingHostnameState,
  TrackingHostnameTakenError,
} from "../tracking-hostnames.ts";

export type CloudFrontTrackingConfig = {
  distributionId: string;
  connectionGroupId: string;
  cnameTarget: string;
};

export type CloudFrontTenant = {
  id: string;
  distributionId: string | null;
  hostname: string | null;
  enabled: boolean;
  domainStatus: string | null;
  certificateArn: string | null;
  etag: string;
};

export type CloudFrontCertificate = {
  status: string | null;
  certificateArn: string | null;
};

export type CreateCloudFrontTenantInput = {
  distributionId: string;
  connectionGroupId: string;
  name: string;
  hostname: string;
};

export interface CloudFrontTenantsApi {
  create(input: CreateCloudFrontTenantInput): Promise<CloudFrontTenant>;
  /** By id or name (CloudFront takes either). */
  get(identifier: string): Promise<CloudFrontTenant | null>;
  certificate(id: string): Promise<CloudFrontCertificate | null>;
  attachCertificate(id: string, etag: string, certificateArn: string): Promise<void>;
  /** Returns the tenant's new ETag, which `remove` needs. */
  disable(id: string, etag: string): Promise<string>;
  remove(id: string, etag: string): Promise<void>;
}

function errorName(error: unknown): string | undefined {
  return (error as { name?: string } | null)?.name;
}

function tenantOf(result: {
  DistributionTenant?: DistributionTenant;
  ETag?: string;
}): CloudFrontTenant {
  const tenant = result.DistributionTenant;
  if (!tenant?.Id || !result.ETag) throw new Error("CloudFront returned no distribution tenant.");
  return {
    id: tenant.Id,
    distributionId: tenant.DistributionId ?? null,
    hostname: tenant.Domains?.[0]?.Domain ?? null,
    enabled: tenant.Enabled !== false,
    domainStatus: tenant.Domains?.[0]?.Status ?? null,
    certificateArn: tenant.Customizations?.Certificate?.Arn ?? null,
    etag: result.ETag,
  };
}

export function createCloudFrontTenantsApi(): CloudFrontTenantsApi {
  const client = new CloudFrontClient({ region: "us-east-1" });
  return {
    async create({ distributionId, connectionGroupId, name, hostname }) {
      return tenantOf(
        await client.send(
          new CreateDistributionTenantCommand({
            DistributionId: distributionId,
            ConnectionGroupId: connectionGroupId,
            Name: name,
            Domains: [{ Domain: hostname }],
            Enabled: true,
            ManagedCertificateRequest: {
              ValidationTokenHost: "cloudfront",
              PrimaryDomainName: hostname,
              CertificateTransparencyLoggingPreference: "enabled",
            },
          }),
        ),
      );
    },
    async get(identifier) {
      try {
        return tenantOf(
          await client.send(new GetDistributionTenantCommand({ Identifier: identifier })),
        );
      } catch (error) {
        if (errorName(error) === "EntityNotFound") return null;
        throw error;
      }
    },
    async certificate(id) {
      try {
        const result = await client.send(
          new GetManagedCertificateDetailsCommand({ Identifier: id }),
        );
        return {
          status: result.ManagedCertificateDetails?.CertificateStatus ?? null,
          certificateArn: result.ManagedCertificateDetails?.CertificateArn ?? null,
        };
      } catch (error) {
        if (errorName(error) === "EntityNotFound") return null;
        throw error;
      }
    },
    async attachCertificate(id, etag, certificateArn) {
      await client.send(
        new UpdateDistributionTenantCommand({
          Id: id,
          IfMatch: etag,
          Customizations: { Certificate: { Arn: certificateArn } },
        }),
      );
    },
    async disable(id, etag) {
      const result = await client.send(
        new UpdateDistributionTenantCommand({ Id: id, IfMatch: etag, Enabled: false }),
      );
      return tenantOf(result).etag;
    },
    async remove(id, etag) {
      await client.send(new DeleteDistributionTenantCommand({ Id: id, IfMatch: etag }));
    },
  };
}

/**
 * Names are unique in the account and bound to the claim, so a tenant found under this name can
 * only be what this claim created: that's what lets a retry pick it up after a lost answer.
 */
export function tenantName(hostname: string, claim: string): string {
  const hash = createHash("sha256").update(`${claim}\n${hostname}`).digest("hex");
  return `trk-${hash.slice(0, 32)}`;
}

const FAILED_CERTIFICATES = new Map([
  ["failed", "The certificate for the tracking domain could not be issued."],
  ["revoked", "The certificate for the tracking domain was revoked."],
  ["expired", "The certificate for the tracking domain expired."],
  [
    "validation-timed-out",
    "The certificate for the tracking domain could not be validated in time.",
  ],
]);

export function tenantState(
  domainStatus: string | null,
  certificateStatus: string | null,
  cnameTarget: string,
): TrackingHostnameState {
  const failure = certificateStatus ? FAILED_CERTIFICATES.get(certificateStatus) : undefined;
  if (failure) return { status: "failed", message: failure };
  if (certificateStatus === "issued") {
    return domainStatus === "active"
      ? { status: "active", message: null }
      : {
          status: "pending",
          message: `The tracking domain isn't active yet. Check that its CNAME record points to ${cnameTarget}.`,
        };
  }
  return {
    status: "pending",
    message:
      certificateStatus === "pending-validation"
        ? `Waiting for the CNAME record to point to ${cnameTarget}, so its certificate can be issued.`
        : null,
  };
}

const REMOVAL_REFUSALS = new Set(["ResourceNotDisabled", "ResourceInUse", "PreconditionFailed"]);

export class CloudFrontTrackingHostnameProvider implements TrackingHostnameProvider {
  readonly name = "cloudfront";
  readonly cnameTarget: string;
  readonly #config: CloudFrontTrackingConfig;
  readonly #api: CloudFrontTenantsApi;

  constructor(config: CloudFrontTrackingConfig, api: CloudFrontTenantsApi) {
    this.#config = config;
    this.#api = api;
    this.cnameTarget = config.cnameTarget;
  }

  async create(
    hostname: string,
    claim: string,
  ): Promise<{ id: string; state: TrackingHostnameState }> {
    const answer = (tenant: CloudFrontTenant) => ({
      id: tenant.id,
      state: tenantState(tenant.domainStatus, "pending-validation", this.cnameTarget),
    });
    try {
      return answer(
        await this.#api.create({
          distributionId: this.#config.distributionId,
          connectionGroupId: this.#config.connectionGroupId,
          name: tenantName(hostname, claim),
          hostname,
        }),
      );
    } catch (error) {
      const name = errorName(error);
      if (name !== "CNAMEAlreadyExists" && name !== "EntityAlreadyExists") throw error;
      const mine = await this.#claimed(hostname, claim);
      if (!mine) throw new TrackingHostnameTakenError(hostname);
      if (!mine.enabled) throw new Error(`Tenant ${mine.id} is still being removed.`);
      return answer(mine);
    }
  }

  async #claimed(hostname: string, claim: string): Promise<CloudFrontTenant | null> {
    const tenant = await this.#api.get(tenantName(hostname, claim));
    return tenant?.distributionId === this.#config.distributionId && tenant.hostname === hostname
      ? tenant
      : null;
  }

  async release(hostname: string, claim: string): Promise<void> {
    const tenant = await this.#claimed(hostname, claim);
    if (tenant) await this.delete(tenant.id);
  }

  async get(id: string): Promise<TrackingHostnameState | null> {
    const tenant = await this.#api.get(id);
    if (!tenant) return null;
    // A disabled tenant serves nothing, whatever its domain and certificate say.
    if (!tenant.enabled) {
      return {
        status: "pending",
        message: "This tracking domain is being removed. Try removing it again in a few minutes.",
      };
    }
    const certificate = await this.#api.certificate(id);
    // CloudFront serves an issued managed certificate only once it is attached to the tenant.
    if (
      certificate?.status === "issued" &&
      certificate.certificateArn &&
      tenant.domainStatus !== "active" &&
      !tenant.certificateArn
    ) {
      await this.#attach(tenant, certificate.certificateArn);
    }
    return tenantState(tenant.domainStatus, certificate?.status ?? null, this.cnameTarget);
  }

  async #attach(tenant: CloudFrontTenant, certificateArn: string): Promise<void> {
    try {
      await this.#api.attachCertificate(tenant.id, tenant.etag, certificateArn);
    } catch (error) {
      // A stale ETag: the next check reads a fresh one and attaches then.
      if (errorName(error) !== "PreconditionFailed") throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const tenant = await this.#api.get(id);
      if (!tenant) return;
      const etag = tenant.enabled ? await this.#api.disable(id, tenant.etag) : tenant.etag;
      await this.#api.remove(id, etag);
    } catch (error) {
      const name = errorName(error);
      if (name === "EntityNotFound") return;
      // The disable takes minutes to deploy; callers retry on this throw.
      if (name && REMOVAL_REFUSALS.has(name)) {
        throw new Error(`CloudFront can't remove tenant ${id} until it is disabled (${name}).`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
