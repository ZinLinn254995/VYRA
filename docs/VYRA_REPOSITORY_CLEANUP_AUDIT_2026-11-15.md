# VYRA Repository Cleanup Audit — 2026-11-15

**Authority:** `docs/VYRA_PRODUCT_DIRECTION_2026-11-15.md`
**Branch:** `feature/my-storyboard`
**Scope:** Read-only inventory plus explicitly identified safe cleanup. This is not authorization to delete customer data or rewrite applied migrations.

## 1. Verified repository baseline

- Repository: `ZinLinn254995/VYRA`
- Default branch: `main`
- Working branch: `feature/my-storyboard`
- PR: #122, open, Draft, unmerged
- Audit baseline before this reset: 588 tracked paths; 164 files under `src/`; 90 Supabase migration files.
- PR #122 baseline workflows before the reset-document commit: VYRA CI, Browser UI Tests, and Database Tests completed successfully.
- Current application entry point: `src/App.tsx`. Its active top-level surfaces are Marketplace, Workspace, AI Chat, and Profile.
- Production services and data are out of scope. Only the Development environment may be used for future schema verification.

## 2. Keep

| Area | Existing foundation | Reason |
|---|---|---|
| Authentication and tenancy | `src/context/AuthContext.tsx`, `api/auth/session.ts`, `supabase/migrations/20261103101212_initial_customer_data.sql` | User identity, server verification, owner-scoped records, RLS |
| Asset storage and integrity | `vyral_assets`, `vyral_asset_versions`, private Storage, hashes, provenance, ingestion services | Canonical source files, version history, traceability |
| Media Library | `src/components/profile/MyMediaLibraryPage.tsx`, `src/services/mediaLibraryCloud.ts`, `20261114080203_media_library_cloud.sql` and follow-up safety migrations | Upload, organize, preview, download, and reuse media |
| Financial safety | Credit ledger, transfer, quote/approval, usage and pricing migrations/services | Prevent double charges, preserve ledger history, enforce explicit spend approval |
| AI Chat | `src/components/ai/AIChatPage.tsx`, `src/services/aiService.ts`, OpenAI server function and conversation migration | Central conversational control surface |
| Workspace foundation | `src/components/workspace/WorkspacePage.tsx`, storyboard persistence | Creative project and scene planning |
| Publishing foundation | `src/server/tiktok.ts` and related API route | Existing TikTok OAuth/publishing work is reusable |
| Vyral identity and protected sample | `vyrals`, `vyral_assets`, DNA/fingerprint/provenance records, ORIGIN-01 protection migrations | Reusable Universe/Consistency foundations and test fixture |

## 3. Refactor

| Area | Existing location | Required direction |
|---|---|---|
| Vyral identity and DNA | `src/services/vyral*`, `src/server/vyral*`, Vyral migrations and schemas | Reframe Vyral as a Creative Universe; retain Asset DNA and Fingerprints as internal systems; remove mandatory Main/Supporting, purpose, and relationship assumptions |
| Master DNA / context | `vyralMasterDnaV1`, context applicability, inventory, resource resolver | Derive Universe DNA from authoritative assets, entities, canon, state, and optional relationships; retrieve task-relevant context only |
| Workspace and Storyboard | `WorkspacePage.tsx`, storyboard persistence | Connect deliverable projects, Vyral Universes, media, editing, and output versions without duplicate state |
| Media generation | media contracts, quote/approval, provider jobs, AI capabilities | One server-side provider adapter and ingestion pipeline for all supported media |
| Sharing | Vyral resource share grants and license policy | Scope access to selected Universes, Assets, Projects, and collaboration actions |
| Marketplace | `src/components/marketplace/MarketplaceHome.tsx`, creator/license foundations | Replace empty shell with real listings, permissions, licensing, purchase and creator workflows when backend is ready |
| Social publishing | TikTok API plus legacy `PublishingView.tsx` | Make publishing an approved, traceable workflow connected to finished outputs |
| Profile and creator settings | `ProfilePage.tsx`, API key settings, creator pages | Keep profile simple; centralize platform credentials and creator account controls |
| AI orchestration | AI Chat actions, capability registry, pending actions | Make chat coordinate the full creator journey while preserving authorization and approval gates |

## 4. Replace or retire after dependency checks

| Candidate | Evidence / concern | Safe disposition |
|---|---|---|
| Old Studio navigation and screens | `Sidebar.tsx`, `TopHeader.tsx`, and `src/components/views/*` are not imported by the current `src/App.tsx` entry point | Treat as legacy UI; extract useful workflows first, then remove unreachable duplicate screens and their obsolete state dependencies |
| Old AI Ideas Chat | `AIIdeasChatView.tsx` duplicates the current global `AIChatPage.tsx` concept | Retire after full reference check |
| Old Media Library screen | `MediaLibraryView.tsx` duplicates the cloud-backed `MyMediaLibraryPage.tsx` | Retire after feature parity/reference check |
| Legacy OpenRouter BYOK screen | `OpenRouterSettings.tsx` and old model/key-selection flow conflict with centrally managed platform credentials | Remove customer BYOK path; keep secure server-side provider routing |
| Gemini settings / Vision path | `GeminiProviderSettings.tsx` and `docs/VYRAL_AI_VISION_PIPELINE.md` describe a Gemini-specific route | Replace with the approved OpenAI/provider-adapter architecture only after code-path verification |
| Old StudioContext state | `src/context/StudioContext.tsx` supports the legacy screen family, not the current `App.tsx` shell | Remove only after proving no active runtime, test, or migration dependency |
| Reconstruction-first acceptance docs | DNA-only blind reconstruction protocols and 100%-reconstruction goals dominate several older docs | Archive or mark superseded; keep deterministic integrity tests where they protect source bytes and fingerprints |

