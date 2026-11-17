create unique index if not exists vyral_dna_conflict_resolution_request_unique
on public.vyral_dna_records (user_id, (payload ->> 'resolution_request_id'))
where source_kind = 'creator'
  and payload ->> 'record_kind' = 'vision_field_conflict_resolution'
  and payload ? 'resolution_request_id';

comment on index public.vyral_dna_conflict_resolution_request_unique is
  'Makes a creator conflict-resolution request idempotent while preserving each resolution as an immutable DNA record.';
