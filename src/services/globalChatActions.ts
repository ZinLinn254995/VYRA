export type GlobalChatStoryboardRecord = {
  id: string;
  title: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  details?: { scenes?: unknown[] } | null;
};

export type GlobalChatStoryboardDraft = {
  id: string;
  title: string;
  topic: string;
};

export type GlobalChatStoryboardUpdateDraft = {
  id: string;
  storyboardId: string;
  storyboardTitle: string;
  field: 'title' | 'topic';
  previousValue: string;
  expectedUpdatedAt: string;
  nextValue: string;
};

export type GlobalChatStoryboardDeleteDraft = {
  id: string;
  storyboardId: string;
  storyboardTitle: string;
  expectedUpdatedAt: string;
};

export type GlobalChatStoryboardAction =
  | { type: 'storyboard-create-draft'; draft: GlobalChatStoryboardDraft }
  | { type: 'storyboard-create-complete'; draftId: string }
  | { type: 'storyboard-update-draft'; draft: GlobalChatStoryboardUpdateDraft }
  | { type: 'storyboard-update-complete'; draftId: string }
  | { type: 'storyboard-delete-draft'; draft: GlobalChatStoryboardDeleteDraft }
  | { type: 'storyboard-delete-complete'; draftId: string };

export const extractStoryboardCreateRequest = (input: string): { title: string; topic: string } | null => {
  const value = input.trim();
  const patterns = [
    /^create\s+(?:a\s+)?storyboards?\s+(?:titled|called)\s+["“']?(.+?)["”']?\s+(?:about|for|on|:|—)\s+(.+)$/i,
    /^create\s+(?:a\s+)?storyboards?\s+(?:about|for|on)\s+(.+)$/i,
    /^make\s+(?:a\s+)?storyboards?\s+(?:about|for|on)\s+(.+)$/i,
    /^(.+?)\s+အကြောင်း\s+storyboard\s*(?:ဖန်တီး|လုပ်)(?:ပေး)?$/i,
    /^storyboard\s*(?:ဖန်တီး|လုပ်)(?:ပေး)?\s*[:：-]?\s*(.+)$/i,
  ];
  const titled = value.match(patterns[0]);
  if (titled) {
    const title = titled[1].trim().replace(/^["“']|["”']$/g, '').trim();
    const topic = titled[2].trim();
    return topic ? { title, topic } : null;
  }
  for (const pattern of patterns.slice(1)) {
    const match = value.match(pattern);
    if (match?.[1]?.trim()) {
      const topic = match[1].trim().replace(/^["“']|["”']$/g, '').trim();
      if (topic && topic.length <= 1000) return { title: '', topic };
    }
  }
  return null;
};

export const isStoryboardCreateIntent = (input: string): boolean =>
  /^\s*(?:create|make)\s+(?:a\s+)?storyboards?\b/i.test(input) ||
  /^\s*(?:storyboard\s*(?:ဖန်တီး|လုပ်)|.+?\s+အကြောင်း\s+storyboard\s*(?:ဖန်တီး|လုပ်))/i.test(input);

export const isStoryboardCreateConfirmation = (input: string): boolean =>
  /^\s*(?:confirm(?:\s+(?:create|storyboard))?|yes,?\s+create(?:\s+it)?|အတည်ပြု(?:မယ်)?|ဖန်တီးပါ)\s*[.!?။]*\s*$/i.test(input);

export const formatStoryboardCreateDraft = (draft: GlobalChatStoryboardDraft): string =>
  '**Storyboard draft — please review**\n\n' +
  '**Title:** ' + draft.title + '\n' +
  '**Topic:** ' + draft.topic + '\n\n' +
  'Nothing has been saved yet. If this is right, simply tell me to go ahead in your own words.';

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
    /^\s*(?:show|tell me|give me)\s+(?:the )?(?:details?|information)\s+(?:of|for|about)\s+(.+?)\s*$/i,
    /^\s*(?:tell me)\s+about\s+(.+?)\s*$/i,
    /^\s*(?:open|view)\s+(?:the )?storyboard\s+(.+?)\s*$/i,
    /^\s*(.+?)\s+storyboard\s*(?:အသေးစိတ်|အကြောင်း)\s*(?:ပြပေး|ပြောပြ|ပြ)?\s*$/i,
    /^\s*(?:storyboard)\s+(.+?)\s*(?:အသေးစိတ်|အကြောင်း)\s*(?:ပြပေး|ပြောပြ|ပြ)?\s*$/i,
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
  return lines.join('\n');
};


export type GlobalChatNavigationTarget = 'workspace' | 'marketplace' | 'my-vyrals' | 'my-media-library';

export const extractGlobalChatNavigationTarget = (input: string): GlobalChatNavigationTarget | null => {
  const value = input.trim().toLocaleLowerCase().replace(/[.!?။]+$/g, '').trim();
  const patterns: Array<[GlobalChatNavigationTarget, RegExp]> = [
    ['my-vyrals', /^(?:(?:go(?:\s+to)?|open|show|take me to)\s+(?:my\s+)?vyrals?|(?:my\s+)?vyrals?\s+(?:ဖွင့်(?:ပေး)?|သွား|ပြပေး))$/i],
    ['my-media-library', /^(?:(?:go(?:\s+to)?|open|show|take me to)\s+(?:my\s+)?media\s+library|(?:my\s+)?media\s+library\s+(?:ဖွင့်(?:ပေး)?|သွား|ပြပေး)|media\s+library)$/i],
    ['workspace', /^(?:(?:go(?:\s+to)?|open|take me to)\s+(?:the\s+)?workspace|workspace\s+(?:ဖွင့်(?:ပေး)?|သွား|ပြပေး))$/i],
    ['marketplace', /^(?:(?:go(?:\s+to)?|open|take me to)\s+(?:the\s+)?marketplace|marketplace\s+(?:ဖွင့်(?:ပေး)?|သွား|ပြပေး))$/i],
  ];
  for (const [target, pattern] of patterns) if (pattern.test(value)) return target;
  return null;
};


export const isStoryboardUpdateIntent = (input: string): boolean =>
  /^\s*(?:(?:update|change|edit)\s+(?:the\s+)?storyboard\b|set\s+(?:title|topic)\s+of\s+(?:the\s+)?storyboard\b|storyboard\s+.+?\s+ရဲ့\s+(?:title|topic)\s+ကို)/i.test(input);

export const extractStoryboardUpdateRequest = (input: string): { storyboardTitle: string; field: 'title' | 'topic'; value: string } | null => {
  const patterns: Array<{ regex: RegExp; target: number; field: number; value: number }> = [
    { regex: /^\s*(?:update|change|edit)\s+(?:the\s+)?storyboard\s+["“']?(.+?)["”']?\s+(title|topic|name|idea)\s+(?:to|as|:)\s+(.+?)\s*$/i, target: 1, field: 2, value: 3 },
    { regex: /^\s*set\s+(title|topic)\s+of\s+(?:the\s+)?storyboard\s+["“']?(.+?)["”']?\s+to\s+(.+?)\s*$/i, target: 2, field: 1, value: 3 },
    { regex: /^\s*storyboard\s+(.+?)\s+ရဲ့\s+(title|topic)\s+ကို\s+(.+?)\s+ပြောင်း(?:ပေး)?\s*$/i, target: 1, field: 2, value: 3 },
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern.regex);
    if (!match) continue;
    const storyboardTitle = match[pattern.target]?.trim().replace(/^["“']|["”']$/g, '').trim();
    const rawField = match[pattern.field]?.toLowerCase();
    const field: 'title' | 'topic' = rawField === 'title' || rawField === 'name' ? 'title' : 'topic';
    const value = match[pattern.value]?.trim().replace(/^["“']|["”']$/g, '').trim();
    if (!storyboardTitle || !value || storyboardTitle.length > 160 || value.length > 1000) return null;
    if (field === 'title' && value.length > 100) return null;
    return { storyboardTitle, field, value };
  }
  return null;
};

export const formatStoryboardUpdateDraft = (draft: GlobalChatStoryboardUpdateDraft): string =>
  '**Storyboard update — please review**\n\n' +
  '**Storyboard:** ' + draft.storyboardTitle + '\n' +
  '**' + (draft.field === 'title' ? 'Title' : 'Topic') + ':** ' + draft.previousValue + '\n' +
  '**New ' + (draft.field === 'title' ? 'title' : 'topic') + ':** ' + draft.nextValue + '\n\n' +
  'Nothing has been changed yet. If this is right, simply tell me to go ahead in your own words.';

export const isStoryboardUpdateConfirmation = (input: string): boolean =>
  /^\s*(?:confirm\s+update|အတည်ပြု(?:မယ်)?|ပြောင်းလဲမှု\s+အတည်ပြု)\s*[.!?။]*\s*$/i.test(input);


export const isStoryboardDeleteIntent = (input: string): boolean =>
  /^\s*(?:delete|remove)\s+(?:the\s+)?storyboard\b|^\s*storyboard\s+.+?\s+ကို\s+(?:ဖျက်|delete)(?:ပေး)?\s*$/i.test(input);

export const extractStoryboardDeleteTitle = (input: string): string | null => {
  const patterns = [
    /^\s*(?:delete|remove)\s+(?:the\s+)?storyboard\s+["“']?(.+?)["”']?\s*[.!?။]*\s*$/i,
    /^\s*storyboard\s+["“']?(.+?)["”']?\s+ကို\s+(?:ဖျက်|delete)(?:ပေး)?\s*[.!?။]*\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    const title = match?.[1]?.trim().replace(/^["“']|["”']$/g, '').trim();
    if (title && title.length <= 160) return title;
  }
  return null;
};

export const formatStoryboardDeleteDraft = (draft: GlobalChatStoryboardDeleteDraft): string =>
  '**Delete Storyboard — confirmation required**\n\n' +
  'You are about to permanently delete **' + draft.storyboardTitle + '**.\n' +
  'This action cannot be undone.\n\n' +
  'Nothing has been deleted yet. If you want me to continue, just tell me naturally.';

export const isStoryboardDeleteConfirmation = (input: string): boolean =>
  /^\s*(?:confirm\s+delete|ဖျက်ရန်\s+အတည်ပြု|ဖျက်မယ်\s+အတည်ပြု)\s*[.!?။]*\s*$/i.test(input);


export type GlobalChatVyralDraft = {
  id: string;
  name: string;
  description: string;
};

export type GlobalChatAction = GlobalChatStoryboardAction
  | { type: 'vyral-create-draft'; draft: GlobalChatVyralDraft }
  | { type: 'vyral-create-complete'; draftId: string }
  | { type: 'vyral-asset-upload-draft'; draft: GlobalChatVyralAssetUploadDraft }
  | { type: 'vyral-asset-upload-complete'; draftId: string };

export const isVyralCreateIntent = (input: string): boolean =>
  /^\s*(?:(?:please\s+)?(?:create|make|build)\s+(?:(?:a|an|new)\s+)?vyrals?\b|(?:new\s+)?vyral\s+(?:အသစ်\s*)?(?:ဖန်တီး|လုပ်)(?:ပေး)?(?=\s|$))/i.test(input);

export const extractVyralCreateRequest = (input: string): { name: string; description: string } | null => {
  const value = input.trim();
  const patterns = [
    /^(?:please\s+)?(?:create|make|build)\s+(?:(?:a|an|new)\s+)?vyrals?\s+(?:named|called)\s+["“']?(.+?)["”']?(?:\s+(?:about|for|with description|—|:|-)\s+(.+))?$/i,
    /^(?:please\s+)?(?:create|make|build)\s+(?:(?:a|an|new)\s+)?vyrals?\s*[:：]\s*["“']?(.+?)["”']?(?:\s*[—-]\s*(.+))?$/i,
    /^vyral\s+(?:အသစ်\s*)?(?:ဖန်တီး|လုပ်)(?:ပေး)?\s*[:：-]?\s*(.+?)(?:\s+(?:အကြောင်း|ဖော်ပြချက်)\s+(.+))?$/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const name = (match[1] ?? '').trim().replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '').trim();
    const description = (match[2] ?? '').trim().replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '').trim();
    if (!name || name.length > 100 || description.length > 1000) return null;
    return { name, description };
  }
  return null;
};

export const formatVyralCreateDraft = (draft: GlobalChatVyralDraft): string =>
  '**Vyral creation draft — please review**\n\n' +
  '**Name:** ' + draft.name + '\n' +
  '**Purpose / Description:** ' + (draft.description || 'Not specified yet') + '\n\n' +
  'This will create a private Vyral with its initial identity DNA. Assets and Master DNA will be added and maintained as you build it through AI Chat.\n\n' +
  'Nothing has been created yet. If this is what you want, simply tell me to go ahead.';

export const isVyralCreateConfirmation = (input: string): boolean =>
  /^\s*(?:confirm\s+vyral\s+create|vyral\s+ဖန်တီးရန်\s+အတည်ပြု)\s*[.!?။]*\s*$/i.test(input);


export type GlobalChatVyralAssetUploadDraft = {
  id: string;
  vyralId: string;
  vyralName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export const extractVyralAssetUploadTarget = (input: string): string | null => {
  const patterns = [
    /^\s*(?:add|save|upload|put)\s+(?:this|the attached file|attachment|file)\s+(?:to|into)\s+(?:my\s+)?vyral\s+["“']?(.+?)["”']?\s*[.!?]*\s*$/i,
    /^\s*(?:add|save|upload)\s+(?:this|the attached file|attachment|file)\s+(?:to|into)\s+["“']?(.+?)["”']?\s+(?:vyral)\s*[.!?]*\s*$/i,
    /^\s*(?:ဒီဖိုင်ကို|ဒီ Asset ကို|ပူးတွဲဖိုင်ကို)\s*(?:vyral\s*)?["“']?(.+?)["”']?\s*(?:ထဲ|ထဲကို)\s*(?:ထည့်|သိမ်း)(?:ပေး)?\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = input.trim().match(pattern);
    const target = match?.[1]?.trim().replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, '').trim();
    if (target && target.length <= 100) return target;
  }
  return null;
};

export const isNaturalChatApproval = (input: string): boolean =>
  /^\s*(?:yes|yeah|yep|okay|ok|go ahead|do it|proceed|looks good|that's right|sounds good|အေး(?:\s*လုပ်လိုက်(?:တော့|ပါ)?)?|ဟုတ်ပြီ|ဟုတ်တယ်|ရတယ်\s*လုပ်လိုက်(?:တော့|ပါ)?|လုပ်လိုက်(?:တော့|ပါ)?|ထည့်လိုက်(?:တော့|ပါ)?|သိမ်းလိုက်(?:တော့|ပါ)?|အတည်ပြု(?:မယ်|ပါ)?)\s*[.!?။]*\s*$/i.test(input);

export const isVyralAssetUploadConfirmation = (input: string): boolean =>
  /^\s*(?:confirm\s+(?:asset )?upload|confirm\s+add\s+to\s+vyral|vyral\s+asset\s+upload\s+confirm|Asset\s+ထည့်ရန်\s+အတည်ပြု)\s*[.!?။]*\s*$/i.test(input);

export const formatVyralAssetUploadDraft = (draft: GlobalChatVyralAssetUploadDraft): string =>
  '**Asset upload preview**\n\n' +
  '**File:** ' + draft.fileName + '\n' +
  '**Destination Vyral:** ' + draft.vyralName + '\n' +
  '**Size:** ' + (draft.fileSize / 1024 / 1024).toFixed(2) + ' MB\n' +
  '**MIME:** ' + (draft.mimeType || 'unknown') + '\n\n' +
  'The original file will be stored privately. VYRA will create its immutable Asset Version, SHA-256 Fingerprint and the applicable Asset DNA before marking it ready.\n\n' +
  'Nothing has been uploaded yet. If this looks right, just tell me naturally to go ahead.';


export type GlobalChatVyralRecord = { id: string; name: string; description?: string };

export const findMentionedVyrals = (
  input: string,
  vyrals: GlobalChatVyralRecord[],
): GlobalChatVyralRecord[] => {
  const normalizedInput = input.normalize('NFKC').toLocaleLowerCase();
  const matches = vyrals
    .filter((vyral) => {
      const normalizedName = vyral.name.normalize('NFKC').trim().toLocaleLowerCase();
      const index = normalizedInput.indexOf(normalizedName);
      if (!normalizedName || index < 0) return false;
      const clause = normalizedInput.slice(0, index).split(/[.!?;，,]/).pop() ?? '';
      if (/\b(?:don't|do not|not|avoid|without|never|exclude)\b/i.test(clause) ||
          /(?:မဟုတ်|မလုပ်|မသုံး|မပြောင်း|မလိုချင်|မရွေး)/.test(clause)) return false;
      return true;
    })
    .sort((a, b) => b.name.length - a.name.length);
  if (!matches.length) return [];
  return matches.filter((item) => !matches.some((other) =>
    other.id !== item.id && other.name.length > item.name.length &&
    other.name.normalize('NFKC').trim().toLocaleLowerCase().includes(item.name.normalize('NFKC').trim().toLocaleLowerCase())
  ));
};

export const isVyralAssetAddIntent = (input: string): boolean => {
  if (/\b(?:do not|don't|never|avoid)\s+(?:add|put|save|store|keep|include|attach|upload|place|use)\b/i.test(input) ||
      /(?:မထည့်|မသိမ်း|မလုပ်ပါ)/.test(input)) return false;
  return /\b(?:add|put|save|store|attach|upload|place)\b/i.test(input) ||
    /\b(?:make|keep)\s+(?:this|that|it)\s+(?:part|one)\s+of\b/i.test(input) ||
    /\b(?:this|that|it)\s+(?:belongs|should go|needs to go)\s+(?:in|into|with)\b/i.test(input) ||
    /\b(?:i want|i'd like)\s+(?:(?:this|that|it)|(?:this|that)\s+(?:image|picture|file|asset))\s+(?:in|inside|with|part of)\b/i.test(input) ||
    /\b(?:this|that)\s+(?:image|picture|file|asset)\s+(?:should|needs to)\s+be\s+(?:in|inside|part of)\b/i.test(input) ||
    /(?:ထည့်|သိမ်း|ထည့်ပေး|သိမ်းပေး|အဲဒီထဲထား|အဲ့ဒီထဲထား)/.test(input);
};

export const isVyralAssetContextReference = (input: string): boolean =>
  /\b(?:this|that|it|there|same one|current vyral|this vyral|that vyral)\b/i.test(input) ||
  /(?:အဲဒီထဲ|အဲ့ဒီထဲ|အဲဒါထဲ|အဲ့ဒါထဲ|ဒီထဲ|အဲဒီ Vyral|အဲ့ဒီ Vyral)/i.test(input);
