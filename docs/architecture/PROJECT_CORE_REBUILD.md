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
- Prior image attachments are re-encoded into bounded Vision previews; prior video attachments are sampled into a maximum of four frames. Historical context is restricted to the four most recent unique Project attachments in the last twelve messages, with an eight-image/frame Vision budget and bounded text extraction. The current turn's attachment is not duplicated in the Vision payload.
- Small text files are re-read from Offline Storage and restored to the prompt when older history records contain only the Project File reference. New small text attachments continue to store their bounded text content with the originating user message.
- User message history stores metadata references, not expiring signed URLs or binary payloads. Signed URLs remain transient preview handles.
- When a conversation is reloaded, failure to find a Cloud manifest row or signed URL must not remove the structured Project File reference. Offline-only queued uploads remain attached to their original message and can still be resolved from the current device's Offline Storage on the next turn.
- Contract assertions cover persistent IDs, local-first rehydration, Cloud fallback installation, image/video Vision reconstruction, and text recovery.
- Remaining: OCR and PDF/document extraction, generic binary tool access, chunked processing for large documents, user-side attachment preview polish, and full runtime/permission testing.


## Director Project File playback continuity (Nov 17, 2026)

- Scene-level Director video playback plans accept a Project File ID without requiring legacy Asset/version IDs; legacy Asset/version references remain supported.
- When the Editor converts Director track clips back into Scene Instance video clips, it now preserves the canonical Project File ID (or the exact legacy Asset/version pair), MIME type, and trimmed source ranges. This prevents a Project File-only source from being overwritten with undefined legacy identity fields.
- Regression coverage asserts the Project File playback plan and both Director clip conversion paths preserve the source identity and trim bounds.
- Important boundary: the current Master Timeline transport is a synchronized preview/playback engine, not a final video export renderer. The Editor source currently has no complete Project File-aware render/export pipeline. Do not describe export as supported until a separate rendering implementation and end-to-end output verification exist.
- Remaining: execute the new and existing Editor suites; verify audio/video sync and seeking in a real browser; validate offline playback after reload; implement and verify a Project File-aware final render/export pipeline; then test legacy timeline compatibility.


## Project File playback engine verification coverage (Nov 17, 2026)

