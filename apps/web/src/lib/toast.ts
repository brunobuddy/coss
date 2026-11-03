"use client";

import { isAccessRedirect } from "@coss/auth/org-access";
import { toastManager } from "@coss/ui/components/toast";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useActionState } from "react";
import type { ActionResult } from "./action-result";

/** A toast's text; `type` (default `success`): `info`/`warning` for checks that changed nothing yet. */
export type ToastContent = {
  title: string;
  description?: string;
  type?: "success" | "info" | "warning";
};

/**
 * Toasts for the dashboard (`ToastProvider` in `Providers`, bottom right). `toastManager` lives
 * outside React, so a toast shown just before its component unmounts — a dialog closing, a row
 * removed by `refresh()`, a redirect — stays on screen.
 */
export const toast = {
  success: (title: string, description?: string) =>
    toastManager.add({ type: "success", title, description }),
  error: (title: string, description?: string) =>
    toastManager.add({ type: "error", title, description }),
  info: (title: string, description?: string) =>
    toastManager.add({ type: "info", title, description }),
  warning: (title: string, description?: string) =>
    toastManager.add({ type: "warning", title, description }),
};

type Success<T> = string | ToastContent | ((data: T) => string | ToastContent | null | undefined);

type Options<T> = {
  /** Shown when the action succeeds, including when it ends by redirecting within the dashboard. */
  success?: Success<T>;
  /**
   * Where failures go: `inline` (the default) leaves them to the component (`<FormError>`, best
   * inside dialogs and forms, which stay open to fix the input); `toast` for one-click buttons
   * with nowhere to show them.
   */
  errors?: "inline" | "toast";
};

/** A redirect to sign-in, SSO or two-factor setup is a guard refusing the action before any change. */
export function isSuccessRedirect(error: unknown): boolean {
  return isRedirectError(error) && !isAccessRedirect(getURLFromRedirectError(error));
}

/**
 * `useActionState` for a server action that also toasts its outcome. Use it for every mutation
 * a user triggers, so each one is confirmed even when the page changes only subtly.
 */
export function useActionToast<T>(
  action: (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>,
  options: Options<T>,
) {
  return useActionState(async (previous: ActionResult<T> | null, formData: FormData) => {
    let result: ActionResult<T>;
    try {
      result = await action(previous, formData);
    } catch (error) {
      // An action that redirects (e.g. back to a list after deleting) rejects with the redirect.
      if (isSuccessRedirect(error) && typeof options.success !== "function") {
        show(options.success);
      }
      throw error;
    }
    if (result.ok) {
      show(typeof options.success === "function" ? options.success(result.data) : options.success);
    } else if (options.errors === "toast") {
      toast.error(result.error);
    }
    return result;
  }, null);
}

function show(content: string | ToastContent | null | undefined) {
  if (!content) return;
  if (typeof content === "string") toast.success(content);
  else toast[content.type ?? "success"](content.title, content.description);
}
