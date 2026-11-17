# VYRA Project Core Rebuild — Local-First Hybrid Architecture

Status: Approved architecture / implementation in progress
Working branch: `feature/project-core-hybrid-rebuild`
Base branch: `feature/my-storyboard`
Scope: Preserve the approved UI and existing user data while replacing the legacy Project internals.

## 1. Product boundary

A Project has exactly three primary user-facing work areas:

1. **Storage** — the canonical Project file manager.
2. **Chat** — Project-aware AI conversation and generation.
3. **Editor** — timeline, preview, playback, and editing.

Project Details is not a separate feature or destination. Existing approved UI structure, styling, navigation, and interactions must remain unchanged unless a change is required to preserve existing behavior.

## 2. Core invariants

- One logical Project File has one stable `projectFileId` and one Project record.
- Device Original, VYRA Offline Storage, and Cloud are physical replicas of that same logical file, not separate user-visible files.
- VYRA Offline Storage is the primary working copy after local import completes.
- Project Storage, Chat, and Editor all resolve the same `projectFileId`; no feature may invent or disguise legacy Asset IDs as Project File IDs.
- Cloud is the account-level synchronization and recovery source; it is not required for normal use of a locally available file.
- Cloud upload/download and reconciliation run in the background and must not block ordinary UI interaction.
- A local import may show progress only when the local copy is materially large/slow. Small imports should feel immediate.
- Do not delete the source Device file. Import is a copy, never a destructive move.
- Never evict user-designated Offline files as ordinary cache cleanup.
- Existing Project data, file binaries, chat history, and timelines must be preserved and migrated safely.
- No production deployment or production database migration without explicit approval.

## 3. Storage topology

Each signed-in device owns a dedicated VYRA Offline Storage area.

- **OPFS** is the preferred binary storage backend where available.
- **IndexedDB** stores file metadata, replica state, sync operations, and fallback binary Blobs where appropriate.
- Browser storage persistence is requested where supported. Quota and eviction limitations must be surfaced safely; browser storage is not an OS-level guaranteed partition.
- Cloud object storage retains durable account-level copies.
- Supabase/Postgres stores authoritative ownership, Project relationships, metadata, versions, and synchronization state; binaries remain in object storage.

The local store is not a disposable HTTP cache. It is a durable, app-managed replica with explicit lifecycle and recovery semantics.

## 4. Import lifecycle: Device → Offline → Cloud

1. User selects a Device file.
2. VYRA allocates or confirms a stable Project File identity and copies the bytes into the dedicated Offline Storage.
3. Metadata and a durable local operation record are committed.
4. Once the local copy is complete and verified, the file becomes immediately usable in Storage, Chat, and Editor.
5. A background sync operation uploads the Offline copy to Cloud.
6. Cloud verifies the uploaded object and records the replica as synchronized.
7. The original Device file remains untouched. The user may delete it independently; VYRA's Offline and Cloud replicas remain.

For large files, progress belongs only to the local Device → Offline copy. Cloud transfer progress is not shown in the normal workspace.

## 5. Device onboarding and account recovery

On login from a new device:

1. Authenticate and load the user's Project list and lightweight metadata.
2. Initialize that device's dedicated Offline Storage and request persistent storage where supported.
3. Reconcile local and cloud manifests using stable Project File IDs, versions, and content hashes.
4. Download metadata and small/high-priority files first.
5. Download remaining files in the background according to available quota, network conditions, and local availability policy.
6. `VyraApp` starts the account's Cloud sync and Offline recovery after permanent-account login; reconnecting to the network retries pending uploads and resumes account recovery.
7. Files become offline-available as soon as each local download is complete and verified.
8. Files not downloaded due to quota or network constraints remain visible as cloud-backed items and can be explicitly fetched when needed.
9. Cloud downloads are installed under the existing `projectFileId` with `installProjectCloudFileToOfflineStorage`; they must never create a second Project file record. The local replica is marked available only after its write and integrity checks complete. `projectOfflineCloudSync.ts` uploads queued local replicas using the same ID and restores Cloud manifests on account login/reconnect.

Do not claim that every file is offline-ready before it has actually been downloaded and verified. A new device cannot use an unavailable cloud file offline until its local replica exists.

## 6. Two-way synchronization

Every device maintains a durable operation queue. Synchronization is idempotent and resumable.

- Local create/update/delete operations are recorded before network delivery.
- Uploads use stable operation IDs and content hashes to avoid duplicate objects.
- Downloads use version-aware temporary writes; promote to the active local replica only after verification.
- Retries use bounded backoff and survive app restarts.
- Reconciliation is incremental; do not repeatedly download full Project manifests or file bodies.
- Concurrent edits use version checks and explicit conflict records. Never silently overwrite a newer replica.
- Deletion uses tombstones and reference checks so offline devices cannot accidentally resurrect deleted files.
- Multi-device sync is Cloud-mediated; devices do not need direct peer-to-peer connectivity.

