# VYRA Product Decision Log — Vyral DNA Architecture

Last updated: 2026-11-06
Status: **Accepted architectural direction; implementation is pending unless a section explicitly says otherwise.**

This log preserves the evolution of product decisions so that future conversations, contributors, and implementation work do not accidentally revert to an earlier concept. The current accepted decision supersedes conflicting earlier proposals unless the user explicitly changes it.

## 1. Product foundation

A Vyral is a reusable creative entity made of original assets, per-asset DNA, a Master DNA description, explicit asset purposes and relationships, provenance, permissions, and fingerprints. It is not a DNA-only file and not merely a folder of unrelated files.

The canonical Vyral lives in the VYRA application. A portable .vyral export is a representation/copy of a selected immutable snapshot; exporting it must never move, delete, or replace the canonical Vyral.

## 2. Accepted evolution of the DNA strategy

The design has evolved from “put enough DNA into a portable package to reconstruct the asset” toward a two-layer architecture:

### A. Canonical Full DNA — stays in VYRA

VYRA retains the authoritative originals and the full data needed for the strongest supported reconstruction:
- original asset binaries and immutable versions;
- complete Asset DNA records and lossless reconstruction payloads, including raw decoded-sample tiles where applicable;
- Master DNA revisions, asset inventory, Main/Supporting roles, purposes, typed relationships;
- provenance, license/access policy, fingerprints, and verification evidence.

This full layer may be larger than the original compressed asset. That is acceptable because it is canonical preservation/reconstruction data and is not the default payload sent to an AI chat.

### B. Compact Portable DNA — sent to AI chats

The default compact .vyral export should be much smaller and contain:
- stable Vyral identity and pinned Master DNA revision;
- purpose/semantic brief;
- Main and Supporting asset descriptors, IDs, and individual purposes;
- typed relationships and cross-asset constraints;
- Asset DNA references, fingerprints/digests, and honest reconstruction capability labels;
- permitted canonical VYRA resolver reference;
- visibility, license summary, and retrieval policy.

It must not include full raw reconstruction tiles or original binaries by default. Its purpose is to help an AI understand the Vyral, select relevant assets, and request only what the user's task needs. It is a compact map/request contract, not a substitute for omitted pixel/audio/video data.

### C. Intent-based selective retrieval from canonical VYRA

When a user asks an AI chat to create or edit something:
1. AI interprets the request using Compact DNA.
2. AI selects only relevant asset IDs, versions, and relationships.
3. Through a supported, user-authorized VYRA connector/API, it requests those assets for a stated operation.
4. VYRA authenticates and checks visibility, asset permissions, license/derivative/resale restrictions, and rate limits.
5. VYRA returns only the minimum authorized originals, derivatives, or reconstruction payloads needed.
6. The consumer verifies version IDs and integrity digests and preserves Master DNA relationships/constraints.

Do not retrieve the entire Vyral when only a few assets are relevant. Do not embed reusable long-lived credentials in public .vyral packages.

## 3. External AI compatibility boundary

Compact DNA should be self-describing offline. A source reference can optionally resolve to the canonical VYRA Vyral, but it does not grant access. Third-party AI products cannot be forced to browse, call APIs, authenticate, or use a connector. Retrieval is available only when that product supports a compatible integration and the user authorizes it. Without such integration, the AI must clearly say it only has the compact package and cannot access omitted originals.

Public metadata does not automatically make original assets public. Private/unlisted Vyrals and assets must not leak names, paths, thumbnails, metadata, or existence signals.

## 4. Core semantic model — do not regress

- Asset DNA: describes/reconstructs one asset.
- Master DNA: describes the entire Vyral, its inventory, purpose, Main/Supporting roles, relationships, constraints, and snapshot.
- Fingerprint: verifies integrity/identity/change; it does not by itself prove ownership or creator identity.
- Main Asset: defines the Vyral's primary identity.
- Supporting Asset: serves a declared purpose and has meaningful typed relationship(s).
- Every asset needs a non-empty purpose and a meaningful relationship to the Vyral graph. Do not infer membership or relationships merely from filename/folder proximity.
- Master DNA revisions are immutable snapshots. Membership, purpose, relationship, or selected asset-version changes create a new revision/fingerprint.
- Reconstruction labels must remain truthful: lossless_decoded, source_file_exact, semantic_only, model_reconstructed, unavailable. Never claim exact reconstruction without the corresponding payload and verification.

## 5. Storage and export principle

**Keep the full, potentially large DNA in VYRA; export compact DNA by default; retrieve only task-relevant original assets or full reconstruction payloads from VYRA when authorized.**

