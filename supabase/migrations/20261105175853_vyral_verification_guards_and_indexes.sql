-- Harden VYRAL verification boundaries and index composite ownership foreign keys.
-- Applied first to VYRA Development. Client-created DNA is never independently verified.

create index if not exists vyral_asset_versions_asset_owner_idx on public.vyral_asset_versions(asset_id,vyral_id,user_id);
create index if not exists vyral_asset_versions_parent_owner_idx on public.vyral_asset_versions(parent_version_id,asset_id,user_id) where parent_version_id is not null;
create index if not exists vyral_assets_folder_owner_idx on public.vyral_assets(folder_id,vyral_id,user_id) where folder_id is not null;
create index if not exists vyral_dna_asset_owner_idx on public.vyral_dna_records(asset_id,vyral_id,user_id) where asset_id is not null;
create index if not exists vyral_dna_vyral_owner_idx on public.vyral_dna_records(vyral_id,user_id);
create index if not exists vyral_fingerprints_asset_owner_idx on public.vyral_fingerprints(asset_id,user_id);
create index if not exists vyral_fingerprints_version_owner_idx on public.vyral_fingerprints(asset_version_id,asset_id,user_id) where asset_version_id is not null;
create index if not exists vyral_folders_parent_owner_idx on public.vyral_folders(parent_id,vyral_id,user_id) where parent_id is not null;
create index if not exists vyral_lineage_parent_owner_idx on public.vyral_lineage(parent_asset_id,vyral_id,user_id);
create index if not exists vyral_lineage_child_owner_idx on public.vyral_lineage(child_asset_id,vyral_id,user_id);
create index if not exists vyral_lineage_vyral_owner_idx on public.vyral_lineage(vyral_id,user_id);
create index if not exists vyral_reconstruction_asset_owner_idx on public.vyral_reconstruction_tests(asset_id,vyral_id,user_id);
create index if not exists vyral_reconstruction_version_owner_idx on public.vyral_reconstruction_tests(asset_version_id,asset_id,user_id) where asset_version_id is not null;
create index if not exists vyral_reconstruction_dna_owner_idx on public.vyral_reconstruction_tests(dna_record_id,vyral_id,user_id);
create index if not exists vyral_vision_asset_owner_idx on public.vyral_vision_observations(asset_id,user_id);
create index if not exists vyral_vision_version_owner_idx on public.vyral_vision_observations(asset_version_id,asset_id,user_id) where asset_version_id is not null;

revoke update on public.vyrals from authenticated;
grant update (name,description,visibility,lifecycle_status,license_policy,metadata) on public.vyrals to authenticated;
revoke update on public.vyral_assets from authenticated;
grant update (name,folder_id,processing_status,description,license_override,metadata) on public.vyral_assets to authenticated;

drop policy if exists "vyral_vision_observations_insert_own" on public.vyral_vision_observations;
revoke insert on public.vyral_vision_observations from authenticated;
drop policy if exists "vyral_reconstruction_tests_insert_own" on public.vyral_reconstruction_tests;
revoke insert on public.vyral_reconstruction_tests from authenticated;

create or replace function public.guard_vyral_dna_client_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.dna_status <> 'evolving' then
      raise exception 'DNA verification status is assigned only by the verification service';
    end if;
    if new.verification_status = 'independently_verified' then
      raise exception 'Independent verification cannot be self-asserted';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vyral_dna_client_insert_guard on public.vyral_dna_records;
create trigger vyral_dna_client_insert_guard before insert on public.vyral_dna_records
for each row execute function public.guard_vyral_dna_client_insert();
revoke all on function public.guard_vyral_dna_client_insert() from public, anon, authenticated, service_role;

create or replace function public.guard_vyral_fingerprint_client_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and (new.fingerprint_kind <> 'cryptographic' or upper(new.algorithm) <> 'SHA-256') then
    raise exception 'Perceptual, semantic and structural fingerprints must be created by trusted analysis services';
  end if;
  return new;
end;
$$;
drop trigger if exists vyral_fingerprint_client_insert_guard on public.vyral_fingerprints;
create trigger vyral_fingerprint_client_insert_guard before insert on public.vyral_fingerprints
for each row execute function public.guard_vyral_fingerprint_client_insert();
revoke all on function public.guard_vyral_fingerprint_client_insert() from public, anon, authenticated, service_role;

revoke all on function public.set_vyral_updated_at() from public, anon, authenticated, service_role;
