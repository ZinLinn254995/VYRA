# Vyral Master DNA — Architecture and Product Contract

Status: **Architecture decision / implementation target.** This document defines the intended contract; it does not claim that Master DNA, relationship enforcement, public source resolution, or external-AI reconstruction is already implemented.

## 1. Core definition

A **Vyral** is a self-describing, relational, versioned creative entity whose canonical home is a Vyral record in the VYRA application.

A Vyral is not just a folder of unrelated files and not just a DNA document. It consists of:
- one stable Vyral identity and version history;
- one Master DNA record describing the whole Vyral;
- Main Assets and supporting Assets;
- an Asset DNA record for each supported asset version;
- explicit, typed relationships explaining why each asset belongs;
- provenance, licensing, access policy, and verification evidence;
- a Vyral-level fingerprint binding the selected manifest and asset versions together.

**Asset DNA describes an individual asset. Master DNA describes the Vyral as a whole and how its assets form one coherent collection.**

## 2. Canonical source and portable representation

The canonical Vyral lives in VYRA. Its original asset binaries, asset versions, DNA records, relationship graph, permissions, and history remain governed by VYRA.

A .vyral export is a portable representation of that canonical entity. Exporting DNA does not move, delete, or replace the canonical Vyral.

The package must declare:
- stable Vyral ID and Master DNA ID;
- Master DNA schema and version;
- exact manifest revision and Vyral fingerprint;
- every included asset ID and exact asset version ID;
- each included Asset DNA record ID, schema version, and fingerprint/digest;
- Main vs supporting role, purpose, and relationship edges;
- provenance and license information;
- export mode and explicit included/excluded content;
- optional canonical VYRA source reference when policy allows it.

The portable package must be understandable without access to VYRA for all data it actually contains. A source reference is a route to verify or retrieve more information; it is not a substitute for missing DNA or asset data and does not grant access.

## 3. Main Assets, supporting Assets, and purpose

Every included asset must have a declared role:
- main: a foundational asset that defines the Vyral's primary identity or creative subject;
- supporting: an asset that enables, contextualizes, modifies, or is used by another asset or by the Vyral as a whole.

Every asset must include a non-empty purpose statement explaining why it exists in this Vyral. It must also have at least one explicit relationship edge to another asset or to the Vyral root, except that a designated Main Asset may connect directly to the Vyral root. A Main Asset still requires a purpose.

An asset must never be silently treated as a member merely because it is stored in the same folder. Membership is an explicit manifest decision.

Examples of relationship types (the vocabulary is extensible and versioned):
- part_of, depicts, used_by, worn_by, held_by;
- located_in, belongs_to_world, appears_in;
- derived_from, variant_of, references, supports;
- audio_for, motion_for, texture_for, material_for;
- contrasts_with, replaces, supersedes.

Relationships must identify both endpoints by stable asset IDs and, where meaning depends on a particular revision, exact asset-version IDs. The edge includes its direction, type, and a concise rationale. Do not infer a relationship solely from filenames or proximity.

Cycles may be valid (for example, mutually associated characters); the validator must check endpoint integrity and declared semantics, not blindly require a DAG.

## 4. Master DNA responsibilities

Master DNA is the authoritative, machine-readable description of the Vyral snapshot. It must include:

1. **Identity** — stable Vyral ID, name, creator/owner reference, creation time, current Master DNA version.
2. **Purpose and semantic brief** — what the Vyral represents, its intended use, constraints, and important invariants.
3. **Main Asset declarations** — which assets define the Vyral's core identity and why.
4. **Asset inventory** — exact included assets, versions, media types, DNA record references, and per-asset fingerprints.
5. **Relationship graph** — typed, directed edges with rationale and version binding.
6. **Reconstruction profile** — what can be deterministically reconstructed from included payloads, what requires a generative model, and what cannot be reconstructed.
7. **Generation guidance** — cross-asset constraints such as character identity, world style, scale, palette, location continuity, and audio association. Guidance must not be confused with measured facts.
8. **Provenance and license** — creator/source, lineage, permitted uses, derivative/resale rules, and evidence status.
9. **Source resolution** — canonical VYRA URI and public/private access declaration.
10. **Integrity** — canonical manifest digest, per-record digests, and Vyral fingerprint algorithm/version.

## 5. Vyral fingerprint and snapshot integrity

The Vyral fingerprint binds a canonicalized Master DNA manifest to the exact asset-version and DNA-record digests selected by that manifest.

The canonicalization algorithm, field exclusions, hash algorithm, and fingerprint version must be explicit. Unordered collections must be deterministically sorted before hashing. Mutable presentation fields must either be excluded by contract or included consistently; the choice must be documented.

A content change, asset membership change, relationship change, or selected asset-version change creates a new Master DNA revision and a new Vyral fingerprint. Historical revisions remain addressable. The system must not silently rewrite old snapshots.

A fingerprint proves integrity of the data that was hashed. It does not independently prove creator identity, ownership, copyright, or authorization. Those require separate authenticated provenance/signature and rights evidence.

