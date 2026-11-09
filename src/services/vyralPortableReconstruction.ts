export const VYRAL_AI_RECONSTRUCTION_GUIDE = String.raw`# VYRAL Portable Reconstruction Guide

This package is self-describing. Read \`manifest.json\` and use the included \`tools/reconstruct_vyral.py\` when code execution is available. Before sharing or reconstructing, run \`python tools/reconstruct_vyral.py package.vyral --audit-only\` to verify the exact package inventory and hashes without writing files. A package with \`blindReconstruction: true\` and \`blindnessScope: original_encoded_binary_excluded\` omits original encoded source bytes, but its raster DNA v3 tiles still contain the complete decoded pixel samples. That mode proves source-byte exclusion, not semantic blind generation. A true semantic blind package must omit decoded sample tiles too and provide descriptive DNA sufficient for the requested modality.

## What is inside

- \`manifest.json\` identifies the Vyral, its Asset inventory, each Asset DNA record, and the exact reconstruction payload paths.
- \`vyra.asset-dna\` version 3 describes raster image samples. Its raw tiles are lossless decoded samples, not the original encoded PNG/JPEG/WebP file bytes. It may additionally include \`encoded_file_payload\` chunks; when present, those independently hashed chunks restore the exact original encoded file bytes.
- \`vyra.asset-file-dna\` version 1 records deterministic file identity and structural facts. In a normal DNA-only package, \`source_file_exact\` chunks can restore original bytes. In a blind package, the claim is \`unavailable\` and no original binary chunks are present; structural facts are not enough to recreate arbitrary binary files.
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

For each \`vyra.asset-file-dna\` v1 record:

- If the claim is \`source_file_exact\`:
  1. Sort chunks by their integer \`index\`.
  2. Verify every chunk's byte length and SHA-256.
  3. Concatenate chunks in index order.
  4. Verify the final byte length and SHA-256 against \`dna_record.file\`.
  5. Save the exact original bytes using the Asset's original filename when available.
- If the claim is \`unavailable\`, do not invent or fabricate file bytes. Report the Asset as structural-DNA-only and require a modality-specific extractor/reconstructor before claiming a reconstruction.

## Public retrieval

If \`manifest.json\` contains \`masterDna.portable_projection.resolver_uri\`, the creator has enabled the canonical public resolver for this public Vyral:

- POST \`{"action":"master","vyralId":"..." }\` to retrieve the current collection snapshot.
- POST \`{"action":"asset_dna","vyralId":"...","assetId":"...","assetVersionId":"..." }\` to retrieve one selected Asset's DNA and short-lived tile URLs.
- POST \`{"action":"asset_source","vyralId":"...","assetId":"...","assetVersionId":"..." }\` only when the creator also allows redistribution of the original Asset.

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


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    result = {
        "asset_id": asset_id,
        "name": asset.get("name"),
        "result": "decoded-samples-exact",
        "raw_samples": str(raw_path),
        "viewable_png": str(png_path),
        "metadata": str(metadata_path),
        "sha256": sample_hash,
    }
    encoded = record.get("encoded_file_payload")
    if encoded:
        original = bytearray()
        for chunk in encoded["chunks"]:
            original.extend(read_entry(archive, chunk["package_path"], chunk["byte_length"], chunk["sha256"]))
        if len(original) != encoded["size_bytes"] or sha256(original) != encoded["sha256"]:
            raise ValueError("Original encoded raster file failed its final source SHA-256 check")
        filename = safe_name(Path(encoded["filename"]).name)
        suffix = Path(filename).suffix
        if not re.fullmatch(r"\.[A-Za-z0-9]{1,12}", suffix):
            suffix = ".bin"
        original_path = output_dir / (stem + "-original" + suffix.lower())
        original_path.write_bytes(original)
        result["source_file_exact"] = {
            "file": str(original_path),
            "sha256": sha256(original),
            "size_bytes": len(original),
            "mime_type": encoded["mime_type"],
            "original_filename": filename,
        }
        result["original_encoded_file_bytes_recovered"] = True
    else:
        result["original_encoded_file_bytes_recovered"] = False
    return result


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
    suffix = re.sub(r"[^A-Za-z0-9.]+", "", Path(original_name).suffix)[:20]
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


def validate_archive(archive):
    infos = archive.infolist()
    if not infos or len(infos) > 20000:
        raise ValueError("Package has an invalid or excessive number of ZIP entries")
    names = set()
    total_size = 0
    for info in infos:
        name = info.filename
        parts = name.split("/")
        if (not name or name.startswith("/") or "\\" in name
                or any(part in ("", ".", "..") for part in parts)
                or re.match(r"^[A-Za-z]:", name)):
            raise ValueError("Package contains an unsafe ZIP path")
        if name in names:
            raise ValueError("Package contains duplicate ZIP entry names")
        names.add(name)
        if info.flag_bits & 0x1:
            raise ValueError("Encrypted ZIP entries are not supported")
        mode = (info.external_attr >> 16) & 0o170000
        if mode == 0o120000:
            raise ValueError("Symbolic links are not allowed in a VYRAL package")
        if info.file_size < 0 or info.file_size > 64 * 1024 * 1024:
            raise ValueError("A ZIP entry exceeds the 64 MiB safety limit")
        total_size += info.file_size
        if total_size > 512 * 1024 * 1024:
            raise ValueError("Package exceeds the 512 MiB uncompressed safety limit")
        if info.file_size and info.compress_size == 0:
            raise ValueError("Package contains an invalid compressed entry")
        if info.compress_size and info.file_size / info.compress_size > 5000:
            raise ValueError("Package contains an excessive compression ratio")
    return names


def validate_manifest(manifest, archive_names, archive):
    if not isinstance(manifest, dict) or manifest.get("format") != "application/vnd.vyra.vyral+zip" or manifest.get("formatVersion") != 1:
        raise ValueError("Unsupported VYRAL package format")
    if manifest.get("exportMode") != "dna-only":
        raise ValueError("The portable decoder accepts DNA-only VYRAL packages")
    if manifest.get("versions") or manifest.get("folders"):
        raise ValueError("DNA-only packages must not include source versions or folder data")
    assets_list = manifest.get("assets")
    records = manifest.get("dnaRecords")
    if not isinstance(assets_list, list) or not assets_list or not isinstance(records, list) or not records:
        raise ValueError("This package contains no complete per-Asset reconstruction inventory")
    assets = {}
    for asset in assets_list:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str) or not asset["id"]:
            raise ValueError("Package contains an Asset with an invalid identity")
        if asset["id"] in assets:
            raise ValueError("Package contains duplicate Asset identities")
        assets[asset["id"]] = asset
    if len(records) != len(assets):
        raise ValueError("Every Asset must have exactly one supported reconstruction record")

    blind = manifest.get("blindReconstruction") is True
    if blind and manifest.get("blindnessScope") != "original_encoded_binary_excluded":
        raise ValueError("Blind DNA package must declare the exact scope of excluded source bytes")
    counts = {}
    expected_paths = {"manifest.json", "README.txt", "AI_RECONSTRUCTION_GUIDE.md", "tools/reconstruct_vyral.py"}
    reserved_system_paths = {
        "system/identity.json",
        "system/asset-index.json",
        "system/asset-dna/index.json",
        "system/master-dna.ref.json",
        "system/fingerprints/index.json",
        "system/provenance/index.json",
        "system/relationships/index.json",
        "system/classifications/index.json",
        "system/creator-instructions/index.json",
        "system/licensing.json",
        "system/integrity.json",
        "system/system-files.json",
    }
    for entry in records:
        if not isinstance(entry, dict):
            raise ValueError("Package contains an invalid DNA record")
        asset_id = entry.get("asset_id")
        if not isinstance(asset_id, str) or asset_id not in assets:
            raise ValueError("DNA record references an Asset missing from the manifest")
        counts[asset_id] = counts.get(asset_id, 0) + 1
        if counts[asset_id] != 1:
            raise ValueError("Every Asset must have exactly one DNA record")
        record = entry.get("dna_record")
        if not isinstance(record, dict):
            raise ValueError("DNA record payload is missing")
        schema = entry.get("dna_schema_id")
        version = entry.get("dna_schema_version")
        if schema == "vyra.asset-dna" and version == 3:
            if entry.get("recovery_level") != "decoded-samples-exact":
                raise ValueError("Raster DNA must declare exact decoded-sample recovery")
            if record.get("record_id") != entry.get("id") or record.get("source", {}).get("asset_id") != asset_id:
                raise ValueError("Raster DNA identity does not match its Asset inventory entry")
            tiles = record.get("lossless_payload", {}).get("tiles")
            if not isinstance(tiles, list) or not tiles:
                raise ValueError("Raster DNA is missing reconstruction tiles")
            for tile in tiles:
                path = tile.get("package_path")
                if not isinstance(path, str) or path in expected_paths:
                    raise ValueError("Raster DNA contains an invalid or duplicate payload path")
                if path in reserved_system_paths:
                    raise ValueError("Raster DNA payload path collides with a protected System File")
                expected_paths.add(path)
            encoded = record.get("encoded_file_payload")
            if blind and encoded is not None:
                raise ValueError("Blind DNA package must not contain original encoded raster bytes")
            if encoded is not None:
                if (not isinstance(encoded, dict) or encoded.get("encoding") != "raw-chunks-v1"
                        or not isinstance(encoded.get("filename"), str) or not encoded["filename"]
                        or len(encoded["filename"]) > 255
                        or encoded.get("mime_type") != record.get("source", {}).get("mime_type")
                        or encoded.get("size_bytes") != record.get("source", {}).get("size_bytes")
                        or encoded.get("sha256") != record.get("source", {}).get("sha256")
                        or not isinstance(encoded.get("chunk_size"), int)
                        or encoded["chunk_size"] < 1 or encoded["chunk_size"] > 8 * 1024 * 1024
                        or not isinstance(encoded.get("chunks"), list) or not encoded["chunks"]):
                    raise ValueError("Raster DNA exact encoded-file payload metadata is invalid")
                if len(encoded["chunks"]) != (encoded["size_bytes"] + encoded["chunk_size"] - 1) // encoded["chunk_size"]:
                    raise ValueError("Raster DNA exact encoded-file chunk count is incomplete")
                source_bytes = bytearray()
                for index, chunk in enumerate(encoded["chunks"]):
                    expected_length = min(encoded["chunk_size"], encoded["size_bytes"] - index * encoded["chunk_size"])
                    path = "dna/v3/" + record["record_id"] + "/source/" + str(index) + ".bin"
                    if (not isinstance(chunk, dict) or chunk.get("index") != index
                            or chunk.get("byte_length") != expected_length
                            or chunk.get("package_path") != path
                            or path in expected_paths
                            or not isinstance(chunk.get("sha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", chunk["sha256"])):
                        raise ValueError("Raster DNA exact encoded-file chunk metadata is invalid")
                    expected_paths.add(path)
                    source_bytes.extend(read_entry(archive, path, expected_length, chunk["sha256"]))
                if len(source_bytes) != encoded["size_bytes"] or sha256(source_bytes) != encoded["sha256"]:
                    raise ValueError("Raster DNA exact encoded-file source SHA-256 verification failed")
        elif schema == "vyra.asset-file-dna" and version == 1:
            if blind:
                reconstruction = record.get("reconstruction", {})
                if (entry.get("recovery_level") != "semantic-only" or reconstruction.get("claim") != "unavailable"
                        or reconstruction.get("payload_encoding") != "none" or reconstruction.get("chunks") != []):
                    raise ValueError("Blind DNA package must exclude all original File DNA binary chunks")
            elif entry.get("recovery_level") != "source-file-exact":
                raise ValueError("File DNA must declare exact source-file recovery")
            if record.get("record_id") != entry.get("id") or record.get("source", {}).get("asset_id") != asset_id:
                raise ValueError("File DNA identity does not match its Asset inventory entry")
            reconstruction = record.get("reconstruction", {})
            if blind and reconstruction.get("claim") == "unavailable":
                if reconstruction.get("payload_encoding") != "none" or reconstruction.get("chunks") != []:
                    raise ValueError("Blind File DNA must not declare original source-byte chunks")
                continue
            if reconstruction.get("claim") != "source_file_exact":
                raise ValueError("File DNA does not contain an exact source-byte claim")
            chunks = reconstruction.get("chunks")
            if not isinstance(chunks, list) or not chunks:
                raise ValueError("File DNA is missing source-byte chunks")
            indices = [int(chunk.get("index", -1)) for chunk in chunks]
            if sorted(indices) != list(range(len(chunks))):
                raise ValueError("File DNA chunk indices must be unique and contiguous")
            for chunk in chunks:
                path = chunk.get("package_path")
                if not isinstance(path, str) or path in expected_paths:
                    raise ValueError("File DNA contains an invalid or duplicate payload path")
                if path in reserved_system_paths:
                    raise ValueError("File DNA payload path collides with a protected System File")
                expected_paths.add(path)
        else:
            raise ValueError("Unsupported reconstruction record for Asset " + asset_id)
    if set(counts) != set(assets):
        raise ValueError("Every Asset must have exactly one supported reconstruction record")

    # Validate protected System Files shipped with every current .vyral package.
    system_descriptors = manifest.get("systemFiles")
    if system_descriptors is not None:
        if not isinstance(system_descriptors, list):
            raise ValueError("Vyral System File inventory is malformed")
        definitions = [
            ("manifest.json", "package_manifest", "package.manifest"),
            ("system/identity.json", "identity", "manifest.vyral"),
            ("system/asset-index.json", "asset_index", "manifest.assets"),
            ("system/asset-dna/index.json", "asset_dna_index", "manifest.dnaRecords"),
            ("system/master-dna.ref.json", "master_dna_reference", "manifest.masterDna"),
            ("system/fingerprints/index.json", "fingerprint_index", "manifest.fingerprints"),
            ("system/provenance/index.json", "provenance_index", "manifest.lineage"),
            ("system/relationships/index.json", "relationship_index", "manifest.masterDna.relationships"),
            ("system/classifications/index.json", "classification_index", "manifest.assets[].asset_type"),
            ("system/creator-instructions/index.json", "creator_instructions", "manifest.vyral.metadata.creator_instructions"),
            ("system/licensing.json", "licensing", "manifest.vyral.license_policy"),
            ("system/integrity.json", "integrity", "package.entries"),
            ("system/system-files.json", "system_file_index", "package.systemFiles"),
        ]
        if len(system_descriptors) != len(definitions):
            raise ValueError("Vyral System File inventory is incomplete")
        by_path = {}
        for descriptor in system_descriptors:
            if not isinstance(descriptor, dict) or not isinstance(descriptor.get("path"), str) or descriptor["path"] in by_path:
                raise ValueError("Vyral System File descriptor is invalid or duplicated")
            by_path[descriptor["path"]] = descriptor
        for path, kind, source in definitions:
            descriptor = by_path.get(path)
            if (not isinstance(descriptor, dict) or descriptor.get("kind") != kind
                    or descriptor.get("source") != source or descriptor.get("required") is not True
                    or descriptor.get("protected") is not True
                    or descriptor.get("state") not in ("present", "empty", "not_available")):
                raise ValueError("Required Vyral System File is missing or not protected: " + path)
            if path.startswith("system/"):
                expected_paths.add(path)
        if set(by_path) != {item[0] for item in definitions}:
            raise ValueError("Vyral System File inventory contains unexpected paths")

        index = json.loads(archive.read("system/system-files.json").decode("utf-8"))
        if (index.get("schema") != "vyra.vyral-system-file-index" or index.get("version") != 1
                or index.get("files") != system_descriptors
                or index.get("deletion_policy") != {
                    "individual_system_file_deletion": "forbidden",
                    "delete_with_parent_vyral_only": True,
                }):
            raise ValueError("Vyral System File index or deletion policy is invalid")

        integrity = json.loads(archive.read("system/integrity.json").decode("utf-8"))
        entries = integrity.get("entries")
        if integrity.get("hash_algorithm") != "SHA-256" or not isinstance(entries, list):
            raise ValueError("Vyral package integrity declaration is invalid")
        actual_covered = archive_names - {"manifest.json", "system/integrity.json", "system/system-files.json"}
        declared = {}
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or entry["path"] in declared:
                raise ValueError("Vyral package integrity entry is invalid or duplicated")
            declared[entry["path"]] = entry
        if set(declared) != actual_covered:
            raise ValueError("Vyral package integrity inventory does not match its ZIP entries")
        for path, entry in declared.items():
            data = archive.read(path)
            if entry.get("size_bytes") != len(data) or entry.get("sha256") != sha256(data):
                raise ValueError("Vyral package SHA-256 verification failed: " + path)

    if archive_names != expected_paths:
        raise ValueError("Package entries do not match the declared reconstruction payloads and protected System Files")
    return assets, records


def main():
    parser = argparse.ArgumentParser(description="Verify and reconstruct Assets from a VYRAL package.")
    parser.add_argument("package", help="Path to the .vyral ZIP package")
    parser.add_argument("--output", default="reconstructed", help="Output directory")
    parser.add_argument("--asset", action="append", dest="asset_ids", help="Reconstruct only this Asset ID (repeatable)")
    parser.add_argument("--audit-only", action="store_true", help="Validate package inventory and hashes without reconstructing files")
    args = parser.parse_args()

    output_dir = Path(args.output)
    results = []
    with zipfile.ZipFile(args.package, "r") as archive:
        archive_names = validate_archive(archive)
        manifest_info = archive.getinfo("manifest.json")
        if manifest_info.file_size > 32 * 1024 * 1024:
            raise ValueError("VYRAL manifest exceeds the 32 MiB safety limit")
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        blind = manifest.get("blindReconstruction") is True
        assets, records = validate_manifest(manifest, archive_names, archive)
        selected = set(args.asset_ids or [])
        unknown = selected.difference(assets)
        if unknown:
            raise ValueError("Requested Asset IDs are not present in this package: " + ", ".join(sorted(unknown)))
        if args.audit_only:
            selected_assets = [asset for asset_id, asset in assets.items() if not selected or asset_id in selected]
            records_by_asset = {entry["asset_id"]: entry for entry in records}
            selected_records = [records_by_asset[asset["id"]] for asset in selected_assets]
            package_path = Path(args.package)
            print(json.dumps({
                "package": args.package,
                "package_size_bytes": package_path.stat().st_size,
                "package_sha256": sha256_file(package_path),
                "validation": "passed",
                "export_mode": manifest.get("exportMode"),
                "blind_reconstruction": blind,
                "blindness_scope": manifest.get("blindnessScope") if blind else None,
                "asset_count": len(selected_assets),
                "assets": [{
                    "asset_id": asset["id"],
                    "name": asset.get("name"),
                    "dna_schema_id": entry["dna_schema_id"],
                    "dna_schema_version": entry["dna_schema_version"],
                    "recovery_level": entry["recovery_level"],
                    "payload_kind": (
                        "structural-dna-only" if blind and entry["dna_schema_id"] == "vyra.asset-file-dna"
                        else "decoded-pixel-samples+original-file-bytes"
                        if entry["dna_schema_id"] == "vyra.asset-dna" and entry["dna_record"].get("encoded_file_payload")
                        else "original-file-bytes" if entry["recovery_level"] == "source-file-exact"
                        else "decoded-pixel-samples"
                    ),
                    "original_encoded_file_bytes_included": (
                        entry["recovery_level"] == "source-file-exact" or
                        bool(entry["dna_record"].get("encoded_file_payload"))
                    ),
                } for asset, entry in zip(selected_assets, selected_records)],
                "contains_original_encoded_file_bytes": any(
                    entry["recovery_level"] == "source-file-exact" or bool(entry["dna_record"].get("encoded_file_payload"))
                    for entry in selected_records
                ),
                "original_binary_payload_entries": sum(
                    len(entry["dna_record"].get("reconstruction", {}).get("chunks", [])) +
                    len(entry["dna_record"].get("encoded_file_payload", {}).get("chunks", []))
                    for entry in selected_records
                ),
                "archive_entry_count": len(archive_names),
                "undeclared_entries": 0,
                "integrity": "passed",
            }, indent=2))
            return
        for entry in records:
            asset_id = entry["asset_id"]
            if selected and asset_id not in selected:
                continue
            asset = assets[asset_id]
            schema = entry["dna_schema_id"]
            version = int(entry["dna_schema_version"])
            record = entry["dna_record"]
            if schema == "vyra.asset-dna" and version == 3:
                results.append(reconstruct_raster(archive, record, asset, output_dir))
            elif schema == "vyra.asset-file-dna" and version == 1:
                if record.get("reconstruction", {}).get("claim") == "source_file_exact":
                    results.append(reconstruct_file(archive, record, asset, output_dir))
                else:
                    results.append({"asset_id": asset_id, "name": asset.get("name"), "result": "structural-dna-only", "original_file_reconstructed": False})

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
