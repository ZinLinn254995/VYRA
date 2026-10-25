/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modular AI Service Interface
 *
 * Designed to separate provider-specific logic (e.g. Google Gemini 2.5/Flash, custom endpoints)
 * from UI components. Never exposes API keys or secrets in client-side bundles.
 */

import { ChatMessage, ChatSuggestedAction, AIServiceStatus, ContentCategory } from '../types';

export interface AIServiceRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  conversationId?: string;
  context?: {
    category?: ContentCategory;
    targetFormat?: 'short_form' | 'long_form';
    aspectRatio?: '9:16' | '16:9' | '1:1';
  };
}

export interface AIServiceResult {
  content: string;
  suggestedActions?: ChatSuggestedAction[];
  isPreviewNotice?: boolean;
  status: 'success' | 'preview' | 'error';
  errorMessage?: string;
}

export interface AIServiceProvider {
  name: string;
  model: string;
  checkStatus(): Promise<AIServiceStatus>;
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
  public name = 'Google Gemini AI (Server-Proxy Ready)';
  public model = 'gemini-2.5-flash';
  private endpoint = '/api/ai/chat';

  public async checkStatus(): Promise<AIServiceStatus> {
    try {
      const openRouterKey = typeof window !== 'undefined' ? sessionStorage.getItem('vyra_openrouter_key_session') : null;
      if (openRouterKey) {
        let selectedTextModel = '';
        try {
          const selections = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as { text?: string };
          selectedTextModel = selections.text || '';
        } catch { /* use provider default status label */ }
        return {
          status: 'connected',
          providerName: 'OpenRouter',
          modelName: selectedTextModel || 'Select a Text model in Settings',
          backendEndpoint: '/api/providers/openrouter/chat',
          message: 'OpenRouter key was verified in this browser session. The next request will confirm live model access.',
        };
      }
    } catch {
      // Session storage may be unavailable in private browsing modes.
    }

    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (data.geminiConfigured === true && data.status === 'connected') {
          return {
            status: 'connected',
            providerName: this.name,
            modelName: data.modelName || this.model,
            backendEndpoint: this.endpoint,
            message: 'Connected to the server-side Gemini AI engine.',
          };
        }
        return {
          status: 'preview_mode',
          providerName: this.name,
          modelName: data.modelName || this.model,
          backendEndpoint: this.endpoint,
          message: typeof data.message === 'string'
            ? data.message
            : 'The VYRA server is available, but Gemini has not been verified yet.',
        };
      }
    } catch {
      // The backend may not be running (for example, on a static-only deployment).
    }

    return {
      status: 'preview_mode',
      providerName: this.name,
      modelName: this.model,
      backendEndpoint: this.endpoint,
      message:
        'Preview Mode active: the server-side Gemini endpoint is unavailable. No API secrets are exposed to the browser.',
    };
  }

  public async generateResponse(request: AIServiceRequest): Promise<AIServiceResult> {
    const latestUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';

    let openRouterKey = '';
    let selectedTextModel = '';
    try {
      openRouterKey = typeof window !== 'undefined' ? sessionStorage.getItem('vyra_openrouter_key_session') || '' : '';
      const selections = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as { text?: string };
      selectedTextModel = selections.text || '';
    } catch {
      // If browser session storage is unavailable, continue to the configured server provider.
    }

    if (openRouterKey) {
      if (!selectedTextModel) {
        return {
          content: 'Open Settings and discover/select a Text model before using OpenRouter chat.',
          status: 'error',
          errorMessage: 'OPENROUTER_TEXT_MODEL_NOT_SELECTED',
        };
      }
      try {
        const response = await fetch('/api/providers/openrouter/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-openrouter-api-key': openRouterKey,
          },
          body: JSON.stringify({ ...request, model: selectedTextModel }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof data.error === 'string' ? data.error : 'The OpenRouter request failed.';
          return { content: message, status: 'error', errorMessage: message };
        }
        const content = typeof data.text === 'string' ? data.text.trim() : '';
        if (!content) {
          return { content: 'The selected OpenRouter model returned an empty response.', status: 'error', errorMessage: 'Empty OpenRouter response.' };
        }
        return { content, status: 'success' };
      } catch {
        return {
          content: 'Could not reach the VYRA OpenRouter endpoint. Check the server connection and try again.',
          status: 'error',
          errorMessage: 'OpenRouter endpoint unavailable.',
        };
      }
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.text || data.content;
        if (typeof content === 'string' && content.trim()) {
          return {
            content,
            suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : undefined,
            status: 'success',
          };
        }
        return {
          content: 'The AI server returned an empty or invalid response. Please try again.',
          status: 'error',
          errorMessage: 'Invalid response from /api/ai/chat.',
        };
      }

      // If the route exists but Gemini fails or is unconfigured, do not disguise that as a preview answer.
      if (response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        const message = typeof data.error === 'string' ? data.error : 'The AI request failed.';
        return {
          content: message,
          status: 'error',
          errorMessage: message,
        };
      }
    } catch {
      // A missing backend (e.g. static-only hosting) can still use the clearly-labelled preview mode.
    }

    const intent = this.detectPromptIntent(latestUserMessage);
    return this.constructPreviewResponse(latestUserMessage, intent);
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
