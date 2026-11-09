# Global VYRA AI Chat

**Status:** Product direction and architecture planning document; implementation has not started.  
**Branch:** `feature/global-ai-chat`  
**Scope:** Global AI Chat as VYRA's primary conversational, visual, and action interface.

## 1. Product Vision

Global VYRA AI Chat is not merely a text chatbot. It is the main intelligent interface through which a user can understand, navigate, create, manage, and operate VYRA.

A user should be able to describe an intention in natural language. AI should understand the request, decide what information or action is needed, choose the most useful way to present the result, and carry out permitted work through VYRA's tools.

The user should not need to know which page, menu, editor, provider, or technical workflow is required. AI should coordinate those details and explain only what the user needs to know.

**Core principle: “One Chat. The Whole VYRA.”**

## 2. Three Unified Responsibilities

Global AI Chat combines three responsibilities in one experience.

### 2.1 Conversation

- Understand natural-language requests and follow-up instructions.
- Answer questions and explain VYRA features.
- Maintain relevant conversation context.
- Ask a concise clarification only when essential information is missing.
- Explain what it plans to do when the action is consequential or when the user needs to make a decision.

### 2.2 Visualization

AI can present information using the most useful interface for the current context, rather than returning text for everything.

Possible presentation types include:

- Plain text, headings, highlights, and callouts.
- Bulleted and numbered lists.
- Tables and comparison tables.
- Checklists and status indicators.
- Cards and grouped collections.
- Icons and compact metadata.
- Progress indicators and task status.
- Bar, line, and pie charts where data supports them.
- Image galleries and image previews.
- Video players and video previews.
- Audio and voice players.
- Interactive choices, filters, and controls.
- File, project, media, and Storyboard previews.
- Contextual action controls, such as Open, Edit, Save, Retry, or View details.

These are examples of supported presentation categories to design for, not a claim that they already exist.

### 2.3 Execution

Where authorized, AI can use VYRA's application capabilities to:

- Navigate the user to relevant pages or open a particular project.
- Search, inspect, organize, and manage the user's VYRA content.
- Create and update Storyboards and Scenes.
- Generate media through connected generation services.
- Save generated results to My Media Library.
- Prepare previews and exports.
- Perform other supported application tasks through controlled tools.

AI must distinguish between explaining an action, proposing an action, starting an action, and confirming that the action actually succeeded.

## 3. AI Chooses the Presentation Automatically

**The user should not have to request a chart, table, card, gallery, or other layout. AI should select the most useful presentation automatically.**

The presentation should match the user's intent and the available data:

| User intent or result | Preferred presentation |
|---|---|
| Explain a concept | Clear conversational response |
| Compare several options | Comparison table or concise option cards |
| Show a collection of projects | Project cards or a grouped list |
| Show numerical trends | Chart with labels and useful values |
| Show task completion | Progress and checklist |
| Offer a decision | Clear options with brief explanations |
| Show generated images | Image preview or gallery |
| Show generated video | Video player and relevant actions |
| Show generated audio or voice | Audio player and relevant actions |
| Show a long-running task | Live task status and progress |
| Open a VYRA destination | Contextual navigation action |

AI may combine formats when that makes the answer clearer. It should not overload a response with unnecessary widgets.

### 3.1 Presentation rules

- Choose the simplest presentation that communicates the result well.
- Use structured layouts when they materially improve understanding or interaction.
- Keep text and controls readable on mobile screens as well as desktop.
- Do not show irrelevant controls.
- Keep actions close to the content they affect.
- Preserve accessibility, keyboard support where applicable, and clear labels.
- Fall back to readable text if a rich component cannot be rendered.

## 4. Dynamic UI Architecture

AI must not send arbitrary executable React, JavaScript, HTML, or CSS for the application to run.

Instead, the system should use a controlled **Dynamic UI Renderer**.

### 4.1 How it works

1. The model interprets the request.
2. It returns a validated structured response describing content, presentation intent, and any proposed actions.
3. VYRA validates the structure against approved schemas.
4. The renderer maps supported presentation types to trusted, prebuilt UI components.
5. The client renders the result and manages permitted local interactions.
6. Any application-changing action is sent to the authorized backend tool layer.
7. The backend checks identity, permissions, input validity, and relevant business rules before execution.
8. The UI reports the real result returned by the backend.

### 4.2 Component registry

Maintain a predefined registry of approved components. Initial categories should include:

