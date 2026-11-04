import React, { useMemo, useState } from 'react';
import {
  ArrowUp, Archive, Clock3, Copy, History, Lock, MessageSquare,
  MoreHorizontal, Plus, Share2, Trash2, Unlock, X,
} from 'lucide-react';
import { Button } from '../ui/Button';

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

export const AIChatPage: React.FC<AIChatPageProps> = ({ isAuthenticated, onLoginRequired }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

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
    if (!text || isLocked) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    setMessages((previous) => [...previous, { id: makeId(), role: 'user', content: text }]);
    setDraft('');
    if (!activeSessionId) setActiveSessionId(makeId());
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
    <main className="relative mx-auto h-[calc(var(--vyra-visual-viewport-top,0px)+var(--vyra-visual-viewport-height,100dvh)-109px)] min-h-0 w-full max-w-[var(--vyra-content-width)] overflow-hidden px-3 sm:h-[calc(var(--vyra-visual-viewport-top,0px)+var(--vyra-visual-viewport-height,100dvh)-64px)] sm:px-6">
      <header className="fixed right-3 top-[calc(var(--vyra-visual-viewport-top,0px)+112px)] z-[60] flex items-start justify-end sm:right-6 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+76px)]">
        <div
          className="relative overflow-hidden border border-[var(--vyra-border)] bg-white text-slate-800"
          style={{
            width: actionsOpen ? 208 : 40,
            height: actionsOpen ? 304 : 40,
            borderRadius: actionsOpen ? 16 : 9999,
            transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-0 top-0 z-10 size-10 rounded-full bg-white px-0 text-slate-800 hover:bg-slate-100"
            aria-label={actionsOpen ? 'Close chat menu' : 'Open chat menu'}
            title="Chat menu"
            onClick={() => setActionsOpen((open) => !open)}
          >
            {actionsOpen ? <X size={20} /> : <MoreHorizontal size={23} />}
          </Button>
          <div
            aria-hidden={!actionsOpen}
            className={`absolute inset-x-0 bottom-0 top-10 p-1.5 pt-1 text-slate-800 transition-opacity duration-200 ${actionsOpen ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
          >
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={() => { setHistoryOpen(true); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-100">
              <History size={14} /> Recent chats
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-100">
              <Plus size={14} /> New chat
            </button>
            <div className="my-1 border-t border-slate-200" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={shareCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
              <Share2 size={14} /> Share chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={archiveCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
              <Archive size={14} /> Archive chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={toggleLock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {isLocked ? 'Unlock chat' : 'Lock chat'}
            </button>
            <div className="my-1 border-t border-slate-200" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={deleteCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
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
            <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">မင်္ဂလာပါ။ ဘာဖန်တီးကြမလဲ?</h1>
            <p className="mt-2 max-w-md text-xs leading-5 text-[var(--vyra-text-secondary)] sm:text-sm">
              စိတ်ကူးတွေ ဆွေးနွေးနိုင်တယ်၊ Script ရေးနိုင်တယ်၊ Project တွေ စီစဉ်နိုင်တယ်။ VYRA နဲ့ပတ်သက်တာဖြစ်ဖြစ် အခြားအကြောင်းအရာဖြစ်ဖြစ် လွတ်လပ်စွာ မေးမြန်းနိုင်ပါတယ်။
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-1 pb-36 pt-20">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)]'}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
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
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2 focus-within:border-[var(--vyra-accent-primary)]/60">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
            rows={2}
            disabled={isLocked}
            placeholder={isLocked ? 'Chat locked' : 'Message VYRA AI…'}
            aria-label="Message VYRA AI"
            className="max-h-36 min-h-14 w-full resize-y bg-transparent px-2 py-2 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)] disabled:opacity-50"
          />
          <div className="flex items-center justify-end px-1 pb-1">
            <Button type="submit" size="sm" className="size-9 px-0" disabled={!draft.trim() || isLocked} aria-label="Send message">
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
