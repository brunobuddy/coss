/**
 * During a rolling deploy a page rendered by an old task can post its Server Action to a new one,
 * whose action ids differ (they change with every build): Next throws UnrecognizedActionError. A
 * reload fetches the page from the current build. At most one automatic reload per 10 s, so a
 * reload that lands on an old task again (until the load balancer drains it) can't spin.
 */
const SKEW_RELOAD_KEY = "coss:version-skew-reload";
const SKEW_RELOAD_INTERVAL_MS = 10_000;

export function reloadForNewDeployment(): boolean {
  try {
    const last = Number(sessionStorage.getItem(SKEW_RELOAD_KEY) ?? 0);
    if (Date.now() - last < SKEW_RELOAD_INTERVAL_MS) return false;
    sessionStorage.setItem(SKEW_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once (this render).
  }
  window.location.reload();
  return true;
}
