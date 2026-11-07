-- Allow the one explicitly designated ORIGIN-01 DNA-only package test upload
-- to move from uploading to ready after its File DNA v1 record is verified.
-- All identity, source, ownership, and content fields remain immutable.
create or replace function public.prevent_protected_vyral_asset_update()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  target_vyral_id uuid;
  origin_vyral_id constant uuid := 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid;
  owner_user_id constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48';
  file_test_asset_id constant text := 'd2985616-36f4-4369-ab52-1ee5b63b027b';
  file_test_sha constant text := 'f4abd0f4535116dc3024bde89c04712ced6ec5d6d6fcd48d0cbb034f8ebc81a8';
  file_test_path constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/d2985616-36f4-4369-ab52-1ee5b63b027b/v1/ORIGIN-01-DNA-ONLY-TEST.vyral';
begin
  target_vyral_id := nullif(old_row ->> 'vyral_id', '')::uuid;

  -- Exact File DNA test asset: permit only the processing-status transition.
  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = file_test_asset_id
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'ORIGIN-01-DNA-ONLY-TEST.vyral'
     and old_row ->> 'original_filename' = 'ORIGIN-01-DNA-ONLY-TEST.vyral'
     and old_row ->> 'asset_type' = 'other'
     and old_row ->> 'mime_type' = 'application/octet-stream'
     and old_row ->> 'size_bytes' = '4764407'
     and old_row ->> 'sha256' = file_test_sha
     and old_row ->> 'storage_path' = file_test_path
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['processing_status', 'updated_at'])
         = (new_row - array['processing_status', 'updated_at'])
  then return new;
  end if;

  -- Keep the previously approved, exact Gemini candidate finalization exception.
  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = 'a40f067c-0ed1-4b93-814f-4f2f925ff320'
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'original_filename' = '1793919320997.jpg'
     and old_row ->> 'storage_path' = 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a40f067c-0ed1-4b93-814f-4f2f925ff320/v1/1793919320997.jpg'
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '47326'
     and old_row ->> 'sha256' = 'e21a2c83844bd2bd349892456084ca400667109be8b2e428c8350479df4811de'
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'name' = 'ORIGIN-01 — Gemini Blind Reconstruction Candidate'
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['name', 'processing_status', 'updated_at'])
         = (new_row - array['name', 'processing_status', 'updated_at'])
  then return new;
  end if;

  -- Keep the previously approved, exact Grok candidate finalization/rename exceptions.
  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = 'a63edc73-0247-4477-84b9-f942080de694'
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'grok_1793922421242.jpg'
     and old_row ->> 'original_filename' = 'grok_1793922421242.jpg'
     and old_row ->> 'storage_path' = 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a63edc73-0247-4477-84b9-f942080de694/v1/grok_1793922421242.jpg'
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '59278'
     and old_row ->> 'sha256' = 'a0952c39579de6cc8df27c3b73a894a6f1725e237b5329c9a42f0f729174ec10'
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['processing_status', 'updated_at'])
         = (new_row - array['processing_status', 'updated_at'])
  then return new;
  end if;

  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = 'a63edc73-0247-4477-84b9-f942080de694'
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'grok_1793922421242.jpg'
     and old_row ->> 'original_filename' = 'grok_1793922421242.jpg'
     and old_row ->> 'storage_path' = 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a63edc73-0247-4477-84b9-f942080de694/v1/grok_1793922421242.jpg'
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '59278'
     and old_row ->> 'sha256' = 'a0952c39579de6cc8df27c3b73a894a6f1725e237b5329c9a42f0f729174ec10'
     and old_row ->> 'processing_status' = 'ready'
     and new_row ->> 'name' = 'ORIGIN-01 — Grok Blind Reconstruction Candidate'
     and (old_row - array['name', 'updated_at'])
         = (new_row - array['name', 'updated_at'])
  then return new;
  end if;

  -- Keep the previously approved, exact Claude candidate finalization exception.
  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23'
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'ORIGIN-01-blind-reconstruction.png'
     and old_row ->> 'original_filename' = 'ORIGIN-01-blind-reconstruction.png'
     and old_row ->> 'storage_path' = 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23/v1/ORIGIN-01-blind-reconstruction.png'
     and old_row ->> 'mime_type' = 'image/png'
     and old_row ->> 'size_bytes' = '27530'
     and old_row ->> 'sha256' = 'c8cb6e177ae3dafd31e7e6230e73976db3c9ae9ca9d46f341cb036370e008a34'
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'name' = 'ORIGIN-01 — Claude Blind Reconstruction Candidate'
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['name', 'processing_status', 'updated_at'])
         = (new_row - array['name', 'processing_status', 'updated_at'])
  then return new;
  end if;

  if target_vyral_id = origin_vyral_id
     or exists (
       select 1 from public.vyrals v
       where v.id = target_vyral_id
         and coalesce(v.metadata ->> 'protected', 'false') = 'true'
     )
  then
    raise exception using
      errcode = '55000',
      message = 'This Vyral is protected. Its original asset and version records are immutable.';
  end if;

  return new;
end;
$function$;
