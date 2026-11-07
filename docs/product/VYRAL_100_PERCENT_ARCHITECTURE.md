# Vyral 100% — Product and Technical Architecture

**Status:** Authoritative direction for the `feat/vyral-100-percent-acceptance` workstream  
**Baseline:** `main` after PR #117 (merge commit `d8aa7859262791059bb413c8d72d59461b4928a2`)  
**Scope:** Vyral system only. Preserve the accepted Main UI and unrelated product areas.

## 1. Product definition

A **Vyral** is a creator-defined collection of one or more Assets. An Asset may be an image, video, audio file, document, prompt, rule, character, world, location, prop, 3D model, animation, or another supported digital asset.

The creator decides what belongs in a Vyral. Assets may be related, unrelated, coherent, or completely independent. A single-Asset Vyral is valid. A multi-Asset Vyral containing unrelated items is also valid.

Vyral is not inherently a story, character system, world model, timeline, or consistency project. Those capabilities may be layered on when the creator chooses them; they are never prerequisites for Vyral validity.

## 2. Two distinct DNA levels

### 2.1 Asset DNA

Every Asset has its own independent DNA record(s). Asset DNA describes and preserves the information required to identify, interpret, verify, and reconstruct that specific Asset.

Asset DNA must be associated with the correct Asset and version. It must distinguish:
- deterministic facts extracted by software (file identity, format, dimensions, byte length, hashes, decoded samples/pixels, structural data, and supported lossless payload data);
- semantic or interpretive information supplied by AI (descriptions, visual concepts, inferred attributes);
- creator-supplied information and optional relationships.

AI-derived descriptions are not ground truth. Their model, provenance, confidence, and status must remain distinguishable from deterministic evidence and creator assertions.

### 2.2 Vyral DNA

Vyral DNA is the collection-level representation of a Vyral. **It is not separately authored or manually assembled.** It is automatically derived from the current Vyral inventory and the corresponding Asset DNA references.

It must represent at least:
- stable Vyral identity;
- the current collection/inventory;
- each included Asset's stable identity and applicable version/DNA reference;
- collection-level package/schema version and integrity information;
- optional creator-defined connections or collection context, when supplied.

Adding, removing, replacing, or changing an Asset/version/DNA record automatically changes the derived Vyral DNA content/version. The stable Vyral identity remains stable. The implementation may persist a deterministic snapshot/cache, but it must be reproducible from the authoritative inventory and Asset DNA records. No manual Vyral-DNA authoring step may be required.

Vyral DNA must not invent relationships, purpose, roles, storyline, style, or other context. Missing optional metadata is valid, not an error.

## 3. Creator freedom and optional consistency

- No required Main/Supporting role, purpose, story, relationship, or consistency metadata.
- No relationship data is a valid state.
- Creator-defined relationships, character links, world links, style guidance, and consistency rules may be added as optional metadata.
- The system may offer AI suggestions, but must not silently convert guesses into creator-confirmed facts.
- Generation consistency is a capability enabled by relevant DNA, references, optional creator connections, and the selected generation model. Vyral itself must not promise that every generation model will produce identical outputs.

When a task selects only certain Assets, retrieval and generation should use the relevant Asset DNA and references. Unselected, unrelated Assets must not influence the task merely because they are in the same Vyral.

## 4. Original storage and export model

Inside the VYRA app, the original Vyral retains its Original Assets and their Full/Original DNA. The collection-level Vyral DNA is derived from those Asset records. Exporting must not move, delete, or mutate the original records.

For external use, the creator can export any of these three components independently or in combination:

1. **Asset** — the original asset file/reference.
2. **Full/Original DNA** — the complete portable reconstruction/interpretation data available for that Asset or collection.
3. **Compact DNA** — a compact collection/asset reference intended to identify the Vyral and support authorized retrieval from VYRA.

Supported combinations include each component alone, every pair, and all three together. Package manifests must declare exactly which components are present and what each reference means. Import/export must preserve identity, version, provenance, and integrity metadata without falsely upgrading unverified evidence.

### Full DNA outside VYRA

A Full-DNA package must contain the information required for the reconstruction level it claims to support. It must be portable to compatible external AI/tools without requiring a VYRA lookup for the information actually included in that package.

Do not claim that descriptive/semantic DNA alone can recreate every arbitrary original file byte-for-byte. Exact encoded-file recovery requires the original encoded bytes (or an authorized retrievable copy). Lossless decoded-pixel/sample recovery is a distinct, narrower guarantee and must name the decoder/format/version assumptions.

### Compact DNA and authorized retrieval

Compact DNA is a compact reference/manifest, not a magical access credential. External AI systems can retrieve Original DNA or Assets from VYRA only through an explicitly supported integration such as an authorized API, MCP/connector, scoped share endpoint, or other user-approved access flow.

- Public assets may be retrieved subject to the creator's published permissions.
- Private assets must not be exposed to an external AI/person without authorization.
- Never place secrets, long-lived bearer tokens, or private credentials inside a portable DNA package.
- If retrieval integration is unavailable, Compact DNA must still be interpretable as a reference/manifest, but must not pretend the external AI has accessed the original.

## 5. DNA production: deterministic software plus optional AI

The core DNA pipeline must not depend on an AI model for deterministic facts.

**Software-owned deterministic processing** includes, where supported:
- file format, byte length, dimensions, media metadata;
- stable IDs and version references;
- cryptographic hashes/fingerprints;
- deterministic parsing/decoding and lossless payload/sample extraction;
- collection inventory composition and Vyral DNA generation;
- package validation, import/export, and integrity checks.

