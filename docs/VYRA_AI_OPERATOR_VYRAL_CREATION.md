# VYRA AI Operator — Vyral Creation

## Scope

This slice connects natural-language Vyral creation in AI Chat to the shared capability executor. It does not change the AI Chat or Master Editor UI.

## Flow

The browser no longer intercepts Vyral creation intents or performs the identity RPC directly. It forwards the conversation to the authenticated server tool flow; the existing AI Chat presentation and controls remain unchanged.

1. The authenticated chat model calls `propose_vyral_create` with the creator-chosen name and optional description.
2. The server validates bounded fields and creates a server-generated Vyral UUID and action plan.
3. The plan is stored as a `vyral.create` pending action, scoped to the authenticated user and exact conversation session. The preview does not create a Vyral row or DNA record.
4. A natural-language approval in the same chat is matched to exactly one unexpired pending action. The server re-reads and verifies the action, its capability, plan, user, session, and expiry.
5. The shared capability executor checks approval and owner authority. The adapter approves and claims the pending action through service-role-only lifecycle RPCs.
6. The adapter calls `create_vyral_identity_with_dna` through the authenticated user-scoped Supabase client. This invoker RPC uses `auth.uid()` and atomically creates a private Vyral identity plus its initial Root DNA record.
7. The server re-reads the Vyral and Root DNA through the admin client and only reports success after verifying exact owner, identity metadata, and exactly one Root DNA record.
8. The pending action is finalized with a bounded result summary. Proposal retries with the same idempotency key reuse only the same owner/session/name/description pending preview.

## Security boundaries

- No client-supplied owner ID, Vyral ID, action ID, or approval timestamp is trusted.
- The Vyral UUID is generated server-side and stored in the immutable pending plan.
- Approval must be in the same authenticated chat session and while the pending action is unexpired.
- A conflicting Vyral ID is rejected; uncertain retries can reuse only an exact same-owner identity created from the same draft.
- The atomic creation RPC is called with the user-scoped client because it is an invoker function that derives ownership from `auth.uid()`.
- The service-role client is used only for pending-action lifecycle, owner verification, and post-create verification.
- Initial DNA is identity DNA only; Asset DNA and automatically derived Master DNA updates remain separate follow-up work.

## Verification status

- Pure plan parsing, approval phrase, bounds, and exact retry-identity checks are covered by `tests/vyral-creation-action.spec.ts`.
- CI runs this test through `test:vyral-creation-action`.
- The Dev Edge Function has not been redeployed as part of this repository change.
- No OpenAI key/provider call, production database change, production function deployment, production deployment, or merge is performed here.
- Browser-level live approval testing remains pending until the platform OpenAI key is configured.

## Asset upload action groundwork

The first server-side contract for AI Operator Asset uploads is now present in `src/server/vyralAssetUploadAction.ts`. It validates a bounded, expiring `asset.upload` plan with an exact owner/chat-session/action binding, destination Vyral UUID, client draft UUID, file name, MIME type, and file size (maximum 100 MB). It also provides an exact browser-file metadata match check so the selected local `File` cannot silently drift from the reviewed preview.

This is validation groundwork only: the existing browser file picker and `ingestVyralAsset` lifecycle remain unchanged. The model-driven proposal, approval-to-browser handoff, and server-confirmed completion are not yet connected. The new validator tests are included in CI through `test:vyral-asset-upload-action`.

## Conversational Asset naming and upload proposal

The authenticated OpenAI tool catalogue now includes `propose_vyral_asset_upload`. It receives the exact current attachment metadata from the browser (filename, MIME type, byte size; never file bytes), resolves the destination Vyral against the authenticated owner, and stores a session-bound, expiring `asset.upload` preview. The model must ask for a display name when missing, or propose one in natural language and show it for approval. The plan stores `assetName` separately from `fileName`, preserving the original filename.

The canonical ingestion service now accepts an optional approved `assetName` for the VYRA library display name while always retaining `original_filename` from the actual File. Both upload-plan validation and ingestion reject unsafe/path-like display names. CI includes registry, upload-plan and ingestion tests.

## Approved upload handoff

The end-to-end server/browser handoff is now connected:

