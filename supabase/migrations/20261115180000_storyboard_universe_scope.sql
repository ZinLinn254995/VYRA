-- One private, owner-scoped Universe per Storyboard.
-- Existing Vyral asset/folder/DNA tables remain the source of truth.
create unique index if not exists vyrals_one_storyboard_universe_per_owner
  on public.vyrals (user_id, (metadata ->> 'storyboard_id'))
  where metadata ->> 'universe_scope' = 'storyboard'
    and metadata ->> 'storyboard_id' is not null;
