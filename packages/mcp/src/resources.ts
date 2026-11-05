/**
 * What a client can attach without a tool call: the docs' index (no key needed) and, with a key,
 * this project's setup state.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import type { Coss } from "coss";
import { type DocsOptions, docsOrigin } from "./tools/docs.ts";
import { setupReportFor } from "./tools/setup.ts";

export const DOCS_INDEX_URI = "coss://docs/index";
export const SETUP_URI = "coss://setup";

/** The docs' index, `/llms.txt`: the guides, and where each product's API operations are. */
export function registerDocsResources(server: McpServer, options: DocsOptions = {}): void {
  const origin = docsOrigin(options);
  const request = options.fetch ?? fetch;
  server.registerResource(
    "docs_index",
    DOCS_INDEX_URI,
    {
      title: "coss.com docs index",
      description:
        "coss.com's guides, and a link to each product's API operations. read_docs reads a page.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const response = await request(`${origin}/llms.txt`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`coss.com's docs index answered ${response.status}.`);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: await response.text() }],
      };
    },
  );
}

/** `get_setup`'s email-first answer, as something to attach. */
export function registerSetupResource(server: McpServer, coss: Coss, hosted: boolean): void {
  server.registerResource(
    "setup",
    SETUP_URI,
    {
      title: "This project's coss.com setup",
      description:
        "The key's mode, a from address that will succeed, missing DNS records, webhook endpoints, products in use and the next step: get_setup's answer.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await setupReportFor(coss, undefined, hosted), null, 2),
        },
      ],
    }),
  );
}
