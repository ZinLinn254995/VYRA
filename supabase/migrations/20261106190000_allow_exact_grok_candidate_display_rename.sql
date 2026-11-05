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
  gemini_candidate_id constant text := 'a40f067c-0ed1-4b93-814f-4f2f925ff320';
  gemini_candidate_sha constant text := 'e21a2c83844bd2bd349892456084ca400667109be8b2e428c8350479df4811de';
  gemini_candidate_path constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a40f067c-0ed1-4b93-814f-4f2f925ff320/v1/1793919320997.jpg';
  gemini_candidate_name constant text := 'ORIGIN-01 — Gemini Blind Reconstruction Candidate';
  grok_candidate_id constant text := 'a63edc73-0247-4477-84b9-f942080de694';
  grok_candidate_sha constant text := 'a0952c39579de6cc8df27c3b73a894a6f1725e237b5329c9a42f0f729174ec10';
  grok_candidate_path constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a63edc73-0247-4477-84b9-f942080de694/v1/grok_1793922421242.jpg';
  grok_candidate_display_name constant text := 'ORIGIN-01 — Grok Blind Reconstruction Candidate';
begin
  target_vyral_id := nullif(old_row ->> 'vyral_id', '')::uuid;

  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = gemini_candidate_id
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'original_filename' = '1793919320997.jpg'
     and old_row ->> 'storage_path' = gemini_candidate_path
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '47326'
     and old_row ->> 'sha256' = gemini_candidate_sha
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'name' = gemini_candidate_name
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['name', 'processing_status', 'updated_at'])
         = (new_row - array['name', 'processing_status', 'updated_at'])
  then return new;
  end if;

  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = grok_candidate_id
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'grok_1793922421242.jpg'
     and old_row ->> 'original_filename' = 'grok_1793922421242.jpg'
     and old_row ->> 'storage_path' = grok_candidate_path
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '59278'
     and old_row ->> 'sha256' = grok_candidate_sha
     and old_row ->> 'processing_status' = 'uploading'
     and new_row ->> 'processing_status' = 'ready'
     and (old_row - array['processing_status', 'updated_at'])
         = (new_row - array['processing_status', 'updated_at'])
  then return new;
  end if;

  -- Permit only a display-name change on the exact, ready Grok candidate.
  -- Upload filename, storage path, bytes metadata, ownership and status stay immutable.
  if tg_table_name = 'vyral_assets'
     and old_row ->> 'id' = grok_candidate_id
     and old_row ->> 'vyral_id' = origin_vyral_id::text
     and old_row ->> 'user_id' = owner_user_id
     and old_row ->> 'name' = 'grok_1793922421242.jpg'
     and old_row ->> 'original_filename' = 'grok_1793922421242.jpg'
     and old_row ->> 'storage_path' = grok_candidate_path
     and old_row ->> 'mime_type' = 'image/jpeg'
     and old_row ->> 'size_bytes' = '59278'
     and old_row ->> 'sha256' = grok_candidate_sha
     and old_row ->> 'processing_status' = 'ready'
     and new_row ->> 'name' = grok_candidate_display_name
     and (old_row - array['name', 'updated_at'])
         = (new_row - array['name', 'updated_at'])
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
