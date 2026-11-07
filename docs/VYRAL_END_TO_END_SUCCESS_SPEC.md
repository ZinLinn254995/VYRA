# Vyral End-to-End Success Specification

Status: implementation contract; capabilities are not considered complete until the acceptance tests below pass.

## Product outcome

A Vyral is one coherent, reusable collection of creative assets and the knowledge that connects them. It may contain characters, images, video, audio, voice references, scripts, captions, prompts, rules, locations, props, 3D models, documents, and other supported files. These are assets inside one Vyral, not separate Vyral product types.

The user experience must remain simple:
1. Upload existing files or create content through VYRA Chat.
2. VYRA organizes the assets and builds/updates their identity and relationships automatically.
3. The user can preview, organize, and share/export the Vyral without configuring technical records.
4. An external AI can read a compact `.vyral` package and use the supported bridge or DNA-only workflow.

DNA, fingerprints, indexing, classification, relationship inference, extraction, and verification are background systems. They must not be required user tasks or exposed as technical setup screens.

## Core model

- **Asset DNA** describes one asset: its identity, modality, source/version, reproducible properties, semantic traits, and the evidence or extraction method behind each claim.
- **Vyral DNA** describes the collection: its purpose, asset inventory, relationships, shared constraints, consistency rules, and references to each Asset DNA.
- **Fingerprint** verifies identity or detects a change. It is not a substitute for descriptive or generative DNA.
- **Knowledge/observations** may be added over time. New observations must retain provenance, confidence, and uncertainty; they must not silently overwrite creator-approved facts.
- **Selective retrieval** resolves only the assets and DNA sections required for a task. A consumer must not need to load every original asset for every request.

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

## Consistency contract

The Vyral-level index must connect relevant assets and preserve:
- character identity and visual traits;
- voice identity and approved voice characteristics;
- style, palette, setting, props, and world rules;
- scripts, captions, scene order, and timestamps;
- relationships between source assets and derived/generated assets;
- approved creator constraints and unresolved uncertainty.

Relationship inference must be evidence-based. When the system is unsure, it records an unknown or candidate relationship with confidence rather than fabricating a fact. Creator corrections take precedence and remain traceable.

For generation, the system should retrieve only the compact Vyral summary and the relevant Asset DNA/reference assets. Generated outputs must be linked to their source assets and the exact DNA/revision used.

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

1. **Upload path:** representative image, audio, video, document, and 3D files are uploaded; original hashes and versions are preserved; supported DNA extraction runs automatically; unsupported extractors are honestly reported.
2. **Chat creation path:** a Chat-approved generation is saved as an Asset in the selected Vyral, receives the same automatic ingestion pipeline, and records its prompt/model/source provenance.
3. **Collection consistency:** multiple related assets produce a Vyral-level DNA index with evidence-backed relationships and shared constraints; selective queries return only relevant records.
4. **Exact recovery:** every supported exact-recovery fixture is restored byte-for-byte and SHA-256 matches the original.
5. **DNA-only reconstruction:** a clean external test session receives only the `.vyral` DNA package, with no hidden source files or conversation context, and attempts reconstruction. Results are scored using documented modality-specific criteria.
6. **Public bridge:** an authorized external test can retrieve only selected public assets; private assets and unrelated Vyrals remain inaccessible; revoked/expired grants fail.
7. **Private mode:** the same external test cannot retrieve original assets and can only use package-contained DNA.
8. **Import/export:** export → import into a different Vyral → export again preserves package validity, source integrity, identity/provenance, and supported reconstruction records without accidental duplication.
9. **Simple UX:** a normal user completes upload/create, preview, visibility selection, export, and import without seeing or configuring DNA internals.

A green unit-test suite alone is not sufficient. Release status must distinguish automated unit tests, browser tests, Development integration tests, and external-AI blind reconstruction tests.

## Current known implementation boundary

The current foundation includes Vyral asset/version storage, fingerprints, DNA v3 lossless decoded-sample extraction for PNG/JPEG/WebP, File DNA v1 identity and chunk-based exact-file packaging, Master DNA schema/build foundations, and `.vyral` archive export/import foundations.

Known gaps to close before claiming this specification is met:
- semantic and consistency-aware DNA for audio, video, documents, 3D, and other supported modalities;
- automatic evidence-backed Vyral-level indexing and relationship maintenance without manual user classification;
- automatic ingestion of VYRA Chat-generated media into the same Asset/DNA pipeline;
- selective retrieval and a secure Public bridge with Private isolation;
- external-AI blind tests for compact DNA reconstruction;
- a normal-user Vyral interface that hides technical internals.

This specification defines the target and acceptance criteria. It is not a statement that the listed target capabilities are already implemented.
