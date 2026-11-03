import { scrubUrl } from "@coss/observability/scrub";
import { logger } from "hono/logger";

// URLs carry OAuth codes and capability tokens, and stdout goes to CloudWatch.
export const accessLogWith = (print: (line: string) => void) =>
  logger((line) => print(scrubUrl(line)));

export const accessLog = accessLogWith(console.log);