## 7. Canonical Project File contract

The logical file record should contain at least:

- `id` / `projectFileId`
- `projectId`
- `ownerId`
- `folderId`
- `fileName`
- `mimeType`
- `sizeBytes`
- `contentHash` (SHA-256 when available)
- `version` / `updatedAt`
- `metadata`
- replica state for the current device and Cloud

Replica state is separate from logical file identity. Suggested states:

- Local: `missing | copying | available | failed`
- Cloud: `not_queued | queued | uploading | synced | failed`
- Remote download: `not_requested | queued | downloading | verified | failed`

A local file URL/object URL is a short-lived access handle, not a persistent identity and not a value to store in the database.

## 8. Storage and performance behavior

- Cache-first metadata reads with version/manifest-based invalidation.
- Read local binary first whenever the current device has a verified replica.
- No repeated full-list fetches on tab changes or routine renders.
- Signed URLs are ephemeral; do not treat them as the file identity.
- Generate thumbnails/previews asynchronously and cache them separately from original binaries.
- Avoid loading entire large video/audio files into JS memory when a streaming File/Blob/URL path is available.
- Use bounded concurrency for uploads/downloads and respect browser quota/network constraints.
- Do not expose cloud upload spinners or block editor/chat actions on cloud completion.

## 9. Chat and Editor integration

- Chat attachments and generation inputs resolve through the Project File service.
- Generated outputs are ingested as new Project Files directly; they do not require a Vyral Asset/DNA ingestion path.
- Editor timeline clips can reference `projectFileId` as the canonical media identity; local playback now prefers the device replica and falls back to the Cloud media-library row. Existing Asset/version clip references remain readable.
- Existing timeline clips with legacy Asset/version references remain readable during migration; new clips must use Project File IDs.
- Storage, Chat, and Editor share the same local-first resolver and never maintain independent binary copies.

## 10. Migration and legacy retirement

- Preserve the current approved UI and all existing user data.
- Introduce the new Project File and replica contracts before switching consumers.
- Migrate existing Project media and timeline references with deterministic mappings.
- Keep legacy readers for historical records until migration and recovery tests pass.
- Remove legacy code only after no active consumer depends on it and data compatibility is verified.
- Do not delete old database tables or storage objects as part of an unverified code cleanup.

## 11. Verification gates

Before declaring the rebuild complete, verify:

- local import for small and large files;
- source Device file can be deleted after import without breaking VYRA's local copy;
- app restart preserves local files and pending sync operations;
- offline Storage, Chat references, and Editor playback;
- cloud upload retry and integrity verification;
- login on a second device and background download;
- two-way update synchronization and conflict handling;
- quota exhaustion, interrupted transfers, and recovery;
- no duplicate Project file records;
- existing Project data and timeline compatibility;
- UI regression, typecheck, build, unit/integration tests, and relevant RLS/security checks.

## 12. Current implementation status

Completed on the working branch:

- OPFS-first / IndexedDB-fallback local binary storage with durable file metadata and sync queue.
- Stable Project File IDs across local import and Cloud replicas.
- Project Storage upload now copies to Offline Storage first and renders the local item immediately.
- Project Chat attachments are copied into the same Offline Storage before the turn; image/video attachments are inspected through AI Vision, and small text attachments are included in the prompt with their stable Project File ID.
- Master Timeline Editor imports media into Offline Storage first, creates timeline clips with the same Project File ID, and resolves local playback for image/video/audio before falling back to Cloud; legacy Asset/version playback remains supported.
- Project Storage previews prefer the local binary and remain usable when Cloud metadata reads fail.
- Folder relationships are retained in local records and synchronized to the Cloud media row.
- Background Cloud upload remains outside the visible upload progress UI.
- Local imports check available browser storage and request persistent storage where supported.
- Background device recovery is bounded by available quota and per-pass download budgets, and now paginates through every Project file and account Project manifest instead of silently stopping at the first 200 files.
- Contract tests cover local-first upload wiring and capacity guards.

Still pending:

- Project Chat now persists structured attachment references in each user message. Later turns reload prior image/video attachments from Offline Storage first, fall back to the Project-scoped Cloud manifest, install the same Project File ID locally, and send them back through AI Vision. Small text files can be re-read from Offline Storage when older messages only retained the file ID. Remaining: OCR/PDF/document parsing, generic binary tool access, large-file chunking, and UI/runtime validation.
- Editor timeline trim/edit operations and final render/export paths still need end-to-end verification against Project File IDs; the old Asset/version resolver remains intentionally available for historical timelines.
- Offline rename/move/delete now update the local Project File record immediately and persist durable mutation operations. Cloud reconciliation reuses the authenticated Project-scoped Media Library operations; delete remains a local tombstone until Cloud deletion succeeds, and account recovery skips tombstoned IDs to prevent resurrection. Remaining verification: concurrent upload/delete races, folder deletion interactions, and retry behavior.
- Account recovery needs paginated manifest reconciliation, priority ordering, and robust resume checkpoints.
- Full typecheck, build, runtime, browser, RLS, and multi-device tests have not yet been run.

