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

### Phase 3 progress — read-only Storyboard detail inspection

- Added natural-language detail lookup for requests such as “Show details of ORIGIN Story”, “Tell me about Space Journey”, “Open storyboard My First Film”, and a Burmese detail-request pattern.
- The lookup uses the same signed-in user's cloud rows (user_id scoped) plus that user's local cache, reconciled through the existing timestamp-aware merge helper.
- Exact title matches take priority over partial matches. If more than one Storyboard matches, Chat asks the user to clarify instead of selecting one arbitrarily. If none match, it reports that honestly.
- The response includes the Storyboard topic, available category/style/mood/tags and global title/music metadata, plus scene titles, descriptions, durations, transitions, and created/updated dates when present.
- This is strictly read-only. It does not alter Storyboards, create new records, or change the existing Chat UI.
- Added tests for English/Burmese detail intent, exact-match priority, scene formatting, and avoiding accidental matching of list/create requests.

**Verification status:** The implementation and tests have been committed to feature/my-storyboard. Automated CI and Preview verification for this new commit are pending; do not treat this step as verified until those checks finish. No production deployment or merge was performed.

**Next Phase 3 step:** Add navigation through the app's existing navigation path, then define safe create/edit operations with explicit confirmation and server-side authorization. Preserve the existing AI Chat UI baseline.

### Phase 3 progress — allowlisted app navigation from AI Chat

- Added explicit navigation intents for Workspace, Marketplace, My Vyrals, and My Media Library (English plus initial Burmese variants).
- Navigation uses the app's existing section/profile state. It does not introduce new buttons or alter the AI Chat layout.
- Before navigation, AI Chat persists the current conversation including the navigation request and confirmation message. If persistence cannot be confirmed, it stays on the Chat page and reports the save failure instead of navigating away.
- Navigation is allowlisted and read-only. Broad or destructive phrases such as deleting Vyrals or creating Storyboards do not trigger a route change.
- Added intent tests for each supported destination and negative cases.

**Verification:** Storyboard detail-intent fix passed GitHub CI (run 43292879968). Navigation parser and implementation passed GitHub CI (run 43293945486), including TypeScript check, global AI Chat safe-action tests, Supabase Edge Function type-check, and production build. Preview and manual device verification are still pending. No production deployment or merge was performed. The existing AI Chat visual layout has not been changed.


### Phase 3 progress — confirmation-gated Storyboard creation

- Added deterministic English/Burmese create-intent parsing. A request without a topic asks one concise follow-up question; it does not create an empty/default Storyboard.
- A valid request produces a reviewable draft with title and topic in the existing Chat transcript. The draft carries structured action metadata in the existing conversation message record, so it survives normal chat-history persistence and reload without adding UI controls.
- Creation happens only after an explicit confirmation such as “Confirm create” or “အတည်ပြု”. The action re-authenticates the current Supabase user and writes one account-owned row to the existing `vyral_storyboards` table using the existing Storyboard fields.
- The local account cache is updated after the cloud write succeeds. If local cache writing fails, the response reports that the cloud copy is saved and Workspace can refresh it.
- The Storyboard uses a stable draft UUID as its record ID. A repeated confirmation cannot create a second record for that draft; the completed action is recorded in the chat transcript. No scene data is fabricated, and the user can continue editing the new Storyboard in Workspace.
- No AI Chat layout, CSS, controls, or visual hierarchy were changed. No API key is needed for this deterministic action.

**Verification status:** GitHub Actions run `43296280263` passed for implementation commit `0d0ecc3bb9c6ca903c64b47f7b958ff2979a6a9b`, including TypeScript check, global AI Chat safe-action tests, Supabase Edge Function type-check, all listed regression suites, and production build. Focused tests cover English/Burmese creation parsing, missing-topic behavior, explicit confirmation phrases, and draft-preview wording. Preview/device interaction and the saved Storyboard appearing in Workspace still require manual verification. No Production deployment or merge was performed.

**Next Phase 3 step:** Verify the create/confirm/reload/Workspace journey in Preview, then implement the next narrowly scoped action only after this creation path passes.
### Phase 3 progress — confirmation-gated Storyboard editing

- Added explicit English and Burmese update intent parsing for Storyboard title and topic changes. The action does not attempt free-form edits to scene content or other metadata.
- AI Chat loads the signed-in user's account-scoped Storyboards, merges the account's device cache with cloud rows, and requires a unique match. Ambiguous matches ask the creator to clarify; missing matches do not create or modify records.
- The proposed title/topic change is shown as a conversational draft. No database or device-cache mutation occurs until the creator explicitly confirms with “Confirm update” or “အတည်ပြု”.
- Confirmation re-authenticates the user and updates only the selected title or topic field, scoped by both Storyboard ID and user ID. The device cache is synchronized after the cloud update.
- The draft captures the Storyboard's current updated_at value. If the cloud record changed after the draft was prepared, the action stops and asks for a fresh draft instead of overwriting newer work.
- Failed confirmation retains the structured update draft for a safe retry. Completed draft IDs are tracked in the chat transcript to prevent accidental repeat application.
- Added focused tests for English/Burmese update parsing, negative intent cases, confirmation gating, and draft preview wording. No AI Chat layout, CSS, controls, or visual hierarchy were changed.

