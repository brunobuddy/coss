/** How far back the dashboard offers to recover failed deliveries (the API accepts any time). */
export const RECOVER_SINCE_OPTIONS = [
  { hours: 1, label: "The last hour" },
  { hours: 24, label: "The last 24 hours" },
  { hours: 7 * 24, label: "The last 7 days" },
  { hours: 30 * 24, label: "The last 30 days", description: "Everything still kept." },
] as const;

export const DEFAULT_RECOVER_SINCE_HOURS = 24;
