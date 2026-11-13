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

### Phase 3 progress — Vyral read-only intelligence tools

- Added `get_vyral_master_dna_summary` to the authenticated `vyra-openai-chat` tool set.
- The tool reads only the latest Master DNA revision belonging to the authenticated owner and the already owner-verified active Vyral.
- It returns bounded, structured information: purpose and intended uses, Asset roles and reconstruction claims, cross-Asset relationships/constraints, provenance evidence status, and manifest/fingerprint integrity values.
- It does not return source file bytes, private Storage paths, provider credentials, or unrestricted snapshot payloads. Constraint descriptions and arrays are size-limited before they are passed to the model.
- If no Master DNA snapshot exists, the assistant receives an explicit unavailable state rather than fabricated data.
- Deployed Development Edge Function `vyra-openai-chat` version 3 with JWT verification enabled. Production remains untouched.
- Live provider-backed chat and browser behavior are still unverified because the OpenAI key has intentionally not been configured. GitHub status/workflow lookup did not return CI records for the latest code commit; do not treat this as a passing CI result.

### Workspace awareness — current page and selections

- Added a shared `WorkspaceAiContext` contract retained by the app shell when the user moves from Workspace to AI Chat.
- Workspace reports the last active surface: Storyboards, Storyboard Editor, Scene Editor, My Vyrals, or My Media Library.
- When a Storyboard is open, context includes its title/topic and bounded scene inventory. It also reports the current editor view, selected scene titles, active scene title, and selected Master Timeline item (scene, transition, text clip, or audio clip).
- Opening My Vyrals or My Media Library from Workspace updates the retained last-page context before navigation. Assets explicitly sent from Media Library continue through the existing selected-asset handoff.
- AI Chat sends this small context with normal text requests. The Development Edge Function validates allowed page/type fields, bounds text and array sizes, and injects it as untrusted UI-state context—not as authorization or executable instructions. Server-side Vyral ownership checks and action confirmation rules remain authoritative.
- No AI Chat layout/CSS was changed. Context is retained in app memory while navigating between surfaces; it is not a permanent user activity log.
- Deployed Development Edge Function `vyra-openai-chat` version 5 with JWT verification enabled; its workspace-context sanitizer is active. Production remains untouched.
- Browser verification and CI are still outstanding; GitHub status/workflow lookup returned no check records for the latest code commits, so no passing CI claim is made.

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


### Phase 4 — Development database schema audit

- Read-only inspection of Development Supabase (`wbqheogfoahnjvgkwhxe`) found that VYRA already has `generation_jobs`, `provider_attempts`, `provider_cost_records`, `credit_ledger_entries`, and `platform_admins`. These tables have RLS enabled; customer-facing policies are owner-scoped SELECT policies, consistent with server-owned writes.
- The generation-job table already defines the persisted lifecycle as `pending`, `submitted`, `processing`, `succeeded`, `failed`, `cancelled`, and `unknown`. Updated the new pure lifecycle contract to match these existing database states instead of introducing a competing vocabulary.
- Existing provider cost records explicitly distinguish provider-reported actual cost from estimates. Reuse this schema and its existing RPC path rather than creating duplicate ledger tables.
- Existing `platform_admins` registry and Vault accessor patterns are present. The Runway secret accessor still needs a Development-only migration and an admin-gated management Edge Function; no schema or secret changes were made during this read-only audit.
- Production Supabase was not queried or changed.


### Phase 4 progress — Development-only Runway credential management

- Added Development Supabase migration `vyra_runway_api_key_vault` in project `wbqheogfoahnjvgkwhxe`. It creates Vault getter/setter RPCs for `vyra_runway_api_key`; direct execution is revoked from PUBLIC, anon, and authenticated roles and granted only to service_role.
- Deployed Development Edge Function `manage-runway-provider` (JWT required). It checks the authenticated user's `platform_admins` role and permits only owner/admin to read credential status or save a credential. It never returns the secret.
- Added authenticated server proxy routes `GET/POST /providers/runway/settings` in `src/server/ai.ts`. The browser can only send a credential to the server proxy; reading stored credentials is not supported.
- The management endpoint explicitly reports `credentialVerified: false`. Saving a key only stores it securely; it does not claim live verification. No Runway key was supplied or stored.
- No media generation endpoint is enabled. No provider API request, paid preflight, task submission, customer charge, or asset creation occurred. Existing OpenRouter generation safety blocks and legacy BYOK UI remain untouched.
- No AI Chat visual/UI changes. Production Supabase and production deployment remain untouched.

**Next:** Implement the Runway server adapter against the documented Model Router/preflight/task APIs, persist quote/job/attempt/cost data using the existing Development ledger, and keep generation disabled until the live credential is deliberately configured and a non-production end-to-end test passes.


- Added the Runway settings proxy to the existing authenticated AI server router and corrected bearer/key whitespace validation. The Development migration is confirmed present as `20261112204351_vyra_runway_api_key_vault`; `manage-runway-provider` is confirmed ACTIVE with JWT verification enabled.
- GitHub Actions workflow results were not available through the connected commit-status view for these direct branch commits, so CI is **not claimed as passed**. No local repository checkout was available to run the TypeScript/build suite in this step.

### Phase 4 progress — non-billable Runway credential verification

- Added the source-controlled manage-runway-provider Edge Function and registered it with JWT verification enabled. Only authenticated platform owners/admins can inspect status or save the platform credential.
- Saving a Runway key now first calls the documented read-only GET /v1/organization endpoint with the required X-Runway-Version: 2024-11-06 header. The key is stored in Development Vault only after Runway accepts it. Status checks re-verify the stored key and return only configured/verified status and non-secret tier metadata; the key and raw provider response are never returned.
- The credential check does not create a generation task and does not incur generation charges. It may still be subject to Runway's normal API rate limits.
- Added authenticated GET/POST /providers/runway/settings proxy routes. API keys remain server-side and are not written to browser storage.
- Deployed Edge Function version 2 to Development Supabase (wbqheogfoahnjvgkwhxe), ACTIVE with JWT verification enabled. Added the function to CI's Deno type-check list.
- No Runway API key has been supplied, so no live provider verification has been performed and Vault remains unconfigured. No preflight quote, generation task, provider charge, or customer credit reservation has occurred. Production Supabase, production deployment, and AI Chat UI remain untouched.

Official reference: Runway API Reference — Organization information (GET /v1/organization), API version header 2024-11-06: https://docs.dev.runwayml.com/api/

Next: After the platform key is intentionally provided by an authorized administrator, verify it through this non-billable check. Then build the quote and job orchestration around the existing generation ledger. Keep paid generation disabled until the live pricing/quote semantics and persistence path are verified.

### Phase 4 progress — server-side Runway dry-run quote path

