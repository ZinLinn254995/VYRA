-- Canonical semantic relationships between Assets.
-- Generation lineage remains in vyral_lineage; this table stores creator-authored
-- or AI-proposed semantic links used by Asset organization and Master DNA.
create table if not exists public.vyral_asset_relationships (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  source_asset_id uuid not null,
  target_asset_id uuid not null,
  relation_type text not null check (
    length(btrim(relation_type)) between 1 and 80
    and relation_type = lower(btrim(relation_type))
    and relation_type ~ '^[a-z0-9][a-z0-9_.-]*$'
  ),
  label text not null check (length(btrim(label)) between 1 and 120),
  rationale text not null default '' check (length(rationale) <= 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyral_asset_relationships_not_self check (source_asset_id <> target_asset_id),
  constraint vyral_asset_relationships_vyral_fk
    foreign key (vyral_id, user_id) references public.vyrals(id, user_id) on delete cascade,
  constraint vyral_asset_relationships_source_fk
    foreign key (source_asset_id, vyral_id, user_id)
    references public.vyral_assets(id, vyral_id, user_id) on delete cascade,
  constraint vyral_asset_relationships_target_fk
    foreign key (target_asset_id, vyral_id, user_id)
    references public.vyral_assets(id, vyral_id, user_id) on delete cascade,
  constraint vyral_asset_relationships_unique
    unique (source_asset_id, target_asset_id, relation_type)
);

create index if not exists vyral_asset_relationships_vyral_created_idx
  on public.vyral_asset_relationships(vyral_id, created_at desc);
create index if not exists vyral_asset_relationships_source_idx
  on public.vyral_asset_relationships(source_asset_id);
create index if not exists vyral_asset_relationships_target_idx
  on public.vyral_asset_relationships(target_asset_id);

alter table public.vyral_asset_relationships enable row level security;

drop policy if exists "Owners can read their Vyral Asset relationships" on public.vyral_asset_relationships;
create policy "Owners can read their Vyral Asset relationships"
  on public.vyral_asset_relationships for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.vyral_asset_relationships from anon, public;
revoke insert, update, delete on public.vyral_asset_relationships from authenticated;
grant select on public.vyral_asset_relationships to authenticated;
grant all on public.vyral_asset_relationships to service_role;

comment on table public.vyral_asset_relationships is
  'Semantic Asset-to-Asset relationships. Distinct from vyral_lineage, which records generation/derivation lineage.';
