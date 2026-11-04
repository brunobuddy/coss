import { fetchSetupReport, SETUP_PRODUCTS } from "coss";
import { z } from "zod";
import { ok } from "../result.ts";
import { SETUP_OUTPUT } from "./output-schemas.ts";
import { READ_ONLY, type ToolContext } from "./shared.ts";

export function registerSetupTools(ctx: ToolContext): void {
  const { server, coss } = ctx;

  server.registerTool(
    "get_setup",
    {
      title: "Get setup status",
      description:
        "Where this project stands: the key's mode, a from address that will succeed, DNS records " +
        "still missing on domains that cannot send, webhook endpoints, `products` (each one's " +
        "readiness) and one `next` string — the single thing to do now. Call it before writing " +
        "send code. Pass `product` for that product's step: what it still needs (an approved " +
        "number for SMS and Verify, a host, schedule and event type for Scheduling…) or, with a " +
        "sandbox key, how to try it from its testing page. Without `product` it answers for email " +
        "and lists `products_in_use`. A sandbox key accepts any from address; a live key needs a " +
        "domain with `can_send`. A read that fails comes back as `warning` and does not drop `next`.",
      inputSchema: z.object({
        product: z
          .enum(SETUP_PRODUCTS)
          .optional()
          .describe("The product you're about to work on. Default: email."),
      }),
      outputSchema: SETUP_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ product }) => ok(await fetchSetupReport(coss, product ? { product } : {})),
  );
}
