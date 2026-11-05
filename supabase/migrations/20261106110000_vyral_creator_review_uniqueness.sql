-- Prevent concurrent creator-review requests from creating multiple decisions for one Vision observation.
create unique index if not exists vyral_dna_one_creator_review_per_observation
on public.vyral_dna_records (user_id, (payload ->> 'vision_observation_review_id'))
where source_kind = 'creator' and payload ? 'vision_observation_review_id';
