/**
 * Seals through a cloud signing service on the Cloud Signature Consortium API (CSC v1: SSL.com's
 * eSigner eSealing, DigiCert Document Trust Manager): the key stays with the CA, which signs the
 * hash we send. One OAuth 2.0 password-grant token (cached until it nearly expires), and per seal
 * `credentials/authorize` (a SAD for exactly that hash) then `signatures/signHash`. Credentials
 * whose `authMode` is `implicit` (an eSeal) need nothing more; `explicit` ones a one-time password,
 * made here from the credential's TOTP secret.
 */
import { createHmac, createPublicKey, verify } from "node:crypto";
import { withoutTrailingSlashes } from "@coss/db/url";
import { parseCertificate, sha256, signatureAlgorithmFor } from "./crypto.ts";
import type { Sealer } from "./sealer.ts";

export type CscOptions = {
  /** The API's root including its version, e.g. `https://cs.ssl.com/csc/v1`. */
  url: string;
  /** The OAuth 2.0 token endpoint, e.g. `https://login.ssl.com/oauth2/token`. */
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  username: string;
  password: string;
  credentialId: string;
  /** Base64 TOTP secret (HMAC-SHA1, 6 digits, 30 s), for credentials with `authMode: explicit`. */
  totpSecret?: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

const SHA256 = "2.16.840.1.101.3.4.2.1";
const SIGN_ALGORITHMS = { rsa: "1.2.840.113549.1.1.11", ecdsa: "1.2.840.10045.4.3.2" } as const;
/** Tokens are renewed this long before they expire. */
const TOKEN_MARGIN_MS = 5 * 60_000;
/** The credential is read again this often, so a certificate the CA renewed is picked up. */
const CREDENTIAL_TTL_MS = 60 * 60_000;

/** An RFC 6238 one-time password: HMAC-SHA1 over the 30-second counter, 6 digits. */
export function totp(secretBase64: string, at: Date): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30_000)));
  const mac = createHmac("sha1", Buffer.from(secretBase64, "base64")).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export class CscError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type CredentialInfo = {
  key?: { status?: string };
  cert?: { status?: string; certificates?: string[] };
  authMode?: string;
};

type Credential = {
  loadedAt: number;
  notAfter: number;
  chain: Uint8Array[];
  signAlgorithm: string;
  needsOtp: boolean;
};

export class CscSealer implements Sealer {
  readonly name = "csc";
  private token: { value: string; expiresAt: number } | null = null;
  private credential: Credential | null = null;
  private loading: Promise<Credential> | null = null;

  constructor(private readonly opts: CscOptions) {}

  get certificateChain(): readonly Uint8Array[] {
    if (!this.credential) throw new Error("The CSC sealer isn't prepared.");
    return this.credential.chain;
  }

  /**
   * Reads the credential (its certificate chain, key and authorization mode) before the first
   * seal, not at start (the worker must start even when the CA doesn't answer), and again every
   * hour or once its certificate has expired.
   */
  async prepare(): Promise<void> {
    const now = this.now().getTime();
    if (
      this.credential &&
      now - this.credential.loadedAt < CREDENTIAL_TTL_MS &&
      now < this.credential.notAfter
    ) {
      return;
    }
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    this.credential = await this.loading;
  }

