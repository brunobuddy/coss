import * as WebBrowser from "expo-web-browser";
import { DASHBOARD_URL } from "./config";
import { dashboardPath } from "./dashboard-path";

export type EnvironmentParams = { org: string; project: string; env: string };

/** The app's path of an environment (the dashboard's former shape; `openOnWeb` translates it). */
export function environmentPath(params: EnvironmentParams): string {
  return `/${params.org}/projects/${params.project}/${params.env}`;
}

/** Opens the dashboard's page for one of the app's paths in the in-app browser. */
export function openOnWeb(path: string): void {
  void WebBrowser.openBrowserAsync(`${DASHBOARD_URL}${dashboardPath(path)}`);
}
