alter table public.vyral_collection_references
  drop constraint if exists vyral_collection_references_snapshot_binding_check;

alter table public.vyral_collection_references
  add constraint vyral_collection_references_snapshot_binding_check
  check (
    compact_snapshot->'integrity'->>'manifest_sha256' is not null and
    compact_snapshot->'integrity'->>'manifest_sha256' ~ '^[a-f0-9]{64}$' and
    projection_sha256 = compact_snapshot->'integrity'->>'manifest_sha256' and
    compact_snapshot->'source_resolution'->>'visibility' is not null and
    compact_snapshot->'source_resolution'->>'visibility' in ('public','private','unlisted') and
    source_visibility = compact_snapshot->'source_resolution'->>'visibility' and
    jsonb_typeof(compact_snapshot->'portable_projection') = 'object' and
    resolver_uri is not distinct from nullif(compact_snapshot->'portable_projection'->>'resolver_uri','')
  );
