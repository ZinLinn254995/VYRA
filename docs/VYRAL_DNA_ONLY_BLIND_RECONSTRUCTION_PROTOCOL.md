# VYRAL DNA-Only Blind Reconstruction Protocol

Status: acceptance protocol; this document defines evidence requirements and does not claim that any Asset has passed.

## 1. Purpose

Prove what a portable `.vyral` DNA-only package can reconstruct when the receiving AI has no access to the original Asset, the VYRA account, private storage, earlier messages, or hidden reference files.

The test separates three different outcomes:

- **Exact source recovery:** output bytes have the same byte length and SHA-256 as the original source Version.
- **Exact decoded recovery:** decoded samples match byte-for-byte under the pinned decoder and format contract. This is not the same as matching the original encoded file.
- **Blind generative reconstruction:** a newly generated output is compared with the original using predeclared, modality-specific measurements. It must never be reported as byte-exact recovery.

## 2. Blind-test isolation

For every test case:

1. Freeze the source Asset Version, its SHA-256, the exact DNA record ID, schema version, and the exported package SHA-256.
2. Create a clean external AI session. Do not reuse the creator conversation or any session that has seen the original Asset.
3. Provide only the DNA-only `.vyral` package and its included reconstruction guide. Do not provide the original file, screenshots, thumbnails, source URLs, storage paths, or hidden attachments.
4. Disable or avoid retrieval tools that could access the original Asset. If a model has browsing or connected storage, record whether it was disabled.
5. Record provider, model identifier, model version/date when available, settings, full prompt, tool availability, and all output files.
6. Run at least three independent attempts per model/configuration. Do not select only the best attempt for the primary result.
7. Hash and preserve every output before scoring. Keep the evaluator blind to which model/configuration produced each candidate where practical.

A test is invalid if the original Asset or an equivalent hidden reference was available to the model or evaluator during generation.

## 3. Required evidence record

Each attempt must record:

- test ID and timestamp;
- Vyral ID and Asset ID;
- source Asset Version ID and original source SHA-256;
- DNA record ID, schema ID/version, and declared recovery level;
- DNA-only package SHA-256 and package export mode;
- external provider/model/configuration and prompt;
- whether browsing, connectors, code execution, or other tools were available;
- output file name, byte length, detected format, and SHA-256;
- evaluator version, metric configuration, raw measurements, and result;
- any missing, unsupported, or unscorable dimensions.

The evidence record must be append-only or versioned. Re-running a test must create a new attempt, not overwrite the earlier result.

The Development comparison record stores the available evidence in `public.vyral_reconstruction_tests`:

| Field | Meaning |
| --- | --- |
| `model_provider`, `model_id`, `model_version` | Provider and exact model identifiers when supplied; missing versions remain null and an unrecorded model ID is explicitly labelled |
| `prompt_sha256` | SHA-256 of the exact prompt, when supplied and valid; prompt text itself is not stored in this field |
| `session_reference` | Optional external session reference supplied by the creator; it is not provider-authenticated |
| `tool_access` | JSON record of available browsing, connectors, code execution, and other tools when supplied |
| `blindness_status` | `creator_attested` means the creator claims the original binary was not provided; it is not independent proof |
| `attempt_evidence` | Snapshot of model, prompt-hash status, tool access, isolation claim, and uploaded-output hash/size reconciliation |

The comparator intentionally never upgrades a creator attestation to `independently_verified`: it cannot observe or authenticate what happened inside a third-party AI session. An absent model version, prompt hash, or tool-access record remains visibly missing rather than being inferred. Each successful comparison call inserts a separate test row; existing rows are not overwritten.


## 3A. Pre-flight package audit

Before giving a DNA-only package to an external model, run its bundled verifier in non-destructive audit mode:

```bash
python tools/reconstruct_vyral.py path/to/export.vyral --audit-only
```

The audit validates ZIP safety limits, exact declared-entry inventory, protected System Files policy and hashes, each Asset's DNA payload hashes, and reconstruction-payload coverage without writing reconstructed files. Legacy `dna-only` packages may contain original binary chunks and are therefore **not automatically blind**. The new Binary-free DNA export is marked `blindReconstruction: true` with `blindnessScope: original_encoded_binary_excluded`: it excludes raster `encoded_file_payload` chunks and all File DNA v1 source chunks. **It is not yet a blind generative-reconstruction package.** Raster DNA v3 still contains the complete decoded pixel sample stream, so an external tool can reproduce those pixels deterministically without inferring the image from semantic DNA. Non-raster File DNA v1 retains deterministic structural facts only and is labelled `semantic-only`; it cannot restore arbitrary original binary files. The audit reports the exact exclusion scope, per-Asset payload kinds, `contains_original_encoded_file_bytes: false`, and `original_binary_payload_entries: 0`. Preserve this report with the external attempt evidence. It proves the package contains no original encoded source bytes; it does not prove a model session was blind or that a generative reconstruction is accurate.