This is the current accepted direction. Do not revert to sending all raw tiles in every AI-chat attachment merely to make the package self-contained. Do not remove Asset DNA v3: it remains the per-asset lossless decoded-sample layer and is referenced by Master DNA.

## 6. Implementation status and next work

Documentation/schema:
- `docs/VYRAL_MASTER_DNA_ARCHITECTURE.md` — architecture contract, including two-layer storage and selective retrieval.
- `docs/schemas/vyral-master-dna-v1.schema.json` — Master DNA v1 schema, including compact portable projection declaration.
- This decision log — evolution and accepted direction.

Not yet proven implemented by these documentation changes:
- persisted Master DNA revisions and graph in the VYRA data model;
- canonical Full DNA storage/retention policy;
- Compact DNA builder/exporter;
- selective retrieval API/connector with authorization and least privilege;
- AI Chat tool integration and end-to-end selective asset retrieval;
- privacy, license, integrity, and retrieval acceptance tests.

Next implementation sequence:
1. Review/finalize Master DNA data model and relationship vocabulary.
2. Implement deterministic Master DNA builder/validator and immutable fingerprint snapshots.
3. Implement compact .vyral export that excludes full raw reconstruction payloads by default.
4. Implement authenticated, scoped, intent-based selective retrieval from canonical VYRA.
5. Connect AI Chat/third-party integration and verify end-to-end behavior.
6. Test offline behavior, permissions, licensing, privacy leakage, stale versions, and digest failures.

## 7. Change-control rule for future conversations

Treat this file plus the architecture document and schema as the current project decision record. When the user proposes a new idea:
- record it as proposed until explicitly accepted;
- compare it against current accepted decisions;
- if accepted, update this log and the architecture/schema as needed;
- preserve prior decision history rather than silently overwriting the rationale;
- distinguish product intent, architecture target, implemented code, and verified test evidence;
- never claim a feature is implemented merely because it is documented.

The user's latest explicit direction takes priority over older assumptions. If a new idea materially conflicts with this decision, surface the conflict briefly and ask only the clarification needed to avoid implementing the wrong direction.


## 6. Implementation progress — 2026-11-06

Initial Master DNA v1 code is now committed on the existing working branch:
- TypeScript builder and validator with deterministic canonicalization.
- SHA-256 manifest digest and domain-separated Vyral fingerprint.
- Explicit typed Asset-to-Asset and Asset-to-Vyral-root relationship endpoints.
- Cross-reference, version pinning, purpose, Main/Supporting, and privacy-policy validation.
- JSON Schema updated to match the typed endpoint model.
- Dedicated automated tests registered in GitHub Actions.

The Master DNA CI job passed on commit `ce3c52f2748dca0d28bb2f2990ce9aa24353d123`, including TypeScript check, the new Master DNA tests, existing DNA/package/vision suites, and production build. Browser UI and Database workflow runs were still in progress at the time this entry was written.

This is not full product integration yet. Supabase persistence, immutable revision creation, asset-change synchronization, compact .vyral export/import, selective retrieval, and external AI connector authorization remain pending.


## 7. Development database inspection and proposed persistence model — 2026-11-06

Read-only inspection confirmed that VYRA already has asset, version, per-asset DNA, legacy Vyral-scope DNA, fingerprint, and generation-lineage tables. The legacy `vyral_dna_records.scope` constraint only permits `asset` and `vyral`; its existing Vyral-scope records are schema v1. Generation lineage does not replace the new semantic relationship graph.

Decision for implementation planning: keep legacy DNA records backward-compatible and introduce a dedicated immutable Master DNA revision store, a typed relationship table, and explicit asset role/purpose metadata. Do not auto-invent purposes for existing assets. New snapshots should only be created after all current member assets are fully classified and have valid DNA references and relationship edges. The snapshot write path must be server-authenticated and owner-checked; clients should not update/delete historical snapshots.

This database inspection was read-only. No Development or Production schema/data was modified in this step. Database design is documented but not yet migrated.


## 8. Master DNA persistence and conservative claims — 2026-11-06

Implementation direction is now encoded in an additive Development-first migration:
- Vyral purpose and intended uses are explicit declarations, not inferred from a description or filename.
- Every Asset has a creator-declared Main/Supporting role and purpose before a Master DNA snapshot can be accepted.
- A typed semantic relationship graph stores Asset-to-Asset and Asset-to-Vyral-root edges with rationale; same-Vyral foreign keys prevent cross-collection links.
- Master DNA revisions are append-only and client writes are denied. Snapshot acceptance checks exact current membership, latest asset versions, DNA record references, purposes, and relationship coverage.
- Asset, version, purpose, or relationship changes invalidate the current ready state. Only a validated new revision can restore `ready`.

