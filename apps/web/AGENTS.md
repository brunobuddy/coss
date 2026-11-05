# apps/web — the dashboard

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from this
directory unless they name a workspace.

- Pages use the generated `PageProps<"/…">`/`LayoutProps` globals and `await params`. Call `requireOrgMember(orgSlug)`
  (`src/lib/session.ts`; non-members get a 404) and gate controls with its `can(…)` (the role check, read-only while
  the org is suspended). Read data straight
  from `@coss/tenancy` / `@coss/email` (the dashboard never calls the public API). Server code uses `auth` from
  `@/lib/auth`; client code uses `authClient` from `@/lib/auth-client`.
- Layout follows coss.com's docs (`apps/site/DESIGN.md`: grayscale, Cal Sans/Paper Mono, hue only for status):
  `AppShell` (`src/components/shell/`) is the sidebar + framed page with breadcrumbs and ⌘K, used by the
  `[orgSlug]`, `/settings` and `/admin` layouts. An organization's sidebar (`ConsoleSidebar`) is a rail of the
  member's products (what any environment of the project uses, `productActivityByEnvironment` and
  `productUseInProject`, labelled "In use in Production" where only another one does, plus what they pinned,
  `product_preference`; `visibleProducts`) beside a panel with the current product's pages; the header starts with
  the project/environment switcher. `@coss/dashboard-routes` is the one list of products and their pages (the
  rail, panel, breadcrumbs, ⌘K, All products, emails' links; the CLI's `coss open` mirrors it) — add a page there;
  `src/lib/navigation.ts` adds icons and keeps the account and admin lists. Its items carry icon components, so
  server components pass an area name (`SubNav nav=…`, `AreaSidebar area=…`), never the lists. Pages compose `PageHeader`, `Panel`
  (`<Table variant="card">` or `PanelBody` inside), `EmptyState`, `SpecList`, `StatRow`, `StatusDot`; no back
  links (breadcrumbs). `data-page-width="full"` on a page lifts the shell's `max-w-6xl`.
- Mutations live in a colocated `actions.ts` (`"use server"`): `(prev: ActionResult<T> | null, formData) => runAction(…)`
  (`src/lib/actions.ts`). Start with `requireOrgPermission(formString(formData, "orgSlug"), {…})`, re-check that target
  ids belong to that org (`getKeyBinding`, `getOrganizationMember`, `getPendingInvitation`, `getDomain`,
  `getWebhookEndpoint` + its `environmentId`), `refresh()` after writes.
  Throw `ActionError` for user-facing messages. Clients use `useActionToast(action, { success })` (`src/lib/toast.ts`,
  `useActionState` that toasts) + `<FormError>`: every user-triggered mutation toasts its success (short, past
  tense, no period; redirecting actions too, with a static message), failures stay inline in forms and dialogs
  (`errors: "toast"` for one-click buttons); `toast.*` for client-side calls (`authClient`). Pure reads don't toast.
  Hidden inputs carry slugs/ids only.
- coss ui is **Base UI, not Radix**: compose with `render` (`<DialogTrigger render={<Button />}>`), never `asChild`.
  A `<form>` inside `DialogPopup`/`AlertDialogPopup` needs `className="contents"` (otherwise the footer renders outside the
  popup). Popups unmount on close. Add components with `bunx shadcn@latest add @coss/<name>` from `packages/ui`;
  dashboard-specific compositions go in `apps/web/src/components`.
- URLs are product-first: environment pages at `/<org>/<project>/<env>/<product>/…` (Home at the environment
  itself, the catalog at `/products`, Developers at `/developers/…`), organization pages at `/<org>/settings/…`.
  Pages of the organization's own data that belong to a product (domains, dedicated IPs, reputation, SMS numbers)
  live in that product, in any environment. `/<org>` opens the environment last used (cookie `coss_env.<org>`),
  and `/<org>?to=/email/domains` a page in it: links made without an environment (emails) use `orgLinkHref`.
- Routes: a new top-level segment must be added to `RESERVED_ORG_SLUGS` (`packages/auth/src/slugs.ts`), a new static
  segment under `[orgSlug]` to `RESERVED_PROJECT_SLUGS` (`@coss/dashboard-routes`; projects share that level), a
  new page below an environment to its product in `@coss/dashboard-routes` (`test/dashboard-routes.test.ts`), signed-out pages to
  `PUBLIC_PATH_PREFIXES` (`src/proxy.ts`). The entry page is `/dashboard` (`DASHBOARD_PATH`), never `/` (the site's
  landing page): use it for every "go to the dashboard" link and as the post-sign-in default (`safeRedirectPath`).
  The dashboard has no root files (icon, robots, sitemap): the site serves them. Its pages are noindex (the root layout) except `/sign-in` and `/sign-up` (`publicPageMetadata`, `src/lib/public-metadata.ts`), whose canonical folds the `?next=` links of every other signed-out path into one URL. Signed out, `src/proxy.ts` redirects only the dashboard's own top-level pages and API; any other document request answers 404 with a refresh to sign-in (`src/lib/signed-out.ts`), the same for a real organization and a made-up one, so dead URLs are 404s to search engines and slugs can't be enumerated.
- Sign-up sources: the site and `/sign-up` keep a visitor's first touch in `localStorage` (`@coss/auth/first-touch`: path, referrer host and campaign parameters only; nothing with Global Privacy Control on), `/onboarding` reports it once (`recordSignupAttributionAction`, `signup_attribution`), and `/admin/signups` shows the counts. Invited users never reach onboarding, so they aren't counted.
- Domain management uses `emailRuntime().domainDeps` (`src/lib/email-runtime.ts`) and webhook management
  `webhookManagementDeps()` (`src/lib/webhooks.ts`); domain/webhook errors carry user-facing messages. Revealing a
  webhook secret needs `webhook:update` (members can read endpoints but never see secrets).
- Org settings (`[orgSlug]/settings`: rename, slug change, leave, 2FA requirement; `settings/sso`: SSO provider and
  requirement; `settings/scim`: directory sync) and account settings (top-level `/settings`: name and
  verification email; `/settings/security`: password, connected accounts, two-factor, passkeys;
  `/settings/sessions`) call `auth.api.*` server-side — their HTTP routes stay disabled
  (`disabledPaths`, below). `canRemoveOrgMember`/`assignableOrgRoles` mirror Better Auth's owner rules for the UI; Better
  Auth alone protects the last owner. Account actions refuse while impersonating.
- Session-bound Better Auth calls made while *rendering* pass `authHeaders()` (`src/lib/session.ts`), not raw
  `headers()`: after an action replaces the session cookie (password change), Next re-renders with the new cookies
  but the old request headers.
- When driving the dashboard in a browser, wait for hydration before typing or submitting.

- Failed pages stay inside the shell: `[orgSlug]`, `settings` and `admin` each have an `error.tsx` built on `PageError` (`src/components/error-state.tsx`), which also handles the version-skew reload; a new `AppShell` layout needs one too (`test/error-boundaries.test.ts`). A mutation calling `useActionState` directly fails that test; add reads and hand-offs to its `NOT_MUTATIONS` list.
- Browser smoke tests live in `e2e/*.e2e.ts` (Playwright, `bun run --cwd apps/web e2e`, the merge queue's `e2e` job). They run on `next dev` with the fake providers; keep Playwright's output outside the app, or `next dev` reloads every open page. A stale `.next` can do the same: delete all of it with the server stopped.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
