// Pure (no React Native imports) so `bun test` can load it.

const SEGMENT = "[A-Za-z0-9_-]+";
const ENV = `/${SEGMENT}/projects/${SEGMENT}/${SEGMENT}`;

/** The pages a push notification may open: exactly the paths `@coss/push` builds. */
const ROUTES = [
  `/${SEGMENT}/reputation`,
  `/${SEGMENT}/settings/billing`,
  `/${SEGMENT}/settings/billing/invoices/${SEGMENT}`,
  `/${SEGMENT}/spend`,
  `${ENV}/webhooks/${SEGMENT}`,
  `${ENV}/hooks/${SEGMENT}/endpoints/${SEGMENT}`,
  `${ENV}/log-drains/${SEGMENT}`,
  `${ENV}/risk`,
].map((pattern) => new RegExp(`^${pattern}$`));

const ORGANIZATION_PAGE = new RegExp(`^/(${SEGMENT})/(reputation|settings|spend)(/.*)?$`);

/**
 * The app route a notification's `data` points at, or null for anything else. A cold link opens
 * in the first tab, so an organization's own pages name theirs.
 */
export function routeFromNotification(data: unknown): string | null {
  const path = (data as { path?: unknown } | null | undefined)?.path;
  if (typeof path !== "string" || !ROUTES.some((route) => route.test(path))) return null;
  return path.replace(ORGANIZATION_PAGE, "/$1/(organization)/$2$3");
}
