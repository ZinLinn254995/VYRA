-- VYRAL collection, asset identity, DNA, fingerprint and reconstruction foundation.
-- Applied first to the isolated VYRA Development Supabase project.
-- Binary media is stored in the private Storage bucket; Postgres stores metadata only.

create table if not exists public.vyrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  visibility text not null default 'private' check (visibility in ('private','unlisted','public')),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','active','archived')),
  dna_status text not null default 'evolving' check (dna_status in ('evolving','reconstruction_tested','high_fidelity','exact_reconstruction_verified','not_recoverable')),
  dna_schema_version integer not null default 1 check (dna_schema_version > 0),
  license_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(license_policy) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyrals_id_user_unique unique (id,user_id)
);
create index if not exists vyrals_user_updated_idx on public.vyrals(user_id,updated_at desc);

create table if not exists public.vyral_folders (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint vyral_folders_owner_fk foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_folders_id_scope_unique unique (id,vyral_id,user_id),
  constraint vyral_folders_parent_fk foreign key (parent_id,vyral_id,user_id) references public.vyral_folders(id,vyral_id,user_id) on delete cascade
);
create unique index if not exists vyral_folders_root_name_unique on public.vyral_folders(vyral_id,user_id,lower(name)) where parent_id is null;
create unique index if not exists vyral_folders_child_name_unique on public.vyral_folders(vyral_id,user_id,parent_id,lower(name)) where parent_id is not null;

create table if not exists public.vyral_assets (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  folder_id uuid,
  name text not null check (char_length(name) between 1 and 180),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  asset_type text not null check (asset_type in ('image','video','audio','document','model_3d','archive','other')),
  mime_type text not null check (char_length(mime_type) between 1 and 160),
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  processing_status text not null default 'ready' check (processing_status in ('uploading','ready','processing','failed','archived')),
  description text not null default '' check (char_length(description) <= 2000),
  license_override jsonb not null default '{}'::jsonb check (jsonb_typeof(license_override) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vyral_assets_owner_fk foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_assets_folder_fk foreign key (folder_id,vyral_id,user_id) references public.vyral_folders(id,vyral_id,user_id) on delete set null (folder_id),
  constraint vyral_assets_id_scope_unique unique (id,vyral_id,user_id),
  constraint vyral_assets_id_user_unique unique (id,user_id),
  constraint vyral_assets_storage_path_unique unique (storage_path)
);
create index if not exists vyral_assets_scope_created_idx on public.vyral_assets(vyral_id,user_id,created_at desc);
create index if not exists vyral_assets_folder_idx on public.vyral_assets(folder_id) where folder_id is not null;

create table if not exists public.vyral_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  vyral_id uuid not null,
  user_id uuid not null,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  source_kind text not null default 'original' check (source_kind in ('original','generated','edited','restored','derived')),
  parent_version_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint vyral_asset_versions_asset_fk foreign key (asset_id,vyral_id,user_id) references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_versions_parent_fk foreign key (parent_version_id,asset_id,user_id) references public.vyral_asset_versions(id,asset_id,user_id),
  constraint vyral_asset_versions_number_unique unique (asset_id,version_number),
  constraint vyral_asset_versions_scope_unique unique (id,asset_id,user_id),
  constraint vyral_asset_versions_storage_unique unique (storage_path)
);
create index if not exists vyral_asset_versions_asset_idx on public.vyral_asset_versions(asset_id,version_number desc);

