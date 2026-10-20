/**
 * Targeted repair selection: preserve immutable occupants and one first valid
 * movable occupant per exact timestamp across one profile/platform.
 * The caller must scope rows to a single platform and profile-local date.
 * Only IDs also present in eligibleIds may be moved.
 */
export function selectTargetedScheduleOverages(rows, eligibleIds, {
  getStamp = (row) => Date.parse(String(row.scheduledAt || "")),
  getOrder = (row) => Number(row.outputId || 0),
  isImmutable = (row) => Boolean(row.immutable),
} = {}) {
  const eligible = new Set(eligibleIds);
  const ordered = [...rows].sort((a, b) =>
    Number(isImmutable(b)) - Number(isImmutable(a))
    || getOrder(a) - getOrder(b)
  );
  const claimed = new Set();
  const displaced = [];
  for (const row of ordered) {
    const stamp = getStamp(row);
    if (!Number.isFinite(stamp)) continue;
    if (isImmutable(row)) {
      claimed.add(stamp);
      continue;
    }
    if (claimed.has(stamp)) {
      if (eligible.has(row.id)) displaced.push(row.id);
    } else {
      claimed.add(stamp);
    }
  }
  return displaced;
}
