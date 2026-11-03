import { gunzipSync, gzipSync } from "node:zlib";

// Both as sent and URL-encoded, since a secret can sit inside another URL (`next=`, a referrer).
const encoded = (hex) => `%(?:25)?${hex}`;
const SLASH = `(?:/|${encoded("2[Ff]")})`;
const EQUALS = `(?:=|${encoded("3[Dd]")})`;
const AMPERSAND = encoded("26");
const QUESTION = encoded("3[Ff]");
const PATH_END = `(?:(?!${SLASH}|${QUESTION}|${AMPERSAND})[^?&#\\s"])+`;

const SECRET_PATHS = ["t/[ocu]", "t/u/confirm", "f/c", "reset-password", "accept-invitation"].map(
  (prefix) =>
    new RegExp(
      `(${SLASH}${prefix.replaceAll("/", SLASH)}${SLASH})(?!confirm${SLASH})${PATH_END}`,
      "g",
    ),
);

const SECRET_PARAMS = new RegExp(
  `((?:[?&\\s]|${QUESTION}|${AMPERSAND})(?:[A-Za-z_]*[Tt]oken|code|state|session_state|ticket|otp|secret|password)${EQUALS})(?:(?!${AMPERSAND})[^&\\s"])+`,
  "g",
);

export function maskSecrets(text) {
  let masked = text;
  for (const path of SECRET_PATHS) masked = masked.replace(path, "$1[masked]");
  return masked.replace(SECRET_PARAMS, "$1[masked]");
}

export async function handler(event) {
  const { GetObjectCommand, PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({});
  for (const record of event.Records) {
    const Bucket = record.s3.bucket.name;
    const Key = decodeURIComponent(record.s3.object.key.replaceAll("+", " "));
    const object = await s3.send(new GetObjectCommand({ Bucket, Key }));
    // Our own write fires this function again.
    if (object.Metadata?.masked) continue;
    const raw = gunzipSync(await object.Body.transformToByteArray()).toString("latin1");
    await s3.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: gzipSync(Buffer.from(maskSecrets(raw), "latin1")),
        ContentType: "application/gzip",
        Metadata: { masked: "1" },
      }),
    );
  }
}
