import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { reloadForNewDeployment } from "../src/lib/version-skew";

const APP_DIR = path.resolve(import.meta.dir, "../src/app");

describe("error boundaries", () => {
  test("every layout with the shell has one, so a failed page keeps the sidebar", () => {
    for (const dir of ["[orgSlug]", "settings", "admin"]) {
      expect(readFileSync(path.join(APP_DIR, dir, "layout.tsx"), "utf8")).toContain("AppShell");
      expect({ dir, exists: existsSync(path.join(APP_DIR, dir, "error.tsx")) }).toEqual({
        dir,
        exists: true,
      });
    }
  });

  test("every hosted app has one", () => {
    for (const app of ["portal", "sign", "scheduling"]) {
      const file = path.resolve(import.meta.dir, `../../${app}/src/app/error.tsx`);
      expect(readFileSync(file, "utf8")).not.toContain("error.message");
    }
  });
});

describe("reloadForNewDeployment", () => {
  const original = { sessionStorage: globalThis.sessionStorage, window: globalThis.window };
  afterEach(() => {
    Object.assign(globalThis, original);
  });

  function stub() {
    const stored = new Map<string, string>();
    const reload = mock(() => {});
    Object.assign(globalThis, {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
      window: { location: { reload } },
    });
    return reload;
  }

  test("reloads once, then not again right away, so it can't spin", () => {
    const reload = stub();
    expect(reloadForNewDeployment()).toBe(true);
    expect(reloadForNewDeployment()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("still reloads when storage is blocked", () => {
    const reload = stub();
    Object.assign(globalThis, {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(reloadForNewDeployment()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

// Reads and hand-offs to another site: nothing changed here, so there's nothing to confirm.
const NOT_MUTATIONS = new Set([
  "authorizeApp",
  "authorizeCli",
  "simulateContractAction",
  "revealEmailContentAction",
  "addPaymentMethodAction",
  "managePaymentMethodsAction",
  "searchNumbersAction",
  "revealHookEndpointSecretAction",
  "revealLogDrainSecretAction",
  "revealWebhookSecretAction",
  "previewSegmentAction",
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

test("every mutation goes through useActionToast", () => {
  const untoasted = sources(APP_DIR).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/useActionState\(\s*(\w+)/g)]
      .map((match) => match[1] ?? "")
      .filter((action) => !NOT_MUTATIONS.has(action)),
  );
  expect(untoasted).toEqual([]);
});
