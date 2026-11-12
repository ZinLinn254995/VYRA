# VYRA AI Chat MVP — Delivery Roadmap

**Status:** Accepted implementation direction  
**Document role:** Source of truth for the first usable VYRA AI Chat MVP  
**Working branch:** `feature/my-storyboard` only  
**Release boundary:** Preview/development only unless the user explicitly authorizes a production release  
**Plan:** Six sequential phases with a verification gate at the end of each phase

---

## 1. Purpose

Build one useful, reliable AI Chat that can:

1. Talk naturally with the user and understand the current task.
2. Control supported parts of the VYRA application through authorized tools.
3. Generate media and files through configured providers.
4. Save, find, organize, and hand generated assets into the existing VYRA workspace.

The first milestone is a practical MVP, not a complete autonomous creative platform. Do not expand scope into unrelated features until this six-phase path is complete and verified.

## 2. Product principles that must not change

- **One Chat. The Whole VYRA.** AI Chat is the single conversational control surface for supported VYRA operations. Workspace, Storyboard, and Media Library remain visual interfaces for direct/manual work; they are not separate AI assistants.
- **Simple for the user; complexity handled behind the scenes.** The user should describe the goal naturally. VYRA handles provider routing, tool execution, job tracking, and asset persistence.
- **Use the existing application architecture.** Extend current authentication, server routes, Supabase, Storage, Workspace, Storyboard, and Asset systems. Do not create parallel project or media stores.
- **Server-side secrets only.** Provider API keys must never be returned to the browser, embedded in client bundles, or written into logs.
- **Explicit authorization.** The AI may only access the signed-in user's permitted data and tools. It must not infer permission from conversational wording alone for consequential actions.
- **Approval for consequential actions.** Ask for confirmation before destructive actions, publishing, purchases, or other externally visible/irreversible actions. Low-risk navigation and ordinary reads may run without an extra confirmation.
- **Truthful status.** Never tell the user that a file was saved, a generation completed, or an app action succeeded until the backend confirms it.
- **Keep the existing Vyral/DNA direction intact.** AI Chat may use Asset DNA, fingerprints, Vyral context, and authorized asset retrieval where already supported. This roadmap does not replace or weaken those systems.
- **No unrelated scope.** Do not add analytics dashboards, billing features, team administration, marketplace features, or advanced agent orchestration as part of this MVP unless separately approved.

## 3. MVP capability boundary

### Included

- Text-based conversational AI with useful multi-turn context.
- App navigation and a small, explicit set of supported VYRA actions.
- Image, audio, and video generation through configured providers where provider capability and credentials are available.
- File/media output handling, storage, and handoff to existing VYRA asset/workspace flows.
- Generation progress, completion, and actionable error reporting.
- Basic usage/cost safeguards and permission checks required to operate the above safely.

### Not required for this first MVP

- A fully autonomous agent that can perform every action in VYRA.
- Voice-call/live voice conversation or speech input. Audio *generation* is in scope; live voice interaction is not implied by the word “chat.”
- Advanced multi-agent workflows, complex workflow builders, or a complete model marketplace.
- Every possible media format, editing operation, or third-party integration.
- A full enterprise-grade admin/role management system.

## 4. Six-phase implementation plan

### Phase 1 — Admin Dashboard and provider readiness

**Goal:** Make the existing Admin Dashboard a safe, working place to configure the API keys needed by the MVP.

**Work:**
- Keep the Dashboard reachable from Profile's Platform section.
- Keep this first version focused on provider API-key management only. Do not add unrelated dashboard features.
- Make OpenAI the primary provider for conversational AI and supported OpenAI media capabilities.
- Add only the additional provider credentials actually required for media types that OpenAI does not provide or that the project chooses to route elsewhere. Select and document a video provider before implementing its integration; do not invent or hardcode a provider.
- For each configured key, provide connection status, server-side verification, save/replace behavior, and safe error messages.
- Store secrets in the server-side secret store (Supabase Vault or the approved server secret mechanism). Return configuration status only, never the secret itself.
- Keep provider selection/routing in server code, not in client code.
- The current temporary access policy allows ordinary signed-in accounts to reach the Dashboard as explicitly requested by the owner. This is a temporary development convenience, not an acceptable public-production security policy. Before public launch, restrict key management to an authorized platform-admin role.
- Do not require users/customers to supply their own API keys as the default product experience.
- **Credential purchase/configuration timing:** Do not purchase or add the OpenAI API key during early implementation. Build and validate the provider integration, chat flow, app tools, media routing, persistence, and cost safeguards first. Add the paid key only at the final provider-backed end-to-end verification stage, when it is actually needed. Until then, a missing key is an expected state, not a reason to block key-independent development.