## 13. Implementation order

1. Preserve UI and audit current service dependencies.
2. Define canonical Project File and replica contracts.
3. Implement dedicated local binary/metadata storage and durable operation queue.
4. Implement background Cloud upload/download and manifest reconciliation.
5. Integrate Project Storage.
6. Integrate Project Chat and generation.
7. Integrate Editor and timeline playback.
8. Migrate historical records and retire obsolete internals.
9. Run full verification and report merge readiness.

This document is the source of truth for the Local-first Project Storage rebuild. Any implementation that violates the invariants above must be corrected before merge.

## 14. Project-native generation contract

The detailed server/client contract, output lifecycle, legacy compatibility boundary, and rollout gates are defined in [PROJECT_NATIVE_GENERATION.md](./PROJECT_NATIVE_GENERATION.md). New Project generation must create canonical Project Files directly; it must not fabricate or require Vyral Asset IDs. The Project-native generation path remains disabled until the client, reservation Edge Function, transfer worker, completion worker, and recovery path are all switched and verified together.


## Editor → Project Storage reuse (Nov 17, 2026)

- The Editor can browse the current Project's canonical `media_library_items` rows together with the device's Offline Storage records.
- Selecting an existing Video, Image, or Audio reuses its existing `projectFileId`; it never creates a second logical file or a Vyral Asset identity.
- If the selected file is already local, Editor uses the Offline Storage blob immediately. If it is Cloud-only, Editor downloads it on demand, installs the same Project File ID into Offline Storage, then adds that ID to the timeline.
- Existing direct device-file import remains local-first and creates one canonical Project File before background Cloud sync.
- Historical Asset-backed timeline records remain readable during the migration window; they are not rewritten or deleted by this picker.
- Remaining verification: compile/typecheck, runtime selection and playback for each media kind, multi-track placement, trim/edit/render/export, and offline playback after app reload.


## Offline Storage metadata mutations (Nov 17, 2026)

- Project Storage Rename and Move first update the device's canonical Offline metadata and enqueue a durable `rename:` / `move:` operation; Cloud mutation runs in the background through the existing owner- and Project-scoped Media Library service.
- Delete writes a local tombstone and queues `delete:` before the UI hides the item. The local binary is retained until Cloud confirms deletion; only then is the tombstone, binary, and related queue state removed.
- An offline-only file can be tombstoned without requiring a Cloud row. The sync worker checks for an existing owner/Project-scoped manifest row before calling the strict Cloud delete operation.
- Device recovery skips tombstoned Project File IDs, and explicit Cloud-to-device installation refuses to overwrite a pending tombstone. A completed Cloud manifest is also reconciled against local replicas: synced local files missing from the full manifest are removed, while queued/failed uploads are retained. Existing local files receive remote rename/move metadata unless a local mutation is still pending.
- The IndexedDB schema version is advanced without recreating stores, preserving existing metadata, blobs, and upload queue rows. The existing upload operation remains readable as the first member of the expanded mutation queue.
- Remaining verification: compile/typecheck, runtime Offline rename/move/delete, multi-tab races, upload-vs-delete concurrency, remote-device tombstone propagation, and storage cleanup after interrupted deletion.


## Project Chat attachment continuity (Nov 17, 2026)

- New user messages persist a structured attachment reference (projectFileId, name, MIME type) in the same conversation record as the turn text. The Project File remains the only binary source of truth.
- On later turns, Chat collects attachment references from the conversation, deduplicates them by stable Project File ID, and reads the local Offline replica first.
- If the current device lacks a local copy, Chat fetches only the owner- and Project-scoped Media Library row, downloads the Cloud object, verifies the optional SHA-256 metadata through the normal Offline installer, and installs it under the original Project File ID.
- Prior image attachments are re-encoded into bounded Vision previews; prior video attachments are sampled into a maximum of four frames. The current turn's attachment is not duplicated in the Vision payload.
- Small text files are re-read from Offline Storage and restored to the prompt when older history records contain only the Project File reference. New small text attachments continue to store their bounded text content with the originating user message.
- User message history stores metadata references, not expiring signed URLs or binary payloads. Signed URLs remain transient preview handles.
- Contract assertions cover persistent IDs, local-first rehydration, Cloud fallback installation, image/video Vision reconstruction, and text recovery.
- Remaining: OCR and PDF/document extraction, generic binary tool access, chunked processing for large documents, user-side attachment preview polish, and full runtime/permission testing.
