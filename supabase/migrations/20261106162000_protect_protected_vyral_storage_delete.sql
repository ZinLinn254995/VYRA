-- Defense in depth: block deletion of protected Vyral objects even when a
-- caller reaches Storage with elevated database privileges. This complements
-- the Storage RLS policy and the asset/version delete triggers.

create or replace function public.prevent_protected_vyral_storage_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.bucket_id = 'vyral-assets'
     and exists (
       select 1
       from public.vyrals v
       where v.id::text = (storage.foldername(old.name))[2]
         and coalesce(v.metadata ->> 'protected', 'false') = 'true'
     )
  then
    raise exception 'Protected Vyral assets cannot be deleted from Storage'
      using errcode = '55000';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_protected_vyral_storage_delete on storage.objects;

create trigger prevent_protected_vyral_storage_delete
before delete on storage.objects
for each row
execute function public.prevent_protected_vyral_storage_delete();
