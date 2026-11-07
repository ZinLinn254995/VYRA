# Vyral End-to-End Success Specification

Status: implementation contract; capabilities are not considered complete until the acceptance tests below pass.

## Product outcome

A Vyral is a creator-defined collection/container for assets. It may contain exactly one Asset or many Assets. The creator decides what belongs together. Assets may be related, unrelated, loosely grouped, or intentionally random. A Vyral does not require a story, script, character, world, timeline, relationship graph, shared style, or any minimum level of organization. VYRA must not judge whether a Vyral is well-designed or meaningful.

The user experience remains simple:
1. Upload existing files or create content through VYRA Chat.
2. VYRA stores each Asset and automatically builds its available DNA in the background.
3. The creator may organize the collection however they wish, or leave it as-is.
4. When a Vyral is later used for a task, its DNA can help an AI selectively retrieve and recreate the requested Asset(s), preserving consistency where the creator wants it.
5. The creator can export/share a compact `.vyral` package for compatible external AI tools.

DNA, fingerprints, extraction, indexing, and verification are background systems. They are not required user tasks and must not appear as technical setup screens.

## Core model

- **Asset DNA** describes one Asset: identity, modality, source/version, recoverable properties, semantic traits, and the evidence/extraction method behind each claim. Every Asset should have its own DNA, regardless of whether it relates to any other Asset.
- **Vyral DNA** describes the collection identity and inventory, and points to the DNA of its Assets. It may include optional creator-provided or evidence-backed grouping/context, but it must not require a purpose, story, relationships, shared rules, or a main/supporting hierarchy.
- **Fingerprint** verifies identity or detects a change. It is not a substitute for descriptive or generative DNA.
- **Optional context** such as character links, voice links, story order, visual style, or world rules may be captured when the creator supplies it or the system has reliable evidence. Absence of this context is valid and must never block a Vyral from being created, exported, or used.
- **Selective retrieval** resolves only the Asset DNA and source/reference material needed for the current task. A consumer must not need to load every original Asset for every request.
- **Consistency is a usage capability, not a collection validity rule.** When the creator asks to reuse or recreate Assets consistently, the system uses available DNA and optional relationships to preserve relevant traits. It must not force unrelated Assets to become related or invent a story/relationship.

## Asset ingestion contract

Every successful upload or VYRA-generated asset must automatically:
1. Store the original bytes and create an immutable source version.
2. Calculate and verify a cryptographic source fingerprint.
3. Identify the actual file format and modality from validated content, not filename alone.
4. Create exactly one current supported identity/reconstruction record for that asset version, or report a clear internal processing failure and retry state.
5. Extract modality-appropriate information when supported:
   - Images: dimensions, color/profile/alpha information, lossless decoded samples where supported, visual/semantic traits, and source references.
   - Audio: duration, sample rate, channels, codec, waveform/segment metadata, speech/transcript/speaker traits only when a supported extractor is available.
   - Video: duration, frame rate, dimensions, audio tracks, keyframes/scenes, timestamps, motion and continuity observations only when supported.
   - Text/documents: format, encoding, extracted text, structure, language, and source-page/section references where supported.
   - 3D assets: format, geometry/material/rig/animation metadata where supported.
   - Other files: deterministic identity and exact-byte recovery where payload preservation is available; never invent semantic understanding.
6. Record extractor/version, source version, evidence, confidence, limitations, and recovery claim.
7. Update the parent Vyral index automatically and idempotently.

A file identity record alone must never be presented as semantic understanding or as a generative reconstruction recipe. Unsupported modalities must be labelled internally as not yet semantically supported.

## Consistency-on-use contract

Consistency is applied when a Vyral is used for a creative task, not imposed when the Vyral is created.

When the creator asks for a new image, voice, video, scene, character, or other output based on selected Assets, VYRA should:
- identify which selected Assets and DNA records are relevant to that request;
- retrieve only the required DNA sections and, when permitted and useful, original/reference Assets;
- preserve the traits that matter to the requested output (for example character appearance, voice characteristics, visual style, motion, or an explicitly supplied relationship);
- respect creator-provided constraints and distinguish them from AI-inferred observations;
- avoid applying unrelated Assets or unrelated collection content to the task;
- record which source Assets and DNA revisions informed the generated result.

If a Vyral contains one Asset, the system must still be able to use that Asset's DNA independently. If a Vyral contains many unrelated Assets, the system must allow the creator or AI task to select only the relevant ones. If there are no relationships, story rules, or shared constraints, that is a valid state—not an error.

Relationship inference is optional. When useful, it must be evidence-based; uncertainty remains explicitly unknown rather than fabricated. Creator corrections take precedence and remain traceable.

## Reconstruction claims

Keep these outcomes distinct:
- **Exact source recovery:** reconstructed bytes have the same length and SHA-256 as the original source version. This is the 100% binary recovery test.
- **Lossless decoded recovery:** decoded samples match under a pinned decoder/format contract. This does not imply original container bytes match.
- **Semantic reconstruction:** a model generates a new asset from descriptive DNA. It is evaluated against modality-specific measurable criteria and is not byte-exact recovery.
- **Consistency generation:** a new output preserves the relevant approved traits and cross-asset rules. It is not expected to be byte-identical.

