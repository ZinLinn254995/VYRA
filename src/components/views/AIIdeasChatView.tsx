/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useStudio } from '../../context/StudioContext';
import { STARTER_PROMPTS } from '../../services/aiService';
import { ChatMessage, ChatSuggestedAction } from '../../types';
import {
  Sparkles,
  Send,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  Copy,
  AlertCircle,
  RefreshCw,
  Info,
  Layers,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  PanelLeftClose,
  PanelLeft,
  Bot,
  User,
  Wand2,
  FolderPlus,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Terminal,
  Cpu,
  ExternalLink,
} from 'lucide-react';
import { AGENT_TOOLS_REGISTRY } from '../../services/agentTools';

const APP_CONTROL_PROMPTS = [
  {
    icon: '🚀',
    category: 'Project Control',
    label: 'Create Space Mysteries',
    prompt: 'Create a new project called Space Mysteries with 4 scenes',
  },
  {
    icon: '📋',
    category: 'Workspace Query',
    label: 'Show Draft Projects',
    prompt: 'Show me my projects that are still in draft',
  },
  {
    icon: '🎬',
    category: 'Storyboard Sequencing',
    label: 'Generate 4 Storyboard Scenes',
    prompt: 'Create a storyboard with 4 scenes for Quantum Computing',
  },
  {
    icon: '💡',
    category: 'Idea Scratchpad',
    label: 'Save Idea to Library',
    prompt: 'Save this idea to my library: The Physics of Warp Speed',
  },
  {
    icon: '🛡️',
    category: 'Editorial Workflow',
    label: 'Submit to Review Queue',
    prompt: 'Add this completed video to the review queue',
  },
  {
    icon: '📢',
    category: 'Publishing Prep',
    label: 'Prepare for YouTube Publishing',
    prompt: 'Prepare this video for YouTube publishing',
  },
];

