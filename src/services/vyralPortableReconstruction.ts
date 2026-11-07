export const VYRAL_AI_RECONSTRUCTION_GUIDE = String.raw`# VYRAL Portable Reconstruction Guide

This package is self-describing. Read \`manifest.json\` and use the included \`tools/reconstruct_vyral.py\` when code execution is available.

## What is inside

- \`manifest.json\` identifies the Vyral, its Asset inventory, each Asset DNA record, and the exact reconstruction payload paths.
- \`vyra.asset-dna\` version 3 describes raster image samples. Its raw tiles are lossless decoded samples, not the original encoded PNG/JPEG/WebP file bytes.
- \`vyra.asset-file-dna\` version 1 describes original file bytes. When its claim is \`source_file_exact\`, the ordered raw chunks can recover the exact original file and must pass each chunk hash plus the aggregate SHA-256.
- A compact collection reference is a derived inventory and reference map. It is not a reconstruction payload and does not grant access to private VYRA files.

## Raster reconstruction

For each \`vyra.asset-dna\` v3 record:

1. Read width, height, channel layout, sample format, decoder contract, and decoded sample SHA-256 from \`dna_record.decoded_image\`.
2. Read each raw tile from its declared \`package_path\`. Verify byte length and SHA-256 before using it.
3. Tiles contain tightly packed, interleaved RGB or RGBA uint8 samples. Use each tile's x/y/width/height to place its rows into the full image buffer. Rows run top-to-bottom and pixels left-to-right.
4. Verify the SHA-256 of the complete reconstructed sample buffer against \`decoded_samples_sha256\`.
5. A PNG made from those samples is a viewable reconstruction. It is not guaranteed to have the same encoded bytes as the source PNG/JPEG/WebP. Preserve the raw sample file and metadata sidecar as the exact decoded-sample evidence.
6. Preserve the declared color space and alpha mode in metadata. Unknown color space or premultiplied alpha can affect visual interpretation even when the sample bytes match.

## Non-raster and binary reconstruction

For each \`vyra.asset-file-dna\` v1 record with \`source_file_exact\`:

1. Sort chunks by their integer \`index\`.
2. Verify every chunk's byte length and SHA-256.
3. Concatenate chunks in index order.
4. Verify the final byte length and SHA-256 against \`dna_record.file\`.
5. Save the exact original bytes using the Asset's original filename when available.

## Public retrieval

If `manifest.json` contains `masterDna.portable_projection.resolver_uri`, the creator has enabled the canonical public resolver for this public Vyral:

- POST `{"action":"master","vyralId":"..." }` to retrieve the current collection snapshot.
- POST `{"action":"asset_dna","vyralId":"...","assetId":"...","assetVersionId":"..." }` to retrieve one selected Asset's DNA and short-lived tile URLs.
- POST `{"action":"asset_source","vyralId":"...","assetId":"...","assetVersionId":"..." }` only when the creator also allows redistribution of the original Asset.

The resolver independently checks current public visibility, the creator's AI-analysis permission, exact Asset/version membership, snapshot integrity, and source fingerprints. Do not append tokens or credentials to the resolver URL. Private and unlisted Vyrals do not publish this resolver; reconstruct those from the Full DNA payload included in the package.

## Selection and trust

- Reconstruct only the Asset IDs requested by the user. Unselected Assets must not influence the result.
- One Asset is valid. Multiple unrelated Assets are valid. Missing roles, purpose, story, style, or relationships are not errors.
- Do not invent relationships or visual facts that are absent from the package.
- Do not claim original encoded-file recovery for raster DNA v3. Its exact claim is decoded-sample recovery under the declared decoder contract.
- Do not treat a creator-attested fingerprint as independent verification.
- Compact references do not authorize remote access. Public retrieval still follows creator permissions; private retrieval requires an authorized integration or scoped share.
- If the environment cannot read ZIP entries or execute the included decoder, state that limitation. Never pretend to have inspected hidden binary payloads or fabricate a reconstruction.

## Run the included decoder

\`\`\`bash
python3 tools/reconstruct_vyral.py package.vyral --output reconstructed
\`\`\`

The decoder uses only the Python standard library. Inspect the included script before running it, and use an isolated working directory because package contents are untrusted input. It verifies payload hashes before writing outputs and prints a per-Asset recovery report.
`;

