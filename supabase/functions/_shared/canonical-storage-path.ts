export function isCanonicalOwnedStoragePath(path: unknown, expectedPrefix: unknown): path is string {
  if (typeof path !== 'string' || typeof expectedPrefix !== 'string' ||
      expectedPrefix.length === 0 || !expectedPrefix.endsWith('/') ||
      path.length === 0 || path.startsWith('/') || path.includes('\\')) {
    return false;
  }

  const segments = path.split('/');
  const prefixSegments = expectedPrefix.split('/');
  const isSafe = (segment: string) => segment.length > 0 && segment !== '.' && segment !== '..';

  return segments.every(isSafe) &&
    prefixSegments.every(isSafe) &&
    path.startsWith(expectedPrefix);
}
