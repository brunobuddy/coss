/** How long a rolled secret keeps signing, as offered by the dashboard (seconds; the API accepts any up to a week). */
export const PREVIOUS_SECRET_OPTIONS = [
  {
    seconds: 0,
    label: "Immediately",
    description: "Only the new secret signs. For a leaked secret.",
  },
  { seconds: 60 * 60, label: "In 1 hour", description: "" },
  { seconds: 24 * 60 * 60, label: "In 24 hours", description: "Recommended." },
  { seconds: 3 * 24 * 60 * 60, label: "In 3 days", description: "" },
  { seconds: 7 * 24 * 60 * 60, label: "In 7 days", description: "The longest possible." },
] as const;

export const DEFAULT_PREVIOUS_SECRET_OPTION = 24 * 60 * 60;
