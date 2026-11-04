import React, { useMemo, useState } from 'react';
import {
  ArrowUp, Bot, Clock3, Copy, FileText, History,
  ImagePlus, MessageSquare, MoreHorizontal, Plus, Sparkles, X,
} from 'lucide-react';
import { Button } from '../ui/Button';

type ChatMode = 'chat' | 'workspace';
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
type ChatSession = { id: string; title: string; updatedAt: string; messages: ChatMessage[] };

type AIChatPageProps = {
  isAuthenticated: boolean;
  onLoginRequired: () => void;
};

const starterPrompts = [
  { icon: FileText, title: 'Write a script', description: 'Develop a story or video script' },
  { icon: ImagePlus, title: 'Create a character', description: 'Build a reusable character' },
  { icon: Sparkles, title: 'Plan a video', description: 'Turn an idea into a video plan' },
  { icon: MessageSquare, title: 'Brainstorm ideas', description: 'Explore creative directions' },
];

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const AIChatPage: React.FC<AIChatPageProps> = ({ isAuthenticated, onLoginRequired }) => {
  const [mode, setMode] = useState<ChatMode>('chat');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const hasMessages = messages.length > 0;
  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    return firstUserMessage.length > 42 ? firstUserMessage.slice(0, 42) + '…' : firstUserMessage || 'New chat';
  }, [messages]);

  const startNewChat = () => {
    if (messages.length > 0) {
      const session: ChatSession = {
        id: activeSessionId ?? makeId(),
        title: currentTitle,
        updatedAt: 'Just now',
        messages,
      };
      setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
    }
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setHistoryOpen(false);
    setMoreOpen(false);
  };

  const openSession = (session: ChatSession) => {
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setHistoryOpen(false);
  };

  const sendMessage = (value = draft) => {
    const text = value.trim();
    if (!text) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { id: makeId(), role: 'user', content: text }];
    setMessages(nextMessages);
    setDraft('');
    if (!activeSessionId) setActiveSessionId(makeId());
  };

  const handleCopy = (content: string) => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(content);
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-7.5rem)] w-full max-w-[var(--vyra-content-width)] flex-col px-3 pb-4 pt-4 sm:min-h-[calc(100vh-4rem)] sm:px-6 sm:pt-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-[var(--vyra-text-primary)]">VYRA AI</h1>
            <p className="text-[11px] text-[var(--vyra-text-muted)]">Your creative assistant</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="size-9 px-0" aria-label="New chat" title="New chat" onClick={startNewChat}>
            <Plus size={18} />
          </Button>
          <Button size="sm" variant="ghost" className="size-9 px-0" aria-label="Chat history" title="Chat history" onClick={() => setHistoryOpen(true)}>
            <History size={18} />
          </Button>
          <div className="relative">
            <Button size="sm" variant="ghost" className="size-9 px-0" aria-label="More chat options" title="More options" onClick={() => setMoreOpen((open) => !open)}>
              <MoreHorizontal size={19} />
            </Button>
            {moreOpen && (
              <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-1.5 shadow-xl">
                <button type="button" onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">
                  <Plus size={14} /> Start a new chat
                </button>
                <button type="button" onClick={() => { setHistoryOpen(true); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">
                  <History size={14} /> View chat history
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-1">
          <button type="button" onClick={() => setMode('chat')} aria-pressed={mode === 'chat'} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'chat' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)] shadow-sm' : 'text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]'}`}>
            <span className="inline-flex items-center gap-1.5"><MessageSquare size={14} /> Chat</span>
          </button>
          <button type="button" onClick={() => setMode('workspace')} aria-pressed={mode === 'workspace'} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'workspace' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)] shadow-sm' : 'text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]'}`}>
            <span className="inline-flex items-center gap-1.5"><Bot size={14} /> Workspace</span>
          </button>
        </div>
        {mode === 'workspace' ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--vyra-text-secondary)]">
            <span className="size-1.5 rounded-full bg-amber-400" /> No workspace selected
          </span>
        ) : (
          <span className="hidden text-[11px] text-[var(--vyra-text-muted)] sm:block">General conversation</span>
        )}
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 sm:py-12">
            <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] shadow-lg shadow-cyan-950/10">
              <Sparkles size={25} />
            </div>
            <h2 className="text-center text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">
              {mode === 'workspace' ? 'Let’s work on your project' : 'What would you like to create?'}
            </h2>
            <p className="mt-2 max-w-md text-center text-xs leading-5 text-[var(--vyra-text-secondary)] sm:text-sm">
              {mode === 'workspace'
                ? 'Choose a workspace task or tell VYRA AI what you want to do. Workspace context integration is coming next.'
                : 'Talk through an idea, write a script, or plan your next creative project.'}
            </p>
            <div className="mt-7 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {starterPrompts.map(({ icon: Icon, title, description }) => (
                <button key={title} type="button" onClick={() => setDraft(title + ': ')} className="group flex items-center gap-3 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-3.5 text-left transition hover:border-[var(--vyra-accent-primary)]/50 hover:bg-[var(--vyra-bg-hover)]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-secondary)] transition group-hover:text-[var(--vyra-accent-primary)]"><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--vyra-text-primary)]">{title}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--vyra-text-muted)]">{description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 py-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><Sparkles size={16} /></span>}
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)]'}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && <button type="button" onClick={() => handleCopy(message.content)} className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]"><Copy size={12} /> Copy</button>}
                </div>
              </div>
            ))}
            <div className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><Sparkles size={16} /></span>
              <div className="max-w-[88%] rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-4 py-3 text-xs leading-5 text-[var(--vyra-text-secondary)]">
                <p className="font-semibold text-[var(--vyra-text-primary)]">AI connection not set up yet</p>
                <p className="mt-1">Your message is shown in this interface, but VYRA AI needs an AI provider connection before it can generate replies. We’ll connect the model and chat history in the next integration step.</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto w-full max-w-3xl pt-4">
        {mode === 'workspace' && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2 text-[10px] text-[var(--vyra-text-muted)]">
            <Bot size={13} /> Workspace-aware actions will be connected after the chat foundation.
          </div>
        )}
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2 shadow-lg shadow-black/10 focus-within:border-[var(--vyra-accent-primary)]/60">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
            rows={2}
            placeholder={mode === 'workspace' ? 'Ask VYRA AI to help with your workspace…' : 'Message VYRA AI…'}
            aria-label="Message VYRA AI"
            className="max-h-36 min-h-14 w-full resize-y bg-transparent px-2 py-2 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)]"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)]">
              <button type="button" disabled title="File uploads will be connected later" className="grid size-8 place-items-center rounded-lg opacity-50"><ImagePlus size={17} /></button>
              <span className="hidden sm:inline">Shift + Enter for a new line</span>
            </div>
            <Button type="submit" size="sm" className="size-9 px-0" disabled={!draft.trim()} aria-label="Send message">
              <ArrowUp size={17} />
            </Button>
          </div>
        </form>
        <p className="mt-2 text-center text-[10px] text-[var(--vyra-text-muted)]">VYRA AI can make mistakes. Review important changes before confirming.</p>
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
              {sessions.length ? sessions.map((session) => (
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
            <div className="border-t border-[var(--vyra-border-subtle)] p-3">
              <Button block size="md" onClick={startNewChat} startIcon={<Plus size={15} />}>New chat</Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
