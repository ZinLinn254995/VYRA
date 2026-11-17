# Creative Project Platform — Implementation Plan

**Status:** Current direction, supersedes older Vyral/DNA-first implementation plans where they conflict.
**Branch:** `feature/my-storyboard` only. Never merge to `main` without explicit approval.

## Product surface

A project has three working areas:

1. **AI Chat** — the conversational control surface. The user describes what they want; the AI uses authorized project tools.
2. **Editor** — the video editing surface. Preserve working timeline and preview behavior.
3. **Storage** — an unrestricted project file manager.

There is no separate Details area. Do not add a Details tab, panel, mandatory form, or mandatory project document.

## Storage rules

Storage is a general-purpose file manager, not a knowledge system.

- Users may upload any supported file type, create any folders they want, and store nothing.
- Do not require a README, project brief, notes, metadata, tags, DNA, character sheets, relationship maps, Universe records, or other prescribed structures.
- Project context may stay in chat, be inferred from current project/editor state, or be kept in files when the user chooses.
- AI-created supporting files are optional and only created when useful, authorized, and appropriate to the task.
- Keep owner/project isolation, safe file operations, recovery, and versioning as infrastructure guarantees.

## AI Chat rules

- General conversation must work without an active Vyral, DNA snapshot, or pre-populated Storage.
- The AI may use the current conversation, relevant project/editor state, and files the user has chosen to make available.
- Tools must be narrow, project-scoped, authenticated, and independently authorized by the server.
- Read-only operations may run when authorized. Destructive or externally visible actions require explicit confirmation.
- Never claim a file, edit, generation, or other operation succeeded until the backend confirms it.
- Missing provider credentials must produce a clear error; never fabricate an AI response or silently switch providers.
- Keep one AI Chat surface. Do not create separate assistant products.

## Editor rules

- Preserve the existing video editor and its essential timeline, preview, and project persistence behavior.
- AI may propose or perform supported edits only through the same validated editor operations used by the application.
- Do not retain DNA/Universe dependencies merely because the editor currently imports them; first identify what behavior they actually provide, then replace or remove the dependency safely.

## Required infrastructure

- Authenticated project ownership and isolation.
- Generic file upload/list/read/rename/move/delete operations with safe path validation.
- Optional version history and recovery.
- Scoped AI tool execution and confirmation for consequential actions.
- Long-running job state, retry/recovery, and truthful status.
- No extra user-facing infrastructure panels.

## Refactor order

1. **Remove implicit Universe creation from Storage.** Current `StoryboardUniverseTab` creates a `vyrals` row with `universe_scope: storyboard` just to prepare Project Assets. Replace this with project-scoped generic Storage. Do not simply point it at the personal library: that would lose project isolation.
2. **Add project scope to generic Storage safely.** Trace the deployed `media_library_folders` and `media_library_items` schema, owner checks, RLS, folder moves, upload paths, cleanup jobs, and existing data. Add a forward migration for project ownership and matching owner/project constraints. Preserve existing personal and Vyral-backed rows; do not rewrite deployed migrations.
3. **Decouple Storage runtime from Vyral concepts.** Remove automatic syncing to `vyral_folders`/`vyral_assets` for ordinary project files. Keep any legacy Vyral library compatibility isolated until migration/recovery is proven.
4. **Make AI Chat project-native.** General chat must not require an active Vyral. Add only generic, project-scoped file tools that operate on user-selected files; do not introduce a mandatory knowledge schema.
5. **Decouple Editor only where safe.** Preserve working editing behavior while removing unnecessary DNA/Universe assumptions from its runtime dependencies.
6. **Delete obsolete systems after dependency tracing.** Remove unused DNA, Fingerprint, Master DNA, reconstruction, quality grading, package, marketplace, credit, and integration code only when routes, imports, jobs, tests, and data dependencies are accounted for. Never delete deployed migration history as a shortcut.
7. **Verify the exact branch commit.** Run CI, production build, relevant Storage/AI Chat/Editor tests, and browser UI tests. Report failures and unverified live-provider behavior honestly.

## Current findings

- `StoryboardUniverseTab` currently creates a private `vyrals` row with DNA-related fields and storyboard metadata when a Storyboard Storage view is opened.
- `mediaLibraryCloud.ts` still synchronizes Storyboard Universe folders and Assets from `vyral_folders` and `vyral_assets`; its optional `universeId` path also supports a personal library, but that is not a substitute for project-scoped Storage.
- `media_library_folders` and `media_library_items` already have owner-scoped RLS and safe folder-move protections. Preserve those guarantees when adding project scope.
- `vyra-openai-chat` still contains extensive Vyral/Asset/DNA/Universe/Timeline-specific instructions and tool paths. General chat should remain usable without activating those paths; remove or isolate them incrementally with regression coverage.
- The AI Chat page is located at `src/components/ai/AIChatPage.tsx`; the server proxy is `src/server/ai.ts`; the Supabase chat function is `supabase/functions/vyra-openai-chat/index.ts`.

## Non-negotiable constraints

- Do not touch `main`, create a new branch, or deploy Production.
- Do not change approved UI styling/layout unless explicitly requested.
- Do not make Storage content conventions mandatory.
- Do not claim CI, browser tests, live provider calls, or migrations passed unless actually verified on the exact commit and environment.


## Progress update — 2026-11-17

