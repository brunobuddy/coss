import { randomUUID } from "node:crypto";
import type { TrackingHostnameProvider, TrackingHostnameState } from "../tracking-hostnames.ts";

/**
 * In-memory tracking hostnames that are active immediately, for local development and tests.
 * Nothing serves them: links on a fake tracking domain only resolve if you point it at the API.
 */
export class FakeTrackingHostnameProvider implements TrackingHostnameProvider {
  readonly name = "fake";
  readonly cnameTarget: string;
  readonly #hostnames = new Map<string, string>();
  readonly #claims = new Map<string, string>();
  readonly #state: (hostname: string) => TrackingHostnameState;

  /** `state` decides what a hostname reports (default: always active). */
  constructor(
    opts: { cnameTarget?: string; state?: (hostname: string) => TrackingHostnameState } = {},
  ) {
    this.cnameTarget = opts.cnameTarget ?? "track.coss.test";
    this.#state = opts.state ?? (() => ({ status: "active", message: null }));
  }

  /** The hostnames this instance has registered (tests). */
  get hostnames(): string[] {
    return [...this.#hostnames.values()];
  }

  async create(
    hostname: string,
    claim: string,
  ): Promise<{ id: string; state: TrackingHostnameState }> {
    const id = this.#claims.get(claim) ?? randomUUID();
    this.#claims.set(claim, id);
    this.#hostnames.set(id, hostname);
    return { id, state: this.#state(hostname) };
  }

  async get(id: string): Promise<TrackingHostnameState | null> {
    // Hostnames created by another process (e.g. the dashboard) are unknown here: treat them as
    // existing, since a fake hostname has nothing to lose.
    return this.#state(this.#hostnames.get(id) ?? "");
  }

  async delete(id: string): Promise<void> {
    this.#hostnames.delete(id);
  }

  async release(_hostname: string, claim: string): Promise<void> {
    const id = this.#claims.get(claim);
    if (id) this.#hostnames.delete(id);
    this.#claims.delete(claim);
  }
}
