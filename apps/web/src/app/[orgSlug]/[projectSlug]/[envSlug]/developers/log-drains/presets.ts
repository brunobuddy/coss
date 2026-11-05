import type { LogDrainFormat } from "@coss/webhooks/schemas";

/** How each format reads in the dashboard. */
export const FORMAT_LABELS: Record<LogDrainFormat, { label: string; description: string }> = {
  ndjson: {
    label: "NDJSON",
    description: "One JSON object per line, signed: for your own endpoint.",
  },
  loki: { label: "Loki push", description: "Loki's push API (/loki/api/v1/push)." },
  datadog: { label: "Datadog logs", description: "Datadog's log intake (/api/v2/logs)." },
  otlp: { label: "OTLP/HTTP logs", description: "OpenTelemetry logs as JSON (/v1/logs)." },
};

/**
 * How a drain authenticates: no header, `Authorization: Bearer …`, `Authorization: Basic …` built
 * from a user and a password, or any header. The edit form adds `keep`.
 */
export type AuthKind = "none" | "bearer" | "basic" | "header";

export const AUTH_KIND_LABELS: Record<AuthKind, string> = {
  none: "None",
  bearer: "Bearer token",
  basic: "Basic (user and password)",
  header: "Custom header",
};

export type DrainPreset = {
  id: string;
  label: string;
  format: LogDrainFormat;
  /** Filled in when every customer uses the same URL; otherwise only a placeholder. */
  url?: string;
  urlPlaceholder: string;
  urlHelp: string;
  auth: AuthKind;
  headerName?: string;
  /** Labels of the basic auth fields, in the vendor's words. */
  basicLabels?: { user: string; password: string };
  credentialsHelp?: string;
};

export const DRAIN_PRESETS: DrainPreset[] = [
  {
    id: "custom",
    label: "Your endpoint (NDJSON)",
    format: "ndjson",
    urlPlaceholder: "https://logs.example.com/coss",
    urlHelp: "Must be https:// and publicly reachable. Verify batches with the signing secret.",
    auth: "none",
  },
  {
    id: "grafana-loki",
    label: "Grafana Cloud Logs (Loki)",
    format: "loki",
    urlPlaceholder: "https://logs-prod-012.grafana.net/loki/api/v1/push",
    urlHelp:
      "Your stack's Loki URL (its details page in the Grafana Cloud portal) + /loki/api/v1/push.",
    auth: "basic",
    basicLabels: { user: "User", password: "Access policy token" },
    credentialsHelp: "The user is on the Loki details page; the token needs the logs:write scope.",
  },
  {
    id: "grafana-otlp",
    label: "Grafana Cloud (OTLP)",
    format: "otlp",
    urlPlaceholder: "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/logs",
    urlHelp: "Your stack's OTLP endpoint (its OpenTelemetry page) + /v1/logs.",
    auth: "basic",
    basicLabels: { user: "Instance ID", password: "Access policy token" },
    credentialsHelp: "The instance ID is on the OpenTelemetry page; the token needs logs:write.",
  },
  {
    id: "datadog",
    label: "Datadog",
    format: "datadog",
    url: "https://http-intake.logs.datadoghq.com/api/v2/logs",
    urlPlaceholder: "https://http-intake.logs.datadoghq.com/api/v2/logs",
    urlHelp:
      "For another Datadog site, use its intake host (http-intake.logs.datadoghq.eu, us3.datadoghq.com…).",
    auth: "header",
    headerName: "DD-API-KEY",
    credentialsHelp: "An API key from Organization Settings → API Keys.",
  },
  {
    id: "otlp",
    label: "OpenTelemetry (OTLP/HTTP)",
    format: "otlp",
    urlPlaceholder: "https://otel.example.com/v1/logs",
    urlHelp: "A collector or vendor's OTLP/HTTP logs endpoint, ending in /v1/logs.",
    auth: "bearer",
  },
];