The TypeScript validator now requires the Vyral-wide reconstruction claim to equal the weakest included Asset claim. Private/unlisted Master DNA cannot expose public metadata policies or resolver URIs. Tests cover overclaim and privacy rejection.

The migration and pgTAP suite are on PR #117. Local GitHub Actions surfaced one malformed dollar-quoted test statement; that was corrected. The corrected database run is pending. The hosted Development database has not been migrated, and Production remains untouched.


## 9. Master DNA builder and setup workflow — 2026-11-06

The working branch now includes a JWT-protected server builder and a DNA-tab setup interface:
- Owners explicitly set the Vyral purpose and intended uses.
- Every active Asset is assigned a Main/Supporting role, its own purpose, a relationship target (the Vyral root or another Asset), and a rationale.
- The database classification function derives the caller from `auth.uid()`, checks same-Vyral ownership, and atomically updates the Asset role/purpose plus its membership edge.
- The server builder pins each Asset to its latest immutable version and matching Asset DNA record, computes the Master DNA fingerprint through the shared validator, and appends a revision through the service role. The database independently validates the snapshot before setting readiness.
- Reconstruction claims are derived only from passing exact tests pinned to the included version. Otherwise the claim stays `unavailable`.
- Remote resolution stays disabled until the VYRA resolver and external connector authorization exist.

The latest app CI and browser run are pending after the newest UI/builder commits. The Development database has not been migrated; no live Edge Function invocation has been verified. Production remains untouched.


## 10. Verification and environment boundary — 2026-11-06

The Master DNA builder checks the v3 manifest and confirms all declared private tile objects exist in the canonical Asset storage folder without downloading all lossless DNA payloads. It only claims `lossless_decoded` when an exact decoded-reconstruction test passed for the same pinned Asset version; it only claims `source_file_exact` after a byte-exact test. Storage presence is not treated as reconstruction proof.

Current builder limitation: creator/license references remain unset, remote resolution remains disabled, and compact `.vyral` export/import is not yet connected to Master DNA. The Development project's migration history is behind the working branch (last recorded version `20261105235017`), so the new Master DNA migration must not be applied out of order. Reconcile migration history/schema first. Production is untouched.


## 2026-11-06 — Whole-Vyral DNA-only package and AI Chat Master DNA context

**Decision / implementation direction:** DNA-only portability must represent a complete Vyral, not silently export only its first Asset. Whole-Vyral DNA-only export is therefore gated on one lossless DNA v3 record for every Asset and a verified Master DNA snapshot whose Asset inventory exactly matches the package. Each Asset's tile payloads are verified and reconstructed before the archive is created. Single-Asset DNA-only packages remain supported for isolated reconstruction tests.

**Import behavior:** Every included Asset is reconstructed from its own DNA v3 payload into a new PNG version; original encoded source bytes are explicitly not claimed to be recovered. DNA records are remapped to local Asset/version identities. When the destination Master DNA schema is installed, imported roles, purposes, membership edges, and additional typed relationships are stored as unverified imported metadata. A new local Master DNA revision must be built before the destination Vyral can be considered ready. If the migration is unavailable, import avoids writing to missing Master DNA tables and reports the limitation.

**AI Chat behavior:** AI Chat validates the portable Master DNA fingerprint and inventory, then supplies Vyral purpose, asset roles/purposes, relationship graph, reconstruction claims, and cross-asset constraints to the model. Current Vision still receives only the first Asset image preview; the remaining Asset visuals are not yet attached. Multi-image Vision and authenticated remote source resolution remain future work.

**Verification status:** CI passed TypeScript, unit suites (including multi-Asset DNA-only export and per-Asset reconstruction), Deno type-check, and Production Build for the implementation commit. Browser UI and Database runs were still being checked at the time of this entry. No hosted Development migration/deployment or Production changes are authorized by this implementation.


## 2026-11-07 — Universal binary File DNA v1 foundation

Added a generic binary DNA contract for non-raster files. It records version-pinned source identity, byte length, MIME type, extension metadata, conservative magic-byte signature, extractor identity, and SHA-256.

Accepted truth rule:
- hash-only File DNA is identity evidence and has reconstruction claim `unavailable`;
- only a package that carries all lossless raw source-byte chunks, verifies every chunk digest, and verifies the final original-byte SHA-256 may claim `source_file_exact`.

