import { getSettingsRow, sessionEnvironment } from "@coss/scheduling";
import { type NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security-headers";

const dev = process.env.NODE_ENV === "development";
const SESSION_PAGE = /^\/[hbmt]\/(schs_[0-9a-z]{26})\/?$/;

function apiOrigin(): string | null {
  try {
    return new URL(process.env.API_PUBLIC_URL ?? "").origin;
  } catch {
    return null;
  }
}

/**
 * Sets every response's security headers. A session's page may be framed by the origins its
 * environment allows; the session id in its path is not a secret (the token is in the fragment,
 * which never reaches a server), so this lookup reveals nothing but who may embed it.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  let frameAncestors: string[] = [];
  const sessionId = SESSION_PAGE.exec(request.nextUrl.pathname)?.[1];
  if (sessionId) {
    const scope = await sessionEnvironment(sessionId).catch(() => null);
    if (scope) {
      const settings = await getSettingsRow(scope).catch(() => null);
      frameAncestors = settings?.allowedOrigins ?? [];
    }
  }
  const headers = securityHeaders({ dev, frameAncestors, apiOrigin: apiOrigin() });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Static assets need no policy of their own.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