**Acceptance gate (split to respect the no-upfront-key decision):**
- **Key-independent gate now:** a signed-in user can open the Dashboard; missing-key status is shown truthfully; the save/verify path and server-side Vault boundary are implemented; no secret is returned to the browser; Development/Preview is isolated from Production.
- **Credential gate at Phase 6:** only after Chat, app actions, media routing, persistence, and safeguards are ready, purchase/add the OpenAI key and verify valid-key save, invalid-key rejection, replacement, and provider-backed end-to-end behavior.
- Do not mark Phase 1 fully complete until both gates pass. Phase 2–5 may proceed against explicit missing-key behavior and automated mocks/stubs that never claim real provider success.

### Phase 2 — Reliable conversational foundation

**Goal:** Make AI Chat a useful conversational interface before expanding its tool powers.

**Work:**
- Connect the chat server route to the configured primary OpenAI provider.
- Support multi-turn conversation context and clear conversation boundaries.
- Persist and reload conversation history using the authenticated user's ownership scope.
- Handle loading, streaming or progressive responses where supported, retryable errors, provider timeouts, and empty/error states.
- Keep the existing global Chat UI direction: one chat surface, simple composer, attachments/context where supported, no separate assistant products.
- Do not send unrelated private assets or hidden application data to the model. Include only the context needed for the current request and authorized by the user.

**Acceptance gate:**
- A user can start a conversation, ask follow-up questions, refresh, and continue the correct conversation.
- Conversation data is isolated by user.
- Provider errors and missing-key states are understandable and do not expose credentials.
- The assistant does not claim to have performed actions it has not performed.

### Phase 3 — Controlled VYRA app actions

**Goal:** Let AI Chat operate a defined set of VYRA features through secure backend tools.

**Initial tool scope:**
- Navigate to supported VYRA pages/areas.
- Read the current user's permitted workspace/storyboard context.
- Create a storyboard/project through existing application services when the required inputs are available.
- Search and list the current user's authorized media/assets.
- Create folders or organize assets only through existing permission-checked services, where supported.
- Return clear results and links/navigation targets to the UI.

**Safety and execution rules:**
- Define each tool with a narrow input schema, authenticated user context, authorization checks, and validated output.
- The model may request a tool; the server independently validates the request and permission.
- Never accept arbitrary SQL, arbitrary filesystem paths, arbitrary URLs, or unrestricted server commands from model output.
- Confirm before delete, overwrite, publish, purchase, or other consequential actions.
- Do not add a tool merely because the model can describe it. Implement and test the underlying server action first.

**Acceptance gate:**
- At least one real supported app action can be requested in natural language and completed through a server-validated tool.
- Unauthorized users cannot read or modify another user's data.
- Confirmation gates work for consequential actions.
- Tool failure is reported honestly and safely.

### Phase 4 — Media generation

**Goal:** Allow the user to request media creation through the same Chat.

**Work:**
- Implement image generation through the configured provider.
- Implement audio/voice generation through a verified compatible provider/model.
- Implement video generation through a selected and verified video provider.
- Route each task on the server according to configured provider capability; do not expose provider secrets to the browser.
- Validate prompts, parameters, file types, output sizes, and provider responses.
- Support asynchronous jobs for long-running generations: queued, running, succeeded, failed, and cancelled where supported.
- Show generation progress and return a result only after the provider/backend confirms it.
- Keep model/quality choices simple and understandable. Do not add a large model marketplace.

