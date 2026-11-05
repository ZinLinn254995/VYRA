export const calculateCollapseProgress = (
  sentinelTop: number,
  stickyTop: number,
  collapseDistance = 104,
): number => {
  if (collapseDistance <= 0) return 1;
  return Math.max(0, Math.min(1, (stickyTop - sentinelTop) / collapseDistance));
};