## 5. Immediate cleanup completed

- Added `docs/VYRA_PRODUCT_DIRECTION_2026-11-15.md` as the current product authority.
- Removed the founder-email condition that automatically seeded three demo Storyboards into the creator's Workspace.
- Removed the demo Storyboard seeding implementation from `WorkspacePage.tsx`; existing saved Storyboards are still read and preserved.
- No user-owned database rows, Storage objects, applied migrations, Production resources, or Master Editor files were changed.

### Cleanup batch 2 — 2026-11-15

- Removed unreferenced legacy UI components: `AIIdeasChatView.tsx`, `MediaLibraryView.tsx`, `GeminiProviderSettings.tsx`, `SettingsView.tsx`, `OpenRouterSettings.tsx`, and old `Sidebar.tsx`, `TopHeader.tsx`, and `AuthPanel.tsx`.
- Removed seven orphaned legacy Studio view components after repository-wide reference checks: `DashboardView.tsx`, `AnalyticsView.tsx`, `ProjectsView.tsx`, `CreateVideoView.tsx`, `PublishingView.tsx`, `ConsistencyLibraryView.tsx`, and `ProjectWorkspaceView.tsx`. Current remaining files in that folder are retained operational panels, not assumed obsolete.
- Removed unused Gemini Edge Functions `vyra-gemini-proxy` and `manage-ai-provider` from repository source; removed the unused `@google/genai` dependency and synchronized the lockfile.
- Added a forward-only Development migration to remove the legacy Gemini Vault accessors and stored Gemini key. The historical migration remains unchanged; this new migration has not been applied to Production.
- Removed unused legacy navigation and static social-channel configuration from `src/config/brand.ts`; the current BrandLogo consumers retain their needed brand fields.
- Updated app metadata and public product pages to describe the All-in-One AI Creative & Publishing Platform and the internal DNA & Consistency Engine, rather than presenting DNA-only reconstruction as VYRA's main purpose.
- Updated legacy DNA and creator-ecosystem documents with explicit supersession notes. Kept historical technical experiments for reference; they are not current acceptance criteria.
- Added ignore rules for generated Playwright output. Existing tracked reports and screenshots were preserved.
- Preserved ORIGIN-01, all creator data, historical migrations, and the Master Editor. AI Chat UI was not changed.

### Cleanup batch 3 — 2026-11-15

- Removed the customer-supplied OpenRouter BYOK routes from `src/server/ai.ts`, and removed the OpenRouter pricing router from the Node, Vercel catch-all, and Cloudflare Worker entry points.
- Removed the OpenRouter-specific pricing estimator and BYOK-only tests. Kept the generic financial ledger schema and refactored its server recorder contract to be provider-neutral; it is not yet connected to active OpenAI/Runway generation.
- Removed the now-unreferenced legacy StudioContext, Agent Tools subsystem, local Media Library storage, spend-confirmation helper, and old usage/review/backup/recovery UI panels. The active cloud Media Library, Workspace, Vyral, Auth, and financial backends remain.
- Updated package scripts and CI workflows so they no longer invoke deleted OpenRouter-specific tests or routes.
- Refactored the Vyral detail surface to expose only creator-facing Overview, Gallery, and License sections. Internal DNA/Fingerprint/Vision review tabs were removed from the user-facing page; backend DNA, fingerprint, provenance, package integrity, and upload maintenance remain.
- Updated usage-ledger and billing runbooks to state that customer BYOK is retired and platform-managed OpenAI/Runway usage recording is not yet implemented. Historical provider details are marked as legacy.
- A TypeScript failure caused by stale imports was fixed. A contract test that referenced the deleted StudioContext was updated to test the active AI Chat and Admin API-key settings instead. A further vision-contract test was updated to assert internal DNA/Vision review controls are not exposed in the creator UI.
- No Production service, Production database, customer-owned data, ORIGIN-01 data, applied migration history, or Master Editor implementation was modified. No merge or deployment was performed.

### Cleanup batch 4 — 2026-11-15

- Removed the unreferenced demo project seed module and its four bundled sample video images. Existing creator data and ORIGIN-01 were not affected.
- Updated the public DNA technical page and SEO contract to describe internal Asset integrity and Creative Universe consistency, not external DNA-only reconstruction.
- Simplified the database workflow to run only local Supabase startup, migration reset, and pgTAP; removed the retired OpenRouter E2E scaffolding.
- Added a pgTAP regression test confirming legacy Gemini Vault accessors are absent and the old Gemini API secret is not retained.
- Verification on current branch head `7199bfe0b954a512da779c542fa88623370aabba`: TypeScript/CI passed; browser UI tests passed; local Supabase migration reset and all 275 database tests passed.
- Current PR #122 remains open and Draft. No merge, Production deployment, or Production database action was performed.