- Audio and Video playback engines both resolve canonical Project File IDs through their dedicated resolver callbacks; they do not call the legacy Asset resolver when a Project File ID is present.
- Added regression tests for Audio plan generation, Audio engine resolution, and Video engine resolution using Project File IDs without Asset/version identifiers.
- Added a Video engine regression covering a Project File clip's source offset during seek, pause/resume synchronization, and the invariant that the legacy Asset resolver is never called.
- Corrected the Scene-level video MIME validation expression so valid video/* MIME types are accepted by the Project File playback path.
- Playback error text now describes both Project Files and historical Asset sources.
- These are source-level regression additions only. The test suites have not yet been executed in this environment; browser playback, seeking, and sync still require runtime verification.

## Project File final render/export architecture gate (Nov 17, 2026)

The Master Timeline playback engine is a preview transport only. A final export must be a separate deterministic pipeline; it must not record the preview element or assume that a signed playback URL is a durable source.

### Required export contract

- Snapshot the timeline at export start, including ordered tracks, clip IDs, stable Project File IDs (or immutable legacy Asset/version pairs), source-in/source-out, timeline placement, gain, mute/visibility, text overlays, transitions, frame rate, output dimensions, and audio sample rate.
- Resolve every Project File from this Project's Offline Storage first. If absent, download the owner- and Project-scoped Cloud replica, verify its available integrity metadata, and install it using the same Project File ID before rendering. Legacy Asset/version sources remain a read-only compatibility input.
- Pin the source manifest for the export job. Editing the live timeline after export begins must not mutate the in-flight render.
- Validate that every referenced source exists, is readable, and has a supported codec before allocating a render. Missing media must fail with a recoverable source-specific error; never silently omit a clip.
- Render video frames and audio on a shared timeline clock. Apply source trims, placement, track visibility/mute, gain, text overlays, and transitions from the snapshot. Preview-only playback state and temporary object URLs are not export inputs.
- Persist the rendered result as a new canonical Project File ID, then install it into Offline Storage and enqueue normal background Cloud sync. The output is not a legacy Vyral Asset unless a separate explicit compatibility operation is requested.
- Track export job state and cancellation independently from preview playback. A cancelled/failed export must not delete source files or corrupt the editable timeline.
- Keep historical Asset-backed timelines readable. Do not migrate or rewrite their source IDs as part of export.

### Implementation gate / current status

- No complete renderer or Project File-aware export endpoint is present in the inspected MasterTimelineEditor path. Existing Audio/Video engines provide synchronized preview playback only.
- Do not add a fake Export button, MediaRecorder-based screen capture, or claim that preview playback is a finished render.
- Before implementation, select and validate a rendering runtime that supports the required browser/device targets and codecs, and decide whether rendering is local, server-side, or hybrid. Then implement a versioned render manifest, source resolver, render worker/job, output ingestion, cancellation/recovery, and end-to-end fixtures.
- Required acceptance tests: exact clip trim and placement, multi-track A/V sync, seek-independent deterministic output, text/transition composition, offline source hydration, Cloud upload and reopen by stable output ID, cancellation, and historical Asset-backed timeline regression.

This architecture gate is a design decision, not a claim that export has shipped. No production schema or deployment changes are authorized by this work.

## Editor Project File playback cache isolation (Nov 17, 2026)

- Local Project File object URLs are cached under a composite Project ID + Project File ID key, not the file ID alone.
- The resolver verifies that the local metadata belongs to the active Project and validates the MIME category before returning a cached URL.
- This prevents a still-mounted Editor that switches Projects from accidentally reusing a previous Project's local object URL, and prevents a cached URL from bypassing media-kind validation.
- Added a source-contract regression test for Project-scoped cache keys and validation order.
- The test is committed but has not been executed; real browser Project switching and playback still require runtime verification.

## Offline replica integrity and recovery hardening (Nov 17, 2026)

- Recovery no longer treats an IndexedDB metadata record marked available as proof that its OPFS/IndexedDB binary still exists.
- The Cloud manifest reconciliation checks the local blob before skipping a download. If the binary is missing, it downloads and reinstalls the Cloud replica under the original Project File ID.
- The Offline Storage install fast path also verifies that the existing local blob can actually be read before returning the existing record.
- Cloud recovery rejects a downloaded blob whose byte size differs from the manifest's declared size; available SHA-256 metadata is still verified by the installer.
- Added source-contract regression coverage for missing-binary repair, stable identity, and size validation.
- These changes address metadata/binary divergence, including possible OPFS eviction. They are committed but not yet executed in tests or verified in a real browser/device.



## Storage integrity hardening — November 17, 2026

- Project File import now rejects an already-registered Project File ID instead of overwriting its local metadata or binary replica.
- The transition to `available` and creation of the durable Cloud upload operation are committed in one IndexedDB read-write transaction spanning the file and sync stores. A partial commit cannot expose an available file without its upload queue entry.
- An IndexedDB blocked-open event clears the cached open promise so a later attempt can recover after another tab releases the database.
- Contract tests were added for the atomic commit, identity collision guard, and blocked-open retry behavior. These are source-level assertions and have not been executed in this environment.


## Render runtime feasibility audit — November 17, 2026

A dependency and application-host audit was performed before selecting the final video renderer.

### Findings

- The current package manifest contains React, Vite, Supabase, Express, and the Cloudflare Vite/Wrangler toolchain, but no FFmpeg/WebCodecs muxing library, server render worker, or video composition runtime dependency.
- The existing `videoExportRecorder` helper only negotiates MediaRecorder MIME types. It does not implement a deterministic timeline renderer, source hydration, track composition, or Project File output ingestion.
- The Master Timeline Editor currently exposes Project File-aware preview playback, but the inspected Editor source does not contain a complete Project File-aware export flow.
- The application has both Node/Express server code and Cloudflare deployment tooling. The exact production execution target, memory/time limits, codec support, and durable job mechanism must be verified before choosing a server-side renderer.
- Browser-only rendering would need explicit support checks for codecs, memory, long-running jobs, background tab suspension, and device capabilities. It must not be assumed reliable for every supported phone or desktop.

### Decision

Do not add a rendering dependency or an Export control yet. The current repository evidence is insufficient to choose safely between browser-local, server-side, or hybrid rendering. A renderer choice must be made only after the actual deployment target and its execution limits are confirmed, along with target device/browser support and expected output formats.

### Next implementation gates

1. Identify the authoritative production execution platform and its limits for long-running CPU/memory-intensive jobs.
2. Choose a renderer and muxer with verified codec/container support for the required output formats.
3. Build a versioned, immutable render manifest and Project File source hydration layer.
4. Implement asynchronous job status, cancellation, retry, and output ingestion.
5. Add deterministic fixture-based tests for trim, placement, A/V sync, overlays, transitions, and legacy timeline reads.
6. Only then expose the existing approved export entry point in the UI; do not redesign the Editor.

This audit is a deliberate architecture hold, not an export implementation claim.


## Immutable Project render manifest foundation — November 17, 2026

- Added `src/services/projectRenderManifest.ts` as a renderer-neutral, versioned snapshot contract (`vyra.project-render-manifest`, version 1).
- The manifest captures the Project ID, creation timestamp, ordered Scene list, Scene ranges/instances, Video/Audio/Text tracks, clip placement and trims, track visibility/mute/volume, text content, transitions, and immutable source identities.
- New Project Files are represented by stable Project File IDs. Historical sources remain represented by exact Asset ID + immutable Version ID pairs; these identity types are explicitly namespaced and cannot collide.
- The snapshot is detached from the live timeline and deeply frozen. It deliberately excludes signed URLs, temporary object URLs, waveform preview data, and other transient Editor state.
- Manifest creation fails closed for missing media identity, malformed clip timing/source trims, invalid Scene ranges, malformed tracks, and invalid transitions. Text overlay clips are correctly treated as source-free content rather than media files.
- Added `tests/project-render-manifest.spec.ts` and registered `npm run test:project-render-manifest` for source-level coverage of stable identity, immutability, transient URL exclusion, and validation failures.
- This is a serializable input contract only. It does not resolve media bytes, choose codecs, render frames, encode audio, create jobs, or claim export is available. The renderer/runtime decision remains gated on production platform and device capability verification.
- Test execution, typecheck, build, Worker runtime, and browser verification have not been run in this environment.


## Project render source resolver — November 17, 2026

- Added `src/services/projectRenderSourceResolver.ts` to resolve immutable manifest source references into media bytes for a future renderer.
- Resolution order for Project Files is local Offline Storage first, then owner- and Project-scoped Cloud metadata/signing, download, integrity-aware installation, and re-read from Offline Storage. Cloud restoration retains the same Project File ID and uses the existing installer SHA-256 verification when a hash is available.
- Every local record is checked against the active Project, deletion tombstones are rejected, MIME kind is checked, and local/Cloud byte counts are verified. Cloud URLs are short-lived transport details and are never returned in the resolved source object or persisted in the manifest.
- Historical Asset sources remain exact Asset ID + immutable Version ID references and use the existing Vyral Asset playback authorization path; they are not converted into Project File IDs.
- The Project media lookup now returns the stored SHA-256 metadata so the resolver can pass it into Offline installation for integrity verification.
- Added resolver contract tests for local-first behavior, cross-Project rejection, Cloud restore identity preservation, MIME/size failures, and historical Asset version continuity.
- This resolver returns source bytes only. It does not compose frames/audio, encode a video, or implement a render job. Automated tests and runtime verification have not been run in this environment.


## 13. Renderer-neutral composition planner

The immutable manifest now feeds a pure composition-planning layer. It does not encode media or choose a codec; it converts the captured timeline into a serializable render schedule containing:

- ordered Scene time ranges and source ranges;
- Scene-instance video clips and direct Video-track clips;
- Image overlays and their stable source identities;
- overlapping Audio-track clips with trim ranges and effective track gain;
- visible Text overlays with track stacking order;
- transition keys, effect names, and durations without inventing transition placement semantics;
- a deduplicated source inventory keyed by Project File ID or immutable legacy Asset/version pair.

The plan is detached and deeply frozen. It contains no signed URLs, object URLs, Blob bytes, or runtime handles. Project File bytes remain the responsibility of the Project-scoped source resolver. The composition plan is a deterministic input contract for a future renderer, not a claim that video encoding/export is implemented.

A dedicated contract suite covers Scene ordering, image/video/audio/text layering, overlapping audio, source trims, scene-boundary clipping, transition preservation, source deduplication, legacy identity continuity, and immutability.


## 14. Render execution runtime decision

The repository's current production-shaped runtime is Cloudflare Workers: `wrangler.jsonc` points to `worker/index.ts`, which hosts the Express API through Cloudflare's Node HTTP bridge. `server.ts` remains the local Node/Vite development server. A successful Worker build does not establish that the Worker can perform a full media encode.

The connected Cloudflare account was checked read-only. Its Containers usage endpoint returned an authorization response explicitly stating that deploying Containers requires the Workers Paid plan. The connected OAuth identity cannot read account subscription details, so the exact billing plan and price cannot be independently confirmed here. No account configuration was changed.

Runtime constraints relevant to rendering:
- Workers memory is 128 MiB per isolate. Workers Free has 10 ms CPU per invocation; Workers Paid defaults to 30 seconds and can be configured up to 5 minutes. HTTP wall time can be unlimited while the client remains connected, but that does not remove CPU or memory limits.
- Cloudflare Workflows can durably coordinate long-running, retryable steps, but each step still runs under Worker CPU limits; non-stream step results are limited to 1 MiB. Workflows are orchestration, not a substitute for an FFmpeg-capable compute runtime.
- Cloudflare Containers provide larger CPU, memory, and disk instance types suitable for Linux media tools, but the currently connected account cannot deploy them without Workers Paid access.

Decision:
1. Keep the current Worker as the authenticated API/control plane; do not put FFmpeg or a full timeline encoder inside its request handler.
2. Keep the immutable Manifest, source resolver, and renderer-neutral Composition Plan as the stable render input contract.
3. Next implement a durable Project Render Job contract (immutable manifest/plan reference, idempotency key, status, progress checkpoints, cancellation, retry, and output Project File identity) without binding it to an unavailable runtime.
4. Before implementing an encoder or showing an Export action, choose and validate either (a) a client-side WebCodecs renderer with explicit browser/device capability and memory gates, or (b) a separately priced external/container rendering provider. A paid Cloudflare Containers deployment is not assumed.
5. Do not add rendering dependencies, change Cloudflare billing/runtime configuration, deploy, or alter production resources as part of this architecture-only gate.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/), [Containers overview](https://developers.cloudflare.com/containers/), and [Containers instance limits](https://developers.cloudflare.com/containers/platform/limits/).


## 15. Project Render Job lifecycle contract

The render-job contract now wraps the immutable manifest and composition plan in a Project-owned job envelope. It defines:
- stable job, owner, Project, idempotency, and SHA-256 input identity;
- explicit `queued → preparing → rendering → uploading → completed` phases;
- monotonic progress and revision counters;
- cancellation request and cancellation acknowledgement as separate states;
- failure codes/messages and retry from the same pinned input with an incremented attempt;
- completion only after an output has a canonical Project File ID.

The state transition function is pure and returns a deeply frozen snapshot. It does not create database rows, start a renderer, upload bytes, or claim that an export is available. Persistence, execution leases, provider callbacks, and output ingestion remain future integration work. The job is deliberately runtime-neutral so a browser renderer or an approved external/container provider can implement it without changing the Project File identity contract.


## 16. Durable Project Render Job persistence design — November 17, 2026

### Environment audit

The connected Supabase projects were identified read-only:
- Production: `mljntikeomamzonzirex` (`VYRA`).
- Development: `wbqheogfoahnjvgkwhxe` (`VYRA Development`).

A fresh read-only audit on November 17, 2026 found:

- Development is `ACTIVE_HEALTHY` on PostgreSQL 17. Its applied migration history ends at version `20261115134317` (`storyboard_universe_media_library`).
- Development has both `vyral_storyboards` and the older generic `projects` table. The current `media_library_items` and `media_library_folders` tables have `universe_id`, but **do not yet have `project_id`**. The Project-scoped Media Library migration `20261117010000_project_scoped_media_library.sql` is therefore still required before a render output can safely reference a Project-scoped Media Library row.
- The active branch contains 102 migration files. Comparing the recorded Development migration names with the current filenames shows 21 repository migrations without a same-name history entry and 8 database history entries whose names no longer match a current migration filename. Some historical versions have clearly been renamed/re-versioned, so a simple timestamp-based push or name-only replay is not safe.
- The Development history also does not yet include the later Runway submission/polling/output migrations (`20261116100000` through `20261116140000`), the Asset relationship graph migration (`20261116160000`), or the four Project-native migrations (`20261117010000` through `20261117040000`).
- Production is also not aligned: its migration history has a different baseline and does not include the current Media Library, Runway, or Project-native migration sequence. No Production schema was changed.

**Conclusion:** do not run `db push`, `migration repair`, or replay the missing files against Development yet. First reconcile the eight history-only entries with their original SQL and establish which current files they represent; then verify every intervening migration's prerequisites in order. Only after a clean, reproducible local database reset and migration test should the Development project be advanced. The Render Job foreign key remains blocked until the Project-scoped Media Library schema is present and verified.

### Persistence boundary

A dedicated `project_render_jobs` table is required. Reusing `generation_jobs` is rejected: that table represents provider generation/credit reservation and has different lifecycle states, billing fields, and ownership semantics. A timeline render is a separate job, even when its output is ultimately ingested as a Project File.

The persisted row must contain:
- `id`, `user_id`, `project_id`, and a unique per-owner/per-Project `idempotency_key`;
- immutable `input_digest`, `manifest`, and `composition_plan` snapshots;
- `status`, `progress`, `attempt`, and monotonic `revision`;
- nullable canonical `output_project_file_id`;
- bounded safe error code/message;
- `cancel_requested_at`, `completed_at`;
- nullable execution `lease_token` and `lease_expires_at`;
- `created_at` and `updated_at`.

The Project foreign key must bind both `project_id` and `user_id` to `vyral_storyboards(id,user_id)`. The output reference must bind to the Project-scoped `media_library_items` row only after the Project-scoped Media Library migration is present. Do not store Blob bytes, signed URLs, object URLs, provider credentials, or transient runtime handles in this table.

### Database invariants

1. Unique idempotency scope: `(user_id, project_id, idempotency_key)`. A replay with the same digest returns the existing job; the same key with a different digest is rejected.
2. Pinned input immutability: `input_digest`, `manifest`, `composition_plan`, `user_id`, `project_id`, and `idempotency_key` cannot be changed after creation.
3. Revision compare-and-swap: every accepted lifecycle mutation requires the caller's expected `revision`, then increments it exactly once. Stale writers cannot overwrite newer state.
4. Lease ownership: only the holder of the current unexpired lease token may advance execution state or commit an output. Expired leases can be reclaimed safely; retries keep the same pinned input and idempotency key while incrementing `attempt`.
5. Progress and terminal guards: progress is monotonic from 0 to 99 until the output row is verified; completed requires a valid Project File ID and sets progress to 100. Completed/cancelled rows are immutable terminal states.
6. Cancellation is two-step: the owner requests cancellation; the active worker acknowledges cancellation. A worker must not report cancellation before it has stopped or safely abandoned its execution.
7. Ownership: RLS is enabled. Authenticated users can read only their own rows. Browser clients receive no direct INSERT/UPDATE/DELETE policy; mutations go through narrowly scoped server-side RPCs. Every privileged function has an explicit role/owner check, a fixed search path, and EXECUTE revoked from PUBLIC/anon/authenticated unless intentionally exposed.

### Atomic operations to implement

- `create_project_render_job`: verify Project ownership, validate schema versions/digest, enforce idempotency, insert the immutable snapshot, and append the initial event atomically.
- `claim_project_render_job`: atomically claim a queued or lease-expired job and issue a fresh lease token with bounded expiry; concurrent workers cannot both own the same revision.
- `transition_project_render_job`: enforce expected revision, lease ownership, state machine, progress, cancellation acknowledgement, and retry rules in one transaction.
- `commit_project_render_output`: verify the output Media Library row belongs to the same user and Project, then atomically mark the job completed and append the final event.
- `request_project_render_cancellation`: owner-scoped request that increments revision without pretending the renderer has already stopped.

An append-only `project_render_job_events` table should record revision, event type, safe metadata, actor kind, and timestamp for recovery/audit. It must not duplicate large manifest/plan payloads.

### Implementation gate

This section is an architecture specification only. No table, RPC, policy, or migration was applied to either Supabase project. The Supabase CLI v3 documentation confirms that database commands now target the local stack by default and require explicit `--remote` for hosted projects; a local CLI/Docker migration workflow and testable local database are not available in this GitHub-only workspace. The required next step is to bring the Development schema up to the active branch's existing migrations using the repository's actual Supabase CLI workflow, then create and test the new migration locally. Do not apply the design to Production or bypass migration history with ad-hoc DDL.

References: [Supabase CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3), [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase Queues](https://supabase.com/docs/guides/queues).


## Offline render source integrity hardening (Nov 17, 2026)

- The render source resolver now verifies a locally stored Project File's SHA-256 when the Offline Storage record contains a hash, before returning the Blob to a render pipeline.
- Malformed hash metadata and digest mismatches fail closed with explicit integrity errors; a missing Web Crypto digest implementation also fails closed when a hash is present.
- Files without a stored hash retain the existing size/MIME/Project-ownership checks. This does not claim full-file hashing for large files whose Offline Storage import intentionally omits SHA-256.
- Regression tests cover a matching local digest, a mismatched digest, and malformed hash metadata.
- This protects the immutable render source boundary from silently accepting locally corrupted bytes. It does not implement or enable final media rendering/export.


## Cloud-restored render source integrity hardening (Nov 17, 2026)

- The render source resolver now verifies a Cloud download against its SHA-256 metadata before writing it to Offline Storage.
- After installation it validates the returned replica record (stable Project File ID, Project ownership, non-deleted/available state, MIME type, and byte size), then verifies the bytes read back from Offline Storage against the Cloud hash or stored record hash.
- A malformed or mismatched hash, wrong-Project record, altered identity, or incomplete restore fails closed before the source can enter a render plan.
- Regression tests cover invalid Cloud digest, wrong-Project installed metadata, and a valid Cloud-to-Offline restore.
- The source integrity boundary now checks both local-first and Cloud-restored replicas. It still does not provide hashing for records whose metadata has no SHA-256, and it does not implement final encoding/render execution.

## 17. Pure worker lease and recovery contract — November 17, 2026

- Added `src/services/projectRenderLease.ts` as a persistence-neutral lease contract for the future transactional worker adapter.
- A worker claim is fenced by the expected job revision and issues a fresh opaque token, worker identity, bounded expiry, and monotonically increasing lease generation.
- A live lease cannot be stolen. A lease can be reclaimed only after expiry; recovery increments the fencing generation and job revision but does not increment the render attempt (lease recovery is not a user-requested retry).
- Renewal requires the exact current worker/token pair and a still-unexpired lease. An expired worker cannot resurrect its lease.
- Release requires the exact current worker/token pair and expected revision. Stale writers and former lease holders are rejected.
- Lease durations are bounded to 1 second–15 minutes. The server-side adapter must generate unpredictable tokens and perform every claim/renew/release with a database compare-and-swap transaction; this pure module is not a distributed lock and does not provide persistence by itself.
- Added `tests/project-render-lease.spec.ts` and the `test:project-render-lease` script for contract coverage.
- This does not add a database table, RPC, worker runtime, scheduler, or automatic recovery loop. Those remain gated on Development migration-chain alignment and local database testing. No Supabase project was modified.

### Worker-write fencing requirement

- Added `assertProjectRenderLeaseOwnership` as a pure guard for every worker-originated mutation: progress checkpoints, phase transitions, cancellation acknowledgement, and output commit.
- A write must present the persisted job revision, exact worker ID, exact opaque lease token, and exact lease generation. The lease must be structurally valid and unexpired at the transaction's authoritative timestamp.
- When an expired lease is reclaimed, the new generation/token invalidates the previous worker even if that old process later resumes. The database adapter must check this fence and perform the revision compare-and-swap atomically in the same transaction as the write; checking in application memory before a separate update is unsafe.
- Added regression coverage for the former worker attempting a write after recovery, wrong generation/token, stale revision, expired lease, and malformed lease metadata.
- The guard is a contract helper only. It does not create a lock or provide atomicity without the future database transaction. Tests remain unexecuted in this GitHub-only environment.