- Added Development migration media_generation_quotes. It stores short-lived, user-owned quote records with provider model, Runway credits, USD estimate, request fingerprint, sanitized input, and routing metadata. RLS permits authenticated users to read only their own quotes; inserts and mutations are service-role only.
- Added quote-runway-media Edge Function. It authenticates the user, accepts only image/video/audio tasks and a strict input allowlist, reads the platform Runway secret from Vault, calls the task-specific Runway Model Router endpoint with dryRun=true, validates the routing/model/credits response, converts Runway credits at the documented USD $0.01 per credit, enforces a caller-supplied maximum USD budget, and stores a five-minute quote. It never creates a generation task or reserves customer credits.
- Added authenticated POST /media/quote proxy route. The customer cannot supply a Runway key or arbitrary router config ID. Router config slugs are server-side Supabase Function secrets: VYRA_RUNWAY_IMAGE_DRAFT_ROUTER, VYRA_RUNWAY_IMAGE_STANDARD_ROUTER, VYRA_RUNWAY_IMAGE_PREMIUM_ROUTER, and equivalent VIDEO/AUDIO variables. Manual override remains explicitly disabled until a platform-managed model allowlist exists.
- The quote endpoint is safely unavailable until a verified Runway key and all required task/quality router slugs are configured. No key or router slug has been added; no Runway preflight, generation task, customer credit reservation, or charge was performed.
- Added the quote function to Supabase config and CI Deno type-check list. AI Chat UI and production services remain untouched.

Official Runway docs: Model Router dry-run and estimated credits https://docs.dev.runwayml.com/model-routers/generating/ ; API reference https://docs.dev.runwayml.com/api/ ; pricing states 1 credit = USD $0.01 https://docs.dev.runwayml.com/guides/pricing/ .

Next: implement server-side approval consumption and idempotent job submission, but keep live generation blocked until the quote path is tested with a verified non-production key and configured routers.

**Verification update:** The first CI attempt exposed a duplicate Runway settings proxy declaration in src/server/ai.ts. Removed the duplicate while preserving the existing admin settings routes and the new quote route. GitHub Actions run 43305577534 on commit d99d998a094ab7a33364eb424b8267718a6cf24a completed successfully: TypeScript check, all configured regression tests, Deno type-check including quote-runway-media, SEO contracts, and production build passed.

**Development deployment:** Migration media_generation_quotes applied successfully. quote-runway-media is ACTIVE (version 1) with JWT verification enabled. The quotes table is empty as expected. Vault contains no vyra_runway_api_key and no VYRA_RUNWAY_*_ROUTER configuration secrets are present. Therefore the endpoint remains fail-closed and cannot issue a provider quote yet. No Runway preflight request, billable generation, customer credit reservation, production deployment, or merge has occurred.


### Phase 4 progress — persistent customer quote approval gate

- Added Development migration `20261113040000_media_generation_quote_approval.sql` and applied the matching schema change to Development Supabase. Quote rows now retain the server-recorded approval timestamp, customer-approved USD ceiling, and approval idempotency key.
- Added service-role-only `approve_media_generation_quote()`. It locks the quote row, verifies ownership, requires the quote to remain unexpired and in `quoted` state, rejects an approved ceiling below the estimate, and makes retries idempotent. Reusing a key with different quote/budget parameters is rejected.
- Added authenticated `approve-runway-media-quote` Edge Function (JWT verification enabled) and registered it in Supabase config and CI Deno type-checking. It requires an explicit `confirmed: true`, derives the user ID from the authenticated session, and never accepts a client-provided confirmation timestamp.
- Development verification confirms the new approval columns exist, service_role can execute the RPC, authenticated users cannot execute it directly, and the quote table remains empty. The Edge Function is ACTIVE (version 1) with JWT verification enabled.
- This is deliberately only the durable approval stage. It does **not** create a generation job, reserve or charge VYRA credits, or submit a Runway task.

**Critical billing-policy gate discovered during the audit:** the repository's existing `docs/CREDIT_LEDGER_LIFECYCLE.md`, `docs/USAGE_LEDGER_API_INTEGRATION.md`, and credit-economy documents explicitly prohibit implicit USD-to-credit conversion. VYRA credit-unit pricing, rounding, bulk discounts, provider-cost margin, refund rules, and customer-consent wording are not finalized. Therefore it would be unsafe to invent a credit reserve amount or create a billable generation job now. The existing ledger RPC is ready to reserve integer credits, but a published pricing rule must be approved before connecting it to media generation.

**Remaining Phase 4 work:** (1) approve and document the VYRA USD-to-credit pricing/rounding/refund policy; (2) atomically create an idempotent generation job and reserve the policy-derived maximum credits in one database transaction; (3) add provider submission and reconciliation with an explicit feature gate; (4) run mock-based and authenticated Development E2E tests. Runway key/router configuration is still absent, so no live quote or paid generation is possible. No AI Chat UI changes, production changes, deployment, or merge were made.


### Phase 4 progress — policy-gated atomic job + reserve foundation

- Audited the live Development schemas and confirmed the existing ledger RPC is service-role-only, append-only, idempotent per user, and serializes balance writes with a per-user advisory lock. The ledger's reserve entry requires a positive integer credit amount and a generation job ID.
- Added and applied Development migration `20261113043000_media_generation_atomic_job_reserve.sql` (recorded in Supabase migration history as `20261112210530_media_generation_atomic_job_reserve`).
- Added `media_credit_pricing_policies` with versioned policy records, one-active-policy constraint, explicit effective time, positive credits-per-USD, and ceiling-only rounding. **No policy rows are seeded**; there is no invented conversion rate.
- Added `create_media_generation_job_and_reserve()`, restricted to service_role. In one database transaction it validates an explicitly approved unexpired quote, requires an active pricing policy, calculates the policy-derived minimum credit reserve, checks the customer-approved credit ceiling, creates one idempotent generation job, writes the reserve ledger entry, and marks the quote used. Any failure rolls back the entire transaction.
- Verified Development has zero pricing policies and zero active policies. Verified service_role can execute the RPC and authenticated users cannot. No generation job or credit ledger entry was created by these checks.
- This RPC is intentionally not exposed through a customer-facing endpoint and cannot succeed until a commercial pricing policy exists and the customer has explicitly approved the corresponding maximum credit units. Provider submission remains separate and disabled.

**Remaining blockers:** approve the actual credit-unit conversion and rounding/refund/consent terms; add a secure customer endpoint that records explicit maximum-credit consent and invokes the atomic RPC; add transaction/idempotency/insufficient-balance tests; then implement provider submission and reconciliation behind a credential/config feature gate. No API key, live provider task, customer charge, AI Chat UI change, Production migration, deployment, or merge occurred.


### Phase 4 progress — durable customer credit consent and atomic job API

- Added Development migration `20261113050000_media_generation_explicit_credit_consent.sql`. It persists `credit_approval_confirmed_at` and a per-user `credit_approval_idempotency_key` on the quote, alongside the approved maximum credit units and the exact pricing-policy ID.
- Added service-role-only `approve_media_generation_credit_ceiling()`. It locks the quote, requires the earlier explicit USD quote approval, rejects expired quotes, requires an active/effective pricing policy, computes the minimum permitted ceiling using that policy's ceiling-rounding rule, and stores a server-generated consent timestamp. Repeated identical approvals are idempotent; a different approval for the same quote is rejected.
- Hardened `create_media_generation_job_and_reserve()`: it now refuses to create a job unless the quote contains the persisted credit-consent timestamp, idempotency key, approved credit amount, and pricing-policy ID. The approved amount must exactly match the persisted customer-approved amount, and the same policy must still be active. The job, reserve-ledger entry, and quote consumption remain one transaction.
- Added authenticated Development Edge Functions `approve-runway-media-credit` and `create-runway-media-job`, both with JWT verification. The first requires `confirmed: true` and a positive whole-number credit ceiling; it does not accept a client timestamp. The second derives the user's approved credit ceiling from their own quote and invokes the atomic RPC. It creates a pending job and reserve only; it does **not** submit a Runway provider task.
- Added authenticated server proxy routes `POST /media/quote/approve-credits` and `POST /media/jobs`. Registered both functions in `supabase/config.toml` and CI's Deno type-check list.
- Verified Development columns exist; both privileged RPCs are executable by `service_role` and not by `authenticated`; both Edge Functions are ACTIVE with JWT verification enabled. The pricing policy table has zero rows and zero active policies. Quotes, media generation jobs, and media reserve ledger entries remain at zero.
- The absence of an active pricing policy is intentional and fail-closed: credit consent currently returns `CREDIT_PRICING_NOT_CONFIGURED`; no conversion rate has been invented and no user can reserve credits through this path yet.
- Idempotent job retry is preserved after the quote transitions to `used`; the database still verifies the original user, quote, and job idempotency key before returning an existing job.

