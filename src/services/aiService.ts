/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modular AI Service Interface
 *
 * Designed to separate provider-specific logic behind the VYRA server endpoint
 * from UI components. Never exposes API keys or secrets in client-side bundles.
 */

import { ChatMessage, ChatSuggestedAction, AIServiceStatus, ContentCategory } from '../types';
import type { WorkspaceAiContext } from '../types/workspaceAiContext';

export interface AIServiceRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  conversationId?: string;
  /** Optional verified Supabase session for server-side usage accounting. */
  accessToken?: string;
  /** Stable per-generation request ID used only for server-side idempotency. */
  idempotencyKey?: string;
  /** Owner-verified active Vyral context for natural conversational continuity. */
  activeVyralId?: string;
  /** Metadata for the exact locally attached File; bytes stay in the browser and are never sent to the text model. */
  uploadAttachment?: { clientDraftId: string; fileName: string; mimeType: string; sizeBytes: number };
  /** Last known Workspace page and user selections; context only, never authorization. */
  workspaceContext?: WorkspaceAiContext;
  /** Receives incremental text chunks for the live chat UI. */
  onTextDelta?: (chunk: string) => void;
  /** Cancels an in-flight provider request when the user stops generation. */
  signal?: AbortSignal;
  /** Small, derived image preview from a locally verified Vyral DNA package. */
  visionImages?: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string; assetId?: string; assetName?: string }[];
  /** Small, user-authorized PDF/audio source files; currently not sent until OpenAI multimodal support is enabled. */
  mediaFiles?: { mimeType: 'application/pdf' | 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/flac' | 'audio/aac'; data: string; assetId?: string; assetName?: string }[];
  context?: {
    category?: ContentCategory;
    targetFormat?: 'short_form' | 'long_form';
    aspectRatio?: '9:16' | '16:9' | '1:1';
  };
}

export interface AIServiceResult {
  content: string;
  operatorAction?: Record<string, unknown>;
  suggestedActions?: ChatSuggestedAction[];
  isPreviewNotice?: boolean;
  status: 'success' | 'preview' | 'error';
  errorMessage?: string;
  providerName?: string;
  modelName?: string;
  generationId?: string | null;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    costUsd: number | null;
  } | null;
}

export interface AIServiceProvider {
  name: string;
  model: string;
  checkStatus(accessToken?: string): Promise<AIServiceStatus>;
  generateResponse(request: AIServiceRequest): Promise<AIServiceResult>;
}

/**
 * Default Modular Provider: Server Proxy with Graceful Preview Mode
 *
 * 1. Checks if a server-side proxy route (/api/ai/chat) is available.
 * 2. If available, securely communicates with the backend without exposing keys.
 * 3. If unavailable, clearly and transparently operates in Preview Mode without fabricating
 *    fake AI generation or hallucinated scores.
 */
class ModularAIService implements AIServiceProvider {
  public name = 'OpenAI (VYRA Platform)';
  public model = 'gpt-4.1-mini';
  private endpoint = '/api/ai/chat';

