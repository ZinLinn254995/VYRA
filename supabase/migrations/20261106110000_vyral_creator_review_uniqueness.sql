-- Only server-created creator-review records participate in the one-review-per-observation constraint.
drop index if exists public.vyral_dna_one_creator_review_per_observation;
create unique index vyral_dna_one_creator_review_per_observation
on public.vyral_dna_records (user_id, (payload ->> 'vision_observation_review_id'))
where source_kind = 'creator'
  and payload ->> 'review_source' = 'server_creator_review'
  and payload ? 'vision_observation_review_id';