**Remaining:** finalize and approve VYRA credit pricing, rounding, margin, refunds, and customer-facing consent wording; then test the complete approval → job → reserve transaction against a non-production test account, including insufficient-balance rollback and idempotent retries. Provider task submission/reconciliation remains disabled until the key and router configuration are deliberately supplied. AI Chat UI, Production Supabase, production deployment, and merge remain untouched.


### Phase 4 progress — admin-controlled media credit pricing lifecycle

- Added Development migration `20261113060000_media_credit_pricing_admin_controls.sql`.
- Added audit fields to `media_credit_pricing_policies`: `created_by`, `activated_by`, and `activated_at`.
- Added service-role-only `activate_media_credit_pricing_policy()`. The RPC independently verifies that the supplied actor is currently an owner/admin, serializes concurrent activations with a transaction advisory lock, retires the previous active policy, and activates the selected draft in one transaction. A policy cannot be edited into active status directly by an authenticated client.
- Added authenticated `manage-media-credit-pricing` Edge Function and server proxy `POST /admin/media-credit-pricing`. Owner/admin actions:
  - `status`: list recent policies and the active policy.
  - `create_draft`: create a uniquely versioned draft with a positive decimal `creditsPerUsd` (up to 8 fractional digits). Draft creation never affects customer billing.
  - `activate`: requires explicit `confirmed: true` and a policy ID; activation is atomic and audited.
- Function is ACTIVE in Development with JWT verification enabled; `supabase/config.toml` and CI Deno type-check list are updated.
- Verified audit columns exist, the activation RPC is executable by `service_role` and not by `authenticated`, and the migration is recorded. There are still zero pricing policies and zero active policies. No rate was selected or activated.
- Security advisor reports `media_credit_pricing_policies` has RLS enabled with no client policies; this is intentional deny-by-default because access is through the authenticated owner/admin Edge Function using server-side credentials. Existing unrelated advisor findings include other pre-existing tables/functions and leaked-password protection; they were not changed in this task.

**Remaining:** define the commercial credit conversion rate, provider-cost margin, refund/partial-failure rules, and user-facing disclosure before creating and activating the first policy. Then verify admin endpoint behavior with a real Development owner session and test the entire quote → USD approval → credit approval → job → reserve flow. No pricing value has been guessed; media generation remains blocked until the policy is explicitly approved and activated.


- Added `src/services/mediaCreditPricing.ts` with exact BigInt decimal arithmetic for the `ceil(maxCostUsd × creditsPerUsd)` rule, avoiding JavaScript floating-point rounding drift. Added tests for fractional boundaries, invalid decimal strings, zero values, and policy draft validation; registered `test:media-credit-pricing` in CI.
- The CI workflow now type-checks `manage-media-credit-pricing` and runs the exact-decimal pricing tests. The latest commit's GitHub status endpoint returned no check records yet, so CI is not marked passed.

### Phase 4 progress — Admin Dashboard pricing draft controls

- Added `MediaCreditPricingSettings` to the existing Profile → Platform → Admin Dashboard provider settings page. The existing OpenAI key UI and page structure remain in place; this is an additive section beneath the current provider controls.
- The section calls the authenticated `/api/admin/media-credit-pricing` proxy. The Edge Function verifies the signed-in user's current `platform_admins` role; regular users receive an access-denied state and cannot read policy records.
- Owner/admins can inspect the policy history and create versioned draft rates. The UI labels draft creation as non-billable and explains that it cannot affect customer balances.
- Deliberately did **not** expose activation in the UI yet. The customer credit price, provider-cost margin, refund/partial-failure rules, and customer-consent wording still need owner approval. The server activation endpoint remains protected by owner/admin authorization and explicit confirmation.
- No rate has been entered. Development still has zero pricing policies, zero active policies, zero quotes, zero generation jobs, and zero reserve ledger entries. No Runway key/router config or OpenAI key was added; no provider call, charge, Production change, merge, or deployment occurred.
- AI Chat layout and styles were not modified. Browser visual verification of the new Profile settings section remains outstanding; verify it in Preview before considering the Admin Dashboard UI gate complete.

### Phase 4 progress — pricing admin API validation hardening

- Extracted media pricing admin payload validation into the shared, deterministic `src/services/mediaCreditPricing.ts` contract and made the Development Edge Function use it before any database operation.
- The shared contract rejects non-object bodies, unsupported actions, invalid/duplicate-risk version formats, non-positive or exponent-form rates, rates with more than eight decimal places, numeric rather than string rate payloads, malformed policy UUIDs, and activation without the literal boolean `confirmed: true`.
- Extracted the owner/admin role allowlist into a small pure helper used by the Edge Function. Added tests for owner/admin acceptance and member/unknown/null rejection, plus status, draft, and activation request validation.
- The existing `test:media-credit-pricing` CI step already runs the expanded test file; the existing Deno Edge Function type-check includes `manage-media-credit-pricing` and now follows its shared TypeScript import.
- These are deterministic contract tests, not a substitute for a live authenticated owner/non-admin Development API test. GitHub's connected workflow-run view currently returns no runs for the direct branch commit, and commit status has no check records; CI is therefore still unverified.
- No policy was created or activated, no rate was chosen, and no quotes/jobs/reserve entries or provider calls were created. Production, AI Chat UI, and deployment remain untouched.


### Phase 5 progress — Asset and DNA handoff architecture audit

- Audited the existing creator upload pipeline in `src/components/profile/VyralDetailsContent.tsx`. It is the canonical ingestion path: authenticated user ownership, private `vyral-assets` Storage path scoped as `user_id/vyral_id/asset_id/v1/object`, SHA-256 of original bytes, `vyral_assets` row initially marked `uploading`, Storage upload, immutable `vyral_asset_versions` row, cryptographic fingerprint, deterministic DNA, and only then transition to `ready`.
- Raster PNG/JPEG/WebP uploads are gated on the server-side `extract-vyral-asset-dna-v3` function. A failed extraction does not allow the asset to become ready with identity-only File DNA. Other file types receive deterministic File DNA v1, with reconstruction readiness honestly marked identity-only.
- Automatic AI observations are best-effort and are pinned to the exact source version; the Vision observation function independently verifies source integrity. AI suggestions must not block a valid original upload or override creator-authored identity fields.
- The audit confirms that the current general Media Library is a separate legacy surface: generated images/videos/audio are stored in browser IndexedDB and local Studio state. It is not yet a canonical cloud Asset ingestion path. Do not treat a browser-local saved-media record as a Vyral Asset or claim cross-device persistence.
- Integration decision: generated outputs must be ingested through the same canonical Vyral Asset lifecycle rather than writing directly to IndexedDB or inventing a parallel storage schema. Generation job ID, provider/model, quote/approval provenance, prompt/request fingerprint, and parent/source lineage should be attached as metadata/lineage without weakening the immutable source-version hash and DNA gates.
- Before implementation, the next code task is to extract the verified upload lifecycle into a reusable service (or a narrowly scoped shared ingestion module) and have the creator upload UI call that service without changing its appearance. Then connect completed generation outputs to that service and expose only ready Assets to Media Library/Storyboard selection.
- No source code or UI was changed in this audit step. No provider task was submitted, no media was uploaded, no pricing policy was created, and no customer credits were reserved or charged. Production and the AI Chat UI remain untouched.


