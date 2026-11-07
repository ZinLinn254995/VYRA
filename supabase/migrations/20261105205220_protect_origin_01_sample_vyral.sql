-- Protect the foundational ORIGIN-01 validation sample from accidental deletion.
-- Keep the database guard even if the client UI is bypassed.
create or replace function public.prevent_protected_vyral_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid
     or coalesce(old.metadata ->> 'protected', 'false') = 'true' then
    raise exception using
      errcode = '55000',
      message = 'This Vyral is protected from deletion. Remove its protection only through an intentional maintenance procedure.';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_protected_vyral_delete() from public, anon, authenticated;

drop trigger if exists protect_origin_01_from_delete on public.vyrals;
create trigger protect_origin_01_from_delete
before delete on public.vyrals
for each row execute function public.prevent_protected_vyral_delete();

update public.vyrals
set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('protected', true, 'protected_reason', 'Foundational ORIGIN-01 validation sample'),
    updated_at = now()
where id = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d';
