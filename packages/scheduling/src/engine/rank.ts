export type PoolMember = {
  hostId: string;
  weight: number;
  fairUnits: number;
  lastAssignedAtMs: number | null;
  /** Standing in for someone: they rank no better than that person would. */
  atLeastRatio?: number | undefined;
  /** Standing in: the order they were named in. Everyone else comes first, all else equal. */
  coverPosition?: number | undefined;
};

function hashToUnit(seed: string, hostId: string): number {
  let hash = 2166136261;
  for (const char of `${seed}\0${hostId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Who should get the next booking: furthest behind their weighted share, then waiting longest,
 * then a stable tie-break from `seed`, so a retry of one request ranks the same way. New members
 * count as being level with the pool, otherwise they'd take every booking until they caught up.
 */
export function rankCandidates(members: readonly PoolMember[], seed: string): string[] {
  const established = members.filter((member) => member.fairUnits > 0);
  const floor = established.length
    ? Math.min(...established.map((member) => member.fairUnits / member.weight))
    : 0;
  // Someone standing in with few bookings of their own would otherwise take every booking until
  // they caught up: they're as far behind as the person they're covering, and no further.
  const ratio = (member: PoolMember) =>
    Math.max(member.fairUnits / member.weight, floor, member.atLeastRatio ?? 0);
  return [...members]
    .sort(
      (a, b) =>
        ratio(a) - ratio(b) ||
        (a.coverPosition ?? -1) - (b.coverPosition ?? -1) ||
        (a.lastAssignedAtMs ?? 0) - (b.lastAssignedAtMs ?? 0) ||
        hashToUnit(seed, a.hostId) - hashToUnit(seed, b.hostId) ||
        (a.hostId < b.hostId ? -1 : 1),
    )
    .map((member) => member.hostId);
}
