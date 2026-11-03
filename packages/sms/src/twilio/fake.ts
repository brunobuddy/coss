/**
 * A stand-in for Twilio (`SMS_PROVIDER=fake`, tests). Stateless where it matters: the dashboard and
 * the worker each have their own instance, so what one creates the other must be able to look up.
 * Every review passes, except a business whose legal name contains `[reject]` (its resources' ids
 * say so); tests can hold reviews pending with `hold` and decide them with `decide`.
 */
import { randomBytes, randomInt } from "node:crypto";
import type { SmsBusinessProfile } from "@coss/db/schema";
import type { AvailableNumber, ReviewStatus, TwilioApi, TwilioMessage } from "./api.ts";
import type { TwilioCredentials } from "./client.ts";

const REJECTED = "rejected";

function sid(prefix: string, rejected = false): string {
  return `${prefix}fake${rejected ? REJECTED : ""}${randomBytes(12).toString("hex")}`;
}

function rejects(profile: SmsBusinessProfile): boolean {
  return profile.legalName.includes("[reject]");
}

export class FakeTwilioApi implements TwilioApi {
  /** Every call, in order (method name and arguments), for tests. */
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly #held = new Map<string, ReviewStatus>();
  #holdNext = false;

  /** Reviews created from now on stay pending until `decide`d. */
  hold(): void {
    this.#holdNext = true;
  }

  decide(resourceSid: string, status: ReviewStatus): void {
    this.#held.set(resourceSid, status);
  }

  /** What was created, for the lookups (which aren't recorded in `calls`). */
  readonly #existing = new Map<string, unknown>();

  #record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  #created(prefix: string, rejected: boolean): { sid: string } {
    const created = sid(prefix, rejected);
    if (this.#holdNext) this.#held.set(created, { status: "pending", reason: null });
    return { sid: created };
  }

