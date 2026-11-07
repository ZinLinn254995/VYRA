-- Vyral DNA validity is based on its Asset inventory and per-Asset DNA.
-- Creator purpose, Main/Supporting roles, and semantic relationships are optional context.
-- This migration preserves existing metadata and historical snapshots; it only removes
-- those fields as mandatory validity gates.

alter table public.vyral_master_dna_asset_metadata
  alter column role drop not null,
  alter column purpose drop not null;

create or replace function public.set_vyral_master_dna_asset_context(
  p_asset_id uuid,
  p_role text default null,
  p_purpose text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  target_vyral_id uuid;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'A signed-in owner is required.';
  end if;
  if p_role is not null and p_role not in ('main','supporting') then
    raise exception using errcode = '22023', message = 'Asset role must be Main or Supporting when supplied.';
  end if;
  if p_purpose is not null and char_length(btrim(p_purpose)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'Asset purpose must contain 1 to 2000 characters when supplied.';
  end if;
  if p_role is null and p_purpose is null then
    raise exception using errcode = '22023', message = 'At least one optional Asset context field must be supplied.';
  end if;

  select a.vyral_id into target_vyral_id
  from public.vyral_assets a
  where a.id = p_asset_id and a.user_id = caller_id
  ;
  if not found then
    raise exception using errcode = 'P0002', message = 'Asset not found in the signed-in owner scope.';
  end if;

  insert into public.vyral_master_dna_asset_metadata (asset_id,vyral_id,user_id,role,purpose)
  values (p_asset_id,target_vyral_id,caller_id,p_role,case when p_purpose is null then null else btrim(p_purpose) end)
  on conflict (asset_id) do update
    set role = excluded.role,
        purpose = excluded.purpose,
        updated_at = now();
end;
$function$;

drop policy if exists "vyral_master_dna_asset_metadata_insert_own" on public.vyral_master_dna_asset_metadata;
create policy "vyral_master_dna_asset_metadata_insert_own"
  on public.vyral_master_dna_asset_metadata for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "vyral_master_dna_asset_metadata_update_own" on public.vyral_master_dna_asset_metadata;
create policy "vyral_master_dna_asset_metadata_update_own"
  on public.vyral_master_dna_asset_metadata for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update on public.vyral_master_dna_asset_metadata to authenticated;

revoke all on function public.set_vyral_master_dna_asset_context(uuid,text,text) from public, anon;
grant execute on function public.set_vyral_master_dna_asset_context(uuid,text,text) to authenticated;

create or replace function public.mark_vyral_master_dna_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vyral_id uuid;
  target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    target_vyral_id := old.vyral_id;
    target_user_id := old.user_id;
  else
    target_vyral_id := new.vyral_id;
    target_user_id := new.user_id;
  end if;

  update public.vyrals
  set master_dna_status = 'stale',
      updated_at = now()
  where id = target_vyral_id and user_id = target_user_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.mark_vyral_master_dna_root_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vyrals
  set master_dna_status = 'stale',
      updated_at = now()
  where id = new.id and user_id = new.user_id;
  return new;
end;
$$;

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
     or coalesce(new.snapshot -> 'purpose' -> 'intended_uses', '[]'::jsonb) is distinct from
       (select coalesce(v.master_dna_intended_uses, '[]'::jsonb) from public.vyrals v where v.id = new.vyral_id and v.user_id = new.user_id) then
    raise exception using errcode = '23514', message = 'Master DNA optional context does not match the saved Vyral context.';
  end if;

  if new.snapshot ->> 'schema_id' is distinct from new.schema_id
     or new.snapshot ->> 'schema_version' is distinct from new.schema_version::text
     or new.snapshot -> 'vyral' ->> 'vyral_id' is distinct from new.vyral_id::text
     or new.snapshot -> 'snapshot' ->> 'revision' is distinct from new.revision::text
     or new.snapshot -> 'integrity' ->> 'manifest_sha256' is distinct from new.manifest_sha256
     or new.snapshot -> 'integrity' ->> 'vyral_fingerprint' is distinct from new.vyral_fingerprint then
    raise exception using errcode = '23514', message = 'Master DNA snapshot identity or integrity metadata does not match its revision row.';
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
    select a.id, meta.role as master_dna_role, meta.purpose as master_dna_purpose,
      (select av.id from public.vyral_asset_versions av
       where av.asset_id = a.id and av.vyral_id = a.vyral_id and av.user_id = a.user_id
       order by av.version_number desc limit 1) as latest_version_id,
      (select av.sha256 from public.vyral_asset_versions av
       where av.asset_id = a.id and av.vyral_id = a.vyral_id and av.user_id = a.user_id
       order by av.version_number desc limit 1) as latest_version_sha256
    from public.vyral_assets a
    left join public.vyral_master_dna_asset_metadata meta
      on meta.asset_id = a.id and meta.vyral_id = a.vyral_id and meta.user_id = a.user_id
    where a.vyral_id = new.vyral_id and a.user_id = new.user_id
  loop
    select item into snapshot_asset
    from jsonb_array_elements(new.snapshot -> 'assets') as elements(item)
    where item ->> 'asset_id' = asset_row.id::text
    limit 1;

    if snapshot_asset is null
       or (asset_row.master_dna_role is not null and snapshot_asset ->> 'role' is distinct from asset_row.master_dna_role)
       or (asset_row.master_dna_purpose is not null and snapshot_asset ->> 'purpose' is distinct from asset_row.master_dna_purpose)
       or asset_row.latest_version_id is null
       or snapshot_asset ->> 'asset_version_id' is distinct from asset_row.latest_version_id::text
       or snapshot_asset ->> 'asset_fingerprint' is distinct from lower(asset_row.latest_version_sha256)
       or not exists (
         select 1 from public.vyral_dna_records d
         where d.id::text = snapshot_asset -> 'dna_ref' ->> 'record_id'
           and d.asset_id = asset_row.id
           and d.vyral_id = new.vyral_id
           and d.user_id = new.user_id
           and d.scope = 'asset'
           and d.schema_version = (snapshot_asset -> 'dna_ref' ->> 'schema_version')::integer
           and coalesce(d.payload -> 'dna_record' -> 'source' ->> 'asset_version_id', d.payload ->> 'source_version_id') = asset_row.latest_version_id::text
           and lower(coalesce(d.payload -> 'dna_record' -> 'source' ->> 'sha256', d.payload ->> 'source_file_sha256')) = lower(asset_row.latest_version_sha256)
       ) then
      raise exception using errcode = '23514', message = 'Master DNA snapshot contains a missing, stale, or mismatched asset version or DNA reference.';
    end if;
  end loop;

  select count(*)::integer into snapshot_relationship_count
  from jsonb_array_elements(coalesce(new.snapshot -> 'relationships', '[]'::jsonb));

  if snapshot_relationship_count <> (
    select count(*)::integer from public.vyral_asset_relationships rel
    where rel.vyral_id = new.vyral_id and rel.user_id = new.user_id
  ) then
    raise exception using errcode = '23514', message = 'Master DNA optional relationship data does not match canonical Vyral relationships.';
  end if;

  return new;
end;
$$;

comment on function public.set_vyral_master_dna_asset_context(uuid,text,text) is
  'Owner-scoped writer for optional Asset role and purpose metadata; no relationship is created.';
comment on column public.vyrals.master_dna_status is
  'Derived snapshot state: not_started, stale, or ready. Optional creator context never blocks Vyral validity.';
comment on table public.vyral_master_dna_asset_metadata is
  'Optional creator-defined Asset role and purpose metadata. Absence is valid.';
comment on table public.vyral_asset_relationships is
  'Optional typed semantic relationships. An empty relationship graph is valid.';