### Phase 5 progress — Generated Asset provenance contract

- Added `src/services/vyralGeneratedAssetProvenance.ts` as a deterministic contract for generated Asset provenance. It validates the generation job UUID, task, provider/model identifiers, request fingerprint, prompt SHA-256, optional quote/provider generation IDs, and non-negative provider-reported actual cost.
- The metadata builder emits a versioned `vyra.generated-asset-provenance` record with private visibility and SHA-256 identity. It intentionally excludes raw prompts, API keys, and raw provider responses; the prompt digest is intended to bind the record to the source-bound DNA/observation pipeline.
- Added a lineage builder that emits a `vyral_lineage`-compatible parent/child relation only when a real parent Asset exists. Standalone generated Assets do not receive an invented parent.
- Added deterministic tests for valid metadata, malformed IDs/hashes/task/cost, secret/raw-prompt exclusion, standalone generation, and derived-Asset lineage. Registered `test:vyral-generated-asset-provenance` in package scripts and CI.
- Commits: `62fffb8` (contract), `a985630` (tests), `965f0b3` (test script), `70b2a2a` (CI).

**Still not integrated:** the current image/video/audio generation call sites still save to browser IndexedDB and link local IDs into Storyboard scenes. This new contract is a foundation only; no generation result is yet uploaded to `vyral-assets`, no Asset Version/DNA is created by this new path, and no Media Library or Storyboard handoff was changed. The next implementation step is the shared Blob-to-Vyral-Asset ingestion service, then connect completed image/video/audio outputs while preserving existing scene IDs and local recovery behavior until cloud Asset readiness is confirmed.

- No API key, provider call, job, quote, pricing policy, credit reservation, or customer charge was created. No UI appearance or AI Chat UI was changed. Production remains untouched; no merge or deployment occurred. CI result for the latest commit is not yet visible through the connected workflow/status view, so it is not marked passed.


### Phase 5 progress — Shared canonical Asset ingestion service

- Added `src/services/vyralAssetIngestion.ts`, a UI-independent ingestion lifecycle with an adapter/port boundary and a Supabase implementation. It validates the signed-in owner/Vyral UUIDs and upload size, classifies the file, computes SHA-256 from the original bytes, writes the private Vyral Storage object, creates the immutable v1 Asset Version, records the cryptographic Fingerprint, creates the appropriate source-bound DNA, and marks the Asset `ready` only after the DNA gate succeeds.
- Raster PNG/JPEG/WebP still require server-side `extract-vyral-asset-dna-v3`; the service never downgrades a failed raster extraction to identity-only File DNA. Other file types use the existing Universal File DNA v1 identity path, matching current creator-upload behavior.
- Failure handling attempts Storage cleanup even when an upload response is lost, removes incomplete records when no DNA was committed, and preserves the source/version/evidence whenever DNA may already have committed so the existing recovery flow can finish safely.
- Added `ingestGeneratedVyralAsset`, which validates and attaches the previously implemented generation provenance contract, then uses the exact same canonical ingestion lifecycle. It does not invent a parent Asset for standalone generations.
- Refactored `VyralDetailsContent.tsx` creator uploads to call this shared service. The existing AI Vision observation and creator-edit-preserving AI metadata steps remain after ingestion. No visible UI/layout changes were made.
- Added deterministic lifecycle tests for file classification, raster DNA readiness gating, non-raster File DNA, partial-upload rollback, uncertain upload cleanup, preservation after possible DNA commit, owner ID/size validation, and generated-media use of the same pipeline. Added `test:vyral-asset-ingestion` to package scripts and CI.
- Key commits: `bee2ecc` (service), `c226293` (tests), `a41e7ee` (creator upload refactor), `1edd8e3` (generated-media wrapper), `f46e558` (CI registration).

**Remaining Phase 5 integration:** the project-generation call sites still save local IndexedDB media and Storyboard scenes still reference those local media IDs. They must be migrated to call `ingestGeneratedVyralAsset` only after the app has a reliable destination Vyral for each generation. Current Project Workspace does not carry an explicit Vyral ID, so do not silently attach a generated output to an arbitrary user Vyral or ORIGIN-01. Resolve a safe destination policy (for example, a private generated-media Vyral or an explicit existing workspace association) before changing scene handoff. Existing local media recovery remains intact until a cloud Asset is confirmed ready.

- No provider task, API key, quote, pricing policy, job, credit reservation, or customer charge was created. No production changes, deploy, or merge. AI Chat UI remains untouched. GitHub status view did not return a CI run/check for the latest push, so CI is not claimed as passed.


#### Phase 5 ingestion hardening follow-up

- Creator upload error handling now recognizes `VyralAssetIngestionError.preservedForRecovery`, so a source whose DNA commit may already exist is not mislabeled as cleaned up. Adapter cleanup failures are surfaced to the creator instead of being hidden. Commit: `5b9e0c2`.
- Upload rollback now attempts object removal after an uncertain Storage upload response, and the lifecycle test covers this case. Generated Asset metadata enforces private visibility and SHA-256 metadata even when optional provenance is supplied. Commits: `362190f`, `b453cdd`.
- Current verified source refactor: Creator Workspace now calls the shared service; the existing AI Vision observation and metadata suggestion work remains after the shared DNA-ready gate. No UI layout changes.


### Product direction update — Vyral creation is AI Chat-only

- Product decision from the creator: new Vyrals must be structured and created through the global AI Chat box. The My Vyrals surface is a library/management view for existing Vyrals, not a second creation workflow.
- Added explicit English/Burmese Vyral creation intent parsing, name/description extraction, a reviewable draft, and a dedicated confirmation phrase. No database mutation occurs until the creator confirms the draft.
- Confirmation creates a private, draft-lifecycle Vyral with creator-provided identity fields, platform defaults for the current license policy, and an initial root-scope identity DNA record. The generated draft UUID is used as the Vyral ID; retry checks that the existing row belongs to the same Chat draft and resumes missing root DNA instead of creating a duplicate.
- Removed the standalone Create Vyral button and dialog from My Vyrals. Empty state now directs the creator to AI Chat. Existing list/detail, delete protection, and legacy device-local migration behavior remain intact.
- Added English/Burmese parser, draft, and confirmation tests to the existing global chat action test suite. These tests are registered in CI already; the current GitHub status endpoint has not returned a check result, so execution is not claimed as passed.
- This step creates the Vyral identity only. Chat attachment-to-Asset ingestion, selecting/switching an existing destination Vyral, and automatic Master DNA rebuild after inventory changes remain the next integration tasks. No provider generation, billing, production changes, deploy, or merge. AI Chat visual layout remains unchanged.


#### Phase 5 — AI Chat attachment to canonical Vyral Asset handoff

