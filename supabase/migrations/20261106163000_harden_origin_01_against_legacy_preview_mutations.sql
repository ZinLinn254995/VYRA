-- ORIGIN-01 must remain protected even if an older Preview or direct API
-- attempts to clear metadata.protected before deleting or detaching its assets.

create or replace function public.prevent_origin_01_unprotect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid
     and coalesce(new.metadata ->> 'protected', 'false') <> 'true' then
    raise exception 'ORIGIN-01 protection cannot be removed'
      using errcode = '55000';
  end if;

  if coalesce(old.metadata ->> 'protected', 'false') = 'true'
     and coalesce(new.metadata ->> 'protected', 'false') <> 'true' then
    raise exception 'Protected Vyral protection cannot be removed by normal updates'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_origin_01_unprotect on public.vyrals;
create trigger prevent_origin_01_unprotect
before update of metadata on public.vyrals
for each row execute function public.prevent_origin_01_unprotect();

create or replace function public.prevent_protected_vyral_asset_delete()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
declare
  target_vyral_id uuid;
begin
  target_vyral_id := (to_jsonb(old) ->> 'vyral_id')::uuid;

  if target_vyral_id = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid
     or exists (
       select 1
       from public.vyrals v
       where v.id = target_vyral_id
         and coalesce(v.metadata ->> 'protected', 'false') = 'true'
     ) then
    raise exception using
      errcode = '55000',
      message = 'This Vyral is protected. Its assets and stored versions cannot be deleted.';
  end if;

  return old;
end;
$$;

create or replace function public.prevent_protected_vyral_asset_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
declare
  target_vyral_id uuid;
begin
  target_vyral_id := (to_jsonb(old) ->> 'vyral_id')::uuid;

  if target_vyral_id = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid
     or exists (
       select 1
       from public.vyrals v
       where v.id = target_vyral_id
         and coalesce(v.metadata ->> 'protected', 'false') = 'true'
     ) then
    raise exception using
      errcode = '55000',
      message = 'This Vyral is protected. Its original asset and version records are immutable.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_protected_vyral_asset_update on public.vyral_assets;
create trigger prevent_protected_vyral_asset_update
before update on public.vyral_assets
for each row execute function public.prevent_protected_vyral_asset_update();

drop trigger if exists prevent_protected_vyral_asset_version_update on public.vyral_asset_versions;
create trigger prevent_protected_vyral_asset_version_update
before update on public.vyral_asset_versions
for each row execute function public.prevent_protected_vyral_asset_update();

drop policy if exists vyral_assets_delete_own on public.vyral_assets;
create policy vyral_assets_delete_own
on public.vyral_assets
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and vyral_id <> 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid
  and not exists (
    select 1
    from public.vyrals v
    where v.id = vyral_assets.vyral_id
      and coalesce(v.metadata ->> 'protected', 'false') = 'true'
  )
);

drop policy if exists vyral_storage_delete_own on storage.objects;
create policy vyral_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vyral-assets'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  and (storage.foldername(objects.name))[2] <> 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'
  and not exists (
    select 1
    from public.vyrals v
    where v.id::text = (storage.foldername(objects.name))[2]
      and coalesce(v.metadata ->> 'protected', 'false') = 'true'
  )
);

create or replace function public.prevent_protected_vyral_storage_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.bucket_id = 'vyral-assets'
     and (
       (storage.foldername(old.name))[2] = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'
       or exists (
         select 1
         from public.vyrals v
         where v.id::text = (storage.foldername(old.name))[2]
           and coalesce(v.metadata ->> 'protected', 'false') = 'true'
       )
     )
  then
    raise exception 'Protected Vyral assets cannot be deleted from Storage'
      using errcode = '55000';
  end if;

  return old;
end;
$$;
