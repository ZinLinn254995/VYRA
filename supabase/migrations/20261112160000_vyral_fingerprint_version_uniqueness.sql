-- Keep one authoritative fingerprint per source version, kind and algorithm.
-- PostgreSQL treats NULL asset_version_id values as distinct, preserving legacy
-- non-version-pinned fingerprints while preventing duplicate version-pinned rows.
create unique index if not exists vyral_fingerprints_version_kind_algorithm_uidx
  on public.vyral_fingerprints(asset_version_id, fingerprint_kind, algorithm);