- AI Chat now recognizes an explicit request to add an attached file to a named existing Vyral (English and Burmese). It resolves the destination only from the authenticated user's own `vyrals` rows and requires a unique exact name match; no arbitrary/default Vyral or ORIGIN-01 fallback is used.
- Chat presents a review preview containing the exact destination, filename, size and MIME type. Nothing is uploaded until the creator sends the explicit `Confirm Asset upload` command (Burmese confirmation is also supported).
- On confirmation, Chat re-verifies destination ownership and the exact file metadata, then calls the same `ingestVyralAsset` lifecycle as Creator Workspace. This creates the private Storage original, immutable Asset Version, SHA-256 Fingerprint, raster DNA v3 or Universal File DNA v1, and only marks the Asset ready after the DNA gate succeeds.
- After successful ingestion, Chat requests a Master DNA rebuild for that Vyral and reports ready revision only when the builder confirms `status: ready`; otherwise it reports synchronization as pending. No raw file bytes are written into chat history. The pending File object is memory-only and is cleared when leaving/switching/archiving/deleting the chat; a restored draft correctly asks the creator to reattach the file.
- The workflow is additive to the existing attachment composer; no AI Chat layout, spacing, controls, or visual styling changed. Existing .vyral package attachment inspection/import behavior is kept separate from ordinary file upload.
- Added English/Burmese target parsing, strict confirmation, and no-match negative tests to `tests/global-chat-actions.spec.ts`; the existing CI workflow already runs `test:global-chat-actions`. GitHub status did not return a check for the current push, so execution remains unverified.
- Remaining: add optional source-version-pinned AI Vision observations from Chat uploads and verify the full natural-conversation, upload/DNA/Master-DNA path in the Development browser. The OpenAI key is still unset, so live model interpretation remains for final verification. No production changes, deploy, merge, provider generation, or charges.

- Upload recovery hardening: when the shared ingestion service reports that DNA may already have committed, Chat does not offer a blind retry that could create a duplicate Asset. It removes the transient File reference and surfaces the preserved Asset ID with instructions to use the existing Recover DNA workflow. Retry remains available only for failures where the ingestion service safely rolled back the incomplete attempt.


#### Natural-language Vyral context and approvals

- Product requirement clarified by the creator: VYRA AI Chat must accept free-form conversational instructions, not require users to memorize fixed command phrases.
- Chat now resolves a single mentioned Vyral by its actual owner-scoped name from the user's Vyral library, makes it the active working context, and persists that selection per authenticated account. If multiple Vyral names are mentioned (for example, comparison), it does not silently switch.
- A newly created Vyral becomes the active context automatically. Explicitly selected Assets from one Vyral also establish that Vyral as the current context.
- The active Vyral ID is sent with ordinary chat requests. The Development Edge Function verifies the Vyral against the authenticated user before adding its name and description to the model's system context. Client-provided descriptions are not trusted; the server reads the canonical row.
- The model instructions now explicitly support natural references such as “this Vyral”, “continue this”, “add this there”, and follow-up creative requests. No fixed command syntax is required for conversational context switching by name.
- Attached files can be directed to the active Vyral with natural add/save/use/put/include language. A preview is still shown, and only a short natural approval (e.g. “go ahead”, “looks good”, “အေး လုပ်လိုက်”) or explicit confirmation proceeds. Approval is bound to the latest pending preview only; no generic “yes” triggers unrelated old actions.
- The OpenAI key remains unset, so actual model interpretation cannot yet be exercised end-to-end. Deterministic owner-scoped context matching, context handoff, and approval handling are implemented and unit-covered; live natural-language quality must be verified once the platform key is configured in the planned final verification phase.
- AI Chat visual design remains unchanged. No provider generation, customer billing, production deployment, or merge.


- Follow-up implementation: natural-language short approvals are now scoped to the latest assistant preview across Storyboard create/update/delete and Vyral create/upload. The preview copy no longer asks the user to type a fixed confirmation command. A negated phrase such as “don't add this” is explicitly excluded from upload intent.


#### Natural conversation and owner-verified Vyral context — follow-up

- Vyral context selection is inferred from a uniquely mentioned owned Vyral in ordinary user text. If two or more distinct Vyrals are mentioned (for example, a comparison), the active context is not silently changed. Negated mentions such as “don't switch to ORIGIN Story” are excluded.
- The selected Vyral ID is persisted per signed-in account in local browser storage, revalidated against the authenticated owner on load and before use, and passed through the existing authenticated chat endpoint. The server independently verifies ownership.
- The chat Edge Function now loads a bounded, owner-scoped canonical context: Vyral description and Master DNA status/revision/purpose, up to 30 non-archived Assets, each Asset's latest available DNA status/revision, up to 30 Asset relationships, and Master DNA fingerprint metadata. It sends no binary file data, storage credentials, API keys, or full raw DNA payloads to the text model. Truncation is explicitly indicated.
- Creator-authored descriptions, Asset names, tags and relationship rationales are treated as untrusted descriptive data, not system instructions. The model is instructed not to invent missing inventory or claim mutations without a confirmed VYRA action.
- Natural Asset placement language is recognized conservatively. Strong actions such as add/put/save/store/attach/upload/place are supported; “use this image as part of our current Vyral” is supported only when the Vyral destination is explicit. A generic request to “use this image as a reference” is not treated as an upload.
- This improves the information available for free-form conversation, but it does not yet make the model an unrestricted executor of all VYRA features. New mutations and billable generation still require explicit, allowlisted VYRA actions and appropriate approval.


#### Owner-scoped read-only Vyral tools

- The authenticated OpenAI chat Edge Function exposes a narrowly allowlisted read-only tool set only when an active Vyral has been independently verified against the authenticated user:
  - search_vyral_assets: bounded search by Asset name and optional Asset type, returning processing and latest DNA status.
  - get_vyral_asset_details: exact Asset ID/name lookup, latest version metadata and latest DNA verification status; no file bytes or storage path.
  - list_vyral_asset_relationships: bounded relationship inventory for the active Vyral.
- Every query is scoped by both vyral_id and authenticated user_id. Search/detail results are bounded, and no mutation, delete, publish, generation, storage access or billing tool is exposed to the model.
- Tool selection is performed by the platform model, but execution remains in the authenticated Edge Function with a strict allowlist and argument validation. The assistant receives tool results and writes the natural-language answer. The existing browser SSE contract is preserved; direct planner answers are adapted to valid SSE frames.
- Tool execution is limited to three sequential calls per request. OpenAI key remains unset; this code path is not live-provider verified or deployed to Development yet.

### Natural-language approval coverage

- Expanded contextual approval phrases for English and Burmese (for example: “go for it”, “please do”, “perfect”, “အေး ဆက်လုပ်”, “လုပ်ပါ”, and “ဆက်လုပ်ပါ”).
- These short approvals are accepted only when the immediately preceding assistant message contains a pending supported action draft; they do not independently trigger mutations.
- Added regression cases to `tests/global-chat-actions.spec.ts`.
- This improves conversational flexibility without changing the AI Chat UI or weakening preview/approval safeguards.

### Destructive-action approval hardening

- Permanent Storyboard deletion no longer accepts generic conversational approvals such as “yes”, “go ahead”, “လုပ်ပါ”, or “ဆက်လုပ်ပါ”.
- Deletion requires its dedicated explicit confirmation phrase after the exact target and irreversible warning have been previewed.
- Ordinary conversational approvals remain available for reversible/low-risk draft actions and Asset upload previews.
- Added regression cases for generic approvals being rejected by the destructive confirmation parser.
- AI Chat UI and existing preview presentation remain unchanged.