## 6. Public source resolution and privacy

A Public Vyral may expose a stable canonical reference such as a VYRA Vyral page URL (final route to be chosen during implementation). The exported package may include this URI and a machine-readable resolution descriptor.

An external AI or user can follow that reference to:
- confirm that the Vyral ID resolves to a canonical VYRA record;
- inspect the public Master DNA and permitted Asset DNA;
- compare the published revision/fingerprint with the exported snapshot;
- access original assets only when the Vyral's explicit public policy allows it.

Public visibility is an explicit owner-controlled policy, not a side effect of export. Private or unlisted Vyrals must not leak private URLs, storage paths, thumbnails, asset metadata, or existence signals in public responses. A source reference never bypasses authentication, licensing, rate limits, or access control.

When the source is unavailable, deleted, private, or has a newer revision, an external consumer must report that state honestly. It must not silently replace the exported snapshot with current data.

## 7. External AI interoperability

A portable Vyral must carry enough structured information for an external AI workflow to:
1. parse the Master DNA;
2. enumerate Main and supporting Assets;
3. understand each asset's purpose and typed relationships;
4. validate included Asset DNA payloads and fingerprints;
5. reconstruct deterministic assets when their lossless payload is present;
6. use semantic/generation instructions for model-based reconstruction where exact source data is not present;
7. preserve cross-asset constraints when generating scenes or video;
8. cite the canonical VYRA source when permitted and distinguish local package facts from remotely verified facts.

Important limitation: a DNA package cannot force every third-party chat product to browse a URL, call an API, or invoke a particular model. External source resolution depends on that product's network/tool permissions and user authorization. Therefore, the package must remain self-describing offline; remote lookup is an optional verification/enrichment step.

## 8. Reconstruction truth labels

Every asset and the Vyral as a whole must distinguish:
- lossless_decoded: exact decoded sample/data reconstruction verified from included payload;
- source_file_exact: original encoded file bytes verified exactly;
- semantic_only: descriptive information and generation guidance, not exact source recovery;
- model_reconstructed: generated candidate requiring comparison; never label as exact merely because it looks similar;
- unavailable: required data is absent or access is denied.

Master DNA must aggregate these labels without upgrading a weaker child claim. A Vyral with one semantic-only asset cannot claim that every asset is losslessly reconstructed.

## 9. Validation invariants

A Master DNA validator must reject a package when:
- Vyral identity or schema/version is missing or malformed;
- an asset is duplicated, omitted from its declared collection, or has an unresolved version reference;
- an asset lacks a role or purpose;
- a supporting asset has no meaningful relationship to the Vyral graph;
- a relationship points to a nonexistent asset/version or uses an unsupported relationship type;
- a referenced Asset DNA record does not match the asset/version;
- a declared fingerprint or payload digest fails;
- the canonical manifest digest does not match;
- private source data is included in a public export;
- export claims a reconstruction level unsupported by included payload and verification evidence.

The validator must also report warnings for semantically weak or ambiguous relationships rather than inventing missing rationale.

## 10. Change propagation

- Add asset: create/attach its Asset DNA reference, role, purpose, and relationship edges; update inventory and Master DNA revision/fingerprint.
- Remove asset: remove it from the current snapshot and reconcile or reject dangling edges; preserve historical snapshots and source asset records according to ownership/retention rules.
- Update asset: bind the intended new version; do not silently change historical references.
- Change relationship or purpose: create a new Master DNA revision.
- Change visibility/license: update access and export policy; invalidate/reissue public resolution metadata as required.
- Re-export: pin one immutable Master DNA revision and its exact asset versions for the entire package.

## 11. Implementation phases and acceptance gates

1. **Contract and schema:** publish Master DNA JSON Schema, relationship vocabulary, canonicalization/fingerprint rules, and example package.
2. **VYRA data model:** persist Master DNA revisions, asset membership, Main/Supporting roles, purpose, relationship edges, and immutable version bindings.
3. **Deterministic builder/validator:** build Master DNA from canonical VYRA records; reject orphan or unexplained assets; compute/verify fingerprint.
4. **Portable package:** export/import Master DNA plus the referenced Asset DNA records and authorized payloads; preserve exact snapshot semantics.
5. **Public resolver:** expose public-only source verification and permitted asset access with privacy, licensing, and authentication controls.
6. **AI Chat:** parse Master DNA, present a trustworthy asset/relationship summary, use included payloads for reconstruction/vision, and clearly label remote lookups.
7. **Generation consistency:** test multi-asset image/video generation against the declared relationship and identity constraints.

Do not claim the architecture is complete until every phase has implementation evidence. Do not merge or deploy to Production merely because the document/schema exists.

## 12. Relationship examples

For a fantasy-world Vyral:
- Main Asset: World-A, purpose: "Defines the setting and visual identity of this Vyral."
- Supporting Asset: Character-B, purpose: "Primary character who inhabits World-A.", edge belongs_to_world(Character-B -> World-A).
- Supporting Asset: Location-C, purpose: "Recurring village location within World-A.", edge located_in(Location-C -> World-A).
- Supporting Asset: Prop-D, purpose: "Signature staff carried by Character-B.", edge held_by(Prop-D -> Character-B).
- Supporting Asset: Audio-E, purpose: "Ambient theme used for scenes in this world.", edge audio_for(Audio-E -> World-A).

