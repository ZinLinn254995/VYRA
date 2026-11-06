# Vyral Master DNA — Architecture and Product Contract

Status: **Architecture decision with an initial validation core implemented.** The Master DNA v1 TypeScript builder/validator and fingerprint tests now exist on the working PR branch. Database persistence, automatic snapshot refresh on asset/relationship changes, compact export integration, and remote selective retrieval remain unimplemented.

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


## 15. Implementation progress — 2026-11-06

The first executable Master DNA v1 slice is now present in `src/services/vyralMasterDnaV1.ts`:

- Builds a versioned Master DNA snapshot with a deterministic canonical JSON representation.
- Computes a SHA-256 manifest digest and a domain-separated Vyral fingerprint.
- Verifies both hashes when validating an imported or stored record.
- Checks stable Vyral/asset/version references, Main vs Supporting roles, non-empty asset purposes, and explicit relationship coverage.
- Supports typed relationship endpoints targeting either an Asset/version or the Vyral root.
- Rejects cross-Vyral references, stale asset-version references, and public-asset resolution for private/unlisted Vyrals.
- Requires a compact portable projection that excludes full reconstruction payloads.

The JSON Schema now describes the same typed Asset/Vyral relationship endpoints. Automated tests cover snapshot creation, digest tampering, missing purpose/relationships, invalid root/version references, and private visibility policy. The Master DNA test suite is registered in CI.

**Boundary:** this is a deterministic data-contract and integrity core. It does not yet persist Master DNA in Supabase, create new revisions automatically after membership changes, derive a trustworthy reconstruction claim from all child assets, export/import the compact Master DNA through `.vyral`, or implement the VYRA resolver API. Those are the next implementation slices.


## 16. Database persistence mapping — design proposal, not yet migrated

A read-only inspection of the VYRA Development database on 2026-11-06 found the existing canonical tables `vyrals`, `vyral_assets`, `vyral_asset_versions`, `vyral_dna_records`, `vyral_fingerprints`, and `vyral_lineage`. The current `vyral_dna_records.scope` check permits only `asset` and `vyral`; existing collection-scope rows are legacy schema-version-1 records. The existing `vyral_lineage` table is generation lineage, not the complete semantic relationship graph.

**Do not overload the legacy collection-scope DNA record as the new immutable Master DNA revision store.** The proposed persistence model is:

1. Keep `vyral_assets` and its immutable source versions untouched. Store Main/Supporting role and creator-declared purpose in a separate `vyral_master_dna_asset_metadata` table keyed to the exact Asset/Vyral/owner tuple. Existing assets remain unclassified until a creator supplies truthful values; never infer purpose from filename.
2. Add a dedicated `vyral_asset_relationships` table for typed, directed, rationale-bearing edges. Endpoints must be constrained to assets in the same Vyral or the Vyral root. Keep generation lineage distinct.
3. Add append-only `vyral_master_dna_revisions` snapshots containing the canonical Master DNA JSON, revision number, parent revision, manifest digest, Vyral fingerprint, owner, and creation time. Enforce one revision number per Vyral and prevent client-side update/delete.
4. RLS read access is owner-scoped. Snapshot writes and revision creation are performed only by an authenticated server-side operation after it verifies the owner, all asset/version references, purposes, relationships, licensing, and current asset membership.
5. A Vyral is not Master-DNA-ready while any included asset lacks a declared role, purpose, valid Asset DNA reference, or explicit relationship. Existing assets are not silently assigned defaults.

The current Development database inspection was read-only. No tables, rows, policies, storage objects, or Production resources were changed by this design step.

**Supabase platform note:** new public-schema tables are no longer automatically exposed through the Data API; any future table exposure must be deliberate and paired with least-privilege grants and RLS. The hosted Supabase CLI v3 also changed hosted-command defaults; future migrations must target Development explicitly and be reviewed before execution.


## 17. Persistence and readiness contract — implementation added, verification pending

The additive Development-first migration `20261106210000_vyral_master_dna_persistence.sql` introduces:

- Explicit Vyral-level purpose and intended uses, plus per-asset Main/Supporting role and purpose in a separate metadata table. Canonical source Asset rows and versions are not updated or re-written, preserving protected assets such as ORIGIN-01.
- Typed, rationale-bearing relationship edges with database-enforced same-Vyral ownership, valid asset endpoints, and rejection of self/root-to-root edges.
- Append-only Master DNA revision rows with unique revision numbers/fingerprints, owner-scoped reads, and no authenticated-client insert/update/delete permissions.
- Database checks before a revision can be accepted: current revision ancestry, Vyral identity, manifest/fingerprint metadata, declared Vyral purpose, full current asset membership, exact latest asset versions, per-asset DNA record references, asset purposes/roles, and relationship coverage.
- Automatic readiness invalidation. Changes to Vyral purpose, asset membership/metadata, asset versions, or relationships mark the collection `needs_classification` or `stale`. A successfully validated new revision marks it `ready`.

The pgTAP suite `supabase/tests/database/vyral_master_dna.test.sql` covers relationship constraints, owner isolation, revision immutability, classification gates, snapshot acceptance, and stale-state invalidation.

**Current boundary:** this migration and test are committed on the working PR branch. They have not been applied to the hosted Development project. The local GitHub Actions database suite is the acceptance gate; a first run exposed a test quoting defect, which was fixed. A later run is checking the corrected suite. No Production resources were changed.


## 18. First authenticated builder workflow — code added, runtime acceptance pending

The working branch now includes:

- A JWT-protected `build-vyral-master-dna` Supabase Edge Function. It resolves the signed-in owner, reads the canonical Vyral inventory, pins each Asset to its latest immutable version and matching Asset DNA record, reads typed relationships, and derives reconstruction claims only from passing exact tests for that exact version.
- The function builds the canonical Master DNA through the shared TypeScript validator, then inserts an immutable revision using the service-role client. The database trigger independently checks current membership, latest versions, DNA references, declared purposes, and relationship coverage before setting the Vyral to `ready`.
- Repeated build requests return the current ready revision instead of creating unnecessary duplicate revisions.
- The Vyral DNA tab now provides controls for Vyral purpose/intended uses, each Asset's Main/Supporting role and purpose, a relationship target (Vyral root or another Asset), and a rationale. Asset classification is saved atomically through an owner-scoped database function.

The builder deliberately sets remote resolution to `no_remote_resolution`; a public resolver/connector is not implemented. Private/unlisted packages do not receive public resolver URIs. Assets without a matching version-pinned DNA record, purpose, relationship, or declared reconstruction evidence cannot be overstated.

**Verification boundary:** the app CI/browser checks have passed on earlier commits; a fresh CI run is in progress after the latest builder/UI updates. The local Database Tests workflow is still starting its Supabase services. The hosted Development database has not been migrated and the Edge Function has not been invoked against it. Production remains untouched.


## 19. Readiness, verification, and environment boundary — 2026-11-06

The builder validates the DNA v3 manifest and confirms that every declared private tile object exists in the canonical Asset storage folder. It does not download every raw tile just to build the compact Master DNA. An Asset is labelled `lossless_decoded` only when a passing exact decoded-reconstruction test is pinned to that exact Asset version; a passing byte-exact test is required for `source_file_exact`. Storage presence alone is not a reconstruction proof.

The first builder currently leaves creator/license references null and sets remote resolution to `no_remote_resolution`. License-policy projection and the authorized VYRA resolver/connector remain pending. Compact `.vyral` export/import now carries a verified Master DNA snapshot; DNA-only packages support a whole collection when every Asset has one lossless DNA v3 record. Import validates the snapshot, restores each Asset from its own DNA payload, and (when the destination schema is available) seeds role/purpose/membership and additional typed relationships as unverified imported metadata. A fresh local Master DNA build is still required after import. The database readiness gate prevents snapshots with missing Asset DNA records, roles, purposes, versions, or relationships.

The hosted Development project's migration history currently ends at `20261105235017`, while this branch contains later migration files. The history/schema drift must be reconciled before applying the new Master DNA migration or deploying the Edge Function to Development. This is intentional: do not apply the new migration out of order. Production remains untouched.


## 20. Whole-Vyral DNA-only portability and AI Chat integration — code added, runtime acceptance pending

The portable package path now supports two scopes:

- A single-Asset DNA-only reconstruction unit for isolated experiments.
- A whole-Vyral DNA-only package containing every Asset metadata entry, one lossless Asset DNA v3 record per Asset, all corresponding raw tile payloads, and the verified compact Master DNA snapshot. A multi-Asset export is rejected unless the Master DNA inventory exactly matches the complete Asset set.

