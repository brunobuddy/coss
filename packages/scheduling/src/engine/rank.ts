export type PoolMember = {
  hostId: string;
  weight: number;
  fairUnits: number;
  lastAssignedAtMs: number | null;
};

function hashToUnit(seed: string, hostId: string): number {
  let hash = 2166136261;
  for (const char of `${seed}\0${hostId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** How far behind the furthest-behind member is. Null when nobody's been booked yet. */
function lowestShare(members: readonly Pick<PoolMember, "weight" | "fairUnits">[]): number | null {
  const shares = members
    .filter((member) => member.fairUnits > 0)
    .map((member) => member.fairUnits / member.weight);
  return shares.length ? Math.min(...shares) : null;
}

/**
 * Where someone joining a pool starts, given who else is in it: level with whoever's furthest
 * behind, so they take their turns rather than every booking until they've caught up.
 */
export function startingUnits(
  members: readonly Pick<PoolMember, "weight" | "fairUnits">[],
  weight: number,
): number {
  return (lowestShare(members) ?? 0) * weight;
}

/**
 * Who should get the next booking: furthest behind their weighted share, then waiting longest,
 * then a stable tie-break from `seed`, so a retry of one request ranks the same way. A member yet
 * to be booked counts as level with the pool, which also keeps a pool's first bookings in weight
 * order. People who join a running pool are started level by `startingUnits`.
 */
export function rankCandidates(members: readonly PoolMember[], seed: string): string[] {
  const floor = lowestShare(members) ?? 0;
  const ratio = (member: PoolMember) => Math.max(member.fairUnits / member.weight, floor);
  return [...members]
    .sort(
      (a, b) =>
        ratio(a) - ratio(b) ||
        (a.lastAssignedAtMs ?? 0) - (b.lastAssignedAtMs ?? 0) ||
        hashToUnit(seed, a.hostId) - hashToUnit(seed, b.hostId) ||
        (a.hostId < b.hostId ? -1 : 1),
    )
    .map((member) => member.hostId);
}