The exact edge direction and semantics are part of the versioned vocabulary. This example is illustrative, not a claim about current stored Vyrals.

## 13. Compatibility with Asset DNA v3

Asset DNA v3 remains the per-asset lossless decoded-sample layer. Master DNA references immutable Asset DNA records; it does not duplicate their raw tiles inside its JSON record. The .vyral package manifest binds the Master DNA snapshot to the exact Asset DNA records and payload paths included in that export.

The current Asset DNA v3 implementation and ORIGIN-01 verification evidence remain scoped to individual assets. They do not, by themselves, implement or prove the Master DNA graph, public resolver, or multi-asset generation consistency.


## 14. Two-layer DNA storage and compact export (architecture decision)

VYRA uses a **canonical full-DNA layer** and a **compact portable DNA projection**. They are two representations of the same versioned Vyral, not two competing sources of truth.

### 14.1 Canonical full-DNA layer — stored in VYRA

VYRA retains the canonical originals and all data required for the strongest supported reconstruction claim:
- original asset binaries and immutable asset versions;
- complete per-asset DNA records and lossless reconstruction payloads (for example, DNA v3 raw decoded-sample tiles);
- Master DNA revisions, relationship graph, provenance, fingerprints, and verification evidence.

This layer may be larger than the original compressed assets. That is acceptable: it is canonical preservation/reconstruction storage, not the default AI-chat attachment. Storage, retention, backup, quota, and deduplication policies apply.

### 14.2 Compact portable DNA projection — exported to AI chats

The default compact export contains only what an AI needs to understand the Vyral and request relevant source material:
- Vyral ID, Master DNA revision, purpose, and semantic brief;
- Main/Supporting asset descriptors with stable IDs, roles, and purposes;
- typed relationship graph and cross-asset constraints;
- Asset DNA references, fingerprints/digests, and reconstruction capability labels;
- canonical VYRA resolver URI when permitted;
- explicit visibility, license summary, and retrieval policy.

It does **not** embed full raw reconstruction tiles or original binaries by default. Its size should scale mainly with the number and complexity of asset descriptors/relationships, not with the pixel/audio/video payload size. Do not promise a fixed maximum size; measure real exports and enforce a configurable package budget.

The compact projection is a map and request contract, not a magic substitute for missing pixels, audio samples, or video frames. Offline, it can describe assets and relationships and guide semantic generation. Exact reconstruction requires the relevant lossless payload to be included or retrieved from the canonical VYRA source with authorization.

### 14.3 Intent-based selective retrieval

When the user asks an AI workflow to create or edit something:
1. The AI interprets the user's request against the compact Master DNA and selects only candidate assets/versions and required relationships.
2. The AI or its host integration sends a structured retrieval request to VYRA containing the Vyral ID, pinned or permitted revision, requested asset IDs, intended operation, and user authorization context.
3. VYRA authenticates the requester and checks Vyral visibility, asset-level permissions, license/derivative rules, export policy, and rate limits.
4. VYRA returns only the minimum authorized originals, derivatives, or reconstruction payloads required for that operation, with version IDs and integrity digests.
5. The consumer verifies returned digests and preserves the relationship/generation constraints.
6. The request/response may be audited; credentials and short-lived access grants must not be embedded as reusable secrets in a public .vyral file.

The retrieval service must support least-privilege, explicit asset selection, short-lived scoped access, revocation, and clear denial reasons. Public metadata does not imply public original binaries. Private/unlisted records must not reveal hidden asset names, paths, thumbnails, metadata, or existence through errors or timing.

### 14.4 External chat compatibility boundary

A compact .vyral file can explain how to resolve its canonical source, but it cannot force ChatGPT, Gemini, Claude, or another host to browse, call VYRA, authenticate, or pass through user approval. Selective retrieval works only where the chat product has a supported connector/tool/API path and the user has authorized it.

If no retrieval integration is available, the AI must work only with the compact package and clearly state that it cannot access omitted originals. It must not pretend it fetched them. VYRA should provide documented APIs/connectors and a user-mediated fallback such as downloading selected authorized assets.

### 14.5 Retrieval acceptance gates

Before this architecture is considered implemented, tests must prove:
- compact export omits original binaries and full raw tile payloads by default;
- compact export still validates its manifest, Master DNA revision, relationships, and fingerprints;
- a request for one task returns only the minimum matching authorized assets, not the entire Vyral;
- private/unlisted assets are inaccessible without authorization and do not leak through metadata or errors;
- license rules block prohibited derivative, clone, or resale operations;
- stale revision, revoked access, missing source, and digest mismatch are explicit outcomes;
- offline import remains self-describing and never claims exact reconstruction when payloads are absent;
- an external integration can request, receive, and verify selected source assets without embedding long-lived credentials in the package.