The package builder validates every record, checks exact tile coverage and byte lengths, reconstructs every decoded sample stream before writing the ZIP, rejects undeclared payload paths, and validates the Master DNA fingerprint and inventory. Original media binaries, private Storage paths, previews, thumbnails, and version-bound legacy evidence remain excluded from DNA-only packages. Encoded source-file bytes are not claimed to be recoverable.

Import now accepts whole-Vyral DNA-only packages, verifies every Asset DNA record before writing, reconstructs each Asset into a new PNG version, remaps each DNA record to the newly created local Asset/version identities, and stores the exact raw tiles separately. When the destination Master DNA schema is available, the importer also maps Main/Supporting roles, purposes, membership edges, and additional typed relationships into the destination Vyral. Imported claims remain unverified and a new local Master DNA revision must be built. When the migration is unavailable, the package can still be imported without attempting writes to missing tables; the UI reports that Master DNA reconstruction is pending.

AI Chat now validates the compact Master DNA fingerprint and inventory and passes the Vyral purpose, asset roles/purposes, relationship graph, reconstruction claims, and cross-asset constraints as structured context. The current Vision request still attaches only the first Asset's image preview; other Assets are described by verified Master DNA metadata, not visually attached. Multi-image Vision and authenticated remote source resolution are not yet implemented.

**Verification boundary:** the VYRA CI run for the current package changes passed TypeScript, all unit suites including whole-Vyral DNA-only export/reconstruction, Deno type-check, and Production Build. Browser UI and Database workflow runs are still being checked. No hosted Development migration or Edge Function deployment has occurred; Production remains untouched.


## 21. Universal binary File DNA v1 — core added, application integration pending

The working branch now contains `src/services/vyralFileDnaV1.ts` and a JSON Schema for `vyra.asset-file-dna` v1. This is the binary identity/reconstruction layer for assets that are not handled by the image-specific decoded-sample DNA v3 path.

The record pins to an Asset and immutable Asset Version and stores:
- exact source byte length and SHA-256;
- declared MIME type and normalized filename extension (descriptive metadata only);
- a conservative file-signature hint derived from leading magic bytes, not a full semantic parser;
- extractor identity/version;
- an explicit reconstruction declaration.

Two honest modes are supported:
1. **Identity-only:** hash/size/format metadata, with reconstruction claim `unavailable`. This can verify a candidate file but cannot recreate it.
2. **Lossless source-byte payload:** ordered raw chunks, each with length and SHA-256, plus an aggregate source SHA-256. Only this mode may claim `source_file_exact`; reconstruction validates every chunk and the final byte stream.

This generic layer does not yet parse audio codecs, video tracks/timelines, document structures, 3D scene graphs, or archive contents. Magic-byte detection is only a format hint. It is now wired into the browser Asset upload path for non-raster files: upload creates a version-pinned identity-only File DNA v1 record in Supabase, then the Master DNA builder validates its version, size, MIME type, and source SHA-256. Because the upload record carries no raw binary chunks, its reconstruction claim remains `unavailable`; a hash is not a reconstruction payload.

The existing whole-Vyral DNA-only package exporter/importer still accepts only image DNA v3 records. Mixed-media DNA-only package export/import and source-byte retrieval are not yet implemented. The generic service can create lossless chunks when explicitly requested, but the current upload path intentionally does not duplicate the original binary into DNA storage.

Automated tests cover exact byte round-trip, hash-only non-reconstruction, altered/missing/undeclared chunks, malformed chunk coverage, and false exact-claim rejection. CI now runs this suite; the newest commit's Actions result has not yet been returned by the GitHub status query. Do not describe the suite as passed until a run is visible.


## 22. Mixed-media DNA-only package contract

The package service now supports a single DNA-only Vyral containing both raster DNA v3 and binary File DNA v1 records. Each Asset must have exactly one supported reconstruction record. Raster Assets carry lossless decoded-sample tiles; non-raster Assets carry lossless raw source-byte chunks. The parser verifies every declared chunk/tile and rejects undeclared archive entries.

For File DNA v1, the canonical upload record may remain identity-only. During DNA-only export, VYRA reads the exact immutable source version, recomputes its SHA-256, compares it with the File DNA identity record, and only then emits lossless chunks. The package's File DNA record declares `source_file_exact` only when those chunks are included and verified. Import verifies the package bytes again, writes a new immutable source version, and creates a new identity-only File DNA record pinned to the imported version. Imported evidence remains marked unverified until local verification/rebuild.

