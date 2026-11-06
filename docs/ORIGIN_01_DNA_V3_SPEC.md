# ORIGIN-01 DNA v3 — Lossless Reconstruction Specification

Status: implementation specification. No v3 reconstruction success is claimed.
Target: existing branch `rebuild/marketplace-workspace-foundation` only.
Reference asset: ORIGIN-01 protected original. It must remain immutable.

## 1. What DNA v3 promises

DNA v3 is a portable, lossless *decoded-image reconstruction representation*. It is not merely a longer visual description or a model prompt.

For a supported raster source, DNA v3 must preserve the exact decoded sample values needed to rebuild the image, plus the decoding and color interpretation contract. The DNA-only .vyral package may omit the original media file entry while carrying a separate lossless DNA payload. That payload is DNA data, not an ordinary Asset Library copy.

The system must keep these claims separate:

- **Byte-exact file recovery:** output file SHA-256 equals original file SHA-256. This is not promised by decoded pixel DNA because PNG/JPEG metadata, compression choices, chunk order, and encoder details may differ.
- **Decoded-sample exact recovery:** width, height, channel layout, alpha, and every decoded sample value match the source under the declared decoding/color contract. This is the primary v3 target.
- **Structural / perceptual / semantic reconstruction:** separate lower-fidelity claims; never substitute them for decoded-sample exactness.

If exact decoded samples cannot be extracted from the protected original, v3 must report unsupported or incomplete rather than inventing missing data.

## 2. DNA v3 record contract

Each v3 record is immutable and linked to:
- the exact source asset ID and version ID;
- the source SHA-256 and byte size measured by the trusted extractor;
- the extractor name, version, and decoder/color-management contract;
- a schema version and representation kind.

Required logical sections:

### identity
- `schema_id: "vyra.asset-dna"`
- `schema_version: 3`
- `record_id`
- `source.asset_id`
- `source.asset_version_id`
- `source.sha256`
- `source.size_bytes`
- `source.mime_type`

### decoded_image
- `width`, `height`
- `sample_format` (initial v3 implementation: unsigned 8-bit integer)
- `channel_layout` (RGB or RGBA; no implicit channel conversion)
- `color_space` (explicitly identified or `unknown`)
- `icc_profile_sha256` (or null only when no profile exists)
- `alpha_mode` (none, straight, premultiplied, unknown)
- `decoder_contract` including decoder name/version and color-management behavior
- `decoded_samples_sha256`: SHA-256 over the canonical row-major decoded sample byte stream

### lossless_payload
- `encoding: "raw-tiled-v1"`
- `tile_width`, `tile_height`
- `tiles[]`: tile coordinates, edge dimensions, package path, byte length, SHA-256
- tile bytes are tightly packed row-major samples in the declared channel layout
- every pixel must appear exactly once; tiles must not overlap or leave gaps
- payload bytes must be stored in ZIP entries, not JSON/base64, to avoid expansion and accidental truncation

### reconstruction
- deterministic row-major tile assembly rules
- output sample layout and dimensions
- no resize, crop, resampling, antialiasing, or inferred geometry is permitted in exact mode
- renderer/encoder metadata is not allowed to alter decoded samples

### evidence
- extractor verification and source-integrity evidence
- tile hashes and aggregate decoded-sample hash
- creator/model observations remain separate, provenance-labelled evidence; they cannot override measured pixel payload

## 3. DNA-only package behavior

The current v1 package format remains readable. Introduce an additive package manifest capability for v3 DNA payload entries.

For a v3 DNA-only export:
- ordinary asset binary versions remain excluded from `assets/<asset-id>/versions/...`;
- the v3 lossless payload is included under `dna/v3/<record-id>/tiles/...`;
- the manifest explicitly declares the DNA schema, source version/hash, supported recovery level, tile count, and all payload paths/hashes;
- no original asset binary, preview, thumbnail, derivative, public URL, or hidden reference may be included;
- package inspection must prove this boundary before the blind reconstruction test starts.

A package with descriptive DNA but no lossless payload must be labelled `descriptive_only` and cannot claim decoded-sample exact recovery.

## 4. Deterministic reconstruction and verification

The standalone reconstruction path must:
1. validate package and DNA v3 schema;
2. reject undeclared, missing, duplicate, overlapping, out-of-bounds, or incorrectly sized tiles;
3. verify each tile SHA-256;
4. assemble the canonical row-major sample stream;
5. verify aggregate `decoded_samples_sha256`;
6. output the exact width, height, channel layout and samples without resampling;
7. produce a reconstruction report containing every check and its result.

The independent verifier receives the protected original only after candidate output is complete. The reconstruction process itself receives only the DNA-only package.