### AI Chat universal action planner — policy foundation

- Added a server-side, deterministic action-plan contract for natural-language AI proposals. The model may propose only a fixed operation allowlist; it cannot select arbitrary SQL, table names, provider endpoints, or execution code.
- Risk is derived from the server allowlist, never accepted from model output: read-only, reversible write, destructive, and billable.
- Plans are short-lived, bounded, and validated against the current Workspace context. Scene/timeline operations require the active Storyboard/Scene IDs; Asset upload requires the active Vyral. Client Workspace context remains a hint only and must be independently owner-verified by the server before any operation.
- Read operations require authenticated ownership verification. Reversible writes require approval bound to the exact pending plan. Destructive operations require a separate explicit DELETE challenge. Billable media generation requires a matching quote ID and confirmed credit ceiling.
- Added deterministic tests for risk classification, allowlist rejection, extra-parameter rejection, context mismatch, owner verification, plan expiry, and risk-specific approval.
- This is a policy foundation only: it does not yet connect model tool calls to a mutation executor or persist pending plans server-side. No database mutation, provider generation, customer charge, or UI change was introduced. AI Chat appearance remains unchanged; no production deployment or merge.


## Product-wide AI Operator authority model

The product direction is broader than the first Chat MVP: **AI should be able to perform the same user-level work a person can perform in VYRA**, through natural conversation and the existing app's trusted service layer. Workspace pages remain usable manually, but every eligible workflow should also be available through AI Chat. This does not mean unrestricted database access or bypassing authentication.

### Capability policy foundation

- Added `src/server/vyraAiCapabilityRegistry.ts` as the product-wide capability catalogue. It currently defines 100+ individual capabilities across Workspace, Storyboard, Scene Editor, Timeline, Vyral, Assets/DNA, media generation/editing, Media Library, Marketplace, publishing, profile/settings, account security, Admin, and platform operations.
- Each capability is classified as:
  - **Autonomous:** reads, analysis, search, navigation, previews, and other low-risk work.
  - **Approval required:** ordinary writes, external publishing/purchases, destructive changes, and billable generation. Approval must be bound to the exact action, target, and (for generation/purchase) quoted amount.
  - **Human only:** sign-in/security changes, account deletion, payout destinations/withdrawals, refund overrides, and production operations.
  - **Owner/Admin only:** provider secrets, platform pricing/billing policies, user access, privileged audit, global feature flags, and data repair. These actions remain subject to server-side role checks and may require a separate human confirmation.
- Unknown capability IDs fail closed. The registry is a policy catalogue, not a blanket execution grant: a capability becomes usable only when a matching authenticated server adapter exists, verifies resource ownership and current state, applies the correct approval, and records an audit trail.
- Added tests for capability coverage, authentication, approval gates, human-only and owner/Admin-only boundaries, and duplicate/unknown IDs. Registered the tests in CI.
- This establishes the intended app-wide authority model. It does **not** claim all capabilities are already executable from Chat: model tool exposure, per-domain executors, server-persisted pending approvals, audit logs, and end-to-end tests remain to be implemented incrementally.
- AI Chat visual design is unchanged. No production deployment, merge, provider key configuration, or billable operation was performed.


### Universal AI capability executor — secure dispatch foundation

- Added `src/server/aiCapabilityExecutor.ts`, a typed server-side dispatcher for the app-wide capability catalogue. It does not expose generic SQL, arbitrary table access, arbitrary HTTP requests, or unrestricted provider calls.
- A capability is executable only after: the capability is recognized; the user is authenticated; any required approval is independently verified server-side; Owner/Admin boundary is satisfied; the target resource is owner-verified; a capability-specific adapter is registered; input passes adapter validation; and audit events are persisted.
- Human-only actions remain blocked even when an Owner/Admin flag or a generic approval is supplied. Unknown capability IDs fail closed. Catalogue entries without an adapter return an explicit `NO_EXECUTOR` result and are never represented as completed.
- Adapter registration rejects unknown capabilities and duplicate registrations. Execution results are returned only after the adapter and success-audit operation complete; failures are reported without claiming success.
- Added tests for unimplemented capability refusal, unknown operation refusal, human-only boundaries, approval gating, owner verification, adapter validation/registration, and audit ordering. Registered `test:ai-capability-executor` in package scripts and CI.
- This is the reusable execution boundary, not yet the complete live integration: individual app domains still need narrowly scoped adapters and server-persisted approval/idempotency records. No UI changes, provider keys, production deployment, or merge.


### AI Operator pending-action persistence — database foundation

- Added a Development-ready migration for `ai_operator_pending_actions` and `ai_operator_action_audit`.
- Pending actions are scoped to the authenticated owner and chat session, have short expiry windows, bounded JSON plans, and an idempotency key. Reusing an idempotency key with a different capability or plan is rejected.
- Browser access is read-only and owner-scoped through RLS. All lifecycle writes are restricted to service-role RPCs intended to be called only from an authenticated Edge Function.
- Added atomic RPC transitions for propose, approve, reject, claim-for-execution, and finish (completed/failed). Approval and claim both re-check owner, session, status, and expiry in the database. Audit events are deduplicated per action/event.
- The migration is committed and applied to the Development Supabase project. Catalog checks confirmed both tables exist, RLS is enabled with one owner-scoped SELECT policy each, authenticated users cannot insert, and all five lifecycle RPCs are executable by `service_role` but not `authenticated`. The Supabase Security Advisor showed no findings for these new tables or RPCs. The Edge Function does not yet call these RPCs; there is no live model-driven write execution. That integration is the next step.
- No production database changes, UI changes, provider calls, or customer charges.


### Global AI Operator — first autonomous Workspace read adapters

- Extended the authenticated `vyra-openai-chat` Edge Function with two model-selectable, read-only tools available from every app page:
  - `list_my_storyboards`: lists/searches actual Storyboards belonging to the authenticated user, bounded to 30 records.
  - `get_my_storyboard_details`: loads a title-matched Storyboard and bounded scene details; reports ambiguity rather than guessing.
- Every query is scoped server-side by the authenticated `user_id`; model arguments cannot supply or override ownership.
- Tool arguments and output are bounded, search filter metacharacters are sanitized, and no writes, publishing, media charges, or privileged operations are exposed by these tools.
- Existing Vyral Asset/DNA tools remain available only when the active Vyral is independently verified as owned by the authenticated user.
- Development Supabase Edge Function `vyra-openai-chat` deployed as version 7 with JWT verification enabled. Search uses separate owner-scoped title/topic queries rather than interpolated filter expressions.
- This is the first live server-side global Workspace read capability, not completion of the 153-capability catalogue. Write execution, persisted approval integration, and the remaining domain adapters are still pending.
- AI Chat visual structure and styling were not changed. OpenAI platform key remains unset, so authenticated model-driven runtime verification awaits Phase 6; no provider call was made.






### Master Editor AI write adapter — move, trim, split and text edits

