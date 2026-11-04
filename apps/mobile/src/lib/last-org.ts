import * as SecureStore from "expo-secure-store";

const KEY = "coss.last-org";
const ENVIRONMENTS_KEY = "coss.last-environments";

export type EnvironmentChoice = { project: string; env: string };

export function rememberOrganization(slug: string): void {
  void SecureStore.setItemAsync(KEY, slug).catch(() => {});
}

export async function lastOrganization(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY).catch(() => null);
}

async function environments(): Promise<Record<string, EnvironmentChoice>> {
  const stored = await SecureStore.getItemAsync(ENVIRONMENTS_KEY).catch(() => null);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as Record<string, EnvironmentChoice>;
  } catch {
    return {};
  }
}

/** The dashboard's `coss_env.<org>` cookie: the environment used last in an organization. */
export async function lastEnvironment(org: string): Promise<EnvironmentChoice | null> {
  return (await environments())[org] ?? null;
}

export async function rememberEnvironment(org: string, choice: EnvironmentChoice): Promise<void> {
  const next = { ...(await environments()), [org]: choice };
  await SecureStore.setItemAsync(ENVIRONMENTS_KEY, JSON.stringify(next)).catch(() => {});
}

export async function forgetOrganization(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ENVIRONMENTS_KEY).catch(() => {});
}