1. AI Chat sends only a stable local draft UUID plus the attached file's name, MIME type and byte size. The file bytes remain in the browser.
2. The model calls `propose_vyral_asset_upload` after resolving the destination Vyral and the creator-approved Asset display name.
3. The Edge Function creates a session-bound `asset.upload` pending action and returns structured preview metadata through the existing chat response stream.
4. A same-session natural-language approval is checked against the exact pending action. The server approves and claims it, then returns a structured upload instruction.
5. The browser looks up the exact original File by its draft UUID, rechecks filename, MIME type and byte size, re-verifies the signed-in owner and destination Vyral, then runs the existing canonical ingestion pipeline with the AI-approved `assetName`.
6. The browser sends only the resulting Asset ID and immutable Version ID back to the authenticated Edge Function. The server independently verifies owner, destination Vyral, approved display name, original filename, MIME type, size, ready status, immutable Version hash and presence of Asset DNA before marking the pending action completed.
7. Master DNA synchronization is requested after the canonical Asset ingestion succeeds.

The original filename is never overwritten: `vyral_assets.name` stores the approved VYRA display name and `original_filename` preserves the source filename. The file bytes are not sent to OpenAI. A missing local File, expired/ambiguous approval, metadata mismatch, failed ingestion, or unverified DNA cannot be reported as a successful upload.

## Verification status

- Asset upload plan parsing, expiry/owner/session binding, exact File metadata matching, safe display-name validation and canonical ingestion naming have automated tests.
- The latest VYRA CI passed TypeScript, all configured unit/contract tests, Supabase Edge Function Deno type-check and production build.
- Actual browser upload/approval end-to-end testing still awaits the platform OpenAI key; no live OpenAI request was made.
- No Development Edge Function deployment, Production database/function change, Production deployment, or merge was performed.
- The AI Chat and Master Editor presentation/layout/controls were not changed.

## AI Chat Asset naming and rename

Asset ingestion now accepts a validated AI/user-approved display name while preserving the exact original source filename separately in both the Asset and immutable Version metadata. Existing Asset display names can also be changed through `propose_vyral_asset_rename`: the server verifies ownership, snapshots the prior name and `updated_at`, presents a same-chat approval preview, and applies the rename only if the Asset has not changed since preview. Rename does not alter file bytes, immutable versions, DNA, or Fingerprints. The new parser/owner/session/expiry tests run in CI.


## AI Chat Asset metadata authoring

The model-driven `propose_vyral_asset_metadata` tool prepares a same-session approval preview for Asset title/display name, description/details, semantic category, tags, keywords and accessibility alt text. The server snapshots the current values and `updated_at`, validates bounded fields, then applies only the approved fields after rechecking owner, session, expiry and optimistic concurrency. Classification data is stored under `metadata.ai_organization` while unrelated metadata keys are preserved. The technical `asset_type` and MIME type remain tied to the actual file and cannot be changed by descriptive metadata edits. Original filename, immutable bytes, versions, DNA and Fingerprints are not modified.


## AI Chat Vyral folder organization

The AI Operator can read the active Vyral's real folder tree and direct Asset counts, then prepare same-chat approval previews to create, rename or move folders and to move Assets into folders or back to the Vyral root. Folder hierarchy operations are scoped to the same owner and Vyral; cross-Vyral moves are not included. Folder moves preserve the subtree and prevent cycles. The server rechecks ownership, source location, destination membership and optimistic Asset timestamps before applying an approved action. Folder names are unique within their parent (including root), with database uniqueness constraints providing the final conflict guard. No folder deletion or recursive content deletion is part of this operation.



## AI Chat Asset relationship reads

The canonical semantic relationship graph already exists in `vyral_asset_relationships`, including typed Asset/Vyral-root endpoints, rationale, evidence references, owner-scoped RLS, and same-Vyral composite foreign keys. Generation/derivation events remain separate in `vyral_lineage`.

The AI Chat read tool now returns these as two explicitly separate collections: `semanticRelationships` and `generationLineage`. This avoids treating derivation history as the creator-defined semantic graph. The read remains owner-scoped and read-only. AI Chat relationship create/update/delete proposals and their approval/execution flow are not yet connected.
