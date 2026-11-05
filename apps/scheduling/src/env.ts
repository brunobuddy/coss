import { sentryEnvShape } from "@coss/observability/env";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated when the server starts (src/instrumentation.ts). Images are built once and configured
 * per stage at runtime (SKIP_ENV_VALIDATION at build), so nothing here is inlined.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    // What the browser calls: the pages are clients of the public client API, nothing else.
    API_PUBLIC_URL: z.url(),
    // Errors of this app's server.
    ...sentryEnvShape,
  },
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
