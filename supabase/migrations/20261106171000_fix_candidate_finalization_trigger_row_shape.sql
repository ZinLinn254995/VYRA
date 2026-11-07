-- Correct the one-time Gemini candidate exception so the shared trigger
-- remains safe for both vyral_assets and vyral_asset_versions row shapes.
-- JSON row access avoids referencing asset-only columns on version records.

create or replace function public.prevent_protected_vyral_asset_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  target_vyral_id uuid;
  candidate_asset_id constant text := 'a40f067c-0ed1-4b93-814f-4f2f925ff320';
  origin_vyral_id constant uuid := 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid;
  owner_user_id constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48';
  candidate_sha constant text := 'e21a2c83844bd2bd349892456084ca400667109be8b2e428c8350479df4811de';
  candidate_path constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a40f067c-0ed1-4b93-814f-4f2f925ff320/v1/1793919320997.jpg';
  candidate_name constant text := 'ORIGIN-01 — Gemini Blind Reconstruction Candidate';
begin
  target_vyral_id := nullif(old_row ->> 'vyral_id', '')::uuid;

  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = candidate_asset_id
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'original_filename' = '1793919320997.jpg'
     and old_row ->> 'storage_path' = candidate_path
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '47326'
     and old_row ->> 'sha256' = candidate_sha
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'name' = candidate_name
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['name', 'processing_status', 'updated_at'])
         = (new_row - array['name', 'processing_status', 'updated_at'])
  then
    return new;
  end if;

  if target_vyral_id = origin_vyral_id
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
