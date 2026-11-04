/** Who a booking in a preview goes to: what someone's chosen, where `null` says it stays, or what was proposed. */
export function chosenTarget(
  item: { booking: string; to_host: string | null },
  choices: Readonly<Record<string, string | null>>,
): string | null {
  return item.booking in choices ? (choices[item.booking] ?? null) : item.to_host;
}

/** What can be asked to go past. Anything else about a host can't be, like already being booked. */
const OVERRIDABLE = new Set([
  "out_of_office",
  "outside_availability",
  "host_busy",
  "limit_reached",
  "calendar_unverified",
]);

/** What choosing someone means going past: someone covering, outside it, is taking it as anyone. */
export function overridesFor(candidate: { member: boolean; reasons: readonly string[] }): string[] {
  return [
    ...(!candidate.member || candidate.reasons.includes("outside_coverage") ? ["any_host"] : []),
    ...candidate.reasons.filter((reason) => OVERRIDABLE.has(reason)),
  ];
}