- Added `project_id` columns to the generic Media Library folder and item indexes through a forward migration. Existing personal and Universe rows remain unassigned; no legacy files are moved.
- Added database checks so a project-scoped folder/file must belong to the authenticated owner's Storyboard and a file/folder parent must share the same project and legacy scope.
- Preserved folder-cycle prevention and changed root folder uniqueness to be per storage scope.
- Project foreign keys use `ON DELETE RESTRICT` so deleting a Storyboard cannot silently cascade away the Storage index while leaving untracked binary objects.
- Added a migration contract test and registered it in CI.
- Removed the main Project AI Chat's dependency on first preparing a Vyral library. The Chat surface now renders with a null optional Vyral context when no library exists; project media generation still needs its own supported Asset destination flow.
- Added a regression assertion for this Chat behavior.

**Not yet complete:** `mediaLibraryCloud.ts` and `MyMediaLibraryPage` still need to pass and enforce `project_id` in every list/create/upload/move/rename/delete/thumbnail path. `StoryboardUniverseTab` still creates the legacy Vyral container until that runtime migration is ready. Do not deploy the migration or remove that legacy path before the project-scoped runtime and deletion cleanup are implemented and verified.

## Storage runtime audit — 2026-11-17

The first runtime inspection confirms that switching the project page directly to `universeId={null}` would be incorrect: that selects the personal library scope. The project scope must be an explicit, separate parameter all the way from the page to every database operation.

Before removing the legacy Storyboard Universe path, the runtime migration must cover all of these operations:

- Read scope: folder listing, paginated item listing, item lookup by ID, signed original URLs, and folder-cache keys.
- Folder mutations: create, rename, move, and delete, including same-project parent validation and empty-folder checks.
- File mutations: upload, index registration, rename, move, and delete, with every query constrained by owner and `project_id`.
- Derived data: thumbnail creation, thumbnail backfill, signed-thumbnail cache keys, and compare-and-set metadata updates.
- Recovery: storage cleanup queue ownership, safe path validation, retry processing, and project-scoped deletion transactions.

Important deletion finding: the current personal-library delete path calls `delete_media_library_items_and_queue_storage_cleanup` after verifying `universe_id IS NULL`. That is not sufficient for project rows. Project deletion needs a dedicated atomic database operation (or a carefully verified equivalent) that checks `user_id + project_id`, queues only project-owned standalone binaries and thumbnails, deletes only the matching index rows, and never deletes canonical Vyral-backed objects. The existing Universe delete path directly removes canonical Asset/version objects and invokes Master DNA; that behavior must never run for generic project files.

Important upload finding: generic personal uploads currently use owner-prefixed `media-library/` and `media-library-thumbnails/` object paths. Project uploads may use the same private owner namespace, but the database index must carry `project_id`; cleanup and authorization must continue to validate the owner prefix and must not infer project ownership from an untrusted Storage path.

The runtime switch remains intentionally blocked until all of the above paths are implemented and tested together. Keep the current legacy Storyboard Universe behavior in place until then; do not expose a half-migrated Storage page with broken upload or destructive actions.

## Progress update — 2026-11-17 (continued)

- Removed the second legacy Project AI Chat gate: the Scene-layout Chat now renders with a nullable optional Vyral context rather than waiting for a Vyral library to exist.
- Removed the hidden `StoryboardUniverseTab` preloader that previously created a Vyral container in the background just to make that Chat render.
- Extended the Project AI Chat regression test to cover both the current Project Chat view and the legacy Scene-layout Chat path, including the absence of the hidden Universe preloader.
- This change does not yet replace the visible legacy Storage/Universe tab; that remains deliberately intact until generic project-scoped Storage supports every file operation and cleanup path.

**Verification status:** source/test changes were committed, but this environment has not run the Node test, TypeScript build, browser tests, or GitHub Actions for the new commits. Do not interpret the static test-source update as a passing test run.


## 2026-11-17 — Generic Project Storage runtime implementation

- Added explicit `projectId` scope to Media Library reads, signed-URL lookup, folder CRUD/move, file move/rename/delete, uploads, and thumbnail backfill.
- Project queries are constrained by the authenticated owner, `project_id`, and `universe_id IS NULL`; legacy personal and Universe scopes remain separate.
- Project mutations verify the Storyboard owner and verify the selected folder/file rows belong to that exact project before changing them.
- Replaced the Storyboard Storage tab's hidden Vyral/Universe creation with the existing generic Media Library UI bound directly to the Storyboard ID.
- Added an atomic project-file deletion RPC. It rejects canonical Vyral-backed rows and unsafe paths, queues standalone originals/thumbnails for owner-scoped cleanup, then deletes only the selected project's index rows in the same transaction.
- Generic project uploads remain in the private owner-prefixed `media-library/` and `media-library-thumbnails/` Storage paths; project identity is carried by the database index, not inferred from a client-provided path.
- Added project runtime scope tests and wired them into CI alongside migration safety tests.
- Verification status: source/commit inspection only. The new migration has not been applied to Supabase; tests, TypeScript check, browser flow, and production deployment have not been run. Do not expose the new Storage runtime in production until CI passes and the migration is reviewed/applied in the intended environment.
- Remaining audit: project-scope generated/chat asset registration and AI file-tool operations; confirm project deletion/recovery interactions; verify Supabase RLS/Storage policies and execute the migration in a non-production environment before enabling the workflow.

- Project-scoped AI Chat now skips the global owned-Vyral lookup, so ordinary project conversations do not depend on a selected Universe.
- Important remaining dependency: Runway project media generation and recovery still target a Vyral/Universe ID. Generic project Storage is wired for user-managed files, but generated media handoff into project Storage is not yet migrated; do not claim full project-native AI generation until the generation-job schema, provider workflow, recovery, and asset ingestion are moved to project scope.
