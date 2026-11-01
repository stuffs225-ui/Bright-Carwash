/**
 * Compare imported rows against live records as multisets, not sets.
 * Two separate cars with identical time, service and price are NOT duplicates
 * unless the destination already contains at least two matching transactions.
 */
export function subtractExisting<T>(incoming: T[], existing: T[], keyOf: (item: T) => string): T[] {
  const counts = new Map<string, number>();
  existing.forEach(row => {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return incoming.filter(row => {
    const key = keyOf(row);
    const count = counts.get(key) || 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}
