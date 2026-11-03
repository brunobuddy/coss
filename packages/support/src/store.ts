/**
 * Where ticket attachments live: an S3 bucket in production, `support_fake_object` rows otherwise.
 * They outlive the received email they came with, so a ticket's attachments are its own copies.
 */
import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { db, schema } from "@coss/db";
import { eq, inArray } from "drizzle-orm";

const { supportFakeObject } = schema;

export interface SupportFileStore {
  readonly name: string;
  put(object: { key: string; contentType: string; content: Uint8Array }): Promise<void>;
  /** The object's bytes, or `null` when it does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  delete(keys: readonly string[]): Promise<void>;
}

/** A ticket's attachments can be on no ticket yet, so keys don't name one. */
export function supportFileKey(): string {
  return `support/${randomUUID()}`;
}

export class FakeSupportFileStore implements SupportFileStore {
  readonly name = "fake";

  async put(object: { key: string; contentType: string; content: Uint8Array }): Promise<void> {
    await db
      .insert(supportFakeObject)
      .values({
        key: object.key,
        contentType: object.contentType,
        content: Buffer.from(object.content),
      })
      .onConflictDoUpdate({
        target: supportFakeObject.key,
        set: { contentType: object.contentType, content: Buffer.from(object.content) },
      });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const [row] = await db
      .select({ content: supportFakeObject.content })
      .from(supportFakeObject)
      .where(eq(supportFakeObject.key, key))
      .limit(1);
    return row ? new Uint8Array(row.content) : null;
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 1000) {
      await db
        .delete(supportFakeObject)
        .where(inArray(supportFakeObject.key, keys.slice(start, start + 1000)));
    }
  }
}

export class S3SupportFileStore implements SupportFileStore {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(input: { region: string; bucket: string }) {
    this.client = new S3Client({ region: input.region });
    this.bucket = input.bucket;
  }

  async put(object: { key: string; contentType: string; content: Uint8Array }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.content,
        ContentType: object.contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 1000) {
      const { Errors = [] } = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.slice(start, start + 1000).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      if (Errors.length > 0) {
        throw new Error(`S3 could not delete ${Errors.length} objects: ${Errors[0]?.Message}`);
      }
    }
  }
}

/** S3 with `SUPPORT_FILES_BUCKET`, else the fake store outside production; else no attachments. */
export function supportStoreFromEnv(env: {
  SUPPORT_FILES_BUCKET?: string;
  AWS_REGION?: string;
}): SupportFileStore | null {
  if (env.SUPPORT_FILES_BUCKET) {
    if (!env.AWS_REGION) throw new Error("SUPPORT_FILES_BUCKET needs AWS_REGION.");
    return new S3SupportFileStore({ region: env.AWS_REGION, bucket: env.SUPPORT_FILES_BUCKET });
  }
  return process.env.NODE_ENV === "production" ? null : new FakeSupportFileStore();
}
