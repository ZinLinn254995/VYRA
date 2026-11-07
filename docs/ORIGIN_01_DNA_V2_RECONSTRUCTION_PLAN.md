# ORIGIN-01 DNA v2 Reconstruction Plan

Status: diagnostic specification; not a completion claim.
Target branch: `rebuild/marketplace-workspace-foundation`.
Protected reference: ORIGIN-01 original asset. Never mutate or delete it.

## 1. Findings from the current v1 implementation

- The ORIGIN-01 VYRAL-level master DNA record is schema version 1 and mainly contains identity, integrity metadata, approximate observations from a derivative, and open requirements.
- Its visual description says a large red circular disk on a near-white square background. It does not contain a verified pixel mask, exact boundary, per-pixel color data, a complete vector path, or a deterministic rendering recipe.
- The only recorded Vision observation is explicitly bound to a 1536x1536 JPEG chat derivative, not the protected 1254x1254 PNG original. It must not be promoted to original-source truth.
- The current DNA-only export intentionally exports asset metadata and DNA/evidence records while omitting original binaries, previews, and thumbnails. This is correct for a blind-input test, but it cannot recover source information that was never captured in DNA.
- Current v1 package validation allows `exportMode: "dna-only"` with no binary versions. It does not validate that a DNA record contains enough information for any declared reconstruction level.
- The existing reconstruction tests show that descriptive/approximate DNA does not meet the ORIGIN-01 exactness target.

## 2. Non-negotiable distinctions

The system must report these as separate outcomes:

1. **Byte-exact recovery** — reconstructed file bytes hash to the original SHA-256. This requires retaining the original encoded bytes or a proven reversible representation of every byte, including file/container metadata.
2. **Decoded-pixel exact recovery** — decoded pixel samples, dimensions, channel layout, alpha, and declared color interpretation match exactly. This can use a lossless pixel representation plus a deterministic decoder/renderer, even if the final PNG container bytes differ.
3. **Structural reconstruction** — shape geometry and object structure match a declared tolerance.
4. **Perceptual similarity** — image appearance is similar under a named metric.
5. **Semantic similarity** — the same broad subject or meaning is reproduced.

A high score in 3–5 must never be labelled as 1 or 2.

## 3. DNA v2 logical structure

Use an additive, versioned schema. Preserve v1 records unchanged; create a new immutable v2 record linked to the exact source asset version and SHA-256.

Suggested top-level sections:

- `schema: "vyra.asset-dna"`
- `schema_version: 2`
- `asset_identity`: asset ID, exact version ID, source SHA-256, MIME type, byte size.
- `source_facts`: facts read directly from the original binary, each with method, tool/version, evidence pointer, and verification state.
- `canvas`: width, height, orientation, pixel format, channel order, alpha mode, bit depth, color space, ICC/profile digest, and background samples or exact background map where applicable.
- `structure`: ordered objects/layers, object type, coordinate space, exact bounds, center, paths/masks, fill/stroke, z-order, and topology.
- `appearance`: exact colors, gradients, opacity, blend mode, texture/noise descriptors, and whether each value is measured, inferred, assumed, or unknown.
- `raster_representation`: optional lossless tile/pixel payload references, dimensions, encoding, tile size, per-tile hashes, and aggregate decoded-pixel digest.
- `vector_representation`: optional canonical path/primitive data and deterministic renderer contract.
- `render_contract`: renderer name/version, coordinate precision, antialiasing mode, sampling rules, color-management behavior, alpha compositing rules, and output format settings.
- `reconstruction_capabilities`: declared supported levels (byte-exact, decoded-pixel exact, structural, perceptual, semantic), required payloads, and known limitations.
- `provenance`: source binary hash, extractor/version, observation source, creator review, and immutable evidence links.
- `uncertainty`: per-field confidence and status: verified, observed, inferred, assumed, unknown, or disputed.

No model-generated estimate may be written as a verified source fact. Every value must retain its source and evidence.

## 4. Representation strategy

Use the strongest lossless representation available, selected by asset type:

- For authored/vector assets, preserve canonical editable source plus a pinned deterministic renderer.
- For raster assets, capture exact decoded pixels losslessly (for example, tiled RGBA samples with per-tile hashes) if decoded-pixel recovery is required.
- For byte-exact recovery, preserve the original encoded bytes in the package. A description, embedding, vector approximation, or decoded pixel array alone cannot recreate arbitrary original file bytes.
- A compact vector approximation may be stored as an additional structural representation, but it must not replace the lossless source representation or be advertised as exact.

A DNA-only package may omit the ordinary `assets/` media entries while still containing a separately declared lossless DNA reconstruction payload. The manifest and README must state exactly which recovery level that payload supports. If it contains no lossless reconstruction payload, label it descriptive/knowledge-only and do not claim exact recoverability.

## 5. ORIGIN-01 extraction workflow

1. Read the protected original from its private source using an authenticated, owner-authorized path. Do not expose service-role credentials or create a public URL.
2. Independently verify the original byte size and SHA-256 against the protected record before analysis.
3. Decode the original itself, not a chat attachment, screenshot, Gallery re-encode, or candidate derivative.
4. Extract exact canvas/channel/color facts, foreground mask, component topology, measured bounds, subpixel/edge coverage where recoverable, exact pixel colors, and lossless raster tiles.
5. Record all extraction algorithms and versions. Separate direct measurements from approximations.
6. Generate a new immutable DNA v2 record. Never update the protected original or overwrite the v1 record.
7. Export a new DNA-only test package. Inspect its contents to prove the original binary and derivative/candidate assets are absent while the declared DNA payload is present.
8. Reconstruct in a clean isolated environment using only the package and documented decoder. The original is available only to the independent verifier.
9. Compare source and reconstruction at byte and decoded-pixel levels, plus geometry and perceptual levels. Record all results, including failures.
10. Repeat the deterministic decode at least twice and run independent model portability trials separately. Model trials do not substitute for lossless decoder verification.

## 6. Acceptance gates

DNA v2 is not successful until all applicable gates are met:

- Source integrity: original SHA-256 and byte size independently match the protected reference.
- Input isolation: reconstruction process receives no original bytes, original URL, derivative, preview, thumbnail, or hidden reference.
- Package integrity: all package entries and DNA payloads validate against declared hashes; no undeclared external dependencies.
- Decoded-pixel exactness: 100% exact match of dimensions, channel samples, alpha, and declared color interpretation for the decoded-pixel claim.
- Byte-exactness: only claim if reconstructed file SHA-256 exactly equals the protected original SHA-256.
- Determinism: two clean reconstruction runs produce identical output digests.
- Provenance: every source fact is traceable to the protected source version and extraction method.
- Portability: separate compatible tools can parse the schema and decode the representation without VYRA-private state.
- Safety: the protected original remains unchanged and undeletable throughout testing.

A failed gate keeps DNA status at evolving or reconstruction-tested. Do not mark high-fidelity or exact-reconstruction-verified based only on similarity.

## 7. Scope boundaries

- Work only on the existing development feature branch and the VYRA Development Supabase project.
- Do not merge to Main, deploy to Vercel Production, or change the Production Supabase project.
- Do not modify ORIGIN-01 original asset/version/storage metadata or bytes.
- Store each new DNA v2 record and candidate output as additive, separately identified evidence.
- Do not change the Workspace landing page or unrelated product flows as part of this DNA task.

## 8. Current status

Diagnostic audit completed. DNA v2 implementation and ORIGIN-01 re-test are pending. No DNA v2 success is claimed by this document.
