# Vyral DNA → AI Vision Pipeline

## Purpose

A portable `.vyral` attachment should provide both verifiable reconstruction data and a visual reference that a vision model can inspect. These are separate representations with separate guarantees.

## Upload flow

1. The browser reads the ZIP package and validates its manifest and archive structure.
2. Every supported DNA v3 record is reconstructed from its declared raw tiles. Tile hashes and the aggregate decoded-sample digest are verified before the package is accepted.
3. For the first DNA v3 record, VYRA encodes a PNG derivative from the verified decoded samples.
4. The browser creates a separate JPEG vision preview from the first DNA v3 record in the package. The longest edge is capped at 1,024 pixels and the encoded preview is capped at 900 KiB. Other DNA records are integrity-verified and summarized, but are not yet attached as visual inputs.
5. The exact decoded-sample DNA and its hashes remain unchanged. The JPEG is only a model-input derivative; it is not written back into the package and is not a replacement for the original asset.
6. The authenticated chat request sends the JPEG preview and DNA verification summary to the VYRA server. The server validates the MIME type, base64 encoding, size, and file signature before passing it to Gemini as inline image data.

## Provider behavior

- Text-only conversations keep the configured OpenRouter Text path when selected.
- A Vyral attachment with a verified visual preview is routed to the server-managed Gemini Vision path. It does not silently send image data to a selected text-only OpenRouter model.
- If Gemini is not configured or the live request fails, VYRA reports an error. It must not substitute a fabricated text-only response and claim to have seen the image.
- If a package has no portable DNA v3 record, VYRA may pass package metadata only. The assistant must state that it did not receive visual content and must not infer appearance from filenames, dimensions, or hashes.

## Safety limits

- Vyral ZIP archive: 256 MiB maximum.
- DNA records per attachment: 32 maximum.
- Decoded samples per record: 64 MiB maximum.
- Total decoded samples per attachment: 128 MiB maximum.
- Vision preview: 1,024 px longest edge, 900 KiB maximum.
- Server request parser: 4 MiB; the preview remains comfortably below this limit.

## Guarantee boundaries

- DNA v3 verifies exact decoded RGB/RGBA sample reconstruction under the recorded decoder contract.
- The JPEG vision preview is resized and lossy-compressed. It is not exact and is not used for DNA verification.
- A decoded-sample digest does not recover the original encoded PNG/JPEG/WebP bytes.
- AI descriptions are model observations, not deterministic proofs of asset identity. Fingerprints and DNA verification remain independent of model interpretation.

## Acceptance checks still required

- Exercise the flow with ORIGIN-01 and a separate multi-tile Vyral in a real authenticated browser session.
- Confirm the Gemini server environment is configured and a live multimodal request succeeds.
- Confirm a metadata-only package is explicitly described as metadata-only.
- Confirm oversized, malformed, MIME-mismatched, or corrupt packages/previews are rejected.
- Keep the ORIGIN-01 original source and Production data untouched.
