export const calculateCollapseProgress = (titleTop: number, stickyBottom: number): number => {
  const start = stickyBottom + 36;
  const end = stickyBottom - 12;
  return Math.max(0, Math.min(1, (start - titleTop) / (start - end)));
};
