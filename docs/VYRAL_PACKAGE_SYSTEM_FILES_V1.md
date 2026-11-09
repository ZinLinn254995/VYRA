# Vyral Package System Files v1

Status: Package contract, all export builders, read-only viewer, import validation, portable reconstruction validation, and automated CI acceptance are implemented on the Vyral 100% working branch. Runtime tests and production build passed in GitHub Actions on 2026-11-08.

A .vyral remains a ZIP-based hybrid package. Root manifest.json is protected. Original Assets, canonical package records and protected system/ projections coexist. System Files are virtual projections materialized into each exported package; they are not separate database rows or independent Storage objects. The in-app Show System Files panel is a read-only view of the current VYRA records.

System Files are projections/references of data already present in the manifest and canonical VYRA records; they are not a second source of truth:
- system/asset-dna/index.json references Asset DNA record IDs and schema versions; it does not duplicate DNA payloads or reconstruction tiles.
- system/master-dna.ref.json references the single Master DNA snapshot stored in manifest.masterDna.
- system/asset-index.json references original Asset IDs and version IDs; it does not duplicate media.
- system/integrity.json hashes all package entries except manifest.json, system/integrity.json itself, and system/system-files.json. This includes the other System File JSON payloads. The manifest and System File index are structurally cross-checked to avoid circular hashes.

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

Individual System File deletion is forbidden. Because these are package projections rather than independent DB rows, there is no standalone System File delete operation; deleting the parent Vyral removes its entire System File set. The in-app view is read-only. The app importer and included Python reconstruction tool validate the required inventory, deletion policy, and SHA-256 coverage. Legacy packages without a System File inventory remain readable under the legacy parser path.

Integrity hashes provide package consistency and corruption detection, not a digital signature or proof of publisher identity; a party who can rewrite the entire package can recompute its hashes. Canonical VYRA records and existing owner/RLS/storage policies remain authoritative. No Production deployment, Production database change, merge, or branch creation was performed. CI verifies TypeScript, Vyral package round-trips, System File export/import/tamper checks, portable reconstruction, and the production build.