## 5. Acceptance criteria for ORIGIN-01

All are required before marking DNA v3 successful:

- Original source hash and byte size independently match the protected asset/version record.
- Extractor read the protected original itself, not a chat attachment, screenshot, Gallery copy, or model-generated candidate.
- DNA-only package contains no original binary, preview, thumbnail, derivative, or source URL.
- All declared tile entries exist, are safe, unique, complete, non-overlapping, and within image bounds.
- Every tile SHA-256 matches.
- Reconstructed aggregate decoded-sample SHA-256 matches DNA v3's declared digest.
- Independent comparison against the protected original reports identical width, height, channel layout, alpha semantics, and 100% identical decoded sample bytes.
- Two clean reconstructions produce the same aggregate digest and byte-identical canonical sample stream.
- A second independent implementation can parse the schema and reconstruct the sample stream from the package.
- The original protected asset/version/storage bytes and metadata remain unchanged.

Any failed or unperformed criterion means v3 is not passed. Similarity scores and geometry percentages cannot override a failed exactness check.

## 6. Explicit limitation

Decoded-sample exactness does not imply original file-byte exactness. To recover the original PNG byte-for-byte, the original encoded file bytes (or a proven reversible encoding of them, including all metadata and chunk structure) must be preserved. That would be an encoded-source archive, not just a visual description.

## 7. Safety and scope

- Continue on `rebuild/marketplace-workspace-foundation`; do not create a new branch.
- Use VYRA Development Supabase only.
- Do not merge to Main until DNA v3 passes all acceptance criteria.
- Do not deploy Vercel Production or modify the Production Supabase project.
- Never modify, rename, replace, unlock, or delete the protected ORIGIN-01 original.
- Create new DNA v3 records and reconstruction outputs additively.
- Do not change unrelated Workspace or publishing flows.

## 8. Current package integration implementation

The existing VYRAL ZIP service now has an additive DNA v3 package path:

- `createVyralDnaOnlyPackage(...)` creates a `dna-only` package manifest, removes ordinary binary versions, recursively strips URL/storage/preview/thumbnail/derivative reference fields from portable metadata, and includes only the declared DNA v3 tile payload plus manifest.
- Export validates the complete tile set and reconstructs the decoded sample stream before writing the archive. This checks per-tile and aggregate SHA-256 values.
- `parseVyralManifest(...)` validates embedded DNA v3 records and requires every declared tile entry to exist.
- `reconstructVyralDnaV3FromPackage(...)` reconstructs from the package file map without reading the source asset.
- Package regression tests exercise a synthetic DNA-only round-trip and check that ordinary source media and URL/storage/preview/derivative fields are absent.

This is package-layer integration and synthetic test coverage only. It does not yet extract ORIGIN-01 from protected Development storage, prove the source hash against the protected bytes, or establish ORIGIN-01 exact reconstruction. The acceptance criteria in section 5 remain unchanged and mandatory.

## 9. Owner-authenticated ORIGIN-01 extraction path

A Development-only Edge Function and protected Vyral UI action now provide the first real-source extraction path:

- The function requires a valid Supabase user JWT and additionally checks the exact ORIGIN-01 owner ID.
- It reads only the registered protected Vyral, asset and version metadata, then downloads the original from the private `vyral-assets` bucket using the server-side admin client.
- It verifies the downloaded byte size and SHA-256 against the registered original version before decoding.
- The initial decoder accepts only 8-bit truecolor RGB/RGBA PNG files and rejects embedded `iCCP` profiles rather than silently discarding or misrepresenting them.
- It records `sRGB` only when the PNG contains an sRGB chunk; otherwise color space remains `unknown`.
- It creates 128×128 raw sample tiles, hashes every tile and the aggregate sample stream, and stores the new tile objects under a separate DNA path. It does not write to, rename, replace or delete the original asset or version.
- It inserts an additive DNA v3 record with `dna_status=evolving` and `verification_status=observed`. Extraction is not reconstruction verification.
- The UI action is available only inside the protected ORIGIN-01 Vyral and requires explicit confirmation. Existing v3 records are not overwritten.

Current verification boundary:
- The function is deployed to the Development Supabase project with JWT verification enabled.
- The function has **not yet been invoked against ORIGIN-01**. Therefore no claim is made that the source has been decoded, that ICC handling is supported, or that a DNA v3 record has been created.
- If the source PNG contains an embedded ICC profile or uses unsupported PNG encoding, extraction stops without writing DNA.
- After extraction, the next required step is to read back every stored tile, validate hashes, reconstruct the canonical sample stream in a separate execution, compare the reconstructed digest and dimensions, and only then consider a DNA-only export.
