-- Prevent deletion of every asset and version inside a protected Vyral.
create or replace function public.prevent_protected_vyral_asset_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_vyral_id uuid;
begin
  target_vyral_id := (to_jsonb(old) ->> 'vyral_id')::uuid;

  if exists (
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

revoke all on function public.prevent_protected_vyral_asset_delete() from public, anon, authenticated;

drop trigger if exists protect_assets_in_protected_vyrals on public.vyral_assets;
create trigger protect_assets_in_protected_vyrals
before delete on public.vyral_assets
for each row execute function public.prevent_protected_vyral_asset_delete();

drop trigger if exists protect_asset_versions_in_protected_vyrals on public.vyral_asset_versions;
create trigger protect_asset_versions_in_protected_vyrals
before delete on public.vyral_asset_versions
for each row execute function public.prevent_protected_vyral_asset_delete();

-- Keep the existing owner-scoped delete policy, but deny database deletes
-- for assets that belong to a protected Vyral.
drop policy if exists vyral_assets_delete_own on public.vyral_assets;
create policy vyral_assets_delete_own
on public.vyral_assets
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and not exists (
    select 1
    from public.vyrals v
    where v.id = vyral_assets.vyral_id
      and coalesce(v.metadata ->> 'protected', 'false') = 'true'
  )
);

-- Storage object names are user_id/vyral_id/asset_id/version/filename.
-- Prevent deleting any original or versioned binary inside a protected Vyral.
drop policy if exists vyral_storage_delete_own on storage.objects;
create policy vyral_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vyral-assets'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.vyrals v
    where v.id::text = (storage.foldername(objects.name))[2]
      and coalesce(v.metadata ->> 'protected', 'false') = 'true'
  )
);
