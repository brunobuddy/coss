import { createEmailService, DEVELOPMENT_LINK_KEYS, FakeEmailProvider } from "@coss/email";
import { createRiskDeps } from "@coss/risk/runtime";
import { createSmsService, FakeSmsProvider } from "@coss/sms";
import { secretsKeyRing } from "@coss/webhooks";
import { createApp, renderOpenApiDocument } from "./app.ts";

/** The production origin, also the SDK's default `baseUrl`. */
export const PUBLIC_API_URL = "https://api.coss.com";

/** Committed copy of the OpenAPI document, read by the docs site (`apps/site`). */
export const OPENAPI_SNAPSHOT_PATH = new URL("../openapi.json", import.meta.url);

/**
 * The OpenAPI document as served in production, serialized for `openapi.json`. Building it never
 * touches the database: routes are only registered, not run.
 */
export function renderOpenApiSnapshot(): string {
  // A placeholder key: no route runs, so nothing is ever encrypted with it.
  const app = createApp({
    emailService: createEmailService({
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: {
        async enqueue() {
          throw new Error("OpenAPI generation cannot enqueue emails");
        },
      },
    }),
    smsService: createSmsService({
      liveProvider: new FakeSmsProvider({ log: false }),
      sandboxProvider: new FakeSmsProvider({ log: false }),
      queue: {
        async enqueue() {
          throw new Error("OpenAPI generation cannot enqueue SMS");
        },
      },
    }),
    webhookDeps: { secretsKeys: secretsKeyRing([Buffer.alloc(32)]), allowInsecureUrls: false },
    links: { keys: DEVELOPMENT_LINK_KEYS },
    scheduling: {
      dataKeys: secretsKeyRing([Buffer.alloc(32)]),
      lookupKey: Buffer.alloc(32),
    },
    // The development hash key and in-memory counters: no route runs.
    riskDeps: createRiskDeps(
      {},
      { valkey: null, secretsKeys: secretsKeyRing([Buffer.alloc(32)]), production: false },
    ),
  });
  const document = renderOpenApiDocument(app, PUBLIC_API_URL);
  return `${JSON.stringify(document, null, 2)}\n`;
}
