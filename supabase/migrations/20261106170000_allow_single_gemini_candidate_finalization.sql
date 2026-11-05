-- Allow the one already-uploaded ORIGIN-01 Gemini reconstruction candidate
-- to finish its interrupted upload state without weakening ORIGIN-01 protection.
--
-- This is a one-time, exact-record exception:
-- - only the known candidate asset ID is eligible
-- - Vyral/user/path/size/hash/original filename and all metadata stay immutable
-- - only the display name and processing_status may change
-- - only the uploading -> ready transition is accepted
-- - original ORIGIN-01 asset and all version records remain immutable

create or replace function public.prevent_protected_vyral_asset_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
declare
  target_vyral_id uuid;
  candidate_asset_id constant uuid := 'a40f067c-0ed1-4b93-814f-4f2f925ff320'::uuid;
  origin_vyral_id constant uuid := 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d'::uuid;
  owner_user_id constant uuid := 'c9801424-1e4d-4604-99d3-791a8a389b48'::uuid;
  candidate_sha constant text := 'e21a2c83844bd2bd349892456084ca400667109be8b2e428c8350479df4811de';
  candidate_path constant text := 'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/a40f067c-0ed1-4b93-814f-4f2f925ff320/v1/1793919320997.jpg';
  candidate_name constant text := 'ORIGIN-01 — Gemini Blind Reconstruction Candidate';
begin
  target_vyral_id := (to_jsonb(old) ->> 'vyral_id')::uuid;

  if tg_table_name = 'vyral_assets'
     and old.id = candidate_asset_id
     and old.vyral_id = origin_vyral_id
     and old.user_id = owner_user_id
     and old.original_filename = '1793919320997.jpg'
     and old.storage_path = candidate_path
     and old.mime_type = 'image/jpeg'
     and old.size_bytes = 47326
     and old.sha256 = candidate_sha
     and old.processing_status = 'uploading'
     and new.name = candidate_name
     and new.processing_status = 'ready'
     and (to_jsonb(old) - array['name', 'processing_status', 'updated_at'])
         = (to_jsonb(new) - array['name', 'processing_status', 'updated_at'])
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