Capability metadata is per-media-aware:
- raster DNA v3 can restore decoded samples, not original encoded PNG/JPEG bytes;
- File DNA v1 can restore exact original binary bytes when the lossless chunks are present;
- a mixed package does not claim that every original encoded file is recovered merely because some File DNA records are exact.

This package path has synthetic automated coverage for binary clean-import reconstruction and tamper rejection. It does not yet prove a real-world multi-asset mixed Vyral import/export in the authenticated Preview. Audio/video/document/3D/archive semantic parsing remains a separate layer above exact binary preservation.


## 23. AI Chat inspection boundary for Universal File DNA

AI Chat validates File DNA v1 records when a `.vyral` package is attached. For DNA-only packages it reconstructs and verifies the lossless source-byte chunks; for full packages it verifies the pinned source-version bytes against the File DNA size and SHA-256. It passes only verified metadata (asset label, MIME type, conservative format signature, extension, byte length and digest) into the chat context.

This does **not** mean the AI has listened to audio, watched video, parsed a PDF/document, or understood a 3D scene. Those semantic media decoders and corresponding model inputs are separate future work. Raster previews continue through the separate bounded Gemini Vision path; binary File DNA bytes are not sent as arbitrary inline model payloads.


## 24. Deterministic Universal File Structure Profiles

File DNA v1 now carries an optional deterministic `structure` profile alongside its cryptographic file identity. The first bounded parsers record conservative structural facts:
- WAV: format code, channel count, sample rate, bit depth, data bytes and an estimated duration from the declared byte rate.
- ISO-BMFF audio/video: major brand and top-level box inventory, without claiming codec, track or duration decoding.
- MP3/FLAC/Ogg: conservative audio signature and ID3 tag-size hint where present.
- PDF: header and lower-bound page-object markers from a scan capped at 8 MiB; compressed object streams may hide pages.
- GLB/glTF: declared version/length and bounded JSON scene counts (nodes, meshes, materials, scenes, animations).
- UTF-8 text/Markdown/JSON: bounded character/line/word counts, Markdown heading count, and JSON top-level item/key count; source text is not copied into the DNA profile.
- Other containers: conservative signature only.

All parsers are bounded, deterministic and non-generative. A structural profile is not semantic understanding, transcription, OCR, a complete media decode, or a reconstruction proof. Unsupported/ambiguous formats remain explicitly partial, signature-only or unknown. Extractor version is pinned in the record so future parser improvements can create new records rather than silently changing old evidence.


## 25. Verified-byte structural re-analysis in AI Chat

AI Chat does not trust a package's optional File DNA structural facts as an authority. After reconstructing File DNA chunks or verifying the pinned full-package source version by size and SHA-256, Chat re-runs the version-pinned deterministic structure analyzer against those exact bytes. If a stored structure profile is present, canonicalized profile data must match the independently derived result or the attachment is rejected. Older records without structure metadata can still be inspected; Chat derives the profile locally from the verified bytes.

The model receives the derived bounded facts and parser limitations, not arbitrary binary bytes. This keeps container metadata tampering separate from actual media understanding.


### ISO-BMFF track metadata profile extension

The deterministic File DNA analyzer now walks a bounded ISO-BMFF box tree (maximum 4,096 boxes and depth 8), skipping media payload boxes and inspecting metadata containers. Where present it records movie duration/timescale, track handler types, sample-entry codec identifiers, and video dimensions from track headers. Malformed boundaries or safety-limit exhaustion produce a partial result with an explicit note. This is container-level evidence only: it does not decode compressed streams, audio samples, or video frames, and it does not claim scene understanding.


## License policy evaluation v1 — explicit grants, exact versions, conservative rights

The initial deterministic evaluator lives in `src/services/vyralLicensePolicyV1.ts`. It encodes the product's three buyer-facing permission tiers without silently granting rights:

| Profile | Use / generate derivatives | Clone branch / edit branch | Resell branch |
| --- | --- | --- | --- |
| `basic_use` | Allowed | Not allowed | Not allowed |
| `clone_branch` | Allowed | Allowed | Not allowed |
| `modified_branch_resale` | Allowed | Allowed | Allowed |

