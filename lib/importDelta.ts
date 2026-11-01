/**
 * Compare imported rows against live records as multisets, not sets.
 * Two separate cars with identical time, service and price are NOT duplicates
 * unless the destination already contains at least two matching transactions.
 */
export function subtractExisting<TIn, TExisting>(incoming: TIn[], existing: TExisting[], incomingKey: (item: TIn) => string, existingKey: (item: TExisting) => string): TIn[] {
  const counts = new Map<string, number>();
  existing.forEach(row => {
    const key = existingKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return incoming.filter(row => {
    const key = incomingKey(row);
    const count = counts.get(key) || 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}
