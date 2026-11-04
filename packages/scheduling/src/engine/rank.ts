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

/**
 * Who should get the next booking: furthest behind their weighted share, then waiting longest,
 * then a stable tie-break from `seed`, so a retry of one request ranks the same way. A member yet
 * to be booked counts as level with the pool, which also keeps a pool's first bookings in weight
 * order. People who join a running pool are started level by `poolStartingUnits`.
 */
export function rankCandidates(members: readonly PoolMember[], seed: string): string[] {
  const established = members.filter((member) => member.fairUnits > 0);
  const floor = established.length
    ? Math.min(...established.map((member) => member.fairUnits / member.weight))
    : 0;
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
