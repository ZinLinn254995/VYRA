create unique index if not exists vyral_dna_one_promoted_vision_field
on public.vyral_dna_records (
  user_id,
  (payload ->> 'promotion_observation_id'),
  (payload ->> 'promotion_field_path')
)
where source_kind = 'creator'
  and payload ->> 'promotion_source' = 'creator_approved_vision_field'
  and payload ? 'promotion_observation_id'
  and payload ? 'promotion_field_path';

comment on index public.vyral_dna_one_promoted_vision_field is
'Prevents duplicate immutable creator-approved promotion of the same Vision observation field.';