- Text and rich-text blocks.
- Lists and checklists.
- Tables.
- Cards and grouped layouts.
- Status badges and progress.
- Charts.
- Image and media galleries.
- Video and audio players.
- Forms and selection controls.
- Navigation links and action controls.
- Loading, empty, error, and confirmation states.

Each component must have a defined schema, supported properties, interaction behavior, and safe rendering rules. The model can select and populate approved components, but it cannot invent executable components at runtime.

### 4.3 Validation and fallback

- Validate all model-produced structured output.
- Reject unknown component types and unsupported properties.
- Validate URLs and action identifiers before use.
- Treat model output and retrieved content as untrusted data.
- Render a safe text fallback if structured output is invalid.
- Never let malformed UI data interrupt the entire conversation.
- Version schemas so the client and server can evolve safely.

## 5. Navigation and Contextual App Control

Users should be able to ask AI to take them to the relevant place in VYRA.

Examples:

- “Open My Storyboard.”
- “Show my latest project.”
- “Take me to the Assets page.”
- “Open this Scene.”
- “Show my generated images.”

The AI response may include a direct navigation action or open the relevant destination when the user requests it.

Navigation behavior must:
- Use registered internal routes or destination identifiers, not arbitrary model-generated code.
- Check that the destination exists and that the user has access.
- Preserve relevant project or item context when opening a page.
- Avoid silently changing or deleting data during navigation.
- Provide a clear way to return to the conversation.

For actions that change content, AI should use application tools rather than pretending that a navigation event completed the work.

## 6. Multimodal Generation and Media Results

Global AI Chat should support a unified conversational entry point for different media-generation capabilities as providers and features become available.

### 6.1 Image generation

A user can describe an image in chat. The system should:
- Understand the request and gather essential missing details only when needed.
- Route the request to an appropriate image-generation provider.
- Show generation status.
- Display the resulting image in chat.
- Offer relevant actions such as Save to My Media Library, Edit, or Regenerate.

### 6.2 Video generation

A user can request a video using natural language. The system should:
- Understand the desired output and any important constraints.
- Select an available video-generation capability.
- Run long jobs asynchronously.
- Show genuine job status and errors.
- Display the completed result using a video player.
- Offer relevant actions such as Save, Revise, or Use in a Storyboard.

### 6.3 Audio, music, and voice

The chat should eventually support:
- Audio and music generation.
- Speech and voice generation.
- Voice-related transformations where supported.
- Audio previews and playback.
- Saving completed results to My Media Library.

### 6.4 Provider independence

Do not hard-code the product around one media provider. Use a provider-adapter approach so VYRA can add, replace, or compare services without redesigning the chat experience.

Provider selection should consider supported capability, quality, latency, cost, availability, and policy constraints. The user-facing experience should remain consistent where possible.

### 6.5 Media Library boundary

Standalone media generated through Global AI Chat is saved to **My Media Library** when the user chooses to save it or when an explicitly approved workflow defines automatic saving.

- A library item does not automatically become an Asset in a Vyral.
- A library item does not automatically become part of a Storyboard or Scene.
- The user may later choose an item for another workflow.
- The UI must clearly distinguish generated output, saved library media, Vyral Assets, and Storyboard content.

## 7. My Storyboard Integration

Global AI Chat is the primary AI interface for My Storyboard creation and coordination.

Subject to supported tools and permissions, the user should be able to ask AI to:
- Create a Storyboard.
- Plan and create Scenes.
- Generate or select suitable media.
- Arrange Scene content.
- Add or revise text, voice, music, and transitions.
- Review the overall production.
- Make requested revisions.
- Prepare preview and export.

AI should perform as much of the work as it can reliably perform. The user mainly reviews results and makes creative decisions.

The three editor levels documented in `my-storyboard.md` remain available as focused manual workspaces:
1. Storyboard Master Editor.
2. Individual Scene Editor.
3. Individual Media Editors.

Entering an editor should not be mandatory when AI can complete the requested task reliably. The user can open an editor for precise manual adjustments.

## 8. Tool and Action Architecture

The model should not directly access databases, secrets, or unrestricted infrastructure.

VYRA should expose a controlled set of backend tools. Each tool should have:
- A clear purpose and narrow scope.
- A validated input schema.
- Authentication and authorization checks.
- Explicit side-effect classification.
- Structured success and failure results.
- Audit information where appropriate.
- Idempotency or duplicate protection for operations that may be retried.

### 8.1 Action categories

**Read actions:** Search, list, inspect, preview, and retrieve information the user is authorized to access.