### Cleanup batch 4 — native Vyral package boundary

- Confirmed the creator-facing Vyral export menu exposes only **Assets only** and **Vyral package**; it does not expose DNA-only or blind reconstruction modes.
- New native .vyral exports no longer include AI_RECONSTRUCTION_GUIDE.md or tools/reconstruct_vyral.py. The package remains a VYRA-native Universe/Asset transfer format with selected Asset files, DNA/context records, protected system metadata, and integrity checks.
- Updated package projection so old reconstruction guide/script entries are not carried into newly selected native exports. Legacy DNA-only package validation/import support remains as a backward-compatibility path; do not build new creator workflows around it.
- Added a regression test that starts with a package containing legacy reconstruction helper files and asserts that new native package exports strip them.
- Updated the authoritative Product Direction document to define .vyral as a native Creative Universe package, not an external-AI reconstruction prompt bundle.
- The source-integrity and fingerprint foundations remain. The old portable reconstruction script and historical DNA-only protocol are retained only as legacy compatibility/research material until a later, separately tested removal/migration phase.
- Latest verified CI at the start of this batch: VYRA CI and Browser UI Tests passed on commit 63bb253; Database Tests were still running. The package export changes have triggered fresh CI; final outcomes are pending.
- No Master Editor, AI Chat UI, Production environment, Production database, applied migration history, ORIGIN-01 source data, merge, or deployment was touched.

### Development database audit — 2026-11-15

- Audited only Development project `wbqheogfoahnjvgkwhxe`; Production was not queried or changed.
- Found the legacy Gemini secret accessors and `vyra_gemini_api_key` Vault entry still present in Development despite the source cleanup.
- Added the forward-only migration `20261115011448_remove_legacy_gemini_provider_secret.sql`, applied it to Development, and verified both legacy function count and legacy Vault secret count are now zero. The migration history now contains 90 entries.
- The initial migration draft referenced a Vault deletion helper that does not exist in this project's installed Vault extension. It was corrected to delete only the specifically named row from `vault.secrets`; no other secret was targeted.
- Development data counts confirm that historical and active records exist: 8 Vyral assets, 8 asset versions, 17 DNA records, 14 fingerprints, 3 lineage rows, 1 Master DNA revision, 23 reconstruction-test records, 5 storyboards, 8 Media Library folders, 1 Media Library item, and 3 AI Chat conversations. These records were not deleted.
- Empty tables such as asset relationships and collection references remain as product foundations; zero current rows do not establish that their schemas are obsolete.
- Six tables have RLS enabled and no client policies; they are server-owned configuration, telemetry, or rate-limit tables and were not changed without a grant/usage audit.
- Security advisors still report two SECURITY DEFINER RPCs (`get_credit_wallet` and `search_credit_recipients`) callable by authenticated users. Both functions explicitly require `auth.uid()` and scope returned data to that caller; retain pending a separate security review rather than remove their intended functionality.
- Leaked-password protection is disabled in Development and should be enabled in Supabase Auth settings. Performance advisors also report unindexed foreign keys and unused indexes; do not drop indexes based only on early/low-traffic usage statistics.
- The Development project still reports the old `vyra-gemini-proxy` and `manage-ai-provider` Edge Functions as ACTIVE even though their repository source has been removed. The connected Supabase actions do not expose an Edge Function delete operation; these deployed functions remain a manual Dashboard/CLI cleanup item.
- No customer rows, ORIGIN-01 data, unrelated Vault secrets, Production resources, applied historical migration files, or Master Editor code were deleted or changed.

## 6. Must not delete or rewrite

- Never delete customer-owned Assets, Vyrals, projects, media, or canonical versions as code cleanup.
- Never rewrite or delete already-applied Supabase migration files. Use forward-only migrations in Development.
- Preserve RLS, ownership checks, private Storage, server-side secret handling, and financial ledger protections.
- Preserve ORIGIN-01 and its source data.
- Do not touch `src/components/workspace/MasterTimelineEditor.tsx` or its Master Editor implementation.
- Do not change AI Chat UI while that work is paused.

## 7. Remaining audit gates

1. Complete the source dependency/reference audit for remaining shared modules and legacy documentation.
2. Remove the two deployed Gemini Edge Functions from the Development project through Dashboard/CLI; verify no runtime references remain.
3. Inspect Development grants, Storage buckets/policies, and remaining function dependencies before proposing schema cleanup.
4. Resolve documentation conflicts and explicitly mark obsolete reconstruction-only goals as historical; remove legacy reconstruction code only after backward-compatibility dependencies are proven unnecessary.
5. Run CI, browser, database, and Development end-to-end checks after each safe cleanup batch.

**Status:** Partial audit; cleanup is ongoing. Candidate items above are not automatically approved for deletion. Re-check current branch references before every additional removal.
