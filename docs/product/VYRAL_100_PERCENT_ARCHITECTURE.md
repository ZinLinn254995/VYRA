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
- A compact-only package contains the collection reference and only the stable Asset identity/inventory references required inside Master DNA. It omits the manifest's descriptive Asset rows, folder details, original media, full DNA records, and hidden derivatives; this minimizes metadata disclosure while preserving the collection reference.
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


- The destination UI may offer a live **Check access** action. It calls the canonical public resolver without sending credentials, requests the latest public Master DNA projection, verifies the projection SHA-256, source Vyral identity, current revision, source manifest digest, and exact Asset/Version/DNA-reference inventory against the imported immutable reference.
- If the source revision is newer, preserve the imported reference unchanged and tell the user to import the new compact package as a separate revision. Never overwrite an earlier reference snapshot.
- A successful collection-level access check confirms only that the current public Master DNA projection is accessible. It does not mean original media bytes or every Asset DNA payload have been downloaded; those require separate per-Asset requests and their own permission and integrity checks.
- A creator-authorized original Asset copy is a separate explicit action from the collection-DNA access check. It calls the public resolver's `asset_source` action for the exact Asset and Version IDs from the imported reference; the source independently checks current public visibility, Master DNA membership, Vyral redistribution permission, Asset redistribution override, ownership, storage path, and source fingerprint.
- The client downloads only the short-lived signed URL, verifies exact byte length and SHA-256 before saving, and then creates a normal new destination Asset using the existing upload pipeline. The new copy defaults to private and receives its own destination Version, Fingerprint, and deterministic DNA extraction. A public source's permission is never copied as a destination permission.

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

### Selected-media inspection contract

- Resolve every selected Asset to its latest persisted Asset Version. Never rely on a stale Asset-level storage path when a version record exists.
- Re-check owner access, Vyral membership, and both Vyral- and Asset-level AI-analysis permissions before creating a short-lived source URL.
- Images are converted locally into bounded JPEG previews; no more than four image/frame previews are attached to one request.
- Plain-text formats are decoded with a strict content-length cap and an explicit truncation marker.
- PDF and supported audio formats are attached as bounded source data for direct multimodal model inspection. Enforce per-file and aggregate byte limits on both client and server, validate file signatures where available, and reject unsupported formats rather than silently treating them as understood.
- Video is sampled into a small number of frames from the current version. Frame inspection does not imply that the video's audio track was transcribed or understood; communicate that limitation.
- If a request containing image, PDF, audio, or video evidence fails, return an explicit media-inspection error. Never silently downgrade it to text-only Preview Mode or claim that the media was inspected.
- Acceptance tests must cover latest-version resolution, private owner-authorized access, license denial, MIME/signature mismatch, oversized files, PDF/audio inspection, sampled video frames, and fail-closed behavior when the multimodal provider is unavailable.

## 14. AI-generated default details with creator editing

### Product behavior

- On Asset upload/import (and every supported Asset-generation path), VYRA should prepare useful default details based on detected content type and available evidence. For a Vyral, generate or refresh collection-level suggestions after its Asset inventory exists and whenever that inventory changes. For supported structured content (including Storyboards), generate type-specific defaults during creation.
- Suggested details may include a clear name/title, short description, type, category, tags, style, format, subject/topic, intended use, and other fields relevant to that specific type.
- Storyboards may additionally receive a suggested title, concept, format, visual style, scene/shot summaries, sequence, and other storyboard-specific details when the source content supports them.
- Different content types use different detail templates. Do not show irrelevant fields just because they exist in a universal schema.
- AI suggestions should appear as useful defaults without requiring the user to answer a form or understand classification terminology. Users can edit individual fields manually, accept defaults, or leave uncertain fields blank.
- Manual edits are authoritative creator input and must not be silently overwritten by later AI analysis. A later AI refresh may suggest changes separately, but must preserve the creator's saved values unless the creator explicitly accepts replacements.
- Use a distinct `system_default` origin for neutral placeholders. AI may replace system defaults or older AI suggestions, but never creator-confirmed or creator-edited fields.
- Re-read the latest saved metadata before applying asynchronous AI responses so a manual edit made while the model is working always wins. Reject stale collection-analysis results when a newer Asset inventory revision has started.
- Preserve relevant type-specific fields as individually editable details. Structured values remain structured; unsupported or uncertain fields may remain blank.
- Users may correct name, category, type, style, description, tags, and any other editable details at any time.
- The same principle applies at Asset and Vyral level, but Vyral-level details describe the collection as a whole while Asset-level details describe only that Asset.

### Evidence and provenance

