# VYRA Instant Navigation & Smart Data Sync

## Product goal

VYRA should feel continuous: moving between pages, folders, and workspaces should not repeatedly show blocking loading states or refetch unchanged data. Existing content should appear immediately when available; only changed or missing data should be fetched.

This is a platform-wide UX and data-flow standard, not a Media Library-only optimization.

## Non-negotiable behavior

1. **Keep visited page state alive.** Top-level sections are mounted on first visit and hidden when inactive so local state, scroll containers, selections, and loaded data survive navigation.
2. **Render cached content first.** A cached page or folder is shown immediately. A background refresh must not replace it with a blocking spinner.
3. **Patch only changed records.** Upload, create, rename, move, and delete operations update the affected item(s) and their relevant cached lists.
4. **Revalidate quietly.** Refresh stale data after the relevant page becomes active, on app focus/online events, or after a known external change. Do not refresh unrelated hidden pages.
5. **Use loading only for a true first load.** A page with no usable cached content may show its initial loading state. Refreshing existing content should use a subtle, non-blocking indicator or no indicator.
6. **Preserve security boundaries.** All reads and mutations remain owner-scoped and rely on existing Supabase RLS. Caching must never mix users or expose private Storage URLs.
7. **Recover safely.** If a mutation fails, keep the last confirmed state and show the error. If an optimistic mutation cannot be reconciled, invalidate only the affected cache key and retry in the background.

## Shared architecture

### Navigation lifecycle

- The app shell retains each visited top-level page.
- A shared `vyra:page-activated` browser event announces navigation.
- Profile subpage changes announce `profile:<page-key>` so a page can refresh only when it becomes visible.
- The app shell remembers top-level scroll positions; each mounted page remains responsible for its own internal scroll container.
- Page components should subscribe to activation events only for their own page key and remove listeners on unmount.

### Data cache contract

Every cache entry should be keyed by the authenticated owner and the complete query context (page, folder, search, filters, pagination, and relevant workspace/project ID). A cache entry should track:

- data;
- last successful fetch time;
- loading/error state separately from data;
- pagination cursor or has-more state;
- invalidation/version information where required.

Never use a shared unscoped cache for private user data. Clear owner-specific caches on sign-out or account switch.

### Freshness policy

- Fresh cache: show immediately and do not fetch.
- Stale cache: show immediately, then revalidate in the background.
- Missing cache: show the initial loading state and fetch.
- Known local mutation: patch the relevant cache entries directly; do not refetch the entire page.
- Failed revalidation: keep cached content visible and expose a quiet retry/error affordance.

Freshness windows should be configured by data type rather than using one global timeout. Real-time balances, active generation jobs, and permissions may require shorter windows than static library metadata.

### Mutation policy

- Create/upload: insert the confirmed server record into the current view and its cache.
- Rename: update only the renamed record and any derived labels.
- Move: remove the record from the source view; invalidate or patch only the destination view.
- Delete: remove only the confirmed deleted records. For multi-step operations, patch each successful step immediately so partial failures do not leave stale UI.
- Reorder/edit: patch the affected order or entity only.
- If the server is authoritative and returns a canonical record, use that record rather than guessing server-generated fields.

## Current implementation status

### Implemented on the active feature branch

- Top-level Marketplace, Workspace, and AI Chat sections remain mounted after first visit.
- Profile and visited Profile subpages remain mounted.
- Top-level scroll positions are restored when switching sections.
- The app shell and Profile page emit page-activation events.
- My Media Library caches folder views by folder/search/filter context and displays cached data before a quiet refresh.
- Folder metadata is cached briefly per owner; thumbnail signed URLs are reused until shortly before expiry.
- Storage cleanup is throttled rather than started on every folder load.
- Uploads fetch and add only the new indexed item.
- Rename, move, create-folder, and delete operations patch the affected local state and cached lists rather than reloading the whole current folder.
- Returning to My Media Library triggers a quiet refresh only when that view's cache is stale.

### Remaining rollout

- Apply the same cache contract to Storyboards, Workspace projects, Vyrals, Marketplace lists, and AI Chat history/context.
- Add owner-aware cache clearing on sign-out/account switch.
- Add focus/online revalidation for data that can change outside the current browser session.
- Add domain-specific freshness windows and targeted invalidation for cross-page actions.
- Add browser tests for back-and-forth navigation, scroll/state preservation, no blocking spinner on cache hits, and targeted network requests after mutations.
- Verify performance and correctness on Development before considering this work complete.

## Verification rules

- Build and TypeScript checks must pass.
- Browser tests must cover the actual signed-in Library surface and navigation between app sections.
- Database/RLS tests must continue to pass.
- No production migration or deployment is part of this work unless separately authorized.
- Do not modify Master Editor as part of this architecture rollout.
