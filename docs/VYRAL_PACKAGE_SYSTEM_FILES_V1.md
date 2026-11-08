# Vyral Package System Files v1

Status: Package contract, export projection, read-only viewer, and import validation are implemented on the Vyral 100% working branch. Automated runtime execution and Development acceptance remain pending.

A .vyral remains a ZIP-based hybrid package. Root manifest.json is protected. Original Assets, canonical package records and protected system/ projections coexist.

System Files are projections/references of data already present in the manifest and canonical VYRA records; they are not a second source of truth:
- system/asset-dna/index.json references Asset DNA record IDs and schema versions; it does not duplicate DNA payloads or reconstruction tiles.
- system/master-dna.ref.json references the single Master DNA snapshot stored in manifest.masterDna.
- system/asset-index.json references original Asset IDs and version IDs; it does not duplicate media.
- system/integrity.json hashes non-manifest, non-system package entries. Manifest and System Files are structurally validated separately to avoid circular hashes.

Required protected entries:
- manifest.json
- system/identity.json
- system/asset-index.json
- system/asset-dna/index.json
- system/master-dna.ref.json
- system/fingerprints/index.json
- system/provenance/index.json
- system/relationships/index.json
- system/classifications/index.json
- system/creator-instructions/index.json
- system/licensing.json
- system/integrity.json
- system/system-files.json

Every descriptor declares present, empty, or not_available. Missing knowledge is not fabricated.

Individual System File deletion is forbidden. System Files are removed only with their parent Vyral. The in-app view is read-only. External ZIP modification is possible, so every imported package must be re-validated.

Package-level protection does not replace server-side authorization. Canonical VYRA records remain authoritative. This initial slice implements the deterministic projection contract and tests; UI visibility, export/import enforcement and server/database deletion protection remain separate acceptance gates.