Never claim 100% reconstruction for a model-generated image, audio, or video unless a defined, repeatable test actually proves the required equality. Report unsupported or unmeasured dimensions as unknown.

## Public and Private Vyral behavior

Visibility is one simple Vyral-level choice:
- **Public:** a compact DNA package may resolve to a VYRA retrieval bridge. The bridge exposes only the requested original assets that the Vyral owner has made public. Exact source recovery is possible when the original source bytes are retained and the bridge authorizes retrieval.
- **Private:** no external AI/person can retrieve original assets through the bridge. Reconstruction uses only the compact DNA carried in the package. The system should maximize similarity but must not promise exact recovery when the source bytes or sufficient information are unavailable.

The bridge must enforce visibility and ownership server-side. Use scoped, revocable, preferably expiring read-only grants. Never place service-role keys, private storage credentials, or long-lived secrets inside a `.vyral` package. Do not assume uploading a package to an AI chat automatically grants network access; each external AI needs a compatible browsing, connector, or tool capability.

## Compact .vyral package contract

A DNA-only package contains:
- a versioned manifest and stable Vyral identity;
- compact Vyral DNA and selected Asset DNA records;
- fingerprints, source/version references, provenance, confidence, and limitations;
- selective retrieval instructions and the public/private resolution policy;
- generation/consistency constraints;
- no original binary payloads unless the user explicitly exports a full package.

The package must be self-describing, validated, forward-versioned, integrity-checked, and small relative to the original media. It must not claim that compact metadata alone can recover information that it does not contain.

## User interface contract

Normal users should see creative concepts, not infrastructure:
- show the Vyral name, description, assets, preview, and a simple Public/Private choice;
- offer straightforward upload, create, export/share, and import actions;
- hide DNA schemas, hashes, storage paths, extraction controls, manual role/purpose forms, lineage internals, and verification tools from the normal workflow;
- run supported background processing automatically and show only understandable progress or actionable errors.

Advanced diagnostics may exist in a developer-only area, but they must not be part of the ordinary Vyral experience.

## End-to-end release gates

A Vyral release is not considered successful until automated tests and a real Development-environment end-to-end test demonstrate all of the following:

1. **Single-Asset Vyral:** create a Vyral containing one Asset; automatic Asset DNA, fingerprint, export, import, and supported recovery all work without requiring purpose, role, story, or relationship metadata.
2. **Unrelated multi-Asset Vyral:** add several unrelated Assets of mixed supported types; each receives its own DNA. The collection remains valid with no forced links, hierarchy, or shared narrative.
3. **Upload path:** representative image, audio, video, document, and 3D files are uploaded; original hashes and versions are preserved; supported DNA extraction runs automatically; unsupported extractors are honestly reported.
4. **Chat creation path:** a Chat-approved generation is saved as an Asset in the selected Vyral, receives the same automatic ingestion pipeline, and records its prompt/model/source provenance.
5. **Selective use and consistency:** a task selecting one or more Assets retrieves only relevant DNA/reference data. If consistency is requested, the output preserves measurable relevant traits; if no relationship data exists, the system does not invent it.
6. **Exact recovery:** every supported exact-recovery fixture is restored byte-for-byte and SHA-256 matches the original.
7. **DNA-only reconstruction:** a clean external test session receives only the `.vyral` DNA package, with no hidden source files or conversation context, and attempts reconstruction. Results are scored using documented modality-specific criteria.
8. **Public bridge:** an authorized external test can retrieve only selected public Assets; private Assets and unrelated Vyrals remain inaccessible; revoked/expired grants fail.
9. **Private mode:** the same external test cannot retrieve original Assets and can only use package-contained DNA.
10. **Import/export:** export → import into a different Vyral → export again preserves package validity, source integrity, identity/provenance, and supported reconstruction records without accidental duplication.
11. **Simple UX:** a normal user completes upload/create, preview, visibility selection, export, and import without seeing or configuring DNA internals.

A green unit-test suite alone is not sufficient. Release status must distinguish automated unit tests, browser tests, Development integration tests, and external-AI blind reconstruction tests.

## Current known implementation boundary

The current foundation includes Vyral asset/version storage, fingerprints, DNA v3 lossless decoded-sample extraction for PNG/JPEG/WebP, File DNA v1 identity and chunk-based exact-file packaging, Master DNA schema/build foundations, and `.vyral` archive export/import foundations.

undefined

Known gaps to close before claiming this specification is met:
- semantic and consistency-aware DNA for audio, video, documents, 3D, and other supported modalities;
- automatic Asset DNA ingestion and a lightweight Vyral inventory/index that works for one Asset or many unrelated Assets, without requiring role, purpose, hierarchy, or relationships;
- optional, evidence-backed context/relationship capture when it helps a later consistency task, without making it a creation prerequisite;
- automatic ingestion of VYRA Chat-generated media into the same Asset/DNA pipeline;
- selective retrieval and a secure Public bridge with Private isolation;
- external-AI blind tests for compact DNA reconstruction;
- a normal-user Vyral interface that hides technical internals.

This specification defines the target and acceptance criteria. It is not a statement that the listed target capabilities are already implemented.
