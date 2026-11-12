# VYRAL DNA Success Criteria

**Status:** Acceptance criteria and current validation baseline. This document defines what counts as DNA completeness and reconstruction success; it does not claim that the current system has achieved these levels.

## 1. Core definition

VYRA DNA is successful when it preserves an asset's exact source identity, captures enough version-bound knowledge to understand and recreate the asset, and can demonstrate reconstruction quality with reproducible evidence.

A DNA record existing in the database is not, by itself, proof of completeness. A fingerprint is not semantic understanding. A lossless internal sample archive is not proof that an external AI can reconstruct the asset from a DNA-only package.

## 2. Success levels

### L1 — Integrity verified

Required:
- Asset, Vyral, and source-version identities are explicitly bound.
- Original file SHA-256 and byte size match the stored source version.
- Decoder identity, version, color-management contract, dimensions, channel layout, alpha interpretation, and decoded-sample SHA-256 are recorded where applicable.
- Lossless tile/chunk manifests cover the declared source with valid coordinates, lengths, hashes, and paths.
- Cryptographic and perceptual fingerprints are version-bound and clearly distinguished.
- Verification is repeatable by the server; a creator assertion alone is not labelled independently verified.

Pass means the exact source and its canonical decoded representation can be verified or recovered under the declared decoder contract. It does not mean semantic understanding or external reconstruction has passed.

### L2 — Knowledge complete for the asset type

Required:
- A version-bound semantic record describes what the asset represents and its relevant attributes.
- A type-specific checklist defines required, optional, and not-applicable knowledge fields.
- Each fact records its source, confidence when available, observation time, and verification state.
- Prompt intent, creator claims, model suggestions, direct observations, and creator-confirmed facts remain distinct.
- Unknown or uncertain facts remain explicitly unknown; the system must not invent missing values to reach a score.
- Relevant relationships, lineage, generation instructions/settings, and restrictions are captured when applicable.

A record passes only when every required field for its asset type is supported by admissible evidence. Optional fields do not block readiness. Fields that do not apply must be explicitly marked not applicable rather than silently omitted.

### L3 — Blind reconstruction demonstrated

Required:
- A portable DNA-only package is exported and its exact package hash is recorded.
- The package contains no original media, hidden thumbnails, source pixels, or recoverable media payload when the test claims semantic-only blindness.
- The external model/session, model version, prompt/protocol, and tool access are recorded as evidence.
- The reconstruction is created without access to the original asset binary.
- The candidate output is uploaded and its actual bytes, hash, size, and source version are independently verified.
- Evaluation uses metrics appropriate to the asset type; incompatible comparisons are withheld rather than stretched or guessed.

For raster images, evaluate exact decoded-pixel equality when dimensions and decoder contract match, plus normalized RGB error metrics, geometry/segmentation diagnostics, and perceptual measures as separate signals. dHash alone is never an acceptance criterion. ORIGIN-01 red-mask IoU is a sample-specific diagnostic, not a universal image metric.

For audio, video, 3D, documents, and other assets, define their own modality-specific metrics before claiming reconstruction success.

### L4 — Independently verified DNA

Required:
- L1, L2, and L3 have passed for the exact source version and DNA package revision.
- Blindness and package-content claims are independently auditable, not merely creator-attested.
- Reconstruction results are reproducible across more than one suitable model or run where practical.
- Known limitations, metric calibration, and failure cases are documented.
- No unresolved required-field gaps, provenance conflicts, or integrity mismatches remain.

Only L4 may be presented as **Verified DNA**. A high similarity score alone must not be described as 100% DNA success.

## 3. Two different meanings of 100%

- **Internal 100% recovery:** VYRA can verify and recover the original encoded bytes or the exact canonical decoded samples under a pinned decoder contract. These are distinct guarantees and must be labelled separately.
- **External 100% reconstruction:** a DNA-only reconstruction matches the source under a predeclared, modality-specific acceptance protocol. For raster images, exact decoded RGB equality at identical dimensions is a strict exact-match criterion; normalized similarity is reported separately and cannot be relabelled exact.

## 4. Evidence and status vocabulary

Every DNA field and test result must retain its evidence class:
- `creator_provided`
- `generation_prompt`
- `model_suggested`
- `vision_observed`
- `system_measured`
- `creator_confirmed`
- `independently_verified`

Suggested statuses:
- `missing`
- `unknown`
- `observed`
- `corroborated`
- `creator_confirmed`
- `independently_verified`
- `disputed`
- `stale`

A prompt-declared description must never be presented as visually verified. An AI confidence value is a model estimate, not independent proof.

## 5. Current ORIGIN-01 audit baseline (2026-11-12)

### Source and internal integrity

