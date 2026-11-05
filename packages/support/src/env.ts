/** Support's environment variables (zod only: safe for t3-env schemas and `infra`). */
import { z } from "zod";

/** Where attachments live (dashboard and worker). */
export const supportStoreEnvShape = {
  /** The S3 bucket of attachments (with `AWS_REGION`). Unset: the fake store outside production. */
  SUPPORT_FILES_BUCKET: z.string().min(3).optional(),
};

/** The worker's mail: all three or none, and without them support mail waits in production. */
export const supportMailEnvShape = {
  /** A live environment of coss.com's own organization: its received mail becomes tickets. */
  SUPPORT_ENVIRONMENT_ID: z.string().min(1).optional(),
  /** The address customers see (`support@coss.com`), on a verified domain of that organization. */
  SUPPORT_FROM_ADDRESS: z.string().min(3).optional(),
  /** The receiving domain of that environment replies go to (`reply.coss.com`). */
  SUPPORT_REPLY_DOMAIN: z.string().min(3).optional(),
};