**Navigation actions:** Open approved VYRA destinations or specific authorized records.

**Creation actions:** Create projects, Storyboards, Scenes, media-generation jobs, and other supported resources.

**Update actions:** Rename, revise, rearrange, or update existing resources.

**Destructive actions:** Delete, permanently remove, overwrite, or perform other difficult-to-reverse operations.

### 8.2 Confirmation and permissions

- Read-only actions can generally proceed when the user requests them and access is valid.
- Low-risk reversible actions may follow the user's clear instruction.
- Destructive, sensitive, costly, or difficult-to-reverse actions should require an appropriate confirmation before execution.
- Never bypass access control because a request appears in chat.
- Never expose another user's private content.
- Never claim an action succeeded until the backend confirms success.
- If an action fails, explain the failure and do not display a false success state.

The exact confirmation policy and action-risk matrix must be finalized during implementation planning.

## 9. Conversation Context and Continuity

Global AI Chat should understand relevant context across a conversation so users can give natural follow-up instructions without repeating everything.

Examples:
- “Make that image brighter.”
- “Use the second option.”
- “Add this to the Scene we were editing.”
- “Make the video shorter.”
- “Show me the previous result.”

The system should maintain the minimum relevant context needed to resolve references, including:
- Current conversation and recent turns.
- Selected project, Storyboard, Scene, or media item.
- Active generation or processing jobs.
- Relevant user preferences and permissions.
- Results and identifiers returned by tools.

Context must be scoped carefully. A reference to one project must not accidentally modify another. When the target is ambiguous and the consequence matters, ask one direct clarification.

The design should distinguish conversation history from durable user preferences and from application records. Application data must be read from authoritative application services rather than assumed from chat history.

## 10. Long-Running Tasks and Streaming

Some operations, especially video generation, media processing, and export, may take time.

The chat should support:
- Streaming text responses where supported.
- Immediate acknowledgement when a job is accepted.
- A persistent job identifier and real status.
- Progress updates when the provider or backend supplies genuine progress information.
- Completion, failure, cancellation, and retry states.
- Results that remain accessible if the user navigates away and returns.

Do not invent percentage progress or fake activity. If exact progress is unavailable, use honest states such as “Queued,” “Processing,” or “Waiting for provider.”

## 11. Cost, Credits, and Usage Transparency

AI and media operations may have different costs. VYRA should track usage at the backend and associate costs with the relevant operation.

The chat experience should eventually:
- Show an estimate before a costly operation when a reliable estimate is available.
- Clearly identify when an operation will consume credits.
- Request confirmation when required by the pricing and risk policy.
- Record actual usage and cost returned by providers.
- Avoid charging twice for duplicate retries or repeated requests where idempotency can prevent it.
- Show clear outcomes when a job fails, is cancelled, or only partially completes.
- Never invent a price or claim that an operation is free without authoritative pricing information.

Credit transfers, account balances, and billing rules must be enforced by backend services, not by model-generated UI.

## 12. UX Principles

Global AI Chat should follow these principles:

1. **Natural first:** Users describe what they want; they should not need to learn technical commands.
2. **AI chooses the UI:** Users should not need to specify whether they want a chart, table, list, or card.
3. **Simple and uncluttered:** Show only what helps with the current request.
4. **Mobile-first responsive:** The experience must work comfortably on a phone and scale to larger screens.
5. **Context-aware:** Keep relevant project and task context without confusing separate items.
6. **Honest status:** Clearly distinguish planned, running, completed, and failed actions.
7. **Human control:** Users can review, approve, revise, or manually adjust results.
8. **Progressive capability:** Introduce advanced controls only when relevant.
9. **Consistent experience:** Keep navigation, media previews, actions, and status patterns consistent.
10. **Graceful failure:** Errors should be understandable and should not destroy the conversation.

## 13. Security, Privacy, and Reliability

- Authenticate every request and authorize every application action on the server.
- Treat model output, user prompts, uploaded files, retrieved documents, and provider responses as untrusted input.
- Protect against prompt injection in retrieved content and media metadata.
- Keep API keys and provider secrets on the server.
- Apply rate limits, quotas, abuse controls, and cost limits.
- Validate file types, file sizes, and media-processing requests.
- Use secure storage and access-controlled media URLs.
- Avoid sending private user content to a provider unless required for the requested operation and permitted by the applicable privacy design.
- Log meaningful action outcomes without unnecessarily recording sensitive prompt or media content.
- Provide cancellation and recovery paths for long-running jobs.
- Test permission boundaries, malformed model output, tool failures, retries, and concurrent edits.

