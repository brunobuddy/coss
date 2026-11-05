import { TOOLSET_NAMES, type Toolset } from "./server.ts";

/**
 * `COSS_MCP_TOOLSETS`, read: unset, empty or only whitespace means no choice was made, so every
 * tool (a Claude Code plugin's unset option arrives as an empty string). Names it doesn't know are
 * reported and left out.
 */
export function parseToolsets(value: string | undefined): {
  toolsets?: Toolset[];
  unknown: string[];
} {
  const asked = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (asked.length === 0) return { unknown: [] };
  const known = (name: string): name is Toolset => TOOLSET_NAMES.includes(name as Toolset);
  return { toolsets: asked.filter(known), unknown: asked.filter((name) => !known(name)) };
}