- Deterministic file facts (MIME type, dimensions, duration, byte size, file structure, timestamps where reliable, and cryptographic fingerprints) are extracted by software, not invented by AI.
- AI may infer semantic details from actual content and creator-provided context. It must not infer unsupported facts from a filename alone when content is available for inspection.
- Store AI-generated values with provenance such as provider/model, generated time, source Asset/version or source inventory revision, confidence where meaningful, and review status.
- Distinguish system_default, ai_suggested, creator_confirmed, and creator_edited values or equivalent field-level provenance. Do not present low-confidence guesses as confirmed facts.
- If content cannot be inspected or evidence is insufficient, return a minimal safe suggestion (for example a neutral filename-based title) and leave uncertain categories/styles blank or explicitly marked as suggestions.
- AI-generated details are descriptive metadata only. They are not Asset DNA, do not replace deterministic fingerprints or reconstruction payloads, and are never required for a Vyral to be valid or exported/imported.
- Suggested type/category/style labels must remain extensible. Unknown, custom, mixed, and user-defined categories are valid; the taxonomy must not constrain what creators can store.

### Editing and UX

- Show the generated name and the most useful few details by default. Keep advanced/less relevant details tucked away until the user chooses to edit or view more.
- Each field should be independently editable. A single edit must not force the user to regenerate or re-enter all other details.
- Provide a simple way to correct an AI suggestion and, where useful, request a fresh suggestion. Never require accepting AI metadata to upload, create, use, share, or export an Asset/Vyral.
- Preserve creator descriptions and edits across re-analysis, version changes, import, and export. Whole-Vyral packages carry collection-level descriptive metadata and field provenance; importing into an empty/default destination may seed those details, but never overwrite destination creator choices. Re-analyze the combined inventory afterward. Single-Asset exports must not leak unrelated collection-level metadata. When source content changes, mark AI suggestions tied to an older version as stale rather than silently applying them to the new version.
- Avoid a mandatory metadata wizard. Auto-fill first; let the user edit only what they care about.

### Acceptance tests

1. Upload representative image, video, audio, document, prompt, and other supported Asset types; confirm type-appropriate default details are generated when evidence is available.
2. Create a Vyral with one Asset and with multiple unrelated Assets; confirm Vyral-level suggestions summarize the collection without inventing relationships or a storyline.
3. Create a Storyboard; confirm storyboard-specific fields are suggested only when applicable and scene order is preserved from the source.
4. Edit generated name, description, category, and style manually; run another analysis and confirm creator edits remain unchanged.
5. Change an Asset source version; confirm version-bound AI suggestions become stale and do not overwrite creator-confirmed details.
6. Test uncertain, mixed, unknown, and custom categories; confirm the system does not force a false classification.
7. Disable or fail the AI provider; confirm upload, Vyral creation, DNA generation, import/export, and ordinary use still work with safe minimal metadata.
8. Verify AI details remain separate from deterministic Asset DNA, Fingerprints, and Vyral DNA integrity claims.

## 15. Workspace Storyboard persistence

- Creator Storyboards are account-owned workspace records, not device-only drafts.
- Persist Storyboard identity, title, topic, type-specific editable details, and timestamps in the private `vyral_storyboards` table.
- Row Level Security restricts every read, create, update, and delete to the authenticated owner. Anonymous access is not granted.
- Keep a local device copy as a resilience/cache layer; authenticated account data is the cross-device source of truth.
- On sign-in, reconcile local and cloud records by stable Storyboard ID and `updated_at`. The newer revision wins; older local data must never overwrite a newer cloud revision.
- Existing device-only demo entries are not uploaded as creator records.
- Cloud sync failure must not discard a local Storyboard or block the creator from continuing. Show a concise sync status and retry on the next account load.
- Storyboard metadata remains independently editable after creation. AI suggestions never overwrite creator edits, including edits made while a suggestion request is in progress.

### Asset and empty-collection metadata lifecycle

- Upload and import analysis are best-effort and occur after the original Asset and its deterministic recovery evidence have been safely saved. AI unavailability never invalidates or rolls back the Asset.
- After model analysis completes, re-read the latest Asset metadata before saving. Merge only AI-origin suggestions into that latest record so a creator edit made while analysis was in flight always wins.
- Apply the same latest-record merge rule to both ordinary uploads and package imports.
- Collection defaults are generated after the workspace finishes loading even when the Vyral currently has zero Assets. Empty and unrelated inventories remain valid; the model may omit unsupported details rather than inventing a shared purpose or relationship.
- A collection inventory revision change refreshes AI-origin suggestions only. Creator-confirmed and creator-edited fields remain authoritative across revisions.

- Storyboard creation attempts to generate type-appropriate defaults from the creator's supplied title or idea. The creator explicitly approves any metered AI request; declining, missing AI configuration, or an AI failure never blocks manual Storyboard creation.
- Creator-entered Storyboard fields are marked authoritative before the request begins and are never replaced by returned AI suggestions.


## 16. Public compact Master DNA projection