**Verification:** GitHub Actions run `43298266907` passed for implementation commit `94a28111e73e01eef1a157019022da73c15dab50`, including TypeScript check, AI Chat streaming tests, global Chat action tests, Supabase Edge Function type-check, all listed regression suites, and production build. Preview/device interaction for both Storyboard create and update flows remains a manual acceptance check. No production deployment or merge was performed.

**Next Phase 3 step:** Complete Preview/device checks for Storyboard create and update (including refresh/reopen and Workspace synchronization), then proceed to a separately confirmation-gated delete action. Preserve the existing AI Chat UI baseline.
### Phase 3 progress — confirmation-gated Storyboard deletion

- Added narrow English and Burmese delete intent parsing. The request must identify a Storyboard by title; a generic delete request asks for the exact title and never mutates data.
- AI Chat loads only the signed-in user's Storyboards, merges the account-scoped local cache with cloud records, and requires a unique title match. Missing or ambiguous matches do not delete anything.
- The assistant presents the exact Storyboard title and a permanent-deletion warning in a conversational preview. Deletion requires the dedicated “Confirm delete” or “ဖျက်ရန် အတည်ပြု” phrase; generic “yes” and update confirmations are not accepted.
- On confirmation, the app re-authenticates the user, checks the cloud row's updated_at revision, and scopes deletion by both Storyboard ID and user ID. The delete query also includes the expected updated_at value and requests the deleted row back; if no row was actually deleted, it does not report success.
- The matching account-local cache entry is removed only after cloud deletion succeeds (or when the Storyboard exists only in the account-local cache). The structured draft is retained for retry after a failed confirmation. A completed draft ID prevents repeat deletion.
- Added tests for English/Burmese delete intent, exact title extraction, unrelated destructive requests, and strict confirmation wording. Existing AI Chat layout, CSS, controls, spacing, and visual hierarchy were not changed.

**Verification:** GitHub Actions run `43299174012` passed for commit `63ec1c0fd48060d4cf286f7c06bc38ed66306502`, including TypeScript check, Global AI Chat safe-action tests, the existing regression suites, Supabase Edge Function type-check, and production build.

**Remaining acceptance check:** Preview/device manual testing is still required for Storyboard create, update, and delete, including confirmation, refresh/reopen, and Workspace synchronization. No manual browser verification is claimed. No production deployment or merge was performed.

**Next Phase 3 step:** Run the three end-to-end Preview acceptance flows, then assess whether the MVP's safe conversational controls are ready for the next phase. Preserve the existing AI Chat UI baseline.
### Phase 4 — provider architecture audit and recommendation (2026-11-13)

**Current implementation findings**

- The existing `CreateVideoView` still reads `vyra_openrouter_key_session` and selected OpenRouter models from browser `sessionStorage`, then sends the user-provided key in `x-openrouter-api-key`. This is a legacy BYOK flow and conflicts with the product requirement that customers must not bring their own provider keys.
- The current `/providers/openrouter/images/generate` and related generation routes are deliberately blocked by `blockUntrackedGeneration(...)` until generation usage-ledger integration is verified. Do not remove this safety block or bypass it to make generation appear available.
- OpenAI text chat is already server-side through the Development Supabase Edge Function and Vault. Existing Gemini Vision is a separate preserved path.
- OpenAI's current image API supports GPT Image 2.x models, including the 2.6 family. The old `gpt-image-1` model was shut down on 2026-10-23; do not build against it.
- OpenAI's Sora 2 / Videos API was shut down on 2026-09-24 according to the current deprecation notice. Therefore OpenAI cannot be assumed to be the VYRA video-generation provider in this release.
- OpenAI's legacy `/v1/audio/speech` TTS models are scheduled to shut down on 2027-01-06. Avoid making them the long-term audio architecture without a migration plan.

**Recommended media-provider direction**

- Keep OpenAI as the conversational text provider.
- Use one platform-owned media provider account/key for image, video, and audio generation. Runway Dev is the current recommended candidate because its official API documents text/image-to-video, text/image-to-image, text-to-speech, sound effects, speech-to-speech, asynchronous task status, uploads, and a model router spanning multiple model vendors. This reduces VYRA's integration and billing complexity while keeping model choice behind the platform.
- Keep model routing server-side and allowlist models/capabilities. Initial candidates to evaluate are a cost-efficient video model (e.g. Gen-4 Turbo / Kling 4 Flash / Veo 3.1 Fast) and a quality tier (e.g. Kling 4 / Seedance 2.5 / Veo 3.1), based on actual task requirements, regional availability, rights, and verified pricing. Do not expose a large model picker to customers.
- Runway Dev currently documents one credit as USD $0.01 and per-second video pricing that varies materially by model and resolution. Every generation must have a preflight estimate, a spend cap, and explicit customer confirmation before provider submission. The app must record actual provider-reported cost after completion.
- This is an architecture recommendation, not a configured provider connection. No Runway account/key has been purchased or added. Do not incur provider charges until the user explicitly authorizes the final provider-backed verification stage.

