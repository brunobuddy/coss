/** Who a booking in a preview goes to: what someone's chosen, where `null` says it stays, or what was proposed. */
export function chosenTarget(
  item: { booking: string; to_host: string | null },
  choices: Readonly<Record<string, string | null>>,
): string | null {
  return item.booking in choices ? (choices[item.booking] ?? null) : item.to_host;
}
