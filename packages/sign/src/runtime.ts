import { S3DocumentStore, signS3Api } from "./s3-store.ts";
/**
 * Completion's sealer and TSA from the environment (`signSealEnvShape`): `null` when this
 * deployment can't seal yet (production without a certificate), and the worker's completion loop
 * doesn't run.
 */
import { certificatesFromPem } from "./seal/crypto.ts";
import { CscSealer } from "./seal/csc.ts";
import { KmsSealer, LocalSealer, type Sealer } from "./seal/sealer.ts";
import { HttpTsa, type TimestampAuthority } from "./seal/tsa.ts";
import { type DocumentStore, FakeDocumentStore } from "./store.ts";

/** `signSealEnvShape`, parsed. */
type SignSealEnv = {
  SIGN_SEALER?: "kms" | "csc" | "local";
  SIGN_SEAL_KMS_KEY_ID?: string;
  SIGN_SEAL_CERTIFICATE_CHAIN?: string;
  SIGN_CSC_URL?: string;
  SIGN_CSC_TOKEN_URL?: string;
  SIGN_CSC_CLIENT_ID?: string;
  SIGN_CSC_CLIENT_SECRET?: string;
  SIGN_CSC_USERNAME?: string;
  SIGN_CSC_PASSWORD?: string;
  SIGN_CSC_CREDENTIAL_ID?: string;
  SIGN_CSC_TOTP_SECRET?: string;
  SIGN_TSA_URL?: string;
};

/**
 * What seals completed requests: live ones with `sealer`, sandbox ones with `sandboxSealer`, a
 * self-signed test seal (no viewer trusts it), so tests never spend a CA's signings.
 */
export async function sealerFromEnv(
  env: SignSealEnv,
): Promise<{ sealer: Sealer; sandboxSealer: Sealer; tsa: TimestampAuthority | null } | null> {
  const tsa = env.SIGN_TSA_URL ? new HttpTsa(env.SIGN_TSA_URL) : null;
  if (env.SIGN_SEALER === "local") {
    const sealer = await LocalSealer.create();
    return { sealer, sandboxSealer: sealer, tsa };
  }
  if (!env.SIGN_SEALER) return null;
  const sandboxSealer = await LocalSealer.create("coss.com Sign (sandbox test seal)");
  if (env.SIGN_SEALER === "kms") {
    if (!env.SIGN_SEAL_KMS_KEY_ID || !env.SIGN_SEAL_CERTIFICATE_CHAIN) {
      throw new Error(
        "SIGN_SEALER=kms needs SIGN_SEAL_KMS_KEY_ID and SIGN_SEAL_CERTIFICATE_CHAIN.",
      );
    }
    return {
      sealer: new KmsSealer({
        keyId: env.SIGN_SEAL_KMS_KEY_ID,
        certificateChain: certificatesFromPem(env.SIGN_SEAL_CERTIFICATE_CHAIN),
      }),
      sandboxSealer,
      tsa,
    };
  }
  if (env.SIGN_SEALER === "csc") {
    const {
      SIGN_CSC_URL: url,
      SIGN_CSC_TOKEN_URL: tokenUrl,
      SIGN_CSC_CLIENT_ID: clientId,
      SIGN_CSC_USERNAME: username,
      SIGN_CSC_PASSWORD: password,
      SIGN_CSC_CREDENTIAL_ID: credentialId,
    } = env;
    if (!url || !tokenUrl || !clientId || !username || !password || !credentialId) {
      throw new Error(
        "SIGN_SEALER=csc needs SIGN_CSC_URL, SIGN_CSC_TOKEN_URL, SIGN_CSC_CLIENT_ID, SIGN_CSC_USERNAME, SIGN_CSC_PASSWORD and SIGN_CSC_CREDENTIAL_ID.",
      );
    }
    return {
      // The credential is read before the first seal, not here: the worker starts regardless.
      sealer: new CscSealer({
        url,
        tokenUrl,
        clientId,
        clientSecret: env.SIGN_CSC_CLIENT_SECRET,
        username,
        password,
        credentialId,
        totpSecret: env.SIGN_CSC_TOTP_SECRET,
      }),
      sandboxSealer,
      tsa,
    };
  }
  return null;
}

/**
 * The document store: S3 with `SIGN_DOCUMENTS_BUCKET`, else the fake store outside production;
 * `null` in production without a bucket (Sign stays off there).
 */
export function signStoreFromEnv(env: {
  SIGN_DOCUMENTS_BUCKET?: string;
  AWS_REGION?: string;
}): DocumentStore | null {
  if (env.SIGN_DOCUMENTS_BUCKET) {
    if (!env.AWS_REGION) throw new Error("SIGN_DOCUMENTS_BUCKET needs AWS_REGION.");
    return new S3DocumentStore(
      signS3Api({ region: env.AWS_REGION, bucket: env.SIGN_DOCUMENTS_BUCKET }),
    );
  }
  return process.env.NODE_ENV === "production" ? null : new FakeDocumentStore();
}
