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
