export type WorkspaceStoryboard = {
  id: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  details?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isPersistableStoryboardId = (id: string): boolean => UUID_PATTERN.test(id);

/**
 * Merge device and account copies without allowing an older local copy to
 * overwrite a newer cloud revision. Non-UUID demo entries remain device-only.
 */
export const mergeWorkspaceStoryboards = <T extends WorkspaceStoryboard>(
  local: T[],
  remote: T[],
): { storyboards: T[]; pending: T[] } => {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const merged = new Map(remote.map((item) => [item.id, item]));
  const pending: T[] = [];

  for (const item of local) {
    if (!isPersistableStoryboardId(item.id)) {
      merged.set(item.id, item);
      continue;
    }
    const saved = remoteById.get(item.id);
    if (!saved || Date.parse(item.updatedAt) > Date.parse(saved.updatedAt)) {
      merged.set(item.id, item);
      pending.push(item);
    }
  }

  return {
    storyboards: Array.from(merged.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    pending,
  };
};


/**
 * Keep the original idea as the cache key when AI has filled the title/topic.
 * A creator edit changes the key and correctly requests fresh suggestions.
 */
export const workspaceStoryboardSuggestionKey = (
  title: string,
  topic: string,
  origins: Record<string, 'ai_suggested' | 'creator_edited'> = {},
): string =>
  (origins.title === 'ai_suggested' ? '' : title.trim()) + '\u0000' +
  (origins.topic === 'ai_suggested' ? '' : topic.trim());