- Connected the deterministic Master Timeline operation module to the Development `vyra-openai-chat` Edge Function through `propose_master_timeline_edit`.
- Before a proposal, the server owner-scopes the parent Storyboard, reads its saved `details.masterTimeline`, validates exact clip/track UUIDs and operation parameters, then computes a preview with the same pure operation code used by unit tests.
- Supported reversible actions: move an existing Audio/Text clip within or between existing same-kind tracks; trim its start/end; split it at a valid point; update a Text clip's name/content. A split's new UUID is generated server-side and persisted in the pending plan so approval replays the exact preview.
- Preview reports before/after track, start, duration, name/content and any newly-created split clip. No database write occurs until an explicit approval in the same authenticated chat session.
- Approval uses the existing persisted pending-action lifecycle: exact owner + session, expiry, approve RPC, atomic claim, fresh owner-scoped Storyboard read with `updated_at` optimistic concurrency, reapplication against the latest Timeline, guarded DB update, and completion audit. Pending capability IDs match the registered `timeline.move_clip`, `timeline.split_clip`, and `timeline.update_clip` policies and are checked against the requested operation.
- Refined move collision handling to match `MasterTimelineEditor.settleClipDrop`: when a drop cannot fit, restore the clip to its exact original track/time; otherwise place it at the nearest free side. Empty tracks are removed just as the editor does. Unknown Master Timeline metadata is preserved, and proposals that produce no actual change do not create pending actions.
- Development Edge Function deployed as version 18, JWT verification enabled, with the shared operation module included. No production changes, API key, provider call, customer charge, or AI Chat UI/CSS change.
- The active-session ID is confirmed to flow from `AIChatPage` through `aiService` and `src/server/ai.ts` to the Edge Function, so previews and approvals are bound to the same conversation.
- Automated CI first exposed an unrelated missing import of `createVyralFileDnaV1` in `VyralDetailsContent.tsx`; added it. The streaming contract test and two stale global-chat assertions were then corrected to reflect the current bounded tool-call dispatch and natural-language preview behavior. Full GitHub Actions CI passed on commit `9736772ddc74b20cc765bb4fd4b30b8032d413d0` (run `43340953073`), including TypeScript, all action/operation tests, Deno Edge Function type-check, and production build. Live AI/browser E2E remains unverified because the OpenAI platform key is intentionally unset.
- Not yet supported: track creation/deletion, clip deletion/cloning, Scene ordering/duration, transition editing, ripple edits, source trimming, playback, and persisted undo/redo. These remain blocked until their full editor dependency rules are modeled.

### Master Editor operation engine — deterministic reversible clip operations

- Added `src/server/masterTimelineOperations.ts`, a pure server-side transformation layer using the actual `MasterTimelineData` / Track / Clip shape from `MasterTimelineEditor.tsx`.
- Implemented deterministic move between existing tracks of the same media kind, with the editor's exact single-collision nearest-free-side behavior; ambiguous multi-clip collisions fail closed. Empty source tracks are preserved, matching the UI.
- Implemented left/right trim with the same 0.2-second minimum and neighboring-clip boundaries used by the current Text and Audio trim handles.
- Implemented Audio/Text split with the same 0.2-second minimum from either edge and caller-supplied unique IDs.
- Implemented bounded Text clip name/content update. Every operation returns a new immutable timeline snapshot and preserves unrelated scene ranges, instances, transitions and other track data.
- Added `tests/master-timeline-operations.spec.ts`, `npm run test:master-timeline-operations`, and a CI step covering move, collision handling, cross-track moves, trim bounds, split and content edits.
- This is a pure operation engine and test contract only. It is not yet connected to OpenAI tool calling, pending-action approval, owner-scoped optimistic-concurrency persistence, or the live Workspace. No Timeline data has been mutated and no AI Chat UI/CSS was changed.
- Next: add a server-side proposal/approval adapter that loads the exact owner-owned Storyboard, validates the current `updated_at`, applies one operation to the latest Master Timeline snapshot, persists only after explicit approval, and rejects stale or conflicting changes. Destructive clip deletion, scene duration, source trimming, ripple editing and playback remain disabled until their complete dependency rules are implemented.

### Master Editor operational understanding — read-only foundation

- Inspected the full current `MasterTimelineEditor.tsx` implementation and its Workspace persistence path before exposing any timeline actions.
- Added global read tool `get_master_timeline_state`. It loads a Storyboard by UUID with authenticated owner scoping and returns bounded, sanitized current state: actual scene order, Scene durations, instance IDs and source metadata, transition keys/effects/durations, audio/text track IDs and settings, clip IDs/content/start/duration/end, total timeline extent, and item counts.
- The tool also returns implementation-grounded editor semantics so the model does not assume unsupported behavior: Scene durations are sourced from Storyboard Scene records and currently immutable in Master Editor; `sceneInstances` establish order while sourceIn/sourceOut are not applied to displayed duration; Audio/Text clips use independent seconds and can overlap across tracks; trim respects neighboring clips and a 0.2-second minimum; the centered playhead line is a fixed viewport overlay whose time is derived from horizontal scroll/zoom, not a persisted playback cursor; undo/redo are in-memory; Master preview playback is disabled.
- Added a system rule requiring the model to read the exact owner-owned Master Timeline before reasoning about timeline changes, preserve unrelated data, use real IDs only, and refuse to claim unsupported edits.
- Development `vyra-openai-chat` deployed as version 13 with JWT verification enabled. Deployment inspection confirmed the Master Timeline read tool, dispatch allowlist, and editor semantics are in the deployed source.
- This is a read/understanding foundation only: no Master Timeline write executor is enabled yet, no user timeline data was changed, and no OpenAI live model/browser E2E test was performed because the platform key remains unset. AI Chat UI/CSS and production remain untouched.
- Next: create a pure, testable Master Timeline operation/validation layer based on these verified editor semantics, then connect one reversible operation at a time with persisted preview/approval and optimistic concurrency. Do not enable duration, source trim, ripple, or playback operations until the editor supports their full dependency behavior.

### Second persisted AI Operator write adapter — Scene metadata

- Added the global model tool `propose_scene_update`, available from any Workspace page. It requires the owner-scoped parent Storyboard UUID and Scene UUID, and accepts only `title`, `description`, or `transition` with field-specific length limits. It deliberately excludes Scene duration and Timeline clip edits because those affect dependent timing/track data.
- The existing owner-scoped `get_my_storyboard_details` tool now returns Scene IDs (in addition to scene numbers and metadata), so the model can resolve the exact Scene before proposing a change. Ambiguous Storyboard lookup still returns candidates rather than guessing.
- A proposal persists a 10-minute `scene.update` pending action in the same authenticated user/chat session. Approval uses the existing atomic approve → claim → finish lifecycle; execution reloads the parent Storyboard, verifies the Scene still belongs to it, and updates only that Scene object inside the JSONB `details.scenes` array. The parent `updated_at` snapshot prevents stale overwrites.
- Development `vyra-openai-chat` deployed as version 12 with JWT verification enabled. Follow-up inspection confirmed the deployed source contains the Scene proposal tool, approval handler, and Scene ID projection.
- No OpenAI live model call or browser E2E test was possible because the platform key remains unset. No user Storyboard/Scene data was changed by deployment. AI Chat UI/CSS, production database, and production deployment remain untouched.
- Next: add Scene read/context tools for richer scene-specific requests, then Timeline actions with a separate dependency-aware validation model. Keep Scene duration changes disabled until timeline synchronization is implemented.

### First persisted AI Operator write adapter — Storyboard title/topic

