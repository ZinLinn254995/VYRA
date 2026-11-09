create table if not exists public.vyral_collection_references (
  id uuid primary key default gen_random_uuid(),
  destination_vyral_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_vyral_id uuid not null,
  source_revision integer not null check (source_revision > 0),
  source_schema_id text not null check (source_schema_id = 'vyra.vyral-master-dna'),
  source_schema_version integer not null check (source_schema_version = 1),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  projection_sha256 text not null check (projection_sha256 ~ '^[a-f0-9]{64}$'),
  source_visibility text not null check (source_visibility in ('public','private','unlisted')),
  resolver_uri text,
  compact_snapshot jsonb not null check (jsonb_typeof(compact_snapshot) = 'object'),
  imported_at timestamptz not null default now(),
  constraint vyral_collection_references_destination_owner_fk
    foreign key (destination_vyral_id,user_id)
    references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_collection_references_source_revision_unique
    unique (destination_vyral_id,user_id,source_vyral_id,source_revision),
  constraint vyral_collection_references_resolver_uri_check
    check (
      resolver_uri is null or
      resolver_uri ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/resolve-public-vyral-resource$'
    ),
  constraint vyral_collection_references_snapshot_identity_check
    check (
      compact_snapshot->>'schema_id' = source_schema_id and
      (compact_snapshot->>'schema_version')::integer = source_schema_version and
      (compact_snapshot->'vyral'->>'vyral_id')::uuid = source_vyral_id and
      (compact_snapshot->'snapshot'->>'revision')::integer = source_revision
    )
);

create index if not exists vyral_collection_references_destination_idx
  on public.vyral_collection_references(destination_vyral_id,user_id,imported_at desc);

alter table public.vyral_collection_references enable row level security;

drop policy if exists "vyral_collection_references_select_own" on public.vyral_collection_references;
drop policy if exists "vyral_collection_references_insert_own" on public.vyral_collection_references;
drop policy if exists "vyral_collection_references_delete_own" on public.vyral_collection_references;

create policy "vyral_collection_references_select_own"
  on public.vyral_collection_references for select to authenticated
  using (user_id = (select auth.uid()));

create policy "vyral_collection_references_insert_own"
  on public.vyral_collection_references for insert to authenticated
  with check (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.vyrals v
      where v.id = destination_vyral_id and v.user_id = (select auth.uid())
    )
  );

create policy "vyral_collection_references_delete_own"
  on public.vyral_collection_references for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.vyral_collection_references from anon, authenticated;
grant select, insert, delete on public.vyral_collection_references to authenticated;

comment on table public.vyral_collection_references is
  'Imported compact Vyral collection references. These are not Assets and never imply source ownership or source retrieval authorization.';
