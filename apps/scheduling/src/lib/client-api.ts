"use client";

import { useCallback, useRef } from "react";

export type ApiFailure = { code: string; message: string };

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiFailure,
  ) {
    super(detail.message);
  }
}

/** The session token: from the URL fragment the first time, then from this tab's storage. */
function readToken(sessionId: string): string | null {
  const key = `coss-scheduling:${sessionId}`;
  const fromHash = window.location.hash.slice(1);
  if (fromHash.startsWith("cossch_")) {
    try {
      sessionStorage.setItem(key, fromHash);
    } catch {
      // Storage blocked (a third-party iframe in some browsers): the fragment stays the source.
      return fromHash;
    }
    // Out of the address bar, history and anything that reads `location`.
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export type ClientCall = <T>(
  path: string,
  init?: { method?: string; body?: unknown; idempotencyKey?: string },
) => Promise<T>;

/** Calls the client API with this page's session. The token never goes in a URL or a cookie. */
export function useClientApi(sessionId: string, apiUrl: string): ClientCall {
  const token = useRef<string | null>(null);
  return useCallback(
    async <T>(
      path: string,
      init?: { method?: string; body?: unknown; idempotencyKey?: string },
    ) => {
      if (token.current === null) token.current = readToken(sessionId);
      const response = await fetch(`${apiUrl}/scheduling/client${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token.current ?? ""}`,
          ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(init?.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (response.status === 204) return undefined as T;
      const json = (await response.json().catch(() => null)) as (T & { error?: ApiFailure }) | null;
      if (!response.ok) {
        const detail = json?.error ?? {
          code: "unknown",
          message: "Something went wrong. Please try again.",
        };
        throw new ClientApiError(response.status, detail);
      }
      return json as T;
    },
    [sessionId, apiUrl],
  );
}

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};