- Added the first model-selectable reversible-write proposal tool: `propose_storyboard_update`. It accepts only an owner-owned Storyboard UUID, one of the two allowed fields (`title` or `topic`), and a bounded new value. The server loads the current row under the authenticated `user_id`; the model cannot supply owner identity, risk, expiry, or the expected database version.
- The Edge Function creates a 10-minute pending action through `create_ai_operator_pending_action`, bound to the authenticated user and exact chat session. The persisted plan includes the Storyboard ID, field, proposed value, and the current `updated_at` snapshot. The tool only returns a preview; it does not mutate the Storyboard.
- A short natural-language approval or rejection is resolved only when exactly one unexpired pending action exists in that same user/session. Approval uses the database approve → atomic claim lifecycle, then an owner-scoped optimistic-concurrency update. Stale records fail closed. Completion/failure is written through the finish RPC and audit event.
- The current executor supports only `storyboard.update` for this model-driven persisted flow. Destructive deletes, scene/timeline edits, media generation, publishing, purchases, and privileged operations are not enabled through this adapter.
- Development `vyra-openai-chat` deployed as version 10 with JWT verification enabled. Deployment succeeded and the Edge Function source was accepted/compiled. The OpenAI key remains unset, so the new tool has not been exercised through a live model call; no Storyboard write has been performed by this deployment.
- AI Chat UI/CSS and the existing direct preview workflows were not changed. Browser end-to-end verification and automated tests for the new Edge Function flow remain outstanding.

### AI Operator chat-session binding

- The existing AI Chat session UUID is now carried with each normal text-chat request from the existing composer through the client service and authenticated server route to the Development Edge Function.
- The browser creates/reuses the active session ID; the server validates UUID shape and never accepts a user ID from the client. The Edge Function derives the owner from the verified Supabase JWT and tells the model that any future pending action must be bound to both that owner and this exact chat session.
- Requests without a valid session ID are explicitly instructed not to create or approve persistent pending actions. Existing chat UI and styling are unchanged.
- Development `vyra-openai-chat` deployed as version 9 with JWT verification enabled. This deployment validates/loads the updated Edge Function source; no OpenAI runtime request was made because the platform key remains unset.
- This is the session-identity bridge only. The Edge Function does not yet create, approve, claim, or execute pending actions through the five lifecycle RPCs; no model-driven writes are enabled yet. Next: implement a narrowly allowlisted proposal/approval flow using server-side pending-action records, then add the first safe write adapter.

### Expanded global Vyral read coverage

- Added `list_my_vyrals` and `get_my_vyral_details` to the authenticated global AI tool set. These tools are available regardless of the current Workspace page.
- Vyral lookups are strictly scoped to the authenticated user. Search uses separate name/description queries; ambiguous name matches are returned as choices rather than silently selecting one.
- Detail reads include bounded Asset inventory, latest available Asset DNA verification metadata, Master DNA status/revision, and latest Master DNA fingerprint. No file bytes or storage paths are exposed.
- Development `vyra-openai-chat` deployed as version 8 with JWT verification enabled. Deployment succeeded, which confirms the Edge Function source compiled; no OpenAI runtime call was made because the platform key remains unset.
- Remaining: server-persisted approval/action lifecycle integration and safe write adapters; the broader capability registry remains a policy catalogue, not 153 live executors.

### Master Timeline transition editing — Development deployed

- Inspected the actual MasterTimelineEditor transition controls. Supported effects are exactly `dissolve`, `fade`, `wipe`, `slide`, `zoom`, and `blur`; the editor's None control removes a transition. Applying a new effect preserves the current duration, or uses the editor default of 0.5 seconds when no transition exists. There is no duration-edit control in the current UI, so AI does not invent one.
- Added the pure `updateMasterTimelineTransition` operation. It accepts only one of the six editor-supported effects or removal, requires the transition key to be in the exact adjacent-Scene boundary allowlist, preserves existing duration, and leaves unrelated timeline data untouched. Unit tests cover adding, changing, removing, unsupported effects, and non-adjacent keys.
- Added `propose_master_timeline_transition` to the Development Edge Function tool contract. It loads the owner-owned Storyboard, derives Scene ordering exactly like `MasterTimelineEditor`, verifies the requested transition key is a real adjacent Scene boundary, and stores a 10-minute preview bound to the same user and chat session.
- Transition changes use the existing `timeline.add_transition` approval-required capability and persisted pending-action lifecycle. Approval re-reads the exact Storyboard snapshot, re-derives valid adjacency, applies the operation, and saves only `details.masterTimeline` with an optimistic `updated_at` guard. Rejection/expiry/stale snapshots do not modify the Timeline.
- The preview reports current and proposed effect/duration. `none` removes the transition. The AI Chat UI and CSS are untouched.
- `get_master_timeline_state` now returns explicit `transitionBoundaries` with exact adjacent Scene pair keys, so the model does not need to invent or reconstruct transition IDs. The proposal and approval handlers independently re-derive the allowlist from the current owner-owned Storyboard.
- Full GitHub Actions CI passed on commit `0071471f04f24454e72257ac9ddf6047f4c87b39` (run `43342274737`), including the transition contract tests, TypeScript check, Deno Edge Function type-check, and production build. Deployed Development `vyra-openai-chat` version 20 with `verify_jwt=true`; follow-up inspection confirmed the transition and clip-clone proposal tools, explicit transition boundary list, approval capabilities, and shared operation module are present. No API key or live OpenAI call was used; no user Timeline mutation, production database/deployment, or merge.
- Extended the same Master Timeline proposal tool with `clone` for Audio and Text clips. It duplicates the exact selected clip within its existing track, places the copy at the end of that track (matching the current Editor controls), generates a fresh globally unique clip ID, and preserves waveform data. The preview identifies the new clip; persisted approval is required before saving.
- Added tests for Audio/Text cloning, source immutability, global ID collisions across media kinds, and the approval-gated `timeline.add_clip` capability. Full GitHub Actions CI passed on commit `23651fad608035d1994dff80ac4630e698a9d43a` (run `43342804848`), including TypeScript, all action and timeline tests, Deno Edge Function type-check, and production build.
- Development `vyra-openai-chat` version 20 is ACTIVE with JWT verification enabled. Deployment inspection confirmed both transition and clone operations are included. No user Timeline records were changed. OpenAI key remains unset, so live model/browser E2E is still pending.

### Master Timeline Audio/Text clip deletion — destructive confirmation foundation

- Added a pure immutable `deleteMasterTimelineClip` operation for Audio and Text clips. It removes only the exact clip from the exact same-kind track and removes the track if it becomes empty, matching the current MasterTimelineEditor delete behavior. Missing track/clip and invalid timeline data fail closed; source snapshots remain unchanged.
- Connected the operation to the Development AI proposal/approval path as `timeline.remove_clip`. The proposal loads the exact owner-owned Storyboard, captures the clip snapshot in the short-lived pending plan, and previews the exact clip and its current track/timing/content. The snapshot is retained in the audit result for future recovery tooling.
- Deletion requires a distinct phrase of the form `DELETE CLIP XXXXXX`, where the six-character code is derived from the selected clip ID and shown in the preview. Ordinary approvals such as “yes”, “go ahead”, “လုပ်ပါ”, or “ဆက်လုပ်” cannot authorize deletion. The resolver checks the exact phrase against the pending plan, same owner/session, expiry, capability, and optimistic Storyboard timestamp before applying the immutable operation.
- The capability registry already classifies `timeline.remove_clip` as approval-required and destructive. Development `vyra-openai-chat` deployed as version 21 with `verify_jwt=true`; a post-deploy source inspection confirmed the delete operation, destructive capability, exact confirmation phrase, and generic-approval rejection gate are present. AI Chat UI/CSS is unchanged. The repository CI workflow was not triggered/available for this branch commit, so the automated test suite remains unverified; deployment is Development-only, with no production database or function changes.