- Protected original: `ORIGIN-01 Foundational Red Circle`.
- Source version: `b4376fd9-a577-464e-91b4-e33791559e7f`.
- Original SHA-256 and size are recorded and match the verifier's downloaded source.
- DNA v3 contains a pinned ImageMagick WASM decoder contract, 1254×1254 RGB decoded samples, decoded-sample SHA-256, and 100 lossless tiles.
- The database currently labels the original DNA record `evolving` / `observed`; it must not be promoted to Verified DNA merely because internal tile readback passed.
- The original's semantic description is explicitly marked `prompt_declared_not_vision_verified`.
- One vision observation exists, but it is not bound to the original source version and has no creator-confirmed review. It does not close the original's semantic-knowledge gap.
- The original currently has four fingerprint records; fingerprint presence alone does not satisfy the semantic or reconstruction levels.

### Blind reconstruction candidates

- Gemini, Grok, and Claude candidate files have valid recorded source-version hashes and DNA v3 raster sample records.
- The most recent comparison rows in the database were created at 2026-11-12 12:34–12:35 UTC.
- The updated comparison Edge Function containing normalized bilinear RGB metrics and red-mask IoU was deployed at 2026-11-12 12:46 UTC. Therefore, the existing candidate comparison rows predate that deployment and must be rerun before using the new metrics.
- Existing candidate results are strict exact-match failures; they are not evidence of exact reconstruction. Previous similarity and geometry values are diagnostic only.
- Current blindness evidence is creator-attested/unverified, not independently verified. Do not claim independently proven blind reconstruction.

### Next acceptance work

1. Rerun the three registered candidate comparisons against the currently deployed comparison engine.
2. Build a version-bound, asset-type-specific DNA completeness audit. Begin with raster images and preserve the distinction between lossless technical DNA and semantic/reconstruction knowledge.
3. Repair the original source-version semantic evidence chain: analyze the original version, store observations against that exact version, and require creator review for claims that need creator authority.
4. Improve the DNA-only semantic package and run fresh blind reconstruction trials.
5. Extend modality-specific completeness and evaluation profiles to audio, video, documents, and 3D only after each profile has explicit testable requirements.

## 6. Semantic completeness implementation baseline

The first deterministic semantic completeness profile is `raster_image_core_v1`. It checks eight required knowledge dimensions:

- Subject / identity
- Composition
- Geometry / shape
- Spatial layout / position
- Color palette
- Background
- Style
- Text presence (including a trusted not-applicable declaration)

Evidence must be pinned to the exact Asset Version ID and source SHA-256. AI-only observations are provisional. A creator-confirmed review, system measurement, or independent verification can satisfy a required field. A trusted not-applicable declaration is visible in the report and counts as resolved, not silently omitted.

The assessment returns field-level status, evidence references, verified/provisional/missing counts, coverage percentage, and limitations. Coverage is evidence coverage only; it is not a semantic truth score or reconstruction score.

Non-image modalities currently return `unsupported` until their own versioned, modality-specific profile and test criteria are implemented. They are not graded using image fields or a generic cross-modality checklist.

The Development `assess-vyral-asset-dna` Edge Function now includes this source-bound semantic report in the saved Asset DNA assessment. The assessment engine and semantic profile are deterministic; observation generation still depends on the existing vision workflow, and AI suggestions are never promoted to trusted evidence without creator review.

## 6.1 Raster Vision observation contract

The image Vision workflow requests the same eight canonical semantic keys used by `raster_image_core_v1`: `subject`, `composition`, `geometry`, `spatial_layout`, `color_palette`, `background`, `style`, and `text_presence`. Each suggestion carries a value and model-reported confidence. Confidence remains advisory and does not satisfy trusted coverage.

The model receives a bounded JPEG preview derived from the exact source Asset Version. The observation is pinned to the immutable source Version ID and source SHA-256, while the report must not imply the model directly inspected original encoded bytes or performed pixel-exact measurement.

Creator-confirmed observation reviews can confirm the observation's reported semantic fields. Individual creator-confirmed field evidence can also satisfy only its accepted canonical field. Field confirmations are read from append-only evidence and are included only when they match the exact source Version and SHA-256.

The AI Chat Asset DNA assessment report now displays the semantic profile, trusted coverage, provisional count, missing count, and field-level statuses alongside the existing integrity and reconstruction checks.

## 7. Product and safety constraints

- Users should not manually author DNA. VYRA should generate and maintain records in the background.
- Asset DNA is authoritative for each asset; Vyral/Master DNA is derived from the inventory of asset DNA and relationships.
- New observations append evidence; they do not silently overwrite source facts or protected identity, provenance, ownership, or licensing fields.
- No automatic identity merge based only on similarity.
- Do not claim 100%, Verified, or independently blind unless the corresponding acceptance requirements have actually passed.
