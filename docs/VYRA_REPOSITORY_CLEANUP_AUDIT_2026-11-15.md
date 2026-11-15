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

## 6. Must not delete or rewrite

- Never delete customer-owned Assets, Vyrals, projects, media, or canonical versions as code cleanup.
- Never rewrite or delete already-applied Supabase migration files. Use forward-only migrations in Development.
- Preserve RLS, ownership checks, private Storage, server-side secret handling, and financial ledger protections.
- Preserve ORIGIN-01 and its source data.
- Do not touch `src/components/workspace/MasterTimelineEditor.tsx` or its Master Editor implementation.
- Do not change AI Chat UI while that work is paused.

## 7. Remaining audit gates

1. Complete the source dependency/reference audit for legacy Studio UI and shared modules.
2. Inspect all relevant Development database tables, policies, functions, Storage buckets, and actual records before proposing schema cleanup.
3. Resolve documentation conflicts and explicitly mark obsolete reconstruction-only goals as historical.
4. Prepare a deletion/refactor sequence that preserves every useful capability and all existing user data.
5. Run CI, browser, database, and Development end-to-end checks after each safe cleanup batch.

**Status:** Partial audit. Do not treat candidate files above as deleted or the cleanup as complete.
