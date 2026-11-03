/**
 * Loads the monorepo's single root `.env` before next.config validates it. Node's loader never
 * overrides variables that are already set, so real environment variables (CI, hosting) win and a
 * missing file is a no-op. Do not use `@next/env` here: Next has already loaded its env state by
 * the time the config runs, so a second `loadEnvConfig` call does nothing.
 *
 * Resolved from the working directory: Next runs with cwd = apps/web (its config loader resolves
 * relative imports from there too) and compiles this file to CommonJS, so `import.meta` is
 * unavailable.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const rootEnvPath = path.resolve(process.cwd(), "../../.env");

if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