export const VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT = String.raw`#!/usr/bin/env python3
"""Reconstruct verified VYRAL DNA payloads using only the Python standard library."""

import argparse
import binascii
import hashlib
import json
import re
import struct
import sys
import zipfile
import zlib
from pathlib import Path


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(value):
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "asset")).strip(".-_")
    return (value or "asset")[:100]


def read_entry(archive, path, expected_length, expected_hash):
    if not isinstance(path, str) or not path:
        raise ValueError("DNA payload path is missing")
    data = archive.read(path)
    if len(data) != int(expected_length):
        raise ValueError("Payload length mismatch: " + path)
    if sha256(data) != str(expected_hash).lower():
        raise ValueError("Payload SHA-256 mismatch: " + path)
    return data


def png_chunk(kind, payload):
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", binascii.crc32(body) & 0xffffffff)


def encode_png(width, height, channels, samples):
    color_type = 2 if channels == 3 else 6
    row_bytes = width * channels
    scanlines = bytearray()
    for y in range(height):
        start = y * row_bytes
        scanlines.append(0)  # PNG filter: None
        scanlines.extend(samples[start:start + row_bytes])
    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(scanlines), 9))
        + png_chunk(b"IEND", b"")
    )


def reconstruct_raster(archive, record, asset, output_dir):
    image = record["decoded_image"]
    width = int(image["width"])
    height = int(image["height"])
    layout = image["channel_layout"]
    channels = 4 if layout == "RGBA" else 3 if layout == "RGB" else 0
    if width < 1 or height < 1 or channels == 0 or width * height > 8_000_000:
        raise ValueError("Unsupported raster dimensions or channel layout")
    samples = bytearray(width * height * channels)
    coverage = bytearray(width * height)

    tiles = record["lossless_payload"]["tiles"]
    for tile in tiles:
        x, y = int(tile["x"]), int(tile["y"])
        tile_width, tile_height = int(tile["width"]), int(tile["height"])
        if (x < 0 or y < 0 or tile_width < 1 or tile_height < 1
                or x + tile_width > width or y + tile_height > height):
            raise ValueError("Raster tile is outside the declared image bounds")
        raw = read_entry(archive, tile["package_path"], tile["byte_length"], tile["sha256"])
        expected = tile_width * tile_height * channels
        if len(raw) != expected:
            raise ValueError("Raster tile does not match its declared dimensions")
        for row in range(tile_height):
            source_start = row * tile_width * channels
            destination_start = ((y + row) * width + x) * channels
            destination_end = destination_start + tile_width * channels
            samples[destination_start:destination_end] = raw[source_start:source_start + tile_width * channels]
            coverage_start = (y + row) * width + x
            coverage_end = coverage_start + tile_width
            if any(coverage[coverage_start:coverage_end]):
                raise ValueError("Raster tiles overlap")
            coverage[coverage_start:coverage_end] = b"\x01" * tile_width

    if not all(coverage):
        raise ValueError("Raster tiles do not cover the complete image")
    sample_hash = sha256(samples)
    if sample_hash != str(image["decoded_samples_sha256"]).lower():
        raise ValueError("Reconstructed decoded-sample SHA-256 mismatch")

    asset_id = str(asset["id"])
    stem = safe_name(asset.get("name") or asset_id) + "-" + safe_name(asset_id[:8])
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = output_dir / (stem + "." + layout.lower())
    png_path = output_dir / (stem + ".png")
    metadata_path = output_dir / (stem + ".json")
    raw_path.write_bytes(samples)
    png_path.write_bytes(encode_png(width, height, channels, samples))
    metadata = {
        "asset_id": asset_id,
        "record_id": record["record_id"],
        "recovery_level": "decoded-samples-exact",
        "width": width,
        "height": height,
        "channel_layout": layout,
        "sample_format": image.get("sample_format"),
        "color_space": image.get("color_space"),
        "alpha_mode": image.get("alpha_mode"),
        "decoder_contract": image.get("decoder_contract"),
        "decoded_samples_sha256": sample_hash,
        "original_encoded_file_bytes_recovered": False,
        "note": "The raw sample stream is the exact decoded-sample recovery. The PNG is a viewable encoding and is not the original encoded source file.",
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return {
        "asset_id": asset_id,
        "name": asset.get("name"),
        "result": "decoded-samples-exact",
        "raw_samples": str(raw_path),
        "viewable_png": str(png_path),
        "metadata": str(metadata_path),
        "sha256": sample_hash,
    }


def reconstruct_file(archive, record, asset, output_dir):
    reconstruction = record["reconstruction"]
    if reconstruction.get("claim") != "source_file_exact":
        raise ValueError("File DNA does not claim exact source-byte recovery")
    chunks = sorted(reconstruction["chunks"], key=lambda item: int(item["index"]))
    parts = []
    for chunk in chunks:
        parts.append(read_entry(archive, chunk["package_path"], chunk["byte_length"], chunk["sha256"]))
    data = b"".join(parts)
    file_info = record["file"]
    if len(data) != int(file_info["size_bytes"]) or sha256(data) != str(file_info["sha256"]).lower():
        raise ValueError("Reconstructed original-file length or SHA-256 mismatch")
    asset_id = str(asset["id"])
    original_name = asset.get("original_filename") or asset.get("name") or asset_id
    original_name = Path(str(original_name)).name
    suffix = Path(original_name).suffix
    if not suffix and file_info.get("extension"):
        suffix = "." + str(file_info["extension"]).lstrip(".")
    stem = safe_name(Path(original_name).stem or asset_id) + "-" + safe_name(asset_id[:8])
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / (stem + suffix)
    output_path.write_bytes(data)
    return {
        "asset_id": asset_id,
        "name": asset.get("name"),
        "result": "source-file-exact",
        "file": str(output_path),
        "sha256": sha256(data),
        "size_bytes": len(data),
    }


def main():
    parser = argparse.ArgumentParser(description="Verify and reconstruct Assets from a VYRAL package.")
    parser.add_argument("package", help="Path to the .vyral ZIP package")
    parser.add_argument("--output", default="reconstructed", help="Output directory")
    parser.add_argument("--asset", action="append", dest="asset_ids", help="Reconstruct only this Asset ID (repeatable)")
    args = parser.parse_args()

    output_dir = Path(args.output)
    results = []
    with zipfile.ZipFile(args.package, "r") as archive:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        assets = {str(item["id"]): item for item in manifest.get("assets", [])}
        records = manifest.get("dnaRecords", [])
        if not records:
            raise ValueError("This package contains no full per-Asset reconstruction records.")
        selected = set(args.asset_ids or [])
        for entry in records:
            asset_id = str(entry.get("asset_id") or "")
            if selected and asset_id not in selected:
                continue
            asset = assets.get(asset_id)
            if asset is None:
                raise ValueError("DNA record references an Asset missing from the manifest: " + asset_id)
            schema = entry.get("dna_schema_id")
            version = int(entry.get("dna_schema_version", 0))
            record = entry.get("dna_record") or {}
            if schema == "vyra.asset-dna" and version == 3:
                results.append(reconstruct_raster(archive, record, asset, output_dir))
            elif schema == "vyra.asset-file-dna" and version == 1:
                results.append(reconstruct_file(archive, record, asset, output_dir))
            else:
                raise ValueError("Unsupported reconstruction record for Asset " + asset_id)
        if selected:
            missing = selected.difference({item["asset_id"] for item in results})
            if missing:
                raise ValueError("Requested Asset IDs have no supported reconstruction records: " + ", ".join(sorted(missing)))

    print(json.dumps({"package": args.package, "reconstructed_assets": results}, indent=2))
    if not results:
        raise ValueError("No Assets were reconstructed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("VYRAL reconstruction failed: " + str(error), file=sys.stderr)
        sys.exit(1)
`;
