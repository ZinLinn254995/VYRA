# Project-Native AI Generation

Status: Required architecture; backend migration in progress
Working branch: `feature/project-core-hybrid-rebuild`

## Goal

AI Chat generation creates a canonical Project File directly. A generated file is not a Vyral Asset and must not receive a fabricated `vyral_assets` or `vyral_asset_versions` identity.

The Project ID is the generation destination. The generated Project File ID is the durable output identity shared by Storage, Chat, Editor, Offline Storage, and Cloud.

## Non-negotiable invariants

- New generation jobs set `generation_jobs.target_project_id`; `target_vyral_id` remains null for new jobs and is read only for historical jobs.
- Destination ownership is verified against `vyral_storyboards(id,user_id)` on the server.
- The approved quote, credit reservation, idempotency key, and Project destination are bound atomically.
- Provider submission is claimed exactly once. Uncertain submission outcomes are reconciled, never blindly resubmitted.
- Provider output is first downloaded by the trusted Edge Function, bounded by the output-size limit, MIME-validated, SHA-256 hashed, and stored privately.
- Final Cloud path is `{userId}/media-library/{projectId}/{projectFileId}.{ext}`.
- One deterministic Project File ID is derived from `jobId + outputIndex` so retries cannot create duplicate logical files.
- The canonical `media_library_items.id` equals that Project File ID, with `project_id` set, `universe_id` null, and `source_asset_id` null.
- The final row records generation provenance and SHA-256 metadata. The private staging object is removed only after the canonical Cloud object and database record are verified.
- Once the Cloud file is verified, it is installed into the current device's Offline Storage under the same Project File ID. Offline installation failure must not invalidate the Cloud file; it remains recoverable.
- No new output requires `vyral_assets`, `vyral_asset_versions`, DNA ingestion, or Asset fingerprints. File integrity uses the Project File's content hash; Vyral DNA remains a separate asset-domain system.
- Historical Vyral-targeted jobs continue through the existing Asset ingestion and completion path.

## Required state flow

1. **Quote** — quote the user-approved prompt and generation settings.
2. **Approval** — record explicit maximum cost approval.
3. **Reserve** — create the Project-bound job and reserve credits atomically.
4. **Submit** — server-side one-time provider submission.
5. **Poll** — resumable status polling; no resubmission.
6. **Transfer** — claim each output, validate provider URL host, download bounded bytes, compute SHA-256, and stage privately.
7. **Ingest** — create or recover the stable Project File ID; copy staged bytes to the final Project media-library path; verify object metadata and hash; upsert the canonical `media_library_items` row.
8. **Complete** — call `record_runway_project_output_transfer` with `project_file_id`; the database function verifies that the media-library row belongs to the job's Project and its provenance/hash matches.
9. **Local install** — install the verified output into Offline Storage with the same ID and emit the normal local-file-ready event.
10. **Ready** — mark the job ready only after every output is ingested. Return Project File records to Chat; do not return Vyral Asset records.

## Edge Function contracts

### create-runway-media-job

Accept `targetProjectId` for new jobs. Validate the Project UUID and call `create_runway_media_job_for_project`. Return `targetProjectId`; never accept both destination types for a new job. Preserve the existing legacy Asset-targeted RPC only for an explicit historical recovery path, not new UI requests.

### transfer-runway-media-output

Branch on the persisted job destination, not a client-supplied destination:
- Project job: use `claim_runway_output_transfer`, stage under a user-scoped Project staging path, and record transfer state with the Project-specific RPC/contract.
- Historical Vyral job: retain the existing Asset staging path and `record_runway_output_transfer` behavior.

### complete-runway-media-output

For a Project job, accept only `jobId` and `outputIndex` (plus an idempotency token if needed). Resolve the Project File ID server-side from the deterministic job/output mapping or the already recorded output row. Verify the canonical media-library row, owner, Project, bucket, path, MIME, byte count, SHA-256 and generation provenance. Complete through `record_runway_project_output_transfer`. Do not accept Asset IDs from the client.

For a historical Vyral job, retain the existing Asset/version/DNA/Fingerprint readiness gate unchanged.

## Client service contracts

- Generation request takes `targetProjectId`, not `targetVyralId`.
- Project consistency context is built from Project records and Project File IDs. It must not require a hidden Assets Vyral to enable generation.
- Recovery queries use `target_project_id` for new jobs and the legacy target only for historical jobs.
- Successful outputs return `projectFileId`, file metadata, and local/cloud replica state.
- Chat previews and history resolve generated media through the Project File resolver. Historical Asset references remain readable.
- Editor consumes the returned Project File IDs directly.

## Migration and rollout gates

1. Keep existing Asset-targeted jobs and functions operational for history.
2. Deploy schema migrations before switching Edge Functions.
3. Deploy dual-path Edge Functions that branch only on the persisted job destination.
4. Switch the client to Project-only generation for new jobs.
5. Verify retries after every boundary (provider submit, staging upload, final upload, DB record, local install).
6. Verify duplicate prevention, cross-Project ownership rejection, hash mismatch rejection, storage cleanup, and job completion aggregation.
7. Verify generated output opens in Storage, Chat, and Editor offline after local install.
8. Only then retire obsolete new-generation Asset dependencies. Do not delete historical Asset readers or records.

## Current blocker

The branch already contains the `target_project_id` job column, Project-bound job reservation RPC, `project_file_id` output column, and `record_runway_project_output_transfer` RPC. However, the current client generation service, `create-runway-media-job`, `transfer-runway-media-output`, `complete-runway-media-output`, and output ingestion service still require `target_vyral_id` and Vyral Asset/version/DNA records. The Project-native path is therefore not enabled yet. Do not expose a Project-generation UI path until the complete end-to-end flow above is wired and verified.
