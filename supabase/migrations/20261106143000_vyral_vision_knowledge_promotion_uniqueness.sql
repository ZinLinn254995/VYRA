create unique index if not exists vyral_dna_one_vision_knowledge_promotion
on public.vyral_dna_records (user_id, asset_id, (payload ->> 'vision_observation_id'))
where source_kind = 'creator'
  and payload ->> 'knowledge_promotion_source' = 'creator_adopted_vision_observation'
  and payload ? 'vision_observation_id';
