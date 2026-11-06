-- Master DNA persistence: typed relationships, immutable snapshots, and stale-state tracking.
-- This migration is additive. Existing asset DNA records and legacy Vyral-scope DNA remain unchanged.
-- Apply only to the isolated VYRA Development project after review.

alter table public.vyrals
  add column if not exists master_dna_status text not null default 'not_started'
    check (master_dna_status in ('not_started','needs_classification','stale','ready')),
  add column if not exists master_dna_revision integer not null default 0
    check (master_dna_revision >= 0),
  add column if not exists master_dna_purpose text
    check (master_dna_purpose is null or char_length(btrim(master_dna_purpose)) between 1 and 2000),
  add column if not exists master_dna_intended_uses jsonb not null default '[]'::jsonb
    check (jsonb_typeof(master_dna_intended_uses) = 'array');

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

  select (
    not exists (select 1 from public.vyrals v where v.id = target_vyral_id and v.user_id = target_user_id
      and v.master_dna_purpose is not null and btrim(v.master_dna_purpose) <> '')
    or exists (
      select 1 from public.vyral_assets a
      where a.vyral_id = target_vyral_id and a.user_id = target_user_id
        and (a.master_dna_role is null or a.master_dna_purpose is null or btrim(a.master_dna_purpose) = '')
    )
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

create or replace function public.mark_vyral_master_dna_root_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_unclassified_assets boolean;
begin
  select (
    new.master_dna_purpose is null or btrim(new.master_dna_purpose) = ''
    or exists (
      select 1 from public.vyral_assets a
      where a.vyral_id = new.id and a.user_id = new.user_id
        and (a.master_dna_role is null or a.master_dna_purpose is null or btrim(a.master_dna_purpose) = '')
    )
  ) into has_unclassified_assets;

  update public.vyrals v
  set master_dna_status = case when has_unclassified_assets then 'needs_classification' else 'stale' end,
      updated_at = now()
  where v.id = new.id and v.user_id = new.user_id;

  return new;
end;
$$;

revoke all on function public.mark_vyral_master_dna_root_stale() from public, anon, authenticated;
drop trigger if exists vyrals_mark_master_dna_stale on public.vyrals;
create trigger vyrals_mark_master_dna_stale
after update of master_dna_purpose, master_dna_intended_uses on public.vyrals
for each row execute function public.mark_vyral_master_dna_root_stale();


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


create or replace function public.validate_vyral_master_dna_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision integer;
  latest_revision_id uuid;
  asset_row record;
  snapshot_asset jsonb;
  snapshot_asset_count integer;
  snapshot_relationship_count integer;
begin
  select v.master_dna_revision
    into current_revision
  from public.vyrals v
  where v.id = new.vyral_id and v.user_id = new.user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Master DNA Vyral owner scope does not exist.';
  end if;

  select r.id into latest_revision_id
  from public.vyral_master_dna_revisions r
  where r.vyral_id = new.vyral_id and r.user_id = new.user_id
  order by r.revision desc
  limit 1;

  if new.revision <> current_revision + 1
     or new.parent_revision_id is distinct from latest_revision_id then
    raise exception using errcode = '23514', message = 'Master DNA revision must extend the current immutable revision head.';
  end if;

  if new.snapshot -> 'purpose' ->> 'summary' is distinct from
       (select v.master_dna_purpose from public.vyrals v where v.id = new.vyral_id and v.user_id = new.user_id)
     or new.snapshot -> 'purpose' -> 'intended_uses' is distinct from
       (select v.master_dna_intended_uses from public.vyrals v where v.id = new.vyral_id and v.user_id = new.user_id) then
    raise exception using errcode = '23514', message = 'Master DNA purpose does not match the declared Vyral purpose.';
  end if;

  if new.snapshot ->> 'schema_id' is distinct from new.schema_id
     or new.snapshot ->> 'schema_version' is distinct from new.schema_version::text
     or new.snapshot -> 'vyral' ->> 'vyral_id' is distinct from new.vyral_id::text
     or new.snapshot -> 'snapshot' ->> 'revision' is distinct from new.revision::text
     or new.snapshot -> 'integrity' ->> 'manifest_sha256' is distinct from new.manifest_sha256
     or new.snapshot -> 'integrity' ->> 'vyral_fingerprint' is distinct from new.vyral_fingerprint then
    raise exception using errcode = '23514', message = 'Master DNA snapshot identity or integrity metadata does not match its revision row.';
  end if;

  if not exists (
    select 1 from public.vyrals v
    where v.id = new.vyral_id and v.user_id = new.user_id
      and v.master_dna_purpose is not null and btrim(v.master_dna_purpose) <> ''
      and jsonb_typeof(v.master_dna_intended_uses) = 'array'
      and jsonb_array_length(v.master_dna_intended_uses) > 0
  ) then
    raise exception using errcode = '23514', message = 'Vyral purpose and intended uses must be explicitly declared before Master DNA snapshot creation.';
  end if;

  if exists (
    select 1 from public.vyral_assets a
    where a.vyral_id = new.vyral_id and a.user_id = new.user_id
      and (a.master_dna_role is null or a.master_dna_purpose is null or btrim(a.master_dna_purpose) = '')
  ) then
    raise exception using errcode = '23514', message = 'Every Vyral asset must have a declared Master DNA role and purpose before snapshot creation.';
  end if;

  select count(*)::integer into snapshot_asset_count
  from jsonb_array_elements(coalesce(new.snapshot -> 'assets', '[]'::jsonb));

  if snapshot_asset_count <> (
    select count(*)::integer from public.vyral_assets a
    where a.vyral_id = new.vyral_id and a.user_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'Master DNA snapshot asset inventory does not match canonical Vyral membership.';
  end if;

  for asset_row in
    select a.id, a.master_dna_role, a.master_dna_purpose,
      (select av.id from public.vyral_asset_versions av
       where av.asset_id = a.id and av.vyral_id = a.vyral_id and av.user_id = a.user_id
       order by av.version_number desc limit 1) as latest_version_id
    from public.vyral_assets a
    where a.vyral_id = new.vyral_id and a.user_id = new.user_id
  loop
    select item into snapshot_asset
    from jsonb_array_elements(new.snapshot -> 'assets') as elements(item)
    where item ->> 'asset_id' = asset_row.id::text
    limit 1;

    if snapshot_asset is null
       or snapshot_asset ->> 'role' <> asset_row.master_dna_role
       or snapshot_asset ->> 'purpose' <> asset_row.master_dna_purpose
       or asset_row.latest_version_id is null
       or snapshot_asset ->> 'asset_version_id' <> asset_row.latest_version_id::text
       or not exists (
         select 1 from public.vyral_dna_records d
         where d.id::text = snapshot_asset -> 'dna_ref' ->> 'record_id'
           and d.asset_id = asset_row.id
           and d.vyral_id = new.vyral_id
           and d.user_id = new.user_id
           and d.scope = 'asset'
       ) then
      raise exception using errcode = '23514', message = 'Master DNA snapshot contains a missing, stale, or mismatched asset version or DNA reference.';
    end if;

    if not exists (
      select 1 from public.vyral_asset_relationships rel
      where rel.vyral_id = new.vyral_id and rel.user_id = new.user_id
        and ((rel.from_kind = 'asset' and rel.from_asset_id = asset_row.id)
          or (rel.to_kind = 'asset' and rel.to_asset_id = asset_row.id))
    ) then
      raise exception using errcode = '23514', message = 'Every Master DNA asset must have at least one explicit relationship.';
    end if;
    if asset_row.master_dna_role = 'main' and not exists (
      select 1 from public.vyral_asset_relationships rel
      where rel.vyral_id = new.vyral_id and rel.user_id = new.user_id
        and rel.relationship_type = 'master_membership'
        and rel.from_kind = 'asset' and rel.from_asset_id = asset_row.id
        and rel.to_kind = 'vyral'
    ) then
      raise exception using errcode = '23514', message = 'Every Main Asset must have a membership edge to the Vyral root.';
    end if;
    if asset_row.master_dna_role = 'supporting' and not exists (
      select 1 from public.vyral_asset_relationships rel
      join public.vyral_assets main_asset
        on main_asset.id = rel.to_asset_id
       and main_asset.vyral_id = rel.vyral_id
       and main_asset.user_id = rel.user_id
      where rel.vyral_id = new.vyral_id and rel.user_id = new.user_id
        and rel.relationship_type = 'master_membership'
        and rel.from_kind = 'asset' and rel.from_asset_id = asset_row.id
        and rel.to_kind = 'asset' and main_asset.master_dna_role = 'main'
    ) then
      raise exception using errcode = '23514', message = 'Every Supporting Asset must have a membership edge to a Main Asset.';
    end if;
  end loop;

  select count(*)::integer into snapshot_relationship_count
  from jsonb_array_elements(coalesce(new.snapshot -> 'relationships', '[]'::jsonb));

  if snapshot_relationship_count <> (
    select count(*)::integer from public.vyral_asset_relationships rel
    where rel.vyral_id = new.vyral_id and rel.user_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'Master DNA relationship graph does not match canonical Vyral relationships.';
  end if;

  return new;
end;
$$;

create or replace function public.set_vyral_master_dna_revision_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vyrals
  set master_dna_revision = new.revision,
      master_dna_status = 'ready',
      updated_at = now()
  where id = new.vyral_id and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.validate_vyral_master_dna_revision() from public, anon, authenticated;
revoke all on function public.set_vyral_master_dna_revision_ready() from public, anon, authenticated;

drop trigger if exists vyral_master_dna_revision_validate on public.vyral_master_dna_revisions;
create trigger vyral_master_dna_revision_validate
before insert on public.vyral_master_dna_revisions
for each row execute function public.validate_vyral_master_dna_revision();

drop trigger if exists vyral_master_dna_revision_set_ready on public.vyral_master_dna_revisions;
create trigger vyral_master_dna_revision_set_ready
after insert on public.vyral_master_dna_revisions
for each row execute function public.set_vyral_master_dna_revision_ready();


create or replace function public.set_vyral_master_dna_asset_classification(
  p_asset_id uuid,
  p_role text,
  p_purpose text,
  p_target_asset_id uuid,
  p_rationale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_vyral_id uuid;
  target_kind text;
  relation_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'A signed-in owner is required.';
  end if;
  if p_role is null or p_role not in ('main','supporting')
     or p_purpose is null or char_length(btrim(p_purpose)) not between 1 and 2000
     or p_rationale is null or char_length(btrim(p_rationale)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'A valid role, purpose, and relationship rationale are required.';
  end if;

  select a.vyral_id into target_vyral_id
  from public.vyral_assets a
  where a.id = p_asset_id and a.user_id = caller_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Asset not found in the signed-in owner scope.';
  end if;

  if p_role = 'supporting' and exists (
    select 1 from public.vyral_asset_relationships rel
    where rel.vyral_id = target_vyral_id and rel.user_id = caller_id
      and rel.relationship_type = 'master_membership'
      and rel.from_kind = 'asset' and rel.to_kind = 'asset'
      and rel.to_asset_id = p_asset_id
  ) then
    raise exception using errcode = '22023', message = 'A Main Asset cannot be demoted while Supporting Assets still depend on it.';
  end if;

  if p_role = 'main' then
    if p_target_asset_id is not null then
      raise exception using errcode = '22023', message = 'A Main Asset must be linked directly to its Vyral root.';
    end if;
    target_kind := 'vyral';
  else
    if p_target_asset_id is null or p_target_asset_id = p_asset_id or not exists (
      select 1 from public.vyral_assets target
      where target.id = p_target_asset_id
        and target.vyral_id = target_vyral_id
        and target.user_id = caller_id
        and target.master_dna_role = 'main'
    ) then
      raise exception using errcode = '22023', message = 'A Supporting Asset must link to a different Main Asset in the same Vyral.';
    end if;
    target_kind := 'asset';
  end if;

  update public.vyral_assets
  set master_dna_role = p_role,
      master_dna_purpose = btrim(p_purpose),
      updated_at = now()
  where id = p_asset_id and vyral_id = target_vyral_id and user_id = caller_id;

  delete from public.vyral_asset_relationships
  where vyral_id = target_vyral_id and user_id = caller_id
    and relationship_type = 'master_membership'
    and from_kind = 'asset' and from_asset_id = p_asset_id;

  insert into public.vyral_asset_relationships (
    vyral_id,user_id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale
  ) values (
    target_vyral_id,caller_id,'master_membership','asset',p_asset_id,target_kind,
    case when target_kind = 'asset' then p_target_asset_id else null end,btrim(p_rationale)
  ) returning id into relation_id;

  return relation_id;
end;
$$;

revoke all on function public.set_vyral_master_dna_asset_classification(uuid,text,text,uuid,text) from public, anon;
grant execute on function public.set_vyral_master_dna_asset_classification(uuid,text,text,uuid,text) to authenticated;
