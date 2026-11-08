# Vyral Quality Standard v1

## Purpose

Vyral quality grades are evidence-backed assessments of one immutable Vyral snapshot against one explicitly versioned standard. A grade is not a universal promise that every AI model will reproduce the same result.

## Required standard identity

Every standard profile must define:

- A stable `id` and positive integer `version`
- A human-readable name and scope
- An explicit rule list
- All six explicit grade bands (S, A, B, C, D, F), covering the complete 0–100 score range with contiguous boundaries

Grade bands are part of the versioned profile. The engine must not silently substitute a global default scale. Any provisional score thresholds used in tests are test fixtures only, not an approved production standard.

## Rule applicability

Rules may be universal or scoped to Asset type, declared purpose, or declared workflow. Scoped rules require explicit selectors.

- A known unrelated Asset type may make a scoped rule not applicable.
- An unknown Asset classification must not silently make type-scoped rules not applicable; keep them applicable until evidence resolves the type.
- Missing optional purpose/workflow metadata does not make it mandatory for every Vyral; matching scoped rules can be marked not applicable when that context is absent.
- A finding cannot override the applicability resolver by manually changing a rule to `not_applicable`.

## Evidence and trust

Evidence classes remain distinct:

- `deterministic`: reproducible checks performed by VYRA's trusted system
- `creator_declared`: facts or intent declared by the creator, not independently verified
- `ai_assessment`: model observations with model identity and supporting evidence
- `generation_test`: observed results from a defined generation/reconstruction test

Evidence references passed to the pure evaluation service are not authenticated by that service. Production callers must build findings from server-verified records and must never accept browser-supplied evidence references as authoritative proof.

Missing required evidence keeps the evaluation incomplete. A hard-gate failure blocks grading. AI opinion alone cannot override a deterministic hard gate.

## Snapshot and history

Each evaluation must pin:

- The Vyral ID
- The exact immutable Master DNA revision and SHA-256 fingerprint
- The exact standard profile JSON and version
- The quality engine version
- Per-rule findings and evidence references

History is append-only for direct application actions. Deleting the parent Vyral may clean up its dependent history as part of the user's full data deletion.

## Interpretation

A grade describes the Vyral's readiness under the selected standard and evidence available at evaluation time. It does not guarantee byte-exact reconstruction, visual identity, licensing rights, third-party tool access, or identical results across external AI models. Those claims require their own exact tests and evidence.

## Server-managed standard registry and evidence keys

Published profiles are stored as immutable rows in `vyral_quality_standards`. Client roles cannot read, insert, update, or delete these rows. A new profile version is published as a new row; an active profile is never edited in place. No production grade scale is approved merely because a provisional test fixture exists.

Rules may opt into server-built evidence with an explicit `evidenceKey`:

- `snapshot.integrity` — exact immutable Master DNA revision validated by VYRA
- `fingerprint.cryptographic` — a server-verified SHA-256 fingerprint matching the exact Asset Version's stored source hash
- `reconstruction.byte_exact` — a passed byte-exact test for the exact Asset Version and exact DNA record, from the trusted File DNA verifier
- `reconstruction.decoded_exact` — a passed decoded-exact test for the exact Asset Version and exact DNA record, from an allowlisted VYRA readback verifier
- `vision.corroborated` — a corroborated or independently verified observation pinned to the exact Asset Version and source SHA-256

The Edge Function loads all evidence using the authenticated owner identity and the exact Asset Version IDs in the immutable snapshot. It does not accept client-supplied findings, evidence IDs, model claims, or grade values. Client-created fingerprint rows are not trusted: only records carrying protected verification metadata written by `verify-vyral-asset` qualify. Reconstruction and Vision evidence tables are read through the server role because client insert permissions are revoked.

Rules without an evidence key remain unevaluated until a separate trusted evidence adapter exists for that class. Therefore an evaluation can correctly return `incomplete_evidence`; the system must not fill gaps with AI guesses or automatic passing results.

The registry has one globally active default profile at a time. Activation is a separate server-only state change; the profile JSON, rules, grade bands, identity and version remain immutable. To replace the active profile, the trusted publisher deactivates the old row and activates a newly inserted version. The unique active index prevents two defaults from being active concurrently. The evaluation endpoint resolves this single active profile when AI Chat requests a grade; if none is active, it returns a clear blocked setup response and records no invented grade.

## AI Chat quality history

The single VYRA AI Chat surface supports explicit English and Burmese requests to view a Vyral's saved quality history. The caller must select Assets from exactly one Vyral or attach that Vyral's portable `.vyral` package so the request is unambiguous.

The `get-vyral-quality-history` Edge Function:

- Requires a valid signed-in user JWT (`verify_jwt = true` and `auth: 'user'`)
- Confirms that the requested Vyral belongs to the authenticated user before reading history
- Filters evaluation rows by both Vyral ID and authenticated user ID
- Returns at most the latest 20 saved evaluations, newest first
- Preserves each evaluation's pinned Master DNA revision, standard identity/version, engine version, grade/status and score

No history is fabricated when no saved evaluations exist. History is read-only; this endpoint cannot create, alter, or delete evaluations. The AI Chat history request takes precedence over a generic quality-evaluation intent when both terms appear in one message.