  private async load(): Promise<Credential> {
    const info = await this.call<CredentialInfo>("credentials/info", {
      credentialID: this.opts.credentialId,
      certificates: "chain",
      certInfo: true,
      authInfo: true,
    });
    if (info.key?.status && info.key.status !== "enabled") {
      throw new Error(`The CSC credential's key is ${info.key.status}.`);
    }
    if (info.cert?.status && info.cert.status !== "valid") {
      throw new Error(`The CSC credential's certificate is ${info.cert.status}.`);
    }
    // Leaf first; the self-signed root left out, like SIGN_SEAL_CERTIFICATE_CHAIN.
    const chain = (info.cert?.certificates ?? [])
      .map((base64) => new Uint8Array(Buffer.from(base64, "base64")))
      .filter((der, index) => {
        const certificate = parseCertificate(der);
        return index === 0 || !certificate.subject.isEqual(certificate.issuer);
      });
    const [leaf] = chain;
    if (!leaf) throw new Error("The CSC credential has no certificate.");
    const mode = info.authMode ?? "implicit";
    if (mode !== "implicit" && mode !== "explicit") {
      throw new Error(`CSC credentials with authMode ${mode} aren't supported.`);
    }
    if (mode === "explicit" && !this.opts.totpSecret) {
      throw new Error("The CSC credential needs a one-time password: set its TOTP secret.");
    }
    return {
      loadedAt: this.now().getTime(),
      notAfter: parseCertificate(leaf).notAfter.value.getTime(),
      chain,
      signAlgorithm: SIGN_ALGORITHMS[signatureAlgorithmFor(parseCertificate(leaf))],
      needsOtp: mode === "explicit",
    };
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    // The credential the caller read the chain from: never refreshed mid-seal (`prepare` does that
    // before a seal starts).
    if (!this.credential) await this.prepare();
    const credential = this.credential as Credential;
    const hash = Buffer.from(await sha256(data)).toString("base64");
    const { SAD } = await this.call<{ SAD?: string }>("credentials/authorize", {
      credentialID: this.opts.credentialId,
      numSignatures: 1,
      hash: [hash],
      ...(credential.needsOtp && this.opts.totpSecret
        ? { OTP: totp(this.opts.totpSecret, this.now()) }
        : {}),
    });
    if (!SAD) throw new Error("The CSC service authorized nothing.");
    const { signatures } = await this.call<{ signatures?: string[] }>("signatures/signHash", {
      credentialID: this.opts.credentialId,
      SAD,
      hash: [hash],
      hashAlgo: SHA256,
      signAlgo: credential.signAlgorithm,
    });
    const [signature] = signatures ?? [];
    if (!signature) throw new Error("The CSC service returned no signature.");
    const bytes = new Uint8Array(Buffer.from(signature, "base64"));
    // A signature that doesn't verify against our certificate would make a seal nobody can check
    // (the CA renewed the certificate, say): refused, and the credential read again next time.
    const publicKey = createPublicKey({
      key: Buffer.from(
        parseCertificate(credential.chain[0] as Uint8Array)
          .subjectPublicKeyInfo.toSchema()
          .toBER(false),
      ),
      format: "der",
      type: "spki",
    });
    if (!verify("sha256", data, publicKey, bytes)) {
      this.credential = null;
      throw new Error("The CSC service's signature doesn't match the seal's certificate.");
    }
    return bytes;
  }

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > this.now().getTime()) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: this.opts.clientId,
      username: this.opts.username,
      password: this.opts.password,
      ...(this.opts.clientSecret ? { client_secret: this.opts.clientSecret } : {}),
    });
    const response = await (this.opts.fetch ?? fetch)(this.opts.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const answer = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !answer.access_token) {
      throw new CscError(
        `The CSC token endpoint answered ${response.status}${answer.error ? ` (${answer.error})` : ""}.`,
        response.status,
      );
    }
    this.token = {
      value: answer.access_token,
      expiresAt: this.now().getTime() + (answer.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  /** POSTs to `<url>/<method>`; a rejected token is renewed once (SSL.com answers 400, not 401). */
  private async call<T>(method: string, body: object, retried = false): Promise<T> {
    const response = await (this.opts.fetch ?? fetch)(
      `${withoutTrailingSlashes(this.opts.url)}/${method}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const answer = (await response.json().catch(() => ({}))) as T & {
      error?: string;
      error_description?: string;
    };
    if (response.ok) return answer;
    const tokenRejected =
      response.status === 401 ||
      answer.error === "invalid_token" ||
      (answer.error === "invalid_request" && /token/i.test(answer.error_description ?? ""));
    if (tokenRejected && !retried) {
      this.token = null;
      return this.call(method, body, true);
    }
    throw new CscError(
      `CSC ${method} answered ${response.status}${answer.error ? ` (${answer.error}${answer.error_description ? `: ${answer.error_description}` : ""})` : ""}.`,
      response.status,
    );
  }
}