- A public Master DNA lookup must not return the complete creator-side snapshot verbatim. The canonical private revision may contain descriptive Asset names, creator purposes, roles, relationships, rationales, provenance references, and internal notes that are not required for portable collection identity.
- The public resolver returns a separately canonicalized projection containing only the public Vyral identity, revision identity, stable Asset and Asset Version IDs, media types, DNA record references, Asset fingerprints, reconstruction claims, and the minimum retrieval policy fields.
- The public projection omits descriptive Asset rows, Asset purpose/role, collection purpose, relationship graph and rationales, creator/provenance references, internal notes, and resolver implementation details.
- The response includes a projection integrity digest and the source revision manifest digest as separate fields. The source digest identifies the canonical private revision; the projection digest verifies the exact public projection bytes. They are not interchangeable.
- Public projection remains gated by Vyral visibility, every Asset's public visibility, and AI-analysis permissions. Selective Asset source retrieval separately requires redistribution permission.
- Acceptance tests must prove that private creator-authored text and descriptive Asset metadata cannot appear in the public projection, while stable identity and exact version references remain available.


- Whenever the creator selects the Compact DNA component in a `.vyral` export, VYRA creates a separately re-hashed compact Master DNA projection. It retains stable collection/Asset/version identity, DNA record references, fingerprints, and reconstruction claims while omitting creator purpose, relationship rationales, Asset names/types/roles/purposes, provenance identities, internal notes, and storage/package prefixes.
- The selected Full DNA component remains independent. Selecting Full DNA does not silently add descriptive collection metadata to the Compact DNA component; selecting Assets includes the separately selected source Asset metadata and binaries.
- The seven supported component combinations must each be tested for exact component presence and absence, and every combination containing Compact DNA must pass the compact-projection privacy assertions.

## 17. Compact-only import as a collection reference

A Compact-only package is importable as a **reference record**, not as a restored Asset collection. Importing it must never create placeholder Assets, fake source files, fabricated Asset Versions, or unverified local DNA records.

### Destination and ownership

- The user must be authenticated and must explicitly choose an existing destination Vyral they own.
- Store the imported reference as a separate collection-reference record associated with that destination Vyral. It is not an Asset and must not be counted as an Asset, media file, or restorable item.
- The record is owned by the importing user and protected by owner-scoped row-level security. The source Vyral ID is an external identity only; it must never be treated as a local Vyral foreign key or as proof of source ownership.
- Re-importing the same source Vyral revision into the same destination should be idempotent. A later source revision is a separate immutable reference revision; it must not silently overwrite the earlier imported snapshot.

### Validation before persistence

- Parse and validate the .vyral archive and its compact Master DNA schema before asking for confirmation or writing anything.
- Require the compact export profile, no original Asset rows, no Asset Versions, no full DNA records, and no hidden reconstruction payloads. Reject mixed or malformed packages rather than attempting a partial restore.
- Recompute the compact projection's canonical integrity digest locally. Do not trust a digest merely because it is present in the package.
- Validate unique Asset IDs, Asset Version IDs, DNA references, media types, fingerprints, reconstruction claims, and the collection identity. Do not infer missing source data.
- Accept a resolver URI only when it passes the strict HTTPS canonical resolver allow-list. Never accept arbitrary URLs, credentials, tokens, or user-provided storage paths from the package.

### Retrieval and lifecycle

- A compact reference is descriptive identity data only. It does not grant access to original media or full reconstruction payloads.
- Remote retrieval is available only when the imported projection explicitly carries an allowed public resolver and the source endpoint independently confirms current visibility, revision, membership, and license permissions. Import-time validation is not authorization for later retrieval.
- If no supported resolver is present, retain the reference without remote retrieval. Do not label it as restored, recovered, verified, or locally available.
- Source deletion, privacy changes, permission changes, or a newer source revision must be reflected by the resolver at retrieval time. A previously imported reference must not bypass those checks.
- Deleting the destination reference must not delete or mutate any source Vyral or Asset.
- Reference records must remain separate from the destination Vyral's own Master DNA inventory. They must not cause the destination's Master DNA to claim ownership of the referenced source Assets.

### Acceptance tests

1. A valid compact-only package imports as one reference record into the selected destination.
2. No Asset, Asset Version, storage object, full DNA record, or fake Fingerprint is created by that import.
3. Invalid schema, altered projection digest, duplicate inventory IDs, unsafe resolver URI, or mixed full/compact payload is rejected before persistence.
4. Re-import of the same source revision is idempotent; a newer revision is preserved separately.
5. The importing user can read and delete only their own destination reference records.
6. A reference with no resolver remains non-retrievable; a public resolver is re-authorized on every retrieval.
7. Destination Master DNA excludes external reference inventory unless a future, explicitly versioned schema adds a safe reference-link type.
8. A public source Asset copy requires current source-side redistribution permission, exact Asset/Version membership, signed-URL host validation, byte-length validation, and SHA-256 verification before a new private destination Asset is created.
9. Disabling AI analysis does not silently revoke a separately granted redistribution permission; collection-DNA access and original-source copying remain separate authorization paths.
