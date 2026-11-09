# VYRA DNA Revision Workflow v1

## Purpose

DNA improvements must never rewrite the current Asset DNA record. A creator-confirmed correction is prepared as an immutable, source-pinned Change Set, validated deterministically, and applied as a new DNA revision only after every gate passes.

## Identity and source binding

Each Change Set is bound to:

- the exact improvement Proposal ID;
- the Asset ID;
- the immutable Asset Version ID;
- the current Asset DNA record ID and revision;
- the original Asset SHA-256.

The Change Set payload is canonicalized as JSON before SHA-256 hashing. The stored payload and hash are immutable after preparation. A mismatched hash, Proposal ID, source identity, version, or DNA revision blocks validation or application.

## Database-owned revision allocation and extraction uniqueness

Every Asset-DNA insert is assigned its lineage by a database trigger, not by a caller:

- the allocator locks the owning Asset row, serializing concurrent DNA writers for that Asset;
- the first Asset-DNA record receives revision 1 and no parent;
- each later record receives the next revision and the latest record as its parent;
- caller-supplied revision and parent values are ignored;
- Vyral-scope DNA records are outside this per-Asset sequence.

A partial unique index binds each canonical extraction to one source Asset Version ID across both raster DNA v3 (`lossless_decoded_samples_v3`) and File DNA v1 (`vyra.asset-file-dna`). This prevents a retry or fallback path from creating a second canonical DNA extraction for the same source Version, including cross-format duplicates. Append-only Vision observations and creator-evidence revisions are intentionally excluded because multiple observations may validly refer to one source Version. The raster extractor checks for an existing source-version record before processing and handles a concurrent uniqueness conflict by rolling back newly uploaded tiles. Its response returns the database-assigned revision and parent.

## Permitted operations

Version 1 is deliberately narrow:

- only `add` and `replace` JSON Patch-style operations;
- only fields below `dna_record.knowledge.*`;
- every operation has at least one creator-evidence reference;
- replacement operations must carry the exact current `before` value and a different `after` value;
- add operations must target a field that does not exist;
- duplicate target paths are rejected;
- identity, source binding, provenance, fingerprints, integrity, licensing, signatures, and revision metadata are protected.

Removal, array-index edits, arbitrary modality sections, and AI-only assertions are not supported by this version. A future schema version must explicitly add and test any wider operation set.

## Creator evidence requirements

A referenced field confirmation is accepted only when the server can resolve all of the following under the signed-in owner's scope:

1. the field-confirmation evidence row;
2. its creator-confirmed review row;
3. the matching source Vision Observation;
4. matching Asset ID, Asset Version ID, and source SHA-256 across those records;
5. the exact destination field path and accepted value.

An unresolved, disputed, stale, cross-Asset, or mismatched evidence reference blocks the Change Set. Creator confirmation authorizes only the exact knowledge field and value it reviewed.

## Validation and stale-source behavior

Validation checks the canonical payload hash, schema, Proposal binding, source binding, current DNA snapshot, unique allowed patch paths, before/after semantics, and all evidence references.

A previously stored validation report is reused only after the current Asset Version and DNA revision are rechecked. If either has changed, the Proposal becomes stale and must be reassessed. Validation itself never mutates DNA.

## Atomic application

The trusted server invokes `public.apply_vyral_asset_dna_change_set`. The database function:

- accepts calls only from `service_role`;
- locks the Proposal, Asset, and current DNA revision;
- rechecks Proposal identity, Change Set hash, validation report, source Version, DNA revision, and original source hash;
- independently resolves the creator evidence and rechecks the exact accepted value;
- reconstructs the expected JSON patch result and compares it to the submitted payload;
- creates a new Asset DNA record with the prior record as parent and increments the revision number;
- marks the Proposal applied in the same transaction.

The RPC rejects null or malformed inputs. Repeated application returns the already-created revision instead of creating another one.

## User-facing workflow

The global VYRA AI Chat can guide the creator through:

1. assess the selected Asset DNA;
2. create an improvement Proposal;
3. approve or reject that Proposal;
4. prepare the immutable Change Set;
5. validate the Change Set;
6. apply a fully validated Change Set as a new DNA revision.

Every stage reports whether DNA changed. Preparation and validation do not change DNA; only successful atomic application creates a new revision.

## Current limitations and acceptance boundary

- Version 1 changes only creator-confirmed `knowledge.*` facts. It does not invent missing knowledge or rewrite visual, audio, video, geometry, or other modality DNA.
- The database and CI contracts are covered, but an authenticated end-to-end run with a real signed-in creator session and real confirmed Vision evidence is still required.
- A successful DNA revision does not by itself prove that a third-party AI can reconstruct the original Asset. Blind reconstruction remains a separate evidence protocol with its own modality-specific acceptance tests.
- Do not claim 100% DNA or reconstruction fidelity without those independent tests passing.
