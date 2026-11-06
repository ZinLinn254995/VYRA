-- Master DNA persistence: typed relationships, immutable snapshots, and stale-state tracking.
-- This migration is additive. Existing asset DNA records and legacy Vyral-scope DNA remain unchanged.
-- Apply only to the isolated VYRA Development project after review.

alter table public.vyrals
  add column if not exists master_dna_status text not null default 'not_started'
    check (master_dna_status in ('not_started','needs_classification','stale','ready')),
  add column if not exists master_dna_revision integer not null default 0
    check (master_dna_revision >= 0);

alter table public.vyral_assets
  add column if not exists master_dna_role text
    check (master_dna_role is null or master_dna_role in ('main','supporting')),
  add column if not exists master_dna_purpose text
    check (master_dna_purpose is null or char_length(btrim(master_dna_purpose)) between 1 and 2000);

create index if not exists vyral_assets_master_dna_classification_idx
  on public.vyral_assets(vyral_id,user_id,master_dna_role)
  where master_dna_role is null or master_dna_purpose is null;

create table if not exists public.vyral_asset_relationships (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  relationship_type text not null check (relationship_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  from_kind text not null check (from_kind in ('asset','vyral')),
  from_asset_id uuid,
  to_kind text not null check (to_kind in ('asset','vyral')),
  to_asset_id uuid,
  rationale text not null check (char_length(btrim(rationale)) between 1 and 2000),
  evidence_ref text check (evidence_ref is null or char_length(evidence_ref) <= 512),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyral_asset_relationships_from_shape_check
    check ((from_kind = 'asset' and from_asset_id is not null) or (from_kind = 'vyral' and from_asset_id is null)),
  constraint vyral_asset_relationships_to_shape_check
    check ((to_kind = 'asset' and to_asset_id is not null) or (to_kind = 'vyral' and to_asset_id is null)),
  constraint vyral_asset_relationships_not_root_self_check
    check (from_kind <> 'vyral' or to_kind <> 'vyral'),
  constraint vyral_asset_relationships_not_asset_self_check
    check (from_kind <> 'asset' or to_kind <> 'asset' or from_asset_id <> to_asset_id),
  constraint vyral_asset_relationships_owner_fk
    foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_asset_relationships_from_asset_fk
    foreign key (from_asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_relationships_to_asset_fk
    foreign key (to_asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_relationships_id_scope_unique unique (id,vyral_id,user_id)
);

create index if not exists vyral_asset_relationships_from_idx
  on public.vyral_asset_relationships(vyral_id,from_asset_id,relationship_type);
create index if not exists vyral_asset_relationships_to_idx
  on public.vyral_asset_relationships(vyral_id,to_asset_id,relationship_type);

create table if not exists public.vyral_master_dna_revisions (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision > 0),
  parent_revision_id uuid,
  schema_id text not null default 'vyra.vyral-master-dna'
    check (schema_id = 'vyra.vyral-master-dna'),
  schema_version integer not null default 1 check (schema_version = 1),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  vyral_fingerprint text not null check (vyral_fingerprint ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vyral_master_dna_revisions_owner_fk
    foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_master_dna_revisions_creator_fk
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint vyral_master_dna_revisions_parent_fk
    foreign key (parent_revision_id,vyral_id,user_id)
    references public.vyral_master_dna_revisions(id,vyral_id,user_id) on delete restrict,
  constraint vyral_master_dna_revisions_id_scope_unique unique (id,vyral_id,user_id),
  constraint vyral_master_dna_revisions_number_unique unique (vyral_id,revision),
  constraint vyral_master_dna_revisions_fingerprint_unique unique (vyral_id,vyral_fingerprint)
);

create index if not exists vyral_master_dna_revisions_latest_idx
  on public.vyral_master_dna_revisions(vyral_id,revision desc);

create or replace function public.prevent_vyral_master_dna_revision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Master DNA revisions are immutable; create a new revision instead.';
end;
$$;

revoke all on function public.prevent_vyral_master_dna_revision_update() from public, anon, authenticated;
drop trigger if exists vyral_master_dna_revision_immutable on public.vyral_master_dna_revisions;
create trigger vyral_master_dna_revision_immutable
before update on public.vyral_master_dna_revisions
for each row execute function public.prevent_vyral_master_dna_revision_update();

create or replace function public.mark_vyral_master_dna_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vyral_id uuid;
  target_user_id uuid;
  has_unclassified_assets boolean;
begin
  if tg_op = 'DELETE' then
    target_vyral_id := old.vyral_id;
    target_user_id := old.user_id;
  else
    target_vyral_id := new.vyral_id;
    target_user_id := new.user_id;
  end if;

  select exists (
    select 1
    from public.vyral_assets a
    where a.vyral_id = target_vyral_id
      and a.user_id = target_user_id
      and (a.master_dna_role is null or a.master_dna_purpose is null or btrim(a.master_dna_purpose) = '')
  ) into has_unclassified_assets;

  update public.vyrals v
  set master_dna_status = case
        when has_unclassified_assets then 'needs_classification'
        else 'stale'
      end,
      updated_at = now()
  where v.id = target_vyral_id
    and v.user_id = target_user_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.mark_vyral_master_dna_stale() from public, anon, authenticated;

drop trigger if exists vyral_assets_mark_master_dna_stale on public.vyral_assets;
create trigger vyral_assets_mark_master_dna_stale
after insert or update or delete on public.vyral_assets
for each row execute function public.mark_vyral_master_dna_stale();

drop trigger if exists vyral_asset_versions_mark_master_dna_stale on public.vyral_asset_versions;
create trigger vyral_asset_versions_mark_master_dna_stale
after insert or update or delete on public.vyral_asset_versions
for each row execute function public.mark_vyral_master_dna_stale();

drop trigger if exists vyral_asset_relationships_mark_master_dna_stale on public.vyral_asset_relationships;
create trigger vyral_asset_relationships_mark_master_dna_stale
after insert or update or delete on public.vyral_asset_relationships
for each row execute function public.mark_vyral_master_dna_stale();

alter table public.vyral_asset_relationships enable row level security;
alter table public.vyral_master_dna_revisions enable row level security;

create policy "vyral_asset_relationships_select_own"
  on public.vyral_asset_relationships for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vyral_asset_relationships_insert_own"
  on public.vyral_asset_relationships for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "vyral_asset_relationships_update_own"
  on public.vyral_asset_relationships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "vyral_asset_relationships_delete_own"
  on public.vyral_asset_relationships for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "vyral_master_dna_revisions_select_own"
  on public.vyral_master_dna_revisions for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.vyral_asset_relationships to authenticated;
revoke all on public.vyral_master_dna_revisions from public, anon, authenticated;
grant select on public.vyral_master_dna_revisions to authenticated;
grant select, insert on public.vyral_master_dna_revisions to service_role;

comment on table public.vyral_asset_relationships is
  'Typed, rationale-bearing semantic graph edges between assets and their canonical Vyral root.';
comment on table public.vyral_master_dna_revisions is
  'Append-only canonical Master DNA snapshots with manifest digest and Vyral fingerprint.';
comment on column public.vyrals.master_dna_status is
  'Current Master DNA readiness: classification required, stale, ready, or not started.';
comment on column public.vyral_assets.master_dna_purpose is
  'Creator-declared reason this asset belongs to the Vyral; never inferred from filename.';
