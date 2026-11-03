/**
 * The port that serves custom tracking hostnames (e.g. `links.acme.com`) over HTTPS: CloudFront
 * distribution tenants in production (each with its own managed certificate), an in-memory fake in
 * development and tests.
 */

export type TrackingHostnameProviderName = "fake" | "cloudfront";

/** What the provider says about one hostname. */
export type TrackingHostnameState = {
  /**
   * `active`: served with a valid certificate; `pending`: waiting for the CNAME or the
   * certificate; `failed`: the provider gave up (blocked hostname, validation timed out).
   */
  status: "active" | "pending" | "failed";
  /** A customer-facing explanation of what is wrong, if the provider gave one. */
  message: string | null;
};

/** The hostname is already registered with the provider, by someone else. Never adopted. */
export class TrackingHostnameTakenError extends Error {
  constructor(hostname: string) {
    super(`${hostname} is already registered with the tracking provider.`);
    this.name = "TrackingHostnameTakenError";
  }
}

export interface TrackingHostnameProvider {
  readonly name: TrackingHostnameProviderName;
  /** The host customers point their tracking CNAME at (in production, a connection group's routing endpoint). */
  readonly cnameTarget: string;
  /** Registers the hostname; throws `TrackingHostnameTakenError` when it already exists. */
  create(hostname: string): Promise<{ id: string; state: TrackingHostnameState }>;
  /** The hostname's state, or `null` when the provider no longer knows it. */
  get(id: string): Promise<TrackingHostnameState | null>;
  /** Removes the hostname; removing an unknown one succeeds. */
  delete(id: string): Promise<void>;
}