## 4. Modality-specific scoring

### Raster images

Record separately:

- output dimensions and aspect ratio;
- decoded pixel equality and decoded-sample SHA-256, when dimensions and decoder contract match;
- structural similarity (SSIM) and perceptual similarity (LPIPS or an explicitly versioned equivalent);
- foreground geometry/shape agreement;
- background and edge differences;
- color and alpha-channel differences;
- OCR/text accuracy when text is part of the Asset;
- evaluator notes for visible semantic changes.

Do not collapse these into one opaque score. A high perceptual score does not prove exact reconstruction. A resized or color-shifted image must not pass exact decoded recovery.

### Audio

Where supported, record sample rate, channel count, duration, codec, waveform/sample comparison, loudness, alignment, and perceptual metrics. For speech, separately score transcript accuracy and speaker/voice similarity. A matching transcript does not prove matching voice or audio bytes.

### Video

Where supported, record container/codec, dimensions, frame rate, duration, frame-level comparisons at fixed timestamps, scene/shot boundaries, motion/temporal consistency, audio-track presence, and audio comparison. A few matching keyframes do not prove full-video reconstruction.

### Documents and text

Compare extracted text, reading order, page/section structure, tables, formatting, embedded media, and source-file bytes separately. Text equality alone does not prove layout or original-file recovery.

### 3D and other binary assets

Use format-aware validators and compare geometry/topology, transforms, materials, rig/animation data, metadata, and exact bytes separately. If no reliable modality-specific evaluator exists, mark the result **unscored** rather than inventing a similarity score.

## 5. Pass/fail rules

- **Source-file exact: PASS** only when the reconstructed byte length and SHA-256 both equal the pinned original Version.
- **Decoded-samples exact: PASS** only when the full decoded sample stream, dimensions, channel layout, and pinned decoder contract match exactly.
- **Blind generative reconstruction: PASS** only against thresholds declared before the test for every required modality-specific dimension. Publish each metric and threshold; do not change thresholds after seeing the candidate.
- If a required dimension is unavailable, the attempt is **INCOMPLETE**, not PASS.
- If the model accessed the original or hidden reference, the attempt is **INVALID**.
- A best-of-many result may be reported as supplementary, but the median and full attempt distribution must also be reported.
- A result from one model or modality must not be generalized to all AI models, all Assets, or all Vyrals.

No universal visual/perceptual threshold is declared here. Thresholds must first be calibrated on representative Assets and approved before blind evaluation. Until then, report measurements without claiming a generative pass.

## 6. ORIGIN-01 acceptance sequence

1. Pin the existing ORIGIN-01 source Version and DNA v3 record.
2. Run the authenticated Development Asset DNA Assessment and retain its server-side evidence for source bytes and all DNA payload tiles.
3. Export a fresh **Binary-free DNA** package (`blindReconstruction: true`) and verify its integrity, including zero original encoded-binary payload entries. This is useful for testing decoded-pixel recovery, but it is not the semantic blind-reconstruction test.
4. Start a clean external session and supply only that package.
5. Ask the external AI to reconstruct the selected Asset without supplying any image reference.
6. Preserve all attempts and score them using the raster-image measurements above.
7. Compare exact decoded recovery separately from blind generative similarity. The Binary-free DNA package's raster tiles can prove decoded-sample recovery when the decoder contract and complete sample hash match; they do not restore the original encoded PNG bytes. A true semantic blind test must omit those decoded pixel tiles as well and carry only descriptive/structural DNA. Non-raster File DNA currently supplies structural facts only, so those Assets remain incomplete for blind reconstruction until modality-specific DNA extractors exist.
8. Update the DNA design only from measured failure evidence. Repeat the same pinned test after each DNA revision so results remain comparable.

## 7. Release reporting

Every release report must state counts for:

- automated unit/contract tests;
- Development integration assessments;
- exact source-file recovery tests;
- exact decoded-sample recovery tests;
- valid external blind attempts;
- invalid/incomplete attempts;
- modality-specific blind passes.

Do not label Vyral DNA “100% complete” while a required acceptance category is untested, blocked, or unscored. Report the remaining gaps explicitly.