  public async checkStatus(accessToken?: string): Promise<AIServiceStatus> {
    if (!accessToken) {
      return {
        status: 'preview_mode',
        providerName: this.name,
        modelName: this.model,
        backendEndpoint: this.endpoint,
        message: 'Sign in to VYRA to check the platform-managed OpenAI connection.',
      };
    }

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify({ ping: true }),
        cache: 'no-store',
      });

      const data = await res.json().catch(() => ({})) as {
        status?: string;
        modelName?: string;
        message?: string;
        error?: string;
      };
      const modelName = typeof data.modelName === 'string' && data.modelName.trim()
        ? data.modelName.trim()
        : this.model;
      this.model = modelName;

      const status: AIServiceStatus['status'] =
        data.status === 'connected' ? 'connected' :
        data.status === 'error' || !res.ok ? 'error' : 'preview_mode';

      return {
        status,
        providerName: this.name,
        modelName,
        backendEndpoint: this.endpoint,
        message: typeof data.message === 'string' && data.message.trim()
          ? data.message
          : typeof data.error === 'string' && data.error.trim()
            ? data.error
            : status === 'connected'
              ? 'Connected to the server-side OpenAI AI engine.'
              : 'OpenAI is not configured yet. A platform administrator can add the key in Admin Dashboard.',
      };
    } catch {
      return {
        status: 'error',
        providerName: this.name,
        modelName: this.model,
        backendEndpoint: this.endpoint,
        message: 'VYRA AI Chat could not reach the platform connection check. Check the Preview deployment and retry.',
      };
    }
  }

  public async generateResponse(request: AIServiceRequest): Promise<AIServiceResult> {
    // VYRA no longer routes any request to Gemini. Until OpenAI multimodal
    // support is enabled in the platform Edge Function, fail clearly instead
    // of silently falling back to another provider.
    if (request.visionImages?.length || request.mediaFiles?.length) {
      const message = 'OpenAI text chat is available. Image, document and audio inspection will be enabled after the OpenAI multimodal path is connected.';
      return { content: message, status: 'error', errorMessage: message, providerName: 'OpenAI', modelName: this.model };
    }

    if (!request.accessToken) {
      const message = 'Sign in to VYRA before using AI Chat.';
      return { content: message, status: 'error', errorMessage: message, providerName: 'OpenAI', modelName: this.model };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: 'Bearer ' + request.accessToken,
          ...(request.idempotencyKey ? { 'Idempotency-Key': request.idempotencyKey } : {}),
        },
        signal: request.signal,
        body: JSON.stringify({
          stream: true,
          messages: request.messages.filter((message) => message.role !== 'system'),
          ...(request.conversationId ? { conversationId: request.conversationId } : {}),
          ...(request.activeVyralId ? { activeVyralId: request.activeVyralId } : {}),
          ...(request.uploadAttachment ? { uploadAttachment: request.uploadAttachment } : {}),
          ...(request.workspaceContext ? { workspaceContext: request.workspaceContext } : {}),
          ...(request.visionImages?.length ? { visionImages: request.visionImages } : {}),
          ...(request.mediaFiles?.length ? { mediaFiles: request.mediaFiles } : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string; modelName?: string };
        const message = typeof data.error === 'string' && data.error.trim()
          ? data.error
          : 'VYRA AI could not complete this request. Please retry.';
        return {
          content: message,
          status: 'error',
          errorMessage: message,
          providerName: 'OpenAI',
          modelName: typeof data.modelName === 'string' ? data.modelName : this.model,
        };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream') || !response.body) {
        const fallback = await response.json().catch(() => ({})) as {
          text?: string; error?: string; modelName?: string; usage?: AIServiceResult['usage'];
        };
        if (typeof fallback.text === 'string' && fallback.text.trim()) {
          return {
            content: fallback.text.trim(),
            status: 'success',
            providerName: 'OpenAI',
            modelName: typeof fallback.modelName === 'string' ? fallback.modelName : this.model,
            usage: fallback.usage ?? null,
          };
        }
        const message = typeof fallback.error === 'string' ? fallback.error : 'OpenAI returned an empty response. Please retry.';
        return { content: message, status: 'error', errorMessage: message, providerName: 'OpenAI', modelName: this.model };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let usage: AIServiceResult['usage'] = null;
      let streamModel = this.model;
      let operatorAction: Record<string, unknown> | undefined;
      const encodedOperatorAction = response.headers.get('X-Vyra-Operator-Action');
      if (encodedOperatorAction) {
        try { const parsed: unknown = JSON.parse(decodeURIComponent(encodedOperatorAction)); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) operatorAction = parsed as Record<string, unknown>; } catch { /* Ignore malformed non-authoritative metadata. */ }
      }
      let finished = false;
      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') { finished = true; return; }
        if (!payload) return;
        try {
          const event = JSON.parse(payload) as {
            model?: string;
            choices?: Array<{ delta?: { content?: string | null } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            vyra_action?: Record<string, unknown>;
          };
          if (typeof event.model === 'string') streamModel = event.model;
          if (event.vyra_action && typeof event.vyra_action === 'object' && !Array.isArray(event.vyra_action)) operatorAction = event.vyra_action;
          const chunk = event.choices?.[0]?.delta?.content;
          if (typeof chunk === 'string' && chunk.length) {
            content += chunk;
            request.onTextDelta?.(chunk);
          }
          if (event.usage) {
            usage = {
              promptTokens: event.usage.prompt_tokens ?? null,
              completionTokens: event.usage.completion_tokens ?? null,
              totalTokens: event.usage.total_tokens ?? null,
              costUsd: null,
            };
          }
        } catch {
          // Ignore malformed keep-alive or provider event lines; the final empty check remains authoritative.
        }
      };

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);
      } finally {
        reader.releaseLock();
      }

      if (!content.trim()) {
        const message = 'OpenAI returned an empty response. Please retry.';
        return { content: message, status: 'error', errorMessage: message, providerName: 'OpenAI', modelName: streamModel };
      }
      return {
        content,
        ...(operatorAction ? { operatorAction } : {}),
        status: 'success',
        providerName: 'OpenAI',
        modelName: streamModel,
        usage,
      };
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        const message = 'Generation stopped.';
        return { content: message, status: 'error', errorMessage: message, cancelled: true, providerName: 'OpenAI', modelName: this.model };
      }
      const message = 'Could not reach VYRA AI Chat. Check your connection and retry.';
      return { content: message, status: 'error', errorMessage: message, providerName: 'OpenAI', modelName: this.model };
    }
  }

  private detectPromptIntent(prompt: string): 'ideas' | 'script' | 'hooks' | 'outline' | 'storyboard' | 'general' {
    const lower = prompt.toLowerCase();
    if (lower.includes('script') || lower.includes('shorts') || lower.includes('dialogue')) {
      return 'script';
    }
    if (lower.includes('hook') || lower.includes('title') || lower.includes('headline')) {
      return 'hooks';
    }
    if (lower.includes('outline') || lower.includes('structure') || lower.includes('beat')) {
      return 'outline';
    }
    if (lower.includes('storyboard') || lower.includes('visual') || lower.includes('scene')) {
      return 'storyboard';
    }
    if (lower.includes('idea') || lower.includes('topic') || lower.includes('concept') || lower.includes('10')) {
      return 'ideas';
    }
    return 'general';
  }

  private constructPreviewResponse(
    userPrompt: string,
    intent: 'ideas' | 'script' | 'hooks' | 'outline' | 'storyboard' | 'general'
  ): AIServiceResult {
    const cleanTopic = userPrompt.length > 60 ? `${userPrompt.slice(0, 57)}...` : userPrompt;

    let content = '';
    const suggestedActions: ChatSuggestedAction[] = [];

    switch (intent) {
      case 'ideas':
        content = `### Video Concept Architecture & Angles\n\n` +
          `*Topic Focus:* **"${cleanTopic}"**\n\n` +
          `Here is a structured breakdown of high-retention angles for this concept:\n\n` +
          `1. **The Counter-Intuitive Angle:** Disprove a common assumption in your niche. Challenge conventional advice with recent data or emerging breakthroughs.\n` +
          `2. **The Deep-Dive Case Study:** Break down a specific real-world milestone or breakthrough step-by-step with timeline pacing.\n` +
          `3. **The 2030 Future Forecast:** Explore the 5-year trajectory of this topic and how viewers must prepare for the shift.\n\n` +
          `*Recommended Format:* 9:16 Vertical (Shorts / Reels) for discovery, followed by a 16:9 widescreen companion deep-dive.`;

        suggestedActions.push({
          label: 'Create Project from Idea',
          action: 'create_project',
          data: {
            title: cleanTopic,
            topic: userPrompt,
            category: 'Tech & AI',
            format: 'short_form',
          },
        });
        suggestedActions.push({
          label: 'Develop into Storyboard',
          action: 'develop_script',
          data: {
            title: cleanTopic,
            topic: userPrompt,
          },
        });
        break;

      case 'hooks':
        content = `### High-Retention Hook Frameworks\n\n` +
          `*Concept:* **"${cleanTopic}"**\n\n` +
          `**Hook 1 (Curiosity Gap):** "Almost everyone in tech gets this completely backwards. Here is what's actually happening..."\n\n` +
          `**Hook 2 (Statistical Shock):** "Within the next 24 months, 80% of traditional workflows will be obsolete for one specific reason."\n\n` +
          `**Hook 3 (Direct Transformation):** "If you want to master ${cleanTopic}, stop doing what everyone else is doing and follow this 3-step blueprint."\n\n` +
          `*Retention Rule:* Deliver the payoff within 12 seconds to prevent audience drop-off.`;

        suggestedActions.push({
          label: 'Save Hook Framework',
          action: 'save_idea',
          data: {
            title: `Hooks: ${cleanTopic}`,
            topic: userPrompt,
          },
        });
        suggestedActions.push({
          label: 'Create Project with Hook',
          action: 'create_project',
          data: {
            title: cleanTopic,
            topic: `Opening Hook: "Almost everyone gets this backwards..." ${userPrompt}`,
            category: 'Science & Future',
            format: 'short_form',
          },
        });
        break;

      case 'script':
        content = `### 60-Second Short-Form Video Script\n\n` +
          `*Title Draft:* **${cleanTopic}**\n*Pacing:* Fast (140-160 WPM) · 3 Key Beats\n\n` +
          `**[0:00 - 0:08] Hook & Pattern Interrupt:**\n` +
          `"Traditional methods just hit a ceiling. Here is how modern creators are leapfrogging the competition."\n\n` +
          `**[0:08 - 0:38] Core Mechanism & Visual Proof:**\n` +
          `"Step one is replacing manual execution with an automated storyboard pipeline. By routing narrative prompts into structured scenes, you eliminate 80% of editing friction."\n\n` +
          `**[0:38 - 0:50] Real-World Outcome:**\n` +
          `"The result is cinematic fidelity with rapid iteration cycles."\n\n` +
          `**[0:50 - 0:60] Call to Action:**\n` +
          `"Follow VYRA for daily breakdowns of synthetic video architecture."`;

        suggestedActions.push({
          label: 'Send Script to Storyboard',
          action: 'create_project',
          data: {
            title: cleanTopic,
            topic: userPrompt,
            category: 'Tech & AI',
            format: 'short_form',
          },
        });
        suggestedActions.push({
          label: 'Open Video Generator',
          action: 'develop_script',
          data: {
            title: cleanTopic,
            topic: userPrompt,
          },
        });
        break;

      case 'outline':
        content = `### Long-Form Video Outline Structure (10 Minutes)\n\n` +
          `*Working Title:* **Mastering ${cleanTopic}**\n\n` +
          `1. **Act I: The Changing Landscape (0:00 - 2:00)**\n` +
          `   - Opening hook & the core thesis\n` +
          `   - Why previous solutions failed to scale\n\n` +
          `2. **Act II: The Architectural Deep Dive (2:00 - 6:30)**\n` +
          `   - Phase 1: Idea validation & angle scoring\n` +
          `   - Phase 2: Multi-scene storyboard generation\n` +
          `   - Phase 3: Visual prompts & cinematic direction\n\n` +
          `3. **Act III: Practical Execution & Key Takeaways (6:30 - 9:30)**\n` +
          `   - Common pitfalls to avoid\n` +
          `   - Distribution strategy for YouTube and LinkedIn\n\n` +
          `4. **Conclusion & Resources (9:30 - 10:00)**\n` +
          `   - Final summary and community discussion prompt`;

        suggestedActions.push({
          label: 'Create Long-Form Project',
          action: 'create_project',
          data: {
            title: `Mastering ${cleanTopic}`,
            topic: userPrompt,
            category: 'Tech & AI',
            format: 'long_form',
          },
        });
        break;

      default:
        content = `### Creative Strategy Analysis\n\n` +
          `*Brainstorming Input:* **"${cleanTopic}"**\n\n` +
          `To turn this idea into a high-performing video package on VYRA:\n\n` +
          `- **Audience Resonance:** Identify the primary viewer pain point or curiosity trigger.\n` +
          `- **Pacing & Format:** For quick viral reach, choose **9:16 Vertical** with punchy 10-second scenes. For educational authority, choose **16:9 Widescreen**.\n` +
          `- **Visual Direction:** Pair with a distinctive visual style like *Cyber-Minimal* or *Hyper-Realistic 8K* in the storyboard workspace.\n\n` +
          `Choose one of the actions below to immediately initialize this concept into your studio workflow.`;

        suggestedActions.push({
          label: 'Create Project from Topic',
          action: 'create_project',
          data: {
            title: cleanTopic,
            topic: userPrompt,
            category: 'Tech & AI',
            format: 'short_form',
          },
        });
        suggestedActions.push({
          label: 'Save Idea to Scratchpad',
          action: 'save_idea',
          data: {
            title: cleanTopic,
            topic: userPrompt,
          },
        });
        break;
    }

    return {
      content,
      suggestedActions,
      isPreviewNotice: true,
      status: 'preview',
    };
  }
}

export const aiService = new ModularAIService();

export const STARTER_PROMPTS = [
  {
    category: 'Ideation',
    prompt: 'Give me 10 original YouTube video ideas about emerging AI technology and robotics.',
  },
  {
    category: 'Shorts & Reels',
    prompt: 'Create a 60-second YouTube Shorts script about optical quantum computing.',
  },
  {
    category: 'Hooks & Titles',
    prompt: 'Suggest 5 stronger high-retention hooks and viral titles for my next video.',
  },
  {
    category: 'Long-Form Outline',
    prompt: 'Develop this idea into a 10-minute YouTube video outline with act structures.',
  },
  {
    category: 'Visual Storyboard',
    prompt: 'Suggest a scene-by-scene storyboard with cinematic camera prompts and lighting.',
  },
];
