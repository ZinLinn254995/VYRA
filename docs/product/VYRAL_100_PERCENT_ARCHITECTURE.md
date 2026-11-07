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
- Public Compact DNA may include only the canonical HTTPS resolver URI when Vyral visibility is public and AI analysis is permitted. The resolver pins requests to the current ready Master DNA revision and exact Asset/version membership.
- Public Master DNA and Asset DNA retrieval require the Vyral-level and Asset-level AI-analysis permissions. Original source downloads additionally require Vyral-level redistribution permission and must not be denied by the Asset override.
- Private and unlisted Vyrals never publish a public resolver URI. External users reconstruct from Full DNA payloads or need a separate explicit authorization system; the public resolver must return no private source data.
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

### Seven supported component combinations

The Vyral detail page exposes one simple Export menu. It must offer these seven non-empty combinations without exposing internal schema names:

| User-facing label | Original Asset files | Full per-Asset DNA | Compact collection DNA |
|---|---:|---:|---:|
| Assets only | Yes | No | No |
| Rebuild data only | No | Yes | No |
| AI reference only | No | No | Yes |
| Assets + rebuild data | Yes | Yes | No |
| Assets + AI reference | Yes | No | Yes |
| Rebuild + AI reference | No | Yes | Yes |
| Everything | Yes | Yes | Yes |

- Full per-Asset DNA includes the supported record and its declared reconstruction payload for every selected Asset. A whole-Vyral Full-DNA-only export is valid only when every Asset has exactly one supported current-version reconstruction record.
- Compact collection DNA is a derived inventory/reference snapshot. It does not include original binaries or full reconstruction payloads and does not grant access to private Assets. Retrieval requires a separately authorized integration.
- Assets-only packages must not silently include reconstruction records or collection reference data. Each combination must contain only the selected components, with an explicit component declaration in the manifest.
- A compact-only package contains the collection reference and Asset inventory only. It must not contain original media, full DNA records, or hidden derivatives.
- A Full-DNA-only package may include compact collection DNA only when the creator selects both components. Full-DNA-only must not silently inherit compact reference data.
- Every package must retain enough manifest identity and inventory metadata to describe which Vyral and Assets the selected components belong to.
- Portable Full DNA packages include an interpretation guide and a standard-library Python decoder. The decoder verifies per-tile/per-chunk hashes and aggregate sample/file hashes before writing reconstructed outputs. It is an aid for external tools, not a trust shortcut: inspect packaged code before execution and use an isolated working directory.
- Raster DNA v3 reconstruction writes the exact decoded RGB/RGBA sample stream plus a viewable PNG and metadata sidecar. The PNG is a new encoding, not the original encoded source file. File DNA v1 can reproduce original source bytes exactly when its complete chunk set verifies.

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


## 12. Asset selection, AI context, and per-Asset visibility

### Multi-selection
- The Asset library supports selecting one or many Assets. Selection is a temporary working set, not a change to the Asset or its permissions.
- The same selection supports multiple actions: attach as explicit context to AI Chat, organize/move, export, and other eligible bulk management actions.
- The UI must make selected Assets visually obvious and show the selected count. Provide clear Select all / Clear selection behavior within the current filtered folder/list scope.
- Opening an Asset remains distinct from selecting it. Preserve a simple default browsing interaction; selection mode should not make ordinary opening cumbersome.
- When a selection is handed to AI Chat, show the selected Asset chips/cards directly above the composer. The user can remove individual Assets or clear the whole selection before sending.
- The AI request must receive only the selected Asset IDs, exact current versions, permitted DNA/context, and any explicitly attached media required for the task. Unselected Assets must never be silently included.
- Selection does not grant access. The server must re-check ownership, Vyral membership, current version, visibility, and AI-analysis permission before reading or sending any Asset content to a model.
- A private Asset may be selected by its owner for their own AI Chat. That does not make it public and does not grant an external person or model an independent VYRA retrieval right.

### Per-Asset visibility
- Each Asset has its own simple `private` or `public` visibility setting. The user can change it for one Asset or for a selected group.
- New Assets default to private. Changing a Vyral's visibility does not silently overwrite each Asset's explicit visibility.
- Effective public availability requires both the containing Vyral and the individual Asset to be public. A private/unlisted Vyral never exposes an Asset through the public resolver, even if that Asset is marked public.
- Asset-level license overrides remain separate from visibility. Public does not automatically mean AI analysis, generation, remixing, commercial use, or redistribution is allowed.
- Public resolver and Compact-DNA retrieval must enforce both Vyral-level and Asset-level visibility and the relevant license permissions server-side. UI state alone is never authorization.
- Bulk visibility changes require a clear confirmation summary and must apply only to the selected Assets. Protected foundational Assets remain protected from destructive management actions; visibility changes must not weaken their protection.

### Acceptance tests
1. Select one Asset and confirm only that Asset is attached to AI Chat.
2. Select multiple Assets across the current library view and confirm each appears as a distinct removable context chip.
3. Remove one selected Asset and verify it is excluded from the outgoing AI request.
4. Clear selection and verify no Asset context is sent.
5. Select private Assets as the owner and confirm owner-authorized AI Chat works without changing their visibility.
6. Change one Asset to public and verify it is still inaccessible through public resolution while its Vyral is private or unlisted.
7. Change a selected group to public/private and verify only those Asset rows change.
8. Verify server-side resolver denies private Assets and any Asset whose Vyral or license policy disallows the requested operation.
9. Verify new uploads default to private and imported packages preserve declared visibility only when the importer is authorized; otherwise default safely to private.