## 14. Suggested Technology Direction

The final stack must be confirmed after inspecting the existing VYRA repository and its current framework. Do not replace working project foundations without a demonstrated need.

The following is a technology direction, not a locked implementation decision:

| Area | Candidate direction | Responsibility |
|---|---|---|
| Frontend | Existing VYRA React/TypeScript stack, if confirmed | Chat interface and app integration |
| AI orchestration | Vercel AI SDK or a compatible server-side orchestration layer | Streaming, model interaction, tool calling |
| Model API | Provider adapter, with OpenAI Responses API as one candidate | Reasoning, multimodal understanding, tool use |
| UI components | Existing design system; potentially Tailwind and shadcn/ui if compatible | Consistent interface |
| Icons | Lucide or existing icon system | Clear visual actions |
| Schema validation | Zod or equivalent | Validate model output and tool inputs |
| Dynamic UI | VYRA-owned component registry and renderer | Render safe structured UI |
| Charts | A maintained chart library selected during implementation | Data visualization |
| Media generation | Provider adapters for image, video, audio, and speech | Generate media |
| Background work | Existing backend job system or a suitable queue/workflow service | Long-running generation and export |
| Persistence | Existing VYRA database and storage architecture | Conversation, jobs, media, and app data |

Do not assume a particular SDK version or API feature until it has been checked against current documentation and the actual repository.

## 15. Incremental Implementation Roadmap

Build the system in verified stages. The architecture should be extensible, but avoid implementing every future capability at once.

### Phase 0 — Repository and architecture audit
- Inspect the current VYRA app, framework, backend, authentication, database, storage, and deployment setup.
- Identify existing chat or AI infrastructure, if any.
- Confirm compatibility and select the smallest safe architecture.
- Record decisions before changing foundational technologies.

### Phase 1 — Core Global Chat
- Build the chat interface.
- Connect a server-side model integration.
- Support streaming responses and conversation history.
- Add basic error and loading states.
- Establish secure server-side configuration.

### Phase 2 — Structured and Dynamic UI
- Define response schemas and component registry.
- Render text, lists, tables, cards, checklists, and status.
- Add charts and contextual interactive controls.
- Validate output and implement safe fallbacks.
- Verify mobile and desktop behavior.

### Phase 3 — Navigation and Read Tools
- Add authorized search and read tools.
- Open relevant VYRA pages and records from chat.
- Keep project and item context accurate.
- Test access control and navigation fallbacks.

### Phase 4 — Media Generation
- Integrate image generation first, then audio/voice and video according to feasibility.
- Add provider adapters.
- Add background jobs for long-running work.
- Show real status and media previews.
- Add Save to My Media Library and clear library boundaries.

### Phase 5 — App Actions and My Storyboard
- Add controlled create and update tools.
- Integrate Storyboard and Scene workflows.
- Let AI coordinate multi-step creation.
- Add confirmation for risky, destructive, or costly actions.
- Keep manual editors available for user-directed adjustments.

### Phase 6 — Reliability and Production Readiness
- Add usage and credit accounting.
- Add rate limits, quotas, audit events, and operational monitoring.
- Test retries, cancellations, concurrency, permissions, and provider failures.
- Evaluate output quality and user experience.
- Release capabilities gradually.

Each phase should be tested and reviewed before moving to the next. A later phase must not be described as complete merely because it is documented.

## 16. Open Design Decisions

The following details require further discussion or repository inspection before implementation:
- Exact chat layout and conversation navigation.
- Model selection, routing, and fallback strategy.
- How conversation context is stored and scoped.
- Exact component schemas and interaction rules.
- Which VYRA pages and application tools are exposed to AI.
- Confirmation policy for each action category.
- Supported image, video, audio, and speech providers.
- Job persistence, cancellation, and retry behavior.
- Credit estimation, charging, refunds, and usage display.
- Privacy controls and data retention.
- Voice input and spoken responses, if included.
- File uploads and multimodal input support.
- Testing, observability, and production rollout.

## 17. Scope and Implementation Status

This document records the product vision and proposed architecture for Global VYRA AI Chat. It does not mean that the chat, dynamic renderer, charts, navigation tools, media generation, or app-control capabilities have been implemented.

All technology choices remain subject to repository inspection and compatibility checks. Detailed workflows and safety rules must be reviewed before implementation.

**Product principle: One Chat. The Whole VYRA. AI Does the Work. You Make the Decisions.**