This is a foundational binary identity contract, not yet universal semantic understanding. Non-raster Asset upload now writes an identity-only File DNA v1 record to Supabase, and the Master DNA builder validates the record against the latest immutable version. It remains `unavailable` for reconstruction unless lossless source-byte chunks are present and verified. Audio/video/document/3D/archive-specific parsing and mixed-media whole-Vyral DNA-only package export/import remain pending. The existing image DNA v3 pipeline remains separate and unchanged.


## 2026-11-07 — Mixed-media DNA-only package support

Extended the DNA-only package service to accept raster DNA v3 and Universal File DNA v1 together. File DNA exports now include lossless raw source-byte chunks after the canonical immutable source version is downloaded and its SHA-256 is rechecked. Imports verify those chunks, restore the original bytes as a new source version, and create a fresh identity-only File DNA record pinned to the imported version. The package parser rejects missing, altered, or undeclared chunks.

The current package-level tests cover binary-only File DNA export, clean ZIP reconstruction, tampering, and refusal to export a hash-only File DNA record as exact. The authenticated Preview and a real mixed-media Vyral have not yet been manually tested. Semantic parsing for audio/video/documents/3D/archive formats is still pending.


## 2026-11-07 — AI Chat File DNA inspection

AI Chat now validates Universal File DNA v1 attachments. DNA-only packages are reconstructed from lossless binary chunks; full packages verify their pinned original version bytes against the File DNA digest and size. The chat context receives format/identity metadata while explicitly stating that audio, video, document and 3D semantic contents have not been decoded or sent to Vision. This is integrity-aware attachment understanding, not yet media-content understanding.


## 2026-11-07 — Deterministic File Structure Profiles

File DNA v1 now includes optional bounded structural metadata for WAV, ISO-BMFF, common audio signatures, PDF, GLB/glTF, and UTF-8 text/Markdown/JSON. The metadata records container/header facts and simple structural counts, not private source text or inferred meaning. PDF and large text/3D parsing are bounded to 8 MiB. These facts are integrity-adjacent structure hints only; full media decoding, OCR, transcription and semantic interpretation remain separate roadmap work.


## 2026-11-07 — Verify File DNA structure against source bytes

AI Chat now re-runs the deterministic File DNA structure analyzer after verifying either the full-package original version or the DNA-only lossless chunks. If the package's stored structural profile differs from the profile derived from the verified bytes, attachment inspection is rejected. Older File DNA records without a stored profile remain readable because Chat can derive a fresh one. This closes the package-metadata trust gap without claiming semantic media decoding.


## 2026-11-07 — Version-pinned Vyral license policy evaluator

Added the first deterministic license decision helper and focused automated tests.

- Basic Usage grants asset use and derivative generation, but not clone branches or resale.
- Clone Branch grants branch creation and editing, but not resale.
- Modified Branch + Resale grants branch creation, editing, and resale.
- Each grant is pinned to one immutable Asset version and one grantee; expiry, revocation, wrong grantee, missing grant, stale version, and insufficient tier deny the requested action.
- A multi-Asset operation is allowed only when every included Asset has a qualifying grant.
- Owner bypass is explicit and must be supplied only by a trusted server-side ownership check.

**Boundary:** this is a pure policy evaluator and test suite, not production enforcement. Purchase, Marketplace, branch, export, and resale APIs are not yet wired to it; grants are not yet persisted; Master DNA snapshots do not yet include effective license grant references. Existing assets remain unlicensed/unknown until explicit creator or rights-holder evidence is recorded. No licenses or permissions are inferred from filenames or asset ownership metadata.


## 2026-11-08 — Creator-guided Vyral building and rule-based quality grading

**Accepted clarification; additive to the existing Vyral 100% direction.** This is not a scope pivot or replacement of the current DNA, Original Storage, Compact DNA, Master DNA, fingerprint, package, resolver, or licensing work.

