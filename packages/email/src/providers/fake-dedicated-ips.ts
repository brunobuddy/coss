import {
  type DedicatedIpProvider,
  EMAIL_STREAMS,
  type EmailStream,
  type ProviderTenant,
} from "../provider.ts";

/** The IP fake pools get by default, and that the fake provider delivers dedicated mail from. */
export const FAKE_DEDICATED_IP = "198.51.100.10";

/**
 * In-memory dedicated IP pools for local development and tests. A pool gets the IPs `ips`
 * returns for its organization (default: one documentation address, as if already assigned).
 */
export class FakeDedicatedIpProvider implements DedicatedIpProvider {
  readonly name = "fake";
  readonly #pools = new Set<string>();
  readonly #streams = new Map<string, Set<EmailStream>>();
  readonly #ips: (organizationId: string) => string[];
  readonly #fail?: (operation: "ensure" | "release", organizationId: string) => boolean;

  constructor(
    opts: {
      ips?: (organizationId: string) => string[];
      fail?: (operation: "ensure" | "release", organizationId: string) => boolean;
    } = {},
  ) {
    this.#ips = opts.ips ?? (() => [FAKE_DEDICATED_IP]);
    this.#fail = opts.fail;
  }

  /** Organizations with a pool in this instance (tests). */
  get pools(): string[] {
    return [...this.#pools];
  }

  /** The streams whose mail an organization's pool in this instance carries (tests). */
  streamsOf(organizationId: string): EmailStream[] {
    const streams = this.#streams.get(organizationId);
    return EMAIL_STREAMS.filter((stream) => streams?.has(stream));
  }

  async ensurePool(input: {
    organizationId: string;
    tenants: Partial<Record<EmailStream, ProviderTenant>>;
  }): Promise<void> {
    if (this.#fail?.("ensure", input.organizationId)) {
      throw new Error(`Fake pool for ${input.organizationId} failed.`);
    }
    this.#pools.add(input.organizationId);
    const streams = this.#streams.get(input.organizationId) ?? new Set<EmailStream>();
    for (const stream of EMAIL_STREAMS) if (input.tenants[stream]) streams.add(stream);
    this.#streams.set(input.organizationId, streams);
  }

  /** Organizations whose pool in this instance requires TLS (tests). */
  readonly tlsRequired = new Set<string>();

  async setRequireTls(input: { organizationId: string; require: boolean }): Promise<void> {
    if (input.require) this.tlsRequired.add(input.organizationId);
    else this.tlsRequired.delete(input.organizationId);
  }

  async poolIps(organizationId: string): Promise<string[]> {
    // Pools created by another process (e.g. a previous dev server) are unknown here: treat them
    // as existing, since a fake pool has nothing to lose.
    return this.#ips(organizationId);
  }

  async releasePool(input: { organizationId: string }): Promise<void> {
    if (this.#fail?.("release", input.organizationId)) {
      throw new Error(`Fake pool release for ${input.organizationId} failed.`);
    }
    this.#pools.delete(input.organizationId);
    this.#streams.delete(input.organizationId);
  }
}