**Implementation order for Phase 4**

1. Replace the legacy browser BYOK assumption with an authenticated, server-only platform provider boundary. Keep provider secrets in Supabase Vault; never accept provider API keys from the customer chat request.
2. Add a narrow provider-management/status path for the platform-owned media key, with administrator-only write access and status-only reads. Do not reveal the saved secret.
3. Define a generation job contract (`queued`, `running`, `succeeded`, `failed`, `cancelled`) and provider adapter interface before enabling any billable generation.
4. Integrate usage preflight, idempotency, customer approval, provider cost reconciliation, and failure/refund handling. The existing OpenRouter text ledger is not evidence that image/video/audio generation is safely metered.
5. Start with one image-generation path and one video-generation path, test using mocks and no paid credentials, then add speech/audio generation. Persist outputs into the existing Asset/Storage/DNA pipeline in Phase 5 rather than creating a parallel media library.
6. Remove or retire legacy BYOK UI only after the replacement provider path is verified; preserve existing user data and the approved AI Chat visual baseline.

**Official provider references checked on 2026-11-13**

- OpenAI image generation: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI API deprecations (Sora Videos API shutdown and GPT Image changes): https://developers.openai.com/api/docs/deprecations
- OpenAI text-to-speech deprecation: https://developers.openai.com/api/docs/guides/text-to-speech
- Runway Dev API reference (image/video/audio endpoints and asynchronous tasks): https://docs.dev.runwayml.com/api/
- Runway Dev pricing: https://dev.runwayml.com/pricing

**Status:** Phase 4 provider audit completed; implementation has not yet started. The recommended single media-provider candidate is Runway Dev, with OpenAI retained for chat. No API key was purchased or configured, no paid generation was attempted, and no production deployment or merge was performed. Next implementation work is the server-only provider boundary and safe generation-job/usage contract; the existing BYOK generation path must not be silently re-enabled.


### Phase 4 progress — Auto-first model selection policy

- Added a pure, server-usable model-selection policy in `src/services/mediaModelSelection.ts`. It defaults to Auto and supports a Manual override for advanced users without changing the existing AI Chat or media UI.
- Selection is task-aware (image, video, audio, video edit), quality-aware (draft, standard, premium), budget-capped, and can require DNA-reference compatibility.
- Manual selection is accepted only when the requested model is in the trusted candidate list and passes the same task, quality, budget, enabled-state, and DNA-reference checks as Auto.
- The selector rejects models without a fresh numeric preflight quote. It contains no hard-coded provider prices, API keys, network calls, or provider submission logic; the next provider-adapter step must supply trusted allowlisted candidates and current quotes.
- Auto policy: Draft favors the lowest-cost eligible option; Standard balances quality against quoted cost; Premium prioritizes the highest quality within budget. If no model satisfies the constraints, it returns a safe no-eligible-model result rather than silently exceeding budget or downgrading quality.
- Added focused tests for default Auto, quality tiers, manual override, task allowlisting, DNA compatibility, missing quotes, budget enforcement, and side-effect-free behavior. Added the test to CI.
- No AI Chat layout, CSS, controls, spacing, or visual hierarchy were changed. The legacy BYOK UI and generation safety blocks remain untouched.

**Verification status:** Implementation and CI wiring are committed on `feature/my-storyboard`. Automated GitHub Actions verification is pending; no local test runner was available through the GitHub file-edit workflow. No live Runway credentials, paid preflight, or generation request were used. No production deployment or merge was performed.

**Next Phase 4 step:** Connect this policy to a server-only Runway adapter that reads the platform key from Development Supabase Vault, fetches live preflight quotes, and requires an explicit cost confirmation before creating a generation job. Until then, this selector is a tested-by-contract foundation, not an enabled generation feature.


### Phase 4 progress — generation quote approval and job-state contract

- Added `src/server/mediaGenerationContract.ts` with a strict pre-submission approval validator. It requires a valid, unexpired server quote, matching quote ID, explicit timestamped customer confirmation, a confirmed maximum budget, and a valid idempotency key.
- A missing approval, expired/malformed quote, changed quote ID, budget overrun, future confirmation timestamp, or invalid idempotency key is rejected before any provider submission.
- Added a generation-job transition contract: queued → running → succeeded/failed/cancelled, with safe queued cancellation/failure and no transitions out of terminal states.
- Added automated tests and CI steps for the approval gate and state transitions.
- These are pure contract modules only. They do not call Runway, read or store secrets, create database rows, charge customers, or enable any media-generation endpoint. Provider integration remains blocked until the server-only Vault adapter and persistent usage/job ledger are implemented and verified.
