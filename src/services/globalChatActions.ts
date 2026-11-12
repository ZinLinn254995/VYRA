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