  #status(resourceSid: string): ReviewStatus {
    const held = this.#held.get(resourceSid);
    if (held) return held;
    return resourceSid.includes(REJECTED)
      ? { status: "rejected", reason: "Simulated rejection: the business details didn't match." }
      : { status: "approved", reason: null };
  }

  async sendMessage(input: Parameters<TwilioApi["sendMessage"]>[0]): Promise<TwilioMessage> {
    this.#record("sendMessage", [input]);
    return { sid: sid("SM"), status: "queued", errorCode: null };
  }

  async fetchMessage(accountSid: string, messageSid: string): Promise<TwilioMessage> {
    this.#record("fetchMessage", [accountSid, messageSid]);
    return { sid: messageSid, status: "delivered", errorCode: null };
  }

  async createSubaccount(friendlyName: string): Promise<TwilioCredentials> {
    this.#record("createSubaccount", [friendlyName]);
    const created = { accountSid: sid("AC"), authToken: randomBytes(16).toString("hex") };
    this.#existing.set(`subaccount:${friendlyName}`, created);
    return created;
  }

  async findSubaccount(friendlyName: string): Promise<TwilioCredentials | null> {
    return (this.#existing.get(`subaccount:${friendlyName}`) as TwilioCredentials) ?? null;
  }

  async findMessagingService(account: TwilioCredentials, friendlyName: string) {
    return (this.#existing.get(`service:${account.accountSid}:${friendlyName}`) as string) ?? null;
  }

  async findBrand(account: TwilioCredentials, customerProfileSid: string) {
    return (
      (this.#existing.get(`brand:${account.accountSid}:${customerProfileSid}`) as string) ?? null
    );
  }

  async findCampaign(account: TwilioCredentials, serviceSid: string) {
    return (this.#existing.get(`campaign:${account.accountSid}:${serviceSid}`) as string) ?? null;
  }

  async closeSubaccount(accountSid: string): Promise<void> {
    this.#record("closeSubaccount", [accountSid]);
  }

  async searchNumbers(
    account: TwilioCredentials,
    input: Parameters<TwilioApi["searchNumbers"]>[1],
  ): Promise<AvailableNumber[]> {
    this.#record("searchNumbers", [account.accountSid, input]);
    const area = input.kind === "toll_free" ? "833" : (input.areaCode ?? "415");
    return Array.from({ length: input.limit }, () => {
      const exchange = randomInt(200, 1000);
      const line = String(randomInt(10_000)).padStart(4, "0");
      return {
        phoneNumber: `+1${area}${exchange}${line}`,
        locality: input.kind === "toll_free" ? null : "San Francisco",
        region: input.kind === "toll_free" ? null : "CA",
      };
    });
  }

  async buyNumber(account: TwilioCredentials, input: { phoneNumber: string }) {
    this.#record("buyNumber", [account.accountSid, input]);
    const bought = { sid: sid("PN"), phoneNumber: input.phoneNumber };
    this.#existing.set(`number:${account.accountSid}:${input.phoneNumber}`, bought);
    return bought;
  }

  async findNumber(account: TwilioCredentials, phoneNumber: string) {
    return (
      (this.#existing.get(`number:${account.accountSid}:${phoneNumber}`) as {
        sid: string;
        phoneNumber: string;
      }) ?? null
    );
  }

  async findTollFreeVerification(account: TwilioCredentials, numberSid: string) {
    return (
      (this.#existing.get(`verification:${account.accountSid}:${numberSid}`) as string) ?? null
    );
  }

  async releaseNumber(account: TwilioCredentials, numberSid: string): Promise<void> {
    this.#record("releaseNumber", [account.accountSid, numberSid]);
    for (const [key, value] of this.#existing) {
      if ((value as { sid?: string }).sid === numberSid) this.#existing.delete(key);
    }
  }

  async createMessagingService(
    account: TwilioCredentials,
    input: Parameters<TwilioApi["createMessagingService"]>[1],
  ) {
    this.#record("createMessagingService", [account.accountSid, input]);
    const created = { sid: sid("MG") };
    this.#existing.set(`service:${account.accountSid}:${input.friendlyName}`, created.sid);
    return created;
  }

  async addNumberToService(account: TwilioCredentials, serviceSid: string, numberSid: string) {
    this.#record("addNumberToService", [account.accountSid, serviceSid, numberSid]);
  }

  async deleteMessagingService(account: TwilioCredentials, serviceSid: string) {
    this.#record("deleteMessagingService", [account.accountSid, serviceSid]);
  }

  async createCustomerProfile(account: TwilioCredentials, profile: SmsBusinessProfile) {
    this.#record("createCustomerProfile", [account.accountSid, profile]);
    return this.#created("BU", rejects(profile));
  }

  async customerProfileStatus(_account: TwilioCredentials, resourceSid: string) {
    return this.#status(resourceSid);
  }

  async createTrustProduct(
    account: TwilioCredentials,
    input: Parameters<TwilioApi["createTrustProduct"]>[1],
  ) {
    this.#record("createTrustProduct", [account.accountSid, input]);
    return this.#created("BU", rejects(input.profile));
  }

  async trustProductStatus(_account: TwilioCredentials, resourceSid: string) {
    return this.#status(resourceSid);
  }

  async createBrand(account: TwilioCredentials, input: Parameters<TwilioApi["createBrand"]>[1]) {
    this.#record("createBrand", [account.accountSid, input]);
    const created = this.#created("BN", input.trustProductSid.includes(REJECTED));
    this.#existing.set(`brand:${account.accountSid}:${input.customerProfileSid}`, created.sid);
    return created;
  }

  async brandStatus(_account: TwilioCredentials, resourceSid: string) {
    return this.#status(resourceSid);
  }

  async createCampaign(
    account: TwilioCredentials,
    input: Parameters<TwilioApi["createCampaign"]>[1],
  ) {
    this.#record("createCampaign", [account.accountSid, input]);
    const created = this.#created("QE", input.brandSid.includes(REJECTED));
    this.#existing.set(`campaign:${account.accountSid}:${input.serviceSid}`, created.sid);
    return created;
  }

  async campaignStatus(
    _account: TwilioCredentials,
    input: { serviceSid: string; campaignSid: string },
  ) {
    return this.#status(input.campaignSid);
  }

  async createTollFreeVerification(
    account: TwilioCredentials,
    input: Parameters<TwilioApi["createTollFreeVerification"]>[1],
  ) {
    this.#record("createTollFreeVerification", [account.accountSid, input]);
    const created = this.#created("HH", rejects(input.profile));
    this.#existing.set(`verification:${account.accountSid}:${input.numberSid}`, created.sid);
    return created;
  }

  async tollFreeVerificationStatus(_account: TwilioCredentials, resourceSid: string) {
    return this.#status(resourceSid);
  }

  async resubmitTollFreeVerification(
    account: TwilioCredentials,
    resourceSid: string,
    input: Parameters<TwilioApi["resubmitTollFreeVerification"]>[2],
  ) {
    this.#record("resubmitTollFreeVerification", [account.accountSid, resourceSid, input]);
    this.#held.set(
      resourceSid,
      rejects(input.profile)
        ? { status: "rejected", reason: "Simulated rejection: the business details didn't match." }
        : { status: "approved", reason: null },
    );
  }
}
