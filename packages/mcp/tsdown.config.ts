import { defineConfig } from "tsdown";

export default defineConfig({
  // `coss-mcp` (the bin, run by `npx`), the library it is built from (`createCossMcpServer`), and
  // the hosted server's handler (`coss-mcp/http`).
  entry: ["src/index.ts", "src/cli.ts", "src/http.ts"],
  format: "esm",
  // Runs on Node (stdio); dependencies stay external and are installed with the package.
  platform: "node",
  target: "node22",
  // `.js`, as `type: module` makes it ESM (tsdown defaults to `.mjs` on Node).
  fixedExtension: false,
  // oxc emits declarations straight from source; it relies on `isolatedDeclarations` (tsconfig).
  dts: { generator: "oxc" },
  publint: true,
  attw: { profile: "esm-only", level: "error" },
  clean: true,
});
