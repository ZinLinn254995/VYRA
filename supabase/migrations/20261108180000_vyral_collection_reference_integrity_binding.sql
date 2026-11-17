alter table public.vyral_collection_references
  drop constraint if exists vyral_collection_references_snapshot_binding_check;
alter table public.vyral_collection_references
  add constraint vyral_collection_references_snapshot_binding_check
  check (
    projection_sha256 = compact_snapshot->'integrity'->>'manifest_sha256' and
    source_visibility = compact_snapshot->'source_resolution'->>'visibility' and
    resolver_uri is not distinct from nullif(compact_snapshot->'portable_projection'->>'resolver_uri','')
  );