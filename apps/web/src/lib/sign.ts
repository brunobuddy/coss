import "server-only";
import { createSignService, type DocumentStore, type SignService } from "@coss/sign";
import { signStoreFromEnv } from "@coss/sign/runtime";
import { env } from "@/env";
import { ActionError } from "@/lib/actions";

let store: DocumentStore | null | undefined;

/** Sign's document store (S3, or the fake one outside production); `null` while Sign is off. */
export function signStore(): DocumentStore | null {
  if (store === undefined) store = signStoreFromEnv(env);
  return store;
}

/** The writes that touch documents' bytes; throws (for actions) while Sign is off. */
export function signService(): SignService {
  const current = signStore();
  if (!current) throw new ActionError("Sign is temporarily unavailable.");
  return createSignService({ store: current });
}

/** Where signing and builder links point (`SIGN_PUBLIC_URL`); unset until the app is deployed. */
export function signUrl(): string {
  if (!env.SIGN_PUBLIC_URL) throw new ActionError("The signing app isn't available yet.");
  return env.SIGN_PUBLIC_URL;
}
