# apps/portal — the Hooks portal

The page a coss.com customer's users open (or the customer embeds in an iframe) to manage one Hooks
application's endpoints, pick event types, read the message and delivery log, retry, recover and
send tests — so customers never build that UI. Next.js 16 (:3003 locally), standalone image
(`Dockerfile`), its own ECS service on **its own registrable domain** (`PORTAL_HOST` in
`infra/aws/routing.ts`: `portal.cosshooks.com`, CloudFront → ALB): never serve it under coss.com,
which would make it same-site with the dashboard.

## Auth (no cookies, ever)

- A customer's backend creates a session (`POST /v1/hooks/applications/{application}/portal_sessions`,
  `coss.hooks.portal.createSession`); the dashboard's "Open portal" does the same for a member.
  Only `sha256(token)` is stored (`hook_portal_session`).
- The URL is `/s/<session id>#<token>`. The id is not secret (it only selects the page's
  `frame-ancestors`); the token stays in the fragment, which never reaches a server, and the page
  moves it to `sessionStorage` (this tab) and strips it from the address bar.
- The browser calls `/api/sessions/<id>/…` (`src/lib/portal-api.ts`, one catch-all route) with
  `Authorization: Bearer <token>`. Every failure (unknown id, wrong token, expired, deleted
  application, organization being deleted) is the same 404. Rate limits (`portal.session`,
  `portal.ip`) run before the token check. Read-only sessions and suspended organizations refuse
  mutations (403).
- Never add a cookie, a token in a path or query string, or CORS: there is nothing to forge
  cross-site only as long as all three stay out.

## Headers

`src/proxy.ts` sets every response's headers (`src/lib/security-headers.ts`): a strict CSP with no
third-party origins, `Referrer-Policy: no-referrer`, `no-store`. `frame-ancestors` is `'none'`
except on a live session's page, where it lists the environment's allowed origins
(`hook_portal_settings`, validated by `checkedPortalOrigin`). There is no `X-Frame-Options` (it
can't express an allow-list).

## Everything else

- Reads and writes Hooks data straight through `@coss/hooks`, always scoped to the session's
  application. Mutations are audited with the actor that minted the session and the label
  `Portal · application <uid>` (the dashboard's audit page shows that label).
- Test sends are charged to the customer's Hooks send quota (sandbox or live).
- Tests (`test/`, DB-backed) call `handlePortalRequest` directly.