A grant is scoped to one exact Asset version and one grantee, records a terms version and grant time, and may have an expiry. Multi-Asset operations require a valid grant for every included Asset; the effective permission is the intersection, never the union, of the included grants. A grant for an older Asset version does not silently authorize a newer version. Revoked, expired, wrong-grantee, missing, or insufficient grants deny the action.

The evaluator accepts a verified-owner bypass only as an explicit server-derived boolean. Callers must not accept a client-supplied ownership assertion. The evaluator is a pure policy decision helper, not yet wired into purchase, branch creation, editing, export, resale, or Marketplace APIs. It does not establish copyright ownership, creator identity, legal title, or that the grantor had authority to license the Asset.

**Snapshot integration remains a separate step.** Master DNA should carry immutable references to the effective license grant IDs, terms versions, exact Asset versions, and policy snapshot digest. A license change must create a new Master DNA revision or mark the current one stale; it must not rewrite an older snapshot. Missing license evidence must remain explicitly unknown/restricted rather than being upgraded by inference. Do not populate existing Vyrals with guessed grants or licenses.

Automated tests cover the three tiers, multi-Asset intersection, stale versions, wrong grantees, revoked/expired grants, and explicit verified-owner handling. Runtime enforcement and database persistence are not yet implemented.

## 26. First authenticated VYRA Resource Resolver — implementation added, runtime acceptance pending

The working branch now includes a JWT-protected Supabase Edge Function at `resolve-vyral-resource`. It is the first executable remote-resolution path and deliberately starts with a narrow owner-authenticated contract.

Supported POST actions:

- `master`: resolve one exact immutable Master DNA revision (or the latest revision when no revision is supplied), returning its stored snapshot and integrity bindings.
- `asset_dna`: resolve one Asset DNA record only when the exact Asset ID and Asset Version ID are present in the selected Master DNA snapshot. For raster DNA v3, the function validates that the stored DNA record is bound to the same source Asset/version/hash as the Master DNA inventory, then issues short-lived signed URLs for every private tile object.
- `asset_source`: issue a short-lived signed download URL for the exact original Asset version pinned by the selected Master DNA snapshot.

Security boundaries in this first phase:

- Every request requires a valid Supabase user JWT; the function resolves the user identity from the verified session and never accepts a caller-supplied owner ID.
- Only the authenticated owner can resolve their Vyral in this phase. Public and unlisted sharing, third-party OAuth grants, and external AI client credentials are not enabled.
- Asset/version membership must match the selected immutable Master DNA snapshot. A caller cannot substitute a different Asset version.
- Storage paths are checked against the authenticated owner's Vyral/Asset prefix; private paths are not returned as API data.
- Tile/source access uses signed URLs with a 60-second lifetime. The resolver does not return a partial tile URL list if signing any tile fails.
- Responses are marked private/no-store and include no public caching directive.
- DNA v3 responses preserve the distinction between exact decoded-sample reconstruction and recovery of the original encoded PNG/JPEG bytes. File DNA identity-only records are not described as reconstructable.

The function is registered in `supabase/config.toml` with `verify_jwt = true`.

**Not yet implemented:** deployment to the Development Supabase project, live authenticated endpoint tests, public/unlisted read policies, persistent third-party grants, OAuth authorization/consent, MCP Server adapter, rate-limit/audit persistence, and cross-platform ChatGPT/Gemini/Claude connector tests. This implementation must not be described as a public resolver or as an already-working third-party AI integration. The current Development migration-history drift must be reconciled before deploying the function; do not apply migrations out of order. Production remains untouched.

Acceptance gates before enabling external AI access:

1. Apply/reconcile the required schema on Development only.
2. Test owner access, non-owner denial, missing JWT denial, invalid IDs, wrong Vyral, wrong Asset version, stale DNA, missing tile, and expired signed URL.
3. Add explicit share/grant records and revocation before any non-owner retrieval.
4. Add OAuth consent/scopes and an MCP adapter that calls this same resolver rather than duplicating authorization logic.
5. Test clean-session retrieval from at least one external AI client and verify every downloaded tile/source hash.

- Implicit latest-revision resolution is rejected unless the Vyral's current `master_dna_status` is `ready`. An owner may still request an explicit historical revision; it is returned as that pinned historical snapshot, never substituted for the current head.
- Resolver policy helpers are unit-tested for exact snapshot membership, revision integrity bindings, strict owner/Asset storage-prefix boundaries, and exact DNA/source-version/fingerprint agreement.
