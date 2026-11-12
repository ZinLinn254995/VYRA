export type GlobalChatStoryboardRecord = {
  id: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  details?: { scenes?: unknown[] } | null;
};

export const isStoryboardListRequest = (input: string): boolean =>
  /^\s*(?:(?:show|list|view|find)\s+(?:me\s+)?(?:my\s+)?storyboards?|(?:ငါ့|ကျွန်ုပ်၏)?\s*storyboard(?:s)?\s*(?:တွေ|များ)?\s*(?:ပြ|ပြပေး|စာရင်းပြ|ကြည့်)?\s*)$/i.test(input);

export const formatStoryboardList = (items: GlobalChatStoryboardRecord[]): string => {
  if (!items.length) {
    return 'Your Workspace does not have any Storyboards yet. You can create one from Workspace.';
  }
  const lines = items.map((item, index) => {
    const sceneCount = Array.isArray(item.details?.scenes) ? item.details.scenes.length : 0;
    return (index + 1) + '. **' + item.title + '**\n   ' +
      (item.topic?.trim() || 'No description') + '\n   ' +
      sceneCount + ' scene(s) · Updated ' + new Date(item.updatedAt).toLocaleDateString();
  });
  return 'Your Workspace Storyboards (' + items.length + ')\n\n' + lines.join('\n\n');
};


export const extractStoryboardDetailTitle = (input: string): string | null => {
  const patterns = [
    /^\\s*(?:show|tell me|give me)\\s+(?:the )?(?:details?|information)\\s+(?:of|for|about)\\s+(.+?)\\s*$/i,
    /^\\s*(?:tell me)\\s+about\\s+(.+?)\\s*$/i,
    /^\\s*(?:open|view)\\s+(?:the )?storyboard\\s+(.+?)\\s*$/i,
    /^\\s*(.+?)\\s+storyboard\\s*(?:အသေးစိတ်|အကြောင်း)\\s*(?:ပြပေး|ပြောပြ|ပြ)?\\s*$/i,
    /^\\s*(?:storyboard)\\s+(.+?)\\s*(?:အသေးစိတ်|အကြောင်း)\\s*(?:ပြပေး|ပြောပြ|ပြ)?\\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      const title = match[1].trim().replace(/^[\\"'“”‘’]+|[\\"'“”‘’]+$/g, '').trim();
      if (title && !/^(?:my|all|list|show)$/i.test(title)) return title;
    }
  }
  return null;
};

export const findStoryboardMatches = (
  items: GlobalChatStoryboardRecord[],
  requestedTitle: string,
): GlobalChatStoryboardRecord[] => {
  const normalized = requestedTitle.trim().toLocaleLowerCase();
  const exact = items.filter((item) => item.title.trim().toLocaleLowerCase() === normalized);
  if (exact.length) return exact;
  return items.filter((item) => item.title.trim().toLocaleLowerCase().includes(normalized));
};

export const formatStoryboardDetail = (item: GlobalChatStoryboardRecord): string => {
  const details = item.details && typeof item.details === 'object'
    ? item.details as Record<string, unknown>
    : {};
  const lines = [
    '**' + item.title + '**',
    'Topic: ' + (item.topic?.trim() || 'Not provided'),
  ];
  for (const key of ['category', 'style', 'mood', 'globalTitle', 'globalMusic']) {
    const value = details[key];
    if (typeof value === 'string' && value.trim()) {
      const label = key.replace(/[A-Z]/g, (letter) => ' ' + letter.toLowerCase());
      lines.push(label[0].toUpperCase() + label.slice(1) + ': ' + value.trim());
    }
  }
  if (Array.isArray(details.tags) && details.tags.length) {
    lines.push('Tags: ' + details.tags.filter((tag): tag is string => typeof tag === 'string').join(', '));
  }
  const scenes = Array.isArray(details.scenes) ? details.scenes : [];
  lines.push('', 'Scenes (' + scenes.length + '):');
  if (!scenes.length) lines.push('No scenes have been added yet.');
  scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') return;
    const record = scene as Record<string, unknown>;
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled scene';
    const description = typeof record.description === 'string' && record.description.trim() ? record.description.trim() : 'No description';
    const duration = typeof record.duration === 'number' && Number.isFinite(record.duration) ? record.duration + ' sec' : 'duration not set';
    const transition = typeof record.transition === 'string' && record.transition.trim() ? record.transition.trim() : 'not set';
    lines.push((index + 1) + '. **' + title + '** — ' + duration, description, 'Transition: ' + transition);
  });
  lines.push('', 'Created: ' + new Date(item.createdAt).toLocaleDateString(), 'Updated: ' + new Date(item.updatedAt).toLocaleDateString());
  return lines.join('\\n');
};
