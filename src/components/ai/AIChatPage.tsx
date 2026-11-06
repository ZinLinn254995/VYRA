import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Archive, Clock3, Copy, History, Lock, MessageSquare,
  MoreHorizontal, Plus, Share2, Trash2, Unlock, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { parseVyralManifest, readVyralZip, reconstructVyralDnaV3FromPackage } from '../../services/vyralPackage.ts';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  archived?: boolean;
  locked?: boolean;
};

type AIChatPageProps = {
  isAuthenticated: boolean;
  onLoginRequired: () => void;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const inspectVyralAttachment = async (file: File) => {
  if (file.size > 256 * 1024 * 1024) throw new Error('Vyral package exceeds the 256 MB safety limit.');
  const files = await readVyralZip(file);
  const manifest = parseVyralManifest(files);
  const v3Records = manifest.dnaRecords.filter((record) =>
    record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3
  );
  const verified = await Promise.all(v3Records.map(async (record) => {
    const reconstruction = await reconstructVyralDnaV3FromPackage(files, String(record.id));
    return {
      assetId: String(record.asset_id ?? ''),
      width: reconstruction.width,
      height: reconstruction.height,
      channels: reconstruction.channel_layout,
      digest: reconstruction.decoded_samples_sha256,
      bytes: reconstruction.samples.byteLength,
    };
  }));
  const asset = manifest.assets[0];
  const mode = manifest.exportMode === 'dna-only' ? 'DNA-only' : 'Full Vyral';
  const lines = [
    `Package: ${String(manifest.vyral.name)} (${mode})`,
    `Assets: ${manifest.assets.length} · DNA records: ${manifest.dnaRecords.length}`,
    ...verified.map((item) =>
      `DNA v3 verified: ${item.width}×${item.height} ${item.channels}; ${item.bytes.toLocaleString()} decoded bytes; SHA-256 ${item.digest}`
    ),
    v3Records.length === 0 ? 'No portable DNA v3 reconstruction record was found in this package.' : '',
    asset?.name ? `Selected asset: ${String(asset.name)}` : '',
  ].filter(Boolean);
  return lines.join('\\n');
};

export const AIChatPage: React.FC<AIChatPageProps> = ({ isAuthenticated, onLoginRequired }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);\n  const [selectedFileStatus, setSelectedFileStatus] = useState<string | null>(null);\n  const [selectedVyralContext, setSelectedVyralContext] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Measure and apply height before paint so the composer never flashes between sizes.
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, 144);
    textarea.style.height = `${nextHeight}px`;
    const nextIsMultiline = nextHeight > 48;
    setIsMultiline((current) => current === nextIsMultiline ? current : nextIsMultiline);
  }, [draft]);

  const hasMessages = messages.length > 0;
  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    return firstUserMessage.length > 42 ? firstUserMessage.slice(0, 42) + '…' : firstUserMessage || 'New chat';
  }, [messages]);

  const saveCurrentSession = (archived = false) => {
    if (!hasMessages) return;
    const session: ChatSession = {
      id: activeSessionId ?? makeId(),
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived,
      locked: isLocked,
    };
    setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
  };

  const startNewChat = () => {
    saveCurrentSession();
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setActionsOpen(false);
  };

  const openSession = (session: ChatSession) => {
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setIsLocked(Boolean(session.locked));
    setDraft('');
    setHistoryOpen(false);
  };

  const sendMessage = (value = draft) => {
    const text = value.trim();
    if ((!text && !selectedFile) || isLocked) return;
    if (selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    const attachmentText = selectedFile
      ? `\\n\\nAttached file: ${selectedFile.name} (${selectedFile.type || 'application/octet-stream'}, ${selectedFile.size.toLocaleString()} bytes)${selectedVyralContext ? `\\n\\n${selectedVyralContext}` : selectedFileStatus ? `\\n${selectedFileStatus}` : ''}`
      : '';
    setMessages((previous) => [...previous, { id: makeId(), role: 'user', content: (text || 'Please inspect this attachment.') + attachmentText }]);
    setDraft('');
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!activeSessionId) setActiveSessionId(makeId());
  };

  const handleFileSelection = async (file: File | null) => {
    setSelectedFile(file);
    setSelectedVyralContext(null);
    if (!file) {
      setSelectedFileStatus(null);
      return;
    }
    if (file.name.toLowerCase().endsWith('.vyral')) {
      setSelectedFileStatus('Checking Vyral DNA…');
      try {
        const summary = await inspectVyralAttachment(file);
        setSelectedVyralContext(summary);
        setSelectedFileStatus('Vyral package validated · DNA v3 checked locally');
      } catch (error) {
        setSelectedFileStatus(error instanceof Error ? error.message : 'Could not validate this Vyral package.');
      }
      return;
    }
    setSelectedFileStatus('Attachment ready · AI provider connection is required for model analysis');
  };

  const shareCurrentChat = async () => {
    const transcript = messages.map((message) => `${message.role === 'user' ? 'You' : 'VYRA AI'}: ${message.content}`).join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VYRA AI Chat', text: transcript });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcript);
      }
    } catch {
      // The user may cancel the native share sheet.
    }
    setActionsOpen(false);
  };

  const archiveCurrentChat = () => {
    saveCurrentSession(true);
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setActionsOpen(false);
  };

  const deleteCurrentChat = () => {
    if (activeSessionId) {
      setSessions((previous) => previous.filter((session) => session.id !== activeSessionId));
    }
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setActionsOpen(false);
  };

  const toggleLock = () => {
    setIsLocked((previous) => !previous);
    setActionsOpen(false);
  };

  const handleCopy = (content: string) => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(content);
  };

  return (
    <main className="fixed inset-x-0 top-[calc(var(--vyra-visual-viewport-top,0px)+109px)] bottom-[var(--vyra-visual-viewport-bottom-gap,0px)] mx-auto min-h-0 w-full max-w-[var(--vyra-content-width)] overflow-hidden px-3 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+64px)] sm:px-6">
      <header className="fixed right-3 top-[calc(var(--vyra-visual-viewport-top,0px)+112px)] z-[60] flex items-start justify-end sm:right-6 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+76px)]">
        <div
          className="relative overflow-hidden border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-primary)]"
          style={{
            width: actionsOpen ? 208 : 40,
            height: actionsOpen ? 304 : 40,
            borderRadius: actionsOpen ? '16px' : '50%',
            transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className={`absolute right-0 top-0 z-10 size-10 rounded-full px-0 text-[var(--vyra-text-primary)] ${actionsOpen ? 'bg-transparent hover:bg-[var(--vyra-bg-hover)]' : 'bg-[var(--vyra-bg-surface)] hover:bg-[var(--vyra-bg-hover)]'}`}
            aria-label={actionsOpen ? 'Close chat menu' : 'Open chat menu'}
            title="Chat menu"
            onClick={() => setActionsOpen((open) => !open)}
          >
            {actionsOpen ? <X size={20} /> : <MoreHorizontal size={23} />}
          </Button>
          <div
            aria-hidden={!actionsOpen}
            className={`absolute inset-x-0 bottom-0 top-10 p-1.5 pt-1 text-[var(--vyra-text-primary)] transition-opacity duration-200 ${actionsOpen ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
          >
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={() => { setHistoryOpen(true); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <History size={14} /> Recent chats
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <Plus size={14} /> New chat
            </button>
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={shareCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Share2 size={14} /> Share chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={archiveCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Archive size={14} /> Archive chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={toggleLock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {isLocked ? 'Unlock chat' : 'Lock chat'}
            </button>
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={deleteCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-danger)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 size={14} /> Delete chat
            </button>
          </div>
        </div>
      </header>

      <section className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]">
        {!hasMessages ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 pb-32 pt-20 text-center">
            <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] shadow-lg shadow-cyan-950/10">
              <MessageSquare size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Hello! What would you like to create today?</h1>
            <p className="mt-2 max-w-md text-xs leading-5 text-[var(--vyra-text-secondary)] sm:text-sm">
              Explore ideas, write scripts, plan projects, or ask me anything — about VYRA or beyond.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-1 pb-36 pt-20">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`min-w-0 max-w-[88%] break-words rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${message.role === 'user' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)]'}`}>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                  {message.role === 'assistant' && <button type="button" onClick={() => handleCopy(message.content)} className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]"><Copy size={12} /> Copy</button>}
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-[var(--vyra-border)] px-4 py-3 text-xs leading-5 text-[var(--vyra-text-muted)]">
              VYRA AI ရဲ့ အဖြေထုတ်ပေးနိုင်မှုကို AI Provider ချိတ်ဆက်ပြီးနောက် ဖွင့်ပေးမယ်။
            </div>
          </div>
        )}
      </section>

      <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-[var(--vyra-content-width)] p-0 sm:inset-x-6 sm:bottom-4">
        {isLocked && (
          <p className="mb-2 text-center text-[11px] text-[var(--vyra-text-muted)]">ဒီ Chat ကို Lock လုပ်ထားပါတယ်။ စာပို့ရန် Unlock လုပ်ပါ။</p>
        )}
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2">
          {selectedFile && (
            <div className="mb-1 flex items-center gap-2 px-2 text-[10px] text-[var(--vyra-text-muted)]">
              <span className="min-w-0 flex-1 truncate">{selectedFile.name}{selectedFileStatus ? ` · ${selectedFileStatus}` : ''}</span>
              <button type="button" onClick={() => { setSelectedFile(null); setSelectedFileStatus(null); setSelectedVyralContext(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Remove attachment" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--vyra-bg-hover)]">
                <X size={13} />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx"
            onChange={(event) => { void handleFileSelection(event.target.files?.[0] ?? null); }}
          />
          <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-end gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLocked}
              aria-label="Upload file"
              title="Upload file"
              className={`col-start-1 grid size-9 place-items-center rounded-full text-[var(--vyra-text-muted)] transition-colors hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] active:bg-transparent disabled:opacity-40 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
            >
              <Plus size={21} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
              rows={1}
              disabled={isLocked}
              placeholder={isLocked ? 'Chat locked' : 'Message VYRA AI…'}
              aria-label="Message VYRA AI"
              style={{ outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent", WebkitAppearance: "none" }}
              className={`col-start-2 row-start-1 w-full max-h-36 min-h-10 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-6 text-[var(--vyra-text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--vyra-text-muted)] focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent]`}
            />
            <Button
              type="submit"
              size="sm"
              className={`col-start-3 !size-9 !min-h-9 !min-w-9 !rounded-full !p-0 aspect-square shrink-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
              disabled={(!draft.trim() && !selectedFile) || isLocked || Boolean(selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext && selectedFileStatus !== 'Checking Vyral DNA…')}
              aria-label="Send message"
            >
              <ArrowUp size={17} />
            </Button>
          </div>
        </form>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="chat-history-title" className="max-h-[min(80vh,620px)] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--vyra-border-subtle)] px-4 py-3.5">
              <div>
                <h2 id="chat-history-title" className="text-sm font-bold text-[var(--vyra-text-primary)]">Recent chats</h2>
                <p className="mt-0.5 text-[10px] text-[var(--vyra-text-muted)]">Your conversations</p>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" className="grid size-8 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {sessions.filter((session) => !session.archived).length ? sessions.filter((session) => !session.archived).map((session) => (
                <button key={session.id} type="button" onClick={() => openSession(session)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--vyra-bg-hover)]">
                  <MessageSquare size={16} className="shrink-0 text-[var(--vyra-text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--vyra-text-primary)]">{session.title}</span>
                  <span className="shrink-0 text-[10px] text-[var(--vyra-text-muted)]">{session.updatedAt}</span>
                </button>
              )) : (
                <div className="px-5 py-12 text-center">
                  <Clock3 size={23} className="mx-auto text-[var(--vyra-text-muted)]" />
                  <p className="mt-3 text-xs font-semibold text-[var(--vyra-text-primary)]">No recent chats yet</p>
                  <p className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">Your conversations will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