**AI-assisted processing** may add:
- semantic descriptions and visual understanding;
- inferred concepts or attributes;
- optional suggestions for relationships or creator workflows.

AI-derived information must be marked as such, traceable to its model/process, and never treated as a substitute for exact binary or decoded-sample evidence. AI availability or model changes must not alter deterministic fingerprints or the deterministic collection composition.

The current project remains on its existing online architecture. Offline mode is not part of this workstream unless the creator explicitly requests it later.

## 6. Exact recovery, reconstruction, and generation are separate

The implementation and UI/tests must keep these claims separate:

- **Exact encoded-file recovery:** reconstructed bytes match the original file bytes; verify with the original cryptographic hash.
- **Exact decoded-sample recovery:** decoded pixel/sample data matches under a named, pinned decoder and format assumptions.
- **Structural similarity:** geometry/layout/structural measurements.
- **Perceptual similarity:** visual/audio perceptual comparison.
- **Semantic similarity:** meaning or subject consistency.
- **Consistent generation:** newly generated outputs preserve selected identity/traits; this is not exact recovery.

Never label approximate similarity as exact. Every reconstruction result must state which level was tested and passed.

## 7. Import and export behavior

- Importing a Vyral package must unpack and restore its declared collection contents according to the manifest; it must not accidentally create a duplicate ZIP/`.vyral` file as an ordinary Asset when the user intended package import.
- Package validation must check manifest/schema compatibility, Asset inventory, one supported reconstruction record per Asset where required by that package profile, payload integrity, and permission/provenance semantics.
- Import must not invent missing DNA, relationships, roles, or purposes.
- A package that intentionally contains an Asset file as an Asset must remain distinguishable from a package-import action.
- Export must be deterministic for the same authoritative records and selected components, except for explicitly documented non-deterministic metadata.

## 8. User experience constraints

The ordinary user flow stays simple:

1. Upload or generate an Asset.
2. VYRA automatically creates/maintains its DNA and updates the derived Vyral DNA.
3. User can use, share, import, or export the Vyral.

Keep technical internals out of ordinary user-facing screens. Do not expose DNA, Fingerprint, Master DNA, Lineage, Hash, Storage, Schema, Recovery, Knowledge Record, or verification controls as routine user tasks. These concepts belong in implementation, diagnostics, and documentation. Preserve the accepted current UI and behavior; only change the Vyral detail page or Vyral-specific code when required for the acceptance goals.

## 9. Vyral 100% acceptance criteria

A Vyral implementation is not accepted merely because it builds or exports a package. It must pass objective tests:

1. **Single Asset:** create, export, import, and reconstruct a Vyral containing exactly one Asset without requiring roles, purpose, or relationships.
2. **Unrelated collection:** create and use a Vyral containing multiple unrelated Assets with no relationship metadata.
3. **Automatic composition:** adding/removing/replacing an Asset or changing its applicable DNA/version deterministically updates Vyral DNA without manual authoring.
4. **Identity stability:** Vyral identity remains stable while collection-content/version snapshots update correctly.
5. **Asset isolation:** selecting a subset uses only the relevant Asset DNA/references; unrelated Assets do not contaminate the task.
6. **Export matrix:** test Asset-only, Full-DNA-only, Compact-DNA-only, all pairwise combinations, and the combined three-component export.
7. **Portable Full DNA:** in a clean external context, provide only the exported Full-DNA package and test the exact reconstruction level it claims. Do not provide original files, thumbnails, previews, or hidden derivatives unless the package explicitly includes them.
8. **Compact retrieval:** verify authorized retrieval of selected Original DNA/Assets through a real supported integration; verify private access is denied without authorization.
9. **Import correctness:** package import restores the intended Vyral and its Assets, rather than duplicating the package container as an ordinary Asset.
10. **Integrity and provenance:** verify hashes, payloads, version references, and creator-attested versus independently verified evidence accurately.
11. **Cross-model portability:** test supported external AI clients separately. A shared DNA schema improves consistent interpretation but does not guarantee identical generative output across different models.
12. **No false claims:** report encoded-byte exactness, decoded-sample exactness, structural, perceptual, and semantic results separately.

## 10. Scope and change control

- Work from a new branch created from the latest `main`.
- Keep the accepted Main baseline unchanged until the user explicitly approves a merge.
- Do not deploy to Production or modify Production Supabase.
- Use Development resources for tests.
- Do not modify unrelated pages/features. Preserve the current user-approved UI and behavior.
- Do not add offline mode to scope.
- Do not merge a PR without explicit user approval.

## 11. Implementation order

1. Audit the current DNA v3, File DNA v1, Master/Vyral DNA, package manifest, import/export, and retrieval implementations against this document.
2. Remove validity gates that incorrectly require roles, purposes, relationships, or story metadata.
3. Make Vyral DNA a deterministic, automatically derived collection snapshot of Asset DNA/inventory.
4. Fix and test package import semantics and the Asset/Full DNA/Compact DNA export matrix.
5. Verify exact recovery claims and package portability with clean-context tests.
6. Implement/verify authorized Compact-DNA retrieval and public/private access behavior.
7. Run the full test suite and document each acceptance result with evidence.
8. Only then propose the branch for review and request merge approval.

---

**Core principle:** Every Asset owns its own DNA. Vyral DNA is automatically composed from the Vyral's Asset DNA inventory. Assets are creator-defined and independent by default; relationships and consistency are optional. VYRA preserves the originals, while exports let creators choose Asset, Full DNA, and Compact DNA independently or together.