export const AIIdeasChatView: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    activeConversation,
    createNewConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    sendMessage,
    isSendingMessage,
    chatError,
    retryLastMessage,
    aiStatus,
    savedIdeas,
    saveIdea,
    deleteSavedIdea,
    createProjectFromIdea,
    setCurrentSection,
    setActiveProjectId,
    executeToolDirectly,
    showToast,
  } = useStudio();

  // Input composer state
  const [inputText, setInputText] = useState('');
  const [searchConvQuery, setSearchConvQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chats' | 'saved_ideas'>('chats');
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, isSendingMessage]);

  // Handle Send
  const handleSend = async () => {
    if (!inputText.trim() || isSendingMessage) return;
    const textToSend = inputText;
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(textToSend);
  };

  // Keyboard navigation: Enter sends, Shift+Enter adds newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  // Copy message text
  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMsgId(msg.id);
    showToast('Response copied to clipboard', 'info');
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Rename conversation
  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingConvId(id);
    setEditTitleInput(currentTitle);
  };

  const handleSaveRename = (id: string) => {
    if (editTitleInput.trim()) {
      renameConversation(id, editTitleInput);
    }
    setEditingConvId(null);
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchConvQuery.toLowerCase()) ||
    c.messages.some((m) => m.content.toLowerCase().includes(searchConvQuery.toLowerCase()))
  );

  // Trigger suggested action
  const handleExecuteAction = (action: ChatSuggestedAction) => {
    if (action.action === 'create_project') {
      createProjectFromIdea({
        title: action.data?.title,
        topic: action.data?.topic,
        category: action.data?.category,
        format: action.data?.format,
      });
    } else if (action.action === 'save_idea') {
      saveIdea({
        title: action.data?.title || 'Saved Video Idea',
        concept: action.data?.topic || 'Creative concept from chat',
        category: action.data?.category || 'Tech & AI',
        tags: ['Chat Idea', 'Brainstorm'],
        sourceConversationId: activeConversationId || undefined,
      });
    } else if (action.action === 'develop_script') {
      setCurrentSection('create');
      showToast('Loaded concept into Create Video generator', 'info');
    }
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] max-w-7xl mx-auto rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden shadow-xl transition-colors">
      {/* 1. Conversations & Scratchpad Sidebar */}
      <aside
        className={`flex flex-col border-r border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50 transition-all duration-200 z-20 shrink-0
          ${sidebarOpen ? 'w-full md:w-80' : 'w-0 hidden md:flex md:w-0 overflow-hidden border-r-0'}
        `}
      >
        {/* Sidebar Header & New Chat button */}
        <div className="p-3.5 border-b border-[#2B3058] light:border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#55F4FF] light:text-[#6366F1]" />
              <h2 className="text-xs font-bold text-white light:text-slate-900 tracking-wide uppercase">
                Idea Brainstormer
              </h2>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white light:hover:text-slate-900 md:hidden"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => createNewConversation()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Brainstorm Chat</span>
          </button>

          {/* Tab Switcher (Chats vs Saved Ideas) */}
          <div className="flex items-center p-0.5 bg-[#171A35] light:bg-slate-200 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('chats')}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === 'chats'
                  ? 'bg-[#090B18] light:bg-white text-[#55F4FF] light:text-slate-900 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chats ({conversations.length})
            </button>
            <button
              onClick={() => setActiveTab('saved_ideas')}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === 'saved_ideas'
                  ? 'bg-[#090B18] light:bg-white text-[#55F4FF] light:text-slate-900 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved Ideas ({savedIdeas.length})
            </button>
          </div>

          {/* Search conversations */}
          {activeTab === 'chats' && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchConvQuery}
                onChange={(e) => setSearchConvQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-[#171A35] light:bg-white text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-[#55F4FF]"
              />
            </div>
          )}
        </div>

        {/* List of Conversations or Saved Ideas */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'chats' ? (
            filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const isEditing = editingConvId === conv.id;

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (!isEditing) selectConversation(conv.id);
                    }}
                    className={`group relative flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#171A35] light:bg-white text-white light:text-slate-900 font-semibold border border-[#2B3058] light:border-slate-200 shadow-xs'
                        : 'text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-[#13162C] light:hover:bg-slate-100'
                    }`}
                  >
                    {isEditing ? (
                      <div
                        className="flex items-center gap-1.5 w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitleInput}
                          autoFocus
                          onChange={(e) => setEditTitleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(conv.id);
                            if (e.key === 'Escape') setEditingConvId(null);
                          }}
                          className="flex-1 px-2 py-1 text-xs rounded bg-[#090B18] text-white border border-[#55F4FF] focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(conv.id)}
                          className="p-1 text-emerald-400 hover:text-emerald-300"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingConvId(null)}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="truncate text-xs">{conv.title}</p>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {conv.messages.length} msgs · {new Date(conv.updatedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Actions (Rename / Delete) */}
                        <div
                          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleStartRename(conv.id, conv.title)}
                            title="Rename"
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteConversation(conv.id)}
                            title="Delete"
                            className="p-1 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                No matching conversations found
              </div>
            )
          ) : (
            /* Saved Ideas Scratchpad */
            <div className="space-y-2">
              {savedIdeas.length > 0 ? (
                savedIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="p-3 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-white light:text-slate-900 line-clamp-1">
                        {idea.title}
                      </h4>
                      <button
                        onClick={() => deleteSavedIdea(idea.id)}
                        className="text-slate-500 hover:text-red-400 p-0.5"
                        title="Remove from scratchpad"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 light:text-slate-600 line-clamp-2">
                      {idea.concept}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {idea.category}
                      </span>
                      <button
                        onClick={() =>
                          createProjectFromIdea({
                            title: idea.title,
                            topic: idea.concept,
                            category: idea.category,
                          })
                        }
                        className="text-[11px] text-[#55F4FF] light:text-[#6366F1] font-semibold hover:underline flex items-center gap-1"
                      >
                        <span>Create Project</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  No ideas saved yet. Save concepts from the chat using the "Save Idea" action.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Footer with Temporary Local Storage Notice */}
        <div className="p-3 border-t border-[#2B3058] light:border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Local storage preview</span>
          <button
            onClick={() => setShowStatusModal(true)}
            className="text-[#55F4FF] light:text-[#6366F1] hover:underline"
          >
            Integration Details
          </button>
        </div>
      </aside>

      {/* 2. Main Chat Thread & Composer Area */}
      <section className="flex-1 flex flex-col min-w-0 bg-[#171A35] light:bg-white relative">
        {/* Chat Header Bar */}
        <div className="h-14 px-4 border-b border-[#2B3058] light:border-slate-200 flex items-center justify-between gap-3 bg-[#090B18]/70 light:bg-white/90 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Open conversation list"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-[#1E2345] light:hover:bg-slate-100"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-white light:text-slate-900 truncate">
                {activeConversation?.title || 'AI Ideas Chat'}
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>Model: {aiStatus.modelName}</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#55F4FF] light:text-[#6366F1] font-mono">
                  {aiStatus.status === 'connected' ? 'Connected' : 'Preview Mode'}
                </span>
              </div>
            </div>
          </div>

          {/* Status Badge & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowToolsModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#55F4FF]/10 text-[#55F4FF] light:text-[#6366F1] border border-[#55F4FF]/30 hover:bg-[#55F4FF]/20 transition-colors"
              title="Inspect registered application tools"
            >
              <Cpu className="w-3 h-3" />
              <span className="hidden sm:inline">Tools ({AGENT_TOOLS_REGISTRY.filter((t) => t.isOperational).length} Live)</span>
            </button>

            <button
              onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <Info className="w-3 h-3" />
              <span className="hidden sm:inline">Preview Mode</span>
            </button>

            <button
              onClick={() => createNewConversation()}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[#2B3058] light:border-slate-300 text-slate-300 light:text-slate-700 hover:bg-[#1E2345]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Message Thread Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Transparent Preview Mode Notice Banner */}
          <div className="p-3.5 rounded-xl bg-[#090B18]/70 light:bg-slate-50 border border-[#2B3058] light:border-slate-200 flex items-start gap-3 text-xs">
            <Info className="w-4 h-4 text-[#55F4FF] light:text-[#6366F1] shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed text-slate-300 light:text-slate-700">
              <span className="font-semibold text-white light:text-slate-900">
                Architectural Status Note:
              </span>
              <p className="text-slate-400 light:text-slate-600 text-[11px]">
                The AI Ideas Chat operates in modular Preview Mode. Real Gemini API credentials remain
                safely protected on the server side. You can brainstorm ideas, create structured
                storyboards, and convert any concept directly into a VYRA project.
              </p>
            </div>
          </div>

          {/* If conversation has messages */}
          {activeConversation && activeConversation.messages.length > 0 ? (
            activeConversation.messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {/* Assistant Avatar */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#8D7CFF] to-[#55F4FF] p-[1px] shrink-0 mt-0.5">
                      <div className="w-full h-full rounded-lg bg-[#090B18] flex items-center justify-center text-[#55F4FF]">
                        <Bot className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`max-w-2xl rounded-2xl p-4 space-y-3 transition-colors ${
                      isUser
                        ? 'bg-[#1E2345] light:bg-[#6366F1] text-white rounded-tr-xs shadow-sm'
                        : 'bg-[#090B18] light:bg-slate-100 text-slate-200 light:text-slate-900 border border-[#2B3058] light:border-slate-200 rounded-tl-xs'
                    }`}
                  >
                    {/* Message Header & Role */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 opacity-80 border-b border-white/10 pb-1.5">
                      <span className="font-semibold">{isUser ? 'You' : 'VYRA AI Partner'}</span>
                      <span className="font-mono tabular-nums">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Formatted Markdown Content */}
                    <div className="prose prose-invert max-w-none text-xs space-y-2 whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>

                    {/* Tool Executions Display */}
                    {!isUser && message.toolExecutions && message.toolExecutions.length > 0 && (
                      <div className="pt-2 space-y-2.5 border-t border-[#2B3058]/80 light:border-slate-200">
                        {message.toolExecutions.map((exec) => {
                          const isSuccess = exec.status === 'success';
                          const isConfirmation = exec.status === 'requires_confirmation';
                          const isUnsupported = exec.status === 'unsupported';
                          const isFailed = exec.status === 'failed';
                          const isExecuting = exec.status === 'executing';

                          return (
                            <div
                              key={exec.id}
                              className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                                isSuccess
                                  ? 'bg-[#0E1E2E] light:bg-emerald-50/70 border-emerald-500/40 light:border-emerald-200'
                                  : isConfirmation
                                  ? 'bg-[#2A1E14] light:bg-amber-50/80 border-amber-500/40 light:border-amber-200'
                                  : isUnsupported
                                  ? 'bg-[#221633] light:bg-purple-50/70 border-purple-500/40 light:border-purple-200'
                                  : isFailed
                                  ? 'bg-[#2B151C] light:bg-red-50/70 border-red-500/40 light:border-red-200'
                                  : 'bg-[#171A35] light:bg-slate-50 border-[#2B3058]'
                              }`}
                            >
                              {/* Tool Header */}
                              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center">
                                    <Terminal className="w-3 h-3 text-[#55F4FF] light:text-indigo-600" />
                                  </div>
                                  <span className="font-bold text-white light:text-slate-900 text-xs">
                                    {exec.displayName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    [{exec.toolName}]
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {isSuccess && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 light:text-emerald-700 border border-emerald-500/30">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Action Executed</span>
                                    </span>
                                  )}
                                  {isConfirmation && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 light:text-amber-700 border border-amber-500/30">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Confirmation Needed</span>
                                    </span>
                                  )}
                                  {isUnsupported && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 light:text-purple-700 border border-purple-500/30">
                                      <Info className="w-3 h-3" />
                                      <span>Pending WP2 Pipeline</span>
                                    </span>
                                  )}
                                  {isFailed && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 light:text-red-700 border border-red-500/30">
                                      <XCircle className="w-3 h-3" />
                                      <span>Failed</span>
                                    </span>
                                  )}
                                  {isExecuting && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#55F4FF]/20 text-[#55F4FF] border border-[#55F4FF]/30">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>Executing...</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Summary */}
                              {exec.outputSummary && (
                                <p className="text-[11px] text-slate-300 light:text-slate-700 leading-relaxed font-sans">
                                  {exec.outputSummary}
                                </p>
                              )}

                              {/* Error */}
                              {exec.errorMessage && (
                                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 light:text-red-600">
                                  {exec.errorMessage}
                                </div>
                              )}

                              {/* Output Data List if array */}
                              {exec.outputData && Array.isArray(exec.outputData) && exec.outputData.length > 0 && (
                                <div className="p-2 rounded-lg bg-[#090B18]/70 light:bg-white/80 border border-white/5 space-y-1 max-h-36 overflow-y-auto">
                                  {exec.outputData.map((item: any, iIdx: number) => (
                                    <div key={item.id || iIdx} className="flex items-center justify-between text-[10px] text-slate-400">
                                      <span className="font-semibold text-slate-200 light:text-slate-800 truncate mr-2">
                                        {item.title || item.name || `Item ${iIdx + 1}`}
                                      </span>
                                      <span className="font-mono text-slate-500 shrink-0">
                                        {item.status ? item.status.replace('_', ' ') : item.duration || item.category || ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Resource Navigation Button */}
                              {exec.resourceLink && (
                                <div className="pt-0.5">
                                  <button
                                    onClick={() => {
                                      if (exec.resourceLink?.resourceId) {
                                        setActiveProjectId(exec.resourceLink.resourceId);
                                      }
                                      if (exec.resourceLink?.section) {
                                        setCurrentSection(exec.resourceLink.section);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-all shadow-xs"
                                  >
                                    <span>{exec.resourceLink.label}</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {/* Confirmation Interactive Actions */}
                              {isConfirmation && (
                                <div className="pt-2 border-t border-amber-500/20 flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      await executeToolDirectly(exec.toolName, {
                                        ...exec.inputArgs,
                                        confirmed: true,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Confirm & Permanently Delete</span>
                                  </button>
                                  <button
                                    onClick={() => showToast('Action cancelled', 'info')}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-slate-400 hover:text-white transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Suggested Action Buttons if Assistant message */}
                    {!isUser && message.suggestedActions && message.suggestedActions.length > 0 && (
                      <div className="pt-2 border-t border-[#2B3058]/80 light:border-slate-200 flex flex-wrap gap-2">
                        {message.suggestedActions.map((action, actionIdx) => (
                          <button
                            key={`${action.action}-${actionIdx}`}
                            onClick={() => handleExecuteAction(action)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E2345] light:bg-white border border-[#55F4FF]/40 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-all shadow-xs"
                          >
                            {action.action === 'create_project' && <FolderPlus className="w-3.5 h-3.5" />}
                            {action.action === 'save_idea' && <Bookmark className="w-3.5 h-3.5" />}
                            {action.action === 'develop_script' && <Wand2 className="w-3.5 h-3.5" />}
                            <span>{action.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Copy Response Action */}
                    {!isUser && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleCopyMessage(message)}
                          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                        >
                          {copiedMsgId === message.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedMsgId === message.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-[#2B3058] light:bg-slate-300 flex items-center justify-center text-white shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Empty State: Live App Control & Brainstorming Prompts */
            <div className="max-w-3xl mx-auto py-6 text-center space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#8D7CFF] to-[#55F4FF] p-[1.5px] mx-auto">
                <div className="w-full h-full rounded-2xl bg-[#090B18] flex items-center justify-center text-[#55F4FF]">
                  <Wand2 className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white light:text-slate-900">
                  What video would you like to create or manage?
                </h3>
                <p className="text-xs text-slate-400 light:text-slate-600 max-w-lg mx-auto">
                  VYRA AI can execute real actions across your studio workspace or brainstorm creative video concepts, scripts, and hooks.
                </p>
              </div>

              {/* Section 1: Live Application Control Commands */}
              <div className="text-left space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white light:text-slate-900 uppercase tracking-wider">
                    <Terminal className="w-3.5 h-3.5 text-[#55F4FF] light:text-[#6366F1]" />
                    <span>App-Control Commands (Live Execution)</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#55F4FF] light:text-[#6366F1]">
                    Direct Workspace Actions
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {APP_CONTROL_PROMPTS.map((cmd, cIdx) => (
                    <button
                      key={cIdx}
                      onClick={() => {
                        setInputText(cmd.prompt);
                        if (textareaRef.current) textareaRef.current.focus();
                      }}
                      className="p-3 rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50 hover:border-[#55F4FF]/50 light:hover:border-indigo-400 transition-all text-xs space-y-1 text-left group"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-mono text-[#55F4FF] light:text-[#6366F1] font-semibold flex items-center gap-1">
                          <span>{cmd.icon}</span>
                          <span>{cmd.category}</span>
                        </span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#55F4FF]" />
                      </div>
                      <p className="font-semibold text-slate-200 light:text-slate-900 line-clamp-1 group-hover:text-white">
                        {cmd.label}
                      </p>
                      <p className="text-[10px] text-slate-400 light:text-slate-600 line-clamp-1 italic">
                        "{cmd.prompt}"
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 2: Creative Brainstorming & Outlines */}
              <div className="text-left space-y-2.5 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 light:text-slate-800 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-[#8D7CFF]" />
                  <span>Creative Ideation & Scripts</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STARTER_PROMPTS.map((promptItem, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => {
                        setInputText(promptItem.prompt);
                        if (textareaRef.current) textareaRef.current.focus();
                      }}
                      className="p-3 rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50 hover:border-[#8D7CFF]/50 light:hover:border-indigo-400 transition-all text-xs space-y-1 text-left group"
                    >
                      <span className="text-[10px] font-mono text-[#8D7CFF] font-semibold">
                        {promptItem.category}
                      </span>
                      <p className="text-slate-300 light:text-slate-800 line-clamp-2 group-hover:text-white transition-colors">
                        "{promptItem.prompt}"
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isSendingMessage && (
            <div className="flex gap-3 text-xs items-center text-slate-400">
              <div className="w-7 h-7 rounded-lg bg-[#090B18] border border-[#2B3058] flex items-center justify-center text-[#55F4FF]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="p-3 rounded-xl bg-[#090B18] border border-[#2B3058] text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#55F4FF] animate-pulse" />
                <span>Synthesizing creative concepts and angles...</span>
              </div>
            </div>
          )}

          {/* Error Banner with Retry */}
          {chatError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{chatError}</span>
              </div>
              <button
                onClick={retryLastMessage}
                className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 3. Multiline Message Composer */}
        <div className="p-3 sm:p-4 border-t border-[#2B3058] light:border-slate-200 bg-[#090B18]/90 light:bg-white/95">
          <div className="relative rounded-xl border border-[#2B3058] light:border-slate-300 bg-[#171A35] light:bg-slate-50 focus-within:border-[#55F4FF] transition-all p-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask for video ideas, hooks, full scripts, or storyboard visual prompts..."
              className="w-full bg-transparent text-xs text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed max-h-44 px-1"
            />

            <div className="flex items-center justify-between pt-1 border-t border-[#2B3058]/50 light:border-slate-200 text-[10px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">Press Enter to send · Shift+Enter for newline</span>
                <span className="sm:hidden">Enter to send</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono">{inputText.length} chars</span>
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || isSendingMessage}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Status Modal */}
      {showStatusModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#2B3058]/60 pb-3">
              <h3 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-[#55F4FF]" />
                <span>AI Service Integration Architecture</span>
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 light:text-slate-700 leading-relaxed">
              <div className="p-3 rounded-lg bg-[#090B18] space-y-1 font-mono text-[11px] text-[#55F4FF]">
                <div>PROVIDER: {aiStatus.providerName}</div>
                <div>TARGET_MODEL: {aiStatus.modelName}</div>
                <div>STATUS: {aiStatus.status}</div>
                <div>ENDPOINT: {aiStatus.backendEndpoint}</div>
              </div>

              <p>
                In accordance with security standards, all Gemini API keys remain strictly server-side.
                In this preview phase, conversations and idea scratchpads are stored safely in your
                local workspace.
              </p>

              <p className="text-slate-400 text-[11px]">
                When real backend endpoints are mounted in WP2, the client seamlessly routes chat
                requests through the server proxy without code changes.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#55F4FF] text-[#090B18]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registered Application Tools Modal */}
      {showToolsModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#2B3058] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#55F4FF]/10 flex items-center justify-center text-[#55F4FF] light:text-[#6366F1]">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white light:text-slate-900">
                    Application Control Tools Registry
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {AGENT_TOOLS_REGISTRY.filter((t) => t.isOperational).length} operational tools · {AGENT_TOOLS_REGISTRY.length} total registered interfaces
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowToolsModal(false)}
                className="text-slate-400 hover:text-white light:hover:text-slate-900 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              <p className="text-xs text-slate-300 light:text-slate-700 leading-relaxed">
                The VYRA Conversational Agent translates natural-language commands into verified application actions. Operational tools execute live state operations against your workspace, with destructive actions requiring explicit confirmation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                {AGENT_TOOLS_REGISTRY.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-3 rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-white light:text-slate-900">
                        {tool.displayName}
                      </span>
                      {tool.isOperational ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 light:text-emerald-700 border border-emerald-500/30">
                          Live
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-300 light:text-purple-700 border border-purple-500/30">
                          WP2 Pipeline
                        </span>
                      )}
                    </div>
                    <code className="text-[10px] text-[#55F4FF] light:text-[#6366F1] font-mono block">
                      {tool.name}
                    </code>
                    <p className="text-[11px] text-slate-400 light:text-slate-600 leading-tight">
                      {tool.description}
                    </p>
                    {tool.requiresConfirmation && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-400">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        <span>Requires Confirmation</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#2B3058] flex items-center justify-between bg-[#090B18]/50 light:bg-slate-50">
              <span className="text-[10px] text-slate-400">
                Type or speak commands naturally in chat to execute
              </span>
              <button
                onClick={() => setShowToolsModal(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#55F4FF] text-[#090B18]"
              >
                Close Registry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