create table if not exists public.vyral_dna_records (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  asset_id uuid,
  scope text not null check (scope in ('vyral','asset')),
  schema_version integer not null default 1 check (schema_version > 0),
  dna_status text not null default 'evolving' check (dna_status in ('evolving','reconstruction_tested','high_fidelity','exact_reconstruction_verified','not_recoverable')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  reconstruction_data jsonb not null default '{}'::jsonb check (jsonb_typeof(reconstruction_data) = 'object'),
  source_kind text not null check (source_kind in ('creator','generation','vision','audio_analysis','user_report','community','system','verification')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','observed','corroborated','creator_confirmed','independently_verified','disputed')),
  created_at timestamptz not null default now(),
  constraint vyral_dna_scope_check check ((scope = 'vyral' and asset_id is null) or (scope = 'asset' and asset_id is not null)),
  constraint vyral_dna_owner_fk foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_dna_asset_fk foreign key (asset_id,vyral_id,user_id) references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_dna_id_scope_unique unique (id,vyral_id,user_id)
);
create index if not exists vyral_dna_latest_idx on public.vyral_dna_records(vyral_id,asset_id,created_at desc);

create table if not exists public.vyral_fingerprints (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  asset_version_id uuid,
  user_id uuid not null,
  fingerprint_kind text not null check (fingerprint_kind in ('cryptographic','perceptual','semantic','structural')),
  algorithm text not null check (char_length(algorithm) between 1 and 120),
  value text not null check (char_length(value) between 1 and 20000),
  model_provider text,
  model_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint vyral_fingerprints_asset_fk foreign key (asset_id,user_id) references public.vyral_assets(id,user_id) on delete cascade,
  constraint vyral_fingerprints_version_fk foreign key (asset_version_id,asset_id,user_id) references public.vyral_asset_versions(id,asset_id,user_id) on delete cascade
);
create index if not exists vyral_fingerprints_lookup_idx on public.vyral_fingerprints(fingerprint_kind,algorithm,created_at desc);

create table if not exists public.vyral_vision_observations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  asset_version_id uuid,
  user_id uuid not null,
  task_kind text not null check (task_kind in ('identity','description','consistency','generation_context','reconstruction','safety','other')),
  model_provider text not null,
  model_id text not null,
  observation jsonb not null check (jsonb_typeof(observation) = 'object'),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  verification_status text not null default 'observed' check (verification_status in ('unverified','observed','corroborated','creator_confirmed','independently_verified','disputed')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint vyral_vision_asset_fk foreign key (asset_id,user_id) references public.vyral_assets(id,user_id) on delete cascade,
  constraint vyral_vision_version_fk foreign key (asset_version_id,asset_id,user_id) references public.vyral_asset_versions(id,asset_id,user_id) on delete cascade
);
create index if not exists vyral_vision_asset_created_idx on public.vyral_vision_observations(asset_id,created_at desc);

create table if not exists public.vyral_lineage (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  parent_asset_id uuid not null,
  child_asset_id uuid not null,
  relation_kind text not null check (relation_kind in ('generated_from','edited_from','derived_from','variant_of','restored_from','reference_for')),
  generation_job_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint vyral_lineage_not_self check (parent_asset_id <> child_asset_id),
  constraint vyral_lineage_vyral_fk foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_lineage_parent_fk foreign key (parent_asset_id,vyral_id,user_id) references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_lineage_child_fk foreign key (child_asset_id,vyral_id,user_id) references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_lineage_unique unique (parent_asset_id,child_asset_id,relation_kind)
);
create index if not exists vyral_lineage_child_idx on public.vyral_lineage(child_asset_id,created_at desc);

create table if not exists public.vyral_reconstruction_tests (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  asset_id uuid not null,
  asset_version_id uuid,
  dna_record_id uuid not null,
  model_provider text not null,
  model_id text not null,
  protocol_version text not null default '1',
  comparison_mode text not null check (comparison_mode in ('byte_exact','decoded_exact','perceptual')),
  test_status text not null default 'queued' check (test_status in ('queued','running','passed','failed','inconclusive')),
  exact_match boolean,
  similarity_score numeric(8,7) check (similarity_score is null or similarity_score between 0 and 1),
  verifier jsonb not null default '{}'::jsonb check (jsonb_typeof(verifier) = 'object'),
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object'),
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vyral_reconstruction_asset_fk foreign key (asset_id,vyral_id,user_id) references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_reconstruction_version_fk foreign key (asset_version_id,asset_id,user_id) references public.vyral_asset_versions(id,asset_id,user_id) on delete cascade,
  constraint vyral_reconstruction_dna_fk foreign key (dna_record_id,vyral_id,user_id) references public.vyral_dna_records(id,vyral_id,user_id) on delete cascade
);
create index if not exists vyral_reconstruction_asset_idx on public.vyral_reconstruction_tests(asset_id,created_at desc);

create or replace function public.set_vyral_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger vyrals_set_updated_at before update on public.vyrals for each row execute function public.set_vyral_updated_at();
create trigger vyral_assets_set_updated_at before update on public.vyral_assets for each row execute function public.set_vyral_updated_at();

alter table public.vyrals enable row level security;
alter table public.vyral_folders enable row level security;
alter table public.vyral_assets enable row level security;
alter table public.vyral_asset_versions enable row level security;
alter table public.vyral_dna_records enable row level security;
alter table public.vyral_fingerprints enable row level security;
alter table public.vyral_vision_observations enable row level security;
alter table public.vyral_lineage enable row level security;
alter table public.vyral_reconstruction_tests enable row level security;

create policy "vyrals_select_own" on public.vyrals for select to authenticated using (user_id = (select auth.uid()));
create policy "vyrals_insert_own" on public.vyrals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyrals_update_own" on public.vyrals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "vyrals_delete_own" on public.vyrals for delete to authenticated using (user_id = (select auth.uid()));

create policy "vyral_folders_select_own" on public.vyral_folders for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_folders_insert_own" on public.vyral_folders for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_folders_update_own" on public.vyral_folders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "vyral_folders_delete_own" on public.vyral_folders for delete to authenticated using (user_id = (select auth.uid()));

create policy "vyral_assets_select_own" on public.vyral_assets for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_assets_insert_own" on public.vyral_assets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_assets_update_own" on public.vyral_assets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "vyral_assets_delete_own" on public.vyral_assets for delete to authenticated using (user_id = (select auth.uid()));

create policy "vyral_asset_versions_select_own" on public.vyral_asset_versions for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_asset_versions_insert_own" on public.vyral_asset_versions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_dna_records_select_own" on public.vyral_dna_records for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_dna_records_insert_own" on public.vyral_dna_records for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_fingerprints_select_own" on public.vyral_fingerprints for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_fingerprints_insert_own" on public.vyral_fingerprints for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_vision_observations_select_own" on public.vyral_vision_observations for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_vision_observations_insert_own" on public.vyral_vision_observations for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_lineage_select_own" on public.vyral_lineage for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_lineage_insert_own" on public.vyral_lineage for insert to authenticated with check (user_id = (select auth.uid()));
create policy "vyral_reconstruction_tests_select_own" on public.vyral_reconstruction_tests for select to authenticated using (user_id = (select auth.uid()));
create policy "vyral_reconstruction_tests_insert_own" on public.vyral_reconstruction_tests for insert to authenticated with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.vyrals, public.vyral_folders, public.vyral_assets to authenticated;
grant select, insert on public.vyral_asset_versions, public.vyral_dna_records, public.vyral_fingerprints, public.vyral_vision_observations, public.vyral_lineage, public.vyral_reconstruction_tests to authenticated;

insert into storage.buckets (id,name,public,file_size_limit)
values ('vyral-assets','vyral-assets',false,104857600)
on conflict (id) do nothing;
create policy "vyral_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'vyral-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "vyral_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'vyral-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "vyral_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'vyral-assets' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'vyral-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "vyral_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'vyral-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));

comment on table public.vyrals is 'Creator-owned VYRAL collections and collection-level DNA identity.';
comment on table public.vyral_assets is 'Creator-owned asset metadata; binary media is stored in the private vyral-assets bucket.';
comment on table public.vyral_dna_records is 'Append-only structured Knowledge DNA records. Exact reconstruction must be independently tested.';
comment on table public.vyral_fingerprints is 'Append-only cryptographic, perceptual, semantic and structural asset fingerprints.';
comment on table public.vyral_vision_observations is 'Append-only evidence-based observations from AI Vision or other analysis models.';
comment on table public.vyral_reconstruction_tests is 'Independent DNA-only reconstruction test results; similarity is not exact identity.';
