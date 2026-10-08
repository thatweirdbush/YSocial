/** Puts the pinned id first. Returns the same reference when nothing changes, so memoized lists stay stable. */
export function orderWithPin(ids: readonly string[], pinnedId: string | undefined): readonly string[] {
  if (pinnedId === undefined) return ids;
  const index = ids.indexOf(pinnedId);
  if (index <= 0) return ids;
  return [pinnedId, ...ids.slice(0, index), ...ids.slice(index + 1)];
}