- VYRA AI Chat remains the single conversational control center for all VYRA operations. Creator assistance, Vyral grading, Asset management, DNA operations, project/storyboard actions, and connected generation workflows are capabilities invoked through this one Chat surface. Existing Workspace/Library pages remain visual management surfaces, not separate AI control centers.
- A Creator Assistant capability inside the same Chat helps creators understand, plan, build, evaluate, and improve Vyrals. It recommends optional Assets, metadata, relationships, instructions, and tests based on the creator's declared purpose. It must not force a fixed template or silently convert AI guesses into creator-confirmed facts.
- Creators may freely build Vyrals from arbitrary supported file/Asset types. Unrelated Assets, a single Asset, and collections without relationships, story, character, world, role, or purpose metadata remain valid. Any profile-specific completeness requirements apply only when the creator selects or the requested task requires that profile.
- Quality grading is based on versioned standards and explicit rules, not free-form AI opinion. Universal, asset-type, declared-purpose, and workflow/generation rule profiles are layered. Deterministic checks, creator declarations, AI rubric assessments, and observed generation tests remain separate evidence classes.
- AI may assess semantic/qualitative criteria only through a declared rubric. A deterministic evaluator validates rule IDs, evidence, applicability, hard gates, weights, and score aggregation. Missing evidence is not a pass. Integrity, identity, authorization, licensing, and required reconstruction failures cannot be overridden by an AI score.
- Proposed grade bands S/A/B/C/D/F and score ranges are provisional until a versioned standard is finalized. Every grade must be tied to an exact Vyral snapshot, standard version, rule-level evidence, and applicable purpose/profile. A grade is not a guarantee of identical results across generation models.
- Creator-defined default generation instructions/workflows may travel in a .vyral package as declarative intent. They do not contain executable code or credentials and cannot bypass external AI tool availability, user authorization, VYRA access controls, or license policy. Third-party chat products are not guaranteed to execute them automatically.
- Compact DNA remains a navigation/reference map; Original Assets and authoritative Full/Original DNA remain in VYRA storage. AI should select and retrieve only task-relevant authorized Assets through supported integrations.

**Important reconciliation required before database/UI implementation:** Older decision-log sections and existing Master DNA persistence work describe Main/Supporting roles, purpose, and relationship coverage as mandatory for every Asset. The accepted product definition and current 100% architecture already allow arbitrary/unrelated Assets and optional relationships. The latest clarification confirms the optional/free-form product behavior. Do not silently impose the older mandatory classification model on all Vyrals. Review and reconcile the database readiness gates, builder, UI, schema, and tests additively; preserve existing records and ORIGIN-01 protections.

**Implementation status:** The accepted contract is documented in `docs/product/VYRAL_CREATOR_ASSISTANT_AND_QUALITY_STANDARDS.md`. This documentation does not mean the Creator Assistant, deterministic grading engine, complete Chat orchestration, or external generation handoff is implemented. Each requires code and acceptance tests. Continue on the existing `feat/vyral-100-percent-acceptance` branch; no new branch, merge, Production deployment, or Production database mutation is authorized by this decision.


## 2026-11-08 — Deterministic Quality Grading v1 foundation

Added an initial pure TypeScript grading engine at `src/services/vyralQualityGradingV1.ts`, focused tests at `tests/vyral-quality-grading-v1.spec.ts`, the `test:vyral-quality` package script, and a CI step in `.github/workflows/ci.yml`.

Current engine behavior:
- pins each evaluation to a Vyral ID, snapshot SHA-256 fingerprint, and versioned standard profile;
- validates unique rule IDs, unique findings, supported evidence classes/statuses, and evidence references for scored findings;
- computes weighted scores deterministically (pass = 100% of rule weight, partial = 50%, fail = 0%; not-applicable rules are excluded);
- withholds a grade when required evidence is missing or no applicable weighted evidence exists;
- blocks a grade when a declared hard-gate rule fails;
- records rule-level status, evidence references, explanation, recommendation, and awarded points;
- uses provisional S/A/B/C/D/F bands only as a default; a versioned profile may override them.

**Not yet implemented:** production standard-profile definitions and their approved rule weights/hard gates; AI rubric evaluation; database persistence/history; Chat UI and Creator Assistant integration; purpose/asset-type applicability resolver; generation test runner; and end-to-end grading acceptance tests.

**Verification:** The new tests are registered in CI, but no GitHub Actions result has been confirmed for this push. The Vercel status currently reports a build-rate-limit failure; this is not evidence of a TypeScript/test failure. A Cloudflare Workers build check was observed in progress at the time of inspection. Do not claim the grading tests or full CI passed until a matching run reports success. No Production database mutation or intentional Production deployment was performed as part of this code change.


## 2026-11-08 — Quality evaluator evidence hardening

The deterministic grading engine now requires each finding to declare the same evidence class as its standard rule. A semantic AI assessment cannot be submitted as deterministic proof for an integrity rule. Hard-gate rules must be required deterministic rules. The evaluator also distinguishes missing required evidence from any applicable rule that remains unevaluated: an applicable rule must be explicitly evaluated or marked not applicable; an omitted optional rule is not silently treated as a pass. Added regression tests for evidence-class mismatch, non-deterministic hard gates, and unevaluated applicable optional rules.

**Verification status:** Regression tests and CI wiring are present, but the GitHub Actions result for the latest commits has not yet been confirmed. The grading engine is still a pure foundation; it is not yet wired to authoritative database evidence or the VYRA AI Chat interface.
