/**
 * Rewrites `server.json`'s versions from `package.json` after `changeset version` bumps it (run by
 * the root `version-packages` script). `test/hosted.test.ts` keeps them equal.
 */
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (file: string) => JSON.parse(await readFile(new URL(file, root), "utf8"));
const { version } = (await read("package.json")) as { version: string };
const server = (await read("server.json")) as {
  version: string;
  packages: { version: string }[];
};
server.version = version;
for (const entry of server.packages) entry.version = version;
await writeFile(new URL("server.json", root), `${JSON.stringify(server, null, 2)}\n`);
console.log(`coss-mcp: server.json = ${version}`);
