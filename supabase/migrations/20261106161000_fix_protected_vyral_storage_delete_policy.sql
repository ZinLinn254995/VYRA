-- Fix the protected Vyral Storage delete policy to reference the outer
-- storage.objects row explicitly (avoid resolving "name" to the inner Vyrals row).
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