**Acceptance gate:**
- At least one successful end-to-end generation is verified for each media category that is declared enabled (image, audio, video).
- Missing provider credentials disable only the affected capability and show a clear explanation.
- Timeouts, provider errors, and malformed outputs are handled without false success messages.
- Usage/cost limits prevent accidental runaway requests.

### Phase 5 — Files, assets, and workspace handoff

**Goal:** Make generated results usable inside VYRA rather than leaving them as temporary chat responses.

**Work:**
- Persist generated files in the existing VYRA Storage/Asset architecture.
- Attach ownership, MIME type, size, source job, provider/model metadata where appropriate, and integrity metadata.
- Allow users to find and reopen their generated files from the relevant existing Library/Workspace surfaces.
- Allow Chat to hand selected/generated assets into an existing storyboard/workspace flow.
- Support safe retry/recovery for interrupted uploads or generation completion callbacks.
- Use existing Asset DNA/Fingerprint/Vyral processes where applicable; do not create a competing metadata system.
- Respect visibility, licensing, and ownership rules when reusing or sharing assets.

**Acceptance gate:**
- A generated file remains available after refresh and can be opened from the user's library/workspace.
- A user cannot access another user's private generated files by guessing an ID or URL.
- Chat-to-Workspace handoff uses the correct asset and version.
- Storage failures are visible and recoverable; no success is claimed before persistence is confirmed.

### Phase 6 — End-to-end verification and MVP readiness

**Goal:** Prove that the complete core journey works reliably before calling the MVP ready.

**Test journeys:**
1. Sign in → open Chat → have a multi-turn conversation.
2. Ask Chat to navigate to a supported VYRA area.
3. Ask Chat to create a supported storyboard/project action and verify the result in the visual UI.
4. Ask Chat to generate an image and verify the saved Asset.
5. Ask Chat to generate audio and verify the saved Asset.
6. Ask Chat to generate video and verify the saved Asset.
7. Ask Chat to find a saved Asset and hand it into a storyboard/workspace flow.
8. Verify confirmation gates for destructive/external actions.
9. Verify missing/invalid API keys, provider timeouts, failed jobs, and interrupted uploads.
10. Verify user isolation, secret protection, and Development/Production environment separation.

**Acceptance gate:**
- The above journeys pass in the intended Preview/Development environment.
- Automated tests cover critical server tools, permissions, provider routing, persistence, and failure paths.
- Build/type checks and relevant test suites pass for the exact commit being evaluated.
- Remaining limitations are documented accurately.
- Production deployment, production secret changes, and branch merging require separate explicit authorization.

---

## 5. Delivery order and change control

The implementation order is:

1. Admin Dashboard/provider readiness foundation (key-independent portion)
2. Conversational foundation
3. Controlled app actions
4. Media generation
5. File/Asset/Workspace handoff
6. End-to-end verification, including the deferred Phase 1 credential gate

The OpenAI key purchase/configuration is deliberately delayed until Phase 6. This means Phase 1's credential acceptance checks remain open while key-independent work in Phases 2–5 proceeds. Do not describe Phase 1 as fully complete until its deferred credential gate passes.

Do not skip ahead by building a large generation UI before the provider and backend path is ready. Do not broaden the scope during implementation without recording and agreeing on the change first.

At the end of each phase:
- report what was implemented;
- report what remains;
- run the relevant automated checks;
- distinguish verified results from unverified assumptions;
- proceed to the next phase only when the acceptance gate is satisfied or the owner explicitly accepts a documented exception.

## 6. Branch, environment, and release constraints

- Continue on **`feature/my-storyboard`**. Do not switch branches or create a new branch for this roadmap.
- Keep work in Development/Preview while implementing and validating the MVP.
- Do not merge to `main`, deploy Production, or mutate Production secrets/database without explicit user approval.
- Preserve existing VYRA Storyboard, Workspace, Asset, Vyral, DNA, Fingerprint, and licensing behavior. Changes must be additive and compatible unless the owner approves a deliberate change.
- This roadmap governs the first AI Chat MVP workstream. It does not claim that any phase is already complete merely because it is documented.

## 7. Current baseline and next action

