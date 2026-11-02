/**
 * Environment variables of content screening, for the worker's t3-env schema. Imports only zod.
 */
import { z } from "zod";

/** Values of `SCREENING_CLASSIFIER`. `off` screens nothing; `fake` is for development. */
export const SCREENING_CLASSIFIERS = ["off", "fake", "ai"] as const;
export type ScreeningClassifierName = (typeof SCREENING_CLASSIFIERS)[number];

/** A Vercel AI Gateway decision model; any other decision model on the Gateway works too. */
export const DEFAULT_SCREENING_MODEL = "typesafe-ai/jev";
/** The unversioned Jev alias is text-only; this version advertises image input and ZDR. */
export const DEFAULT_SCREENING_IMAGE_MODEL = "typesafe-ai/jev-1.14.0";

export const screeningEnvShape = {
  SCREENING_CLASSIFIER: z.enum(SCREENING_CLASSIFIERS).default("off"),
  SCREENING_MODEL: z.string().min(1).default(DEFAULT_SCREENING_MODEL),
  // Required with SCREENING_CLASSIFIER=ai.
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
};

export type ScreeningEnv = {
  SCREENING_CLASSIFIER: ScreeningClassifierName;
  SCREENING_MODEL: string;
  AI_GATEWAY_API_KEY?: string | undefined;
};