The repository has an initial Admin Dashboard/API-key management foundation for the OpenAI key, backed by a Development Supabase secret-management function. That foundation is not proof that OpenAI Chat or all generation types are connected. The OpenAI key has not been supplied/configured and must remain unpurchased/unconfigured until the final provider-backed end-to-end verification stage. Continue all key-independent implementation and tests first.

### Phase 2 progress — OpenAI text-chat server integration

- Added the authenticated `vyra-openai-chat` Supabase Edge Function and deployed it to the Development project with JWT verification enabled.
- The Edge Function reads the shared OpenAI key only through the server-side Vault RPC. It never returns the secret to the browser.
- Routed the global AI Chat text path through this OpenAI function; OpenAI is now the single default conversational provider. The previous optional user-supplied OpenRouter/Gemini fallback has been removed from the main chat client path.
- Fixed model choice for the first text-chat integration at `gpt-4.1-mini`; user-facing model selection can be added after the basic chat path is verified.
- When no key exists, the service returns an explicit `OPENAI_NOT_CONFIGURED` response instead of generating fake preview text or silently switching providers.
- The general text-chat path is OpenAI-only. Existing authenticated Vyral Vision and selected-source inspection paths are preserved separately so this provider change does not regress the DNA workflow; broader image/audio/video generation and unified media routing remain in Phase 4.
- The Admin Dashboard remains the only place to configure the platform key. Do not purchase or save the key until final verification.

**Current verification:** Development Edge Function deployment is ACTIVE with `verify_jwt=true`. The OpenAI text-chat integration and streaming code have passed GitHub CI and the added streaming contract tests. Cloudflare Preview for the latest commit is still running. Live provider behavior remains gated on the final API-key setup.

### Phase 2 progress — conversation history foundation

The following key-independent work has been implemented on `feature/my-storyboard`:

- Added `public.vyra_ai_chat_conversations` in the Development Supabase project.
- Enabled RLS and verified owner-scoped SELECT/INSERT/UPDATE/DELETE policies for `authenticated`; anonymous access is not granted.
- Added authenticated-user history loading, automatic transcript/state persistence, and deletion to the AI Chat UI.
- Conversation records store text messages and safe display metadata only; binary attachment data and provider secrets are not stored in chat history.
- Chat history reload is tied to Supabase auth changes, and active chat state is cleared when the account signs out or changes.

**Verification status:** The Development table, RLS policies, and owner-scoped SELECT/INSERT/UPDATE/DELETE policies have been queried and confirmed. Baseline implementation commit `849315e5b14fa0f7eb6c24695d77a410604b0f55` passed the complete GitHub verification workflow, including TypeScript, Supabase Edge Function type-check, all listed regression suites, and production build. Its Cloudflare Preview build `e43788be-d97e-4665-97b5-6c38a97bdea4` completed successfully. The latest code and UI regression fix are verified separately in the progress section below. The updated Development Edge Function is ACTIVE at version 2 with `verify_jwt=true`. The signed-in browser flow (save → refresh → reopen and cross-account isolation) has not yet been manually exercised. Live provider streaming cannot be exercised until the intentionally deferred OpenAI API key is configured at Phase 6, so full Phase 2 acceptance remains open.

**Next action:** Complete key-independent Preview checks for history save → refresh → reopen, follow-up context, and cross-account isolation. At Phase 6, add the OpenAI key and verify live partial streaming plus retry after provider failure. Do not purchase/configure the OpenAI API key before Phase 6. Do not treat a phase as complete until its acceptance gate has been met.

### Phase 2 progress — progressive OpenAI responses

- Updated the Development `vyra-openai-chat` Edge Function to request OpenAI streaming output and forward its server-sent event stream. API credentials remain server-side in Vault.
- Updated the authenticated Node server route to proxy the stream without buffering the complete response first, while preserving JSON error responses for missing keys and provider failures.
- Updated the browser AI service to parse streamed text deltas and usage metadata. The normal text-chat path now requests streaming; the separate Vyral Vision path remains non-streaming and unchanged in provider behavior.
- Updated the Chat UI to append the assistant message as chunks arrive. If a stream fails after partial output, the partial text remains visible with the failure message rather than being presented as a complete success.
- Added a safe Retry action for failed text-only conversations. It resubmits the previous user text; attachments and selected Asset requests are intentionally excluded because their original source payload is not persisted in the transcript.
- Existing Supabase conversation persistence continues to save the transcript as it grows; no duplicate chat-history table was created.

**Verification status:** Implementation is committed on `feature/my-storyboard`. The latest GitHub CI run passed, including TypeScript, Supabase Edge Function type-check, all listed regression suites, and production build. Cloudflare Preview build `3e5ea3a7-2eb4-4b24-8960-5c5acf8c049d` succeeded, and Development Supabase Edge Function version 2 is ACTIVE with JWT verification enabled. The code/build/type-check path is verified. Live provider streaming and retry behavior remain unverified until the deferred OpenAI API key is added at Phase 6; signed-in browser history and cross-account checks also remain to be exercised.

### UI preservation rule — confirmed

The existing AI Chat UI is a user-approved design and is now treated as a visual baseline. Future work must preserve its current layout, spacing, typography, colors, controls, responsive behavior, and interaction patterns. Add functionality through existing components and interaction areas; do not redesign, rearrange, or replace the chat UI. Any necessary addition must fit the current design language and must not disturb existing visual structure.

### Phase 2 progress — reliability and regression protection

- Fixed a streaming error edge case: if the provider returns an error after sending partial text, the UI now retains the received text and appends the error instead of replacing the partial response.
- Added a safe Retry action for failed text-only requests in the existing assistant message action row; no new panel, dialog, or layout was introduced.
- Added dedicated OpenAI Chat streaming contract tests covering authenticated Edge Function setup, server-side secret access, SSE forwarding, browser delta parsing, usage metadata, Vyral Vision path preservation, partial-response retention, and retry wiring.
- Added the new `vyra-openai-chat` Edge Function to the CI Deno type-check list (previously it was deployed but omitted from that explicit type-check command).

**Verification status:** GitHub Actions run `43283530331` passed, including TypeScript, OpenAI Chat streaming contract tests, Supabase Edge Function type-check (now including `vyra-openai-chat`), all existing regression suites, and production build. Cloudflare Preview build `f335bdfd-c026-466b-813c-84da4c190d6e` for the documentation-updated commit `70b2a10e5853efb4700235d08a4239ee6c83374c` completed successfully. GitHub Actions run `43283787337` for the same commit also passed. No production deployment or merge was performed.

**Remaining Phase 2 acceptance:** Signed-in browser tests for history save → refresh → reopen, follow-up context, and cross-account isolation. Live OpenAI streaming and retry after provider failure must be exercised after the API key is configured at Phase 6. The existing Chat UI visual baseline must remain unchanged.

### Phase 3 progress — first safe Workspace action

- Connected the existing global AI Chat to the real Workspace Storyboard inventory without changing the chat UI.
- Added a deterministic read-only command for English and Burmese requests such as “Show my storyboards” and “ငါ့ Storyboard တွေ ပြပေး”.
- The action reads the signed-in account's `vyral_storyboards` rows using an explicit `user_id` filter and merges them with that same account's device cache using the existing timestamp-aware merge helper.
- The response reports actual Storyboard titles, topics, scene counts, and update dates. Empty results are reported honestly; no demo or fabricated Storyboards are inserted.
- The action does not create, edit, delete, publish, or generate anything. It bypasses the text provider only for this exact read-only command, so no API key or paid generation is needed.
- Added focused tests for English/Burmese intent recognition and truthful inventory formatting.

**Verification status:** GitHub Actions run `43284733349` passed for commit `b27e4ea2d1a95603c5a2436600c87992da4e4e8f`, including TypeScript, the new global Chat action tests, all existing regression suites, Supabase Edge Function type-check, and production build. Cloudflare Preview build `870ed926-1867-4214-b80b-653198dd3d37` for the same commit completed successfully. No production deployment or merge was performed.

**Next Phase 3 step:** Add low-risk navigation and detail inspection using the same account-scoped data boundary. Keep create/update/delete, publishing, purchases, and paid generation disabled until each has a separate explicit confirmation and reliable execution contract. Preserve the existing AI Chat UI baseline.