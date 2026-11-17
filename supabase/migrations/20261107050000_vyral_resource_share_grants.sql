-- Revocable, revision-pinned Vyral resource grants.
-- This migration creates the authorization data model only. It does not enable
-- third-party access or change the owner-only resolver behavior.

create table if not exists public.vyral_resource_share_grants (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  master_dna_revision_id uuid not null,
  recipient_kind text not null check (recipient_kind in ('external_ai','user')),
  recipient_ref text not null check (char_length(btrim(recipient_ref)) between 1 and 255),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['master:read','asset_dna:read','asset_source:download']::text[]
  ),
  asset_id uuid,
  asset_version_id uuid,
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  constraint vyral_resource_share_grants_scope_shape_check check (
    (
      scopes && array['asset_dna:read','asset_source:download']::text[]
      and asset_id is not null
      and asset_version_id is not null
    )
    or
    (
      not (scopes && array['asset_dna:read','asset_source:download']::text[])
      and asset_id is null
      and asset_version_id is null
    )
  ),
  constraint vyral_resource_share_grants_revocation_shape_check check (
    (status = 'active' and revoked_at is null and revoked_by is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by is not null)
  ),
  constraint vyral_resource_share_grants_owner_fk
    foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete restrict,
  constraint vyral_resource_share_grants_revision_fk
    foreign key (master_dna_revision_id,vyral_id,user_id)
    references public.vyral_master_dna_revisions(id,vyral_id,user_id) on delete restrict,
  constraint vyral_resource_share_grants_asset_fk
    foreign key (asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete restrict,
  constraint vyral_resource_share_grants_version_fk
    foreign key (asset_version_id) references public.vyral_asset_versions(id) on delete restrict,
  constraint vyral_resource_share_grants_creator_fk
    foreign key (created_by) references auth.users(id) on delete restrict,
  constraint vyral_resource_share_grants_revoker_fk
    foreign key (revoked_by) references auth.users(id) on delete restrict,
  constraint vyral_resource_share_grants_id_scope_unique unique (id,vyral_id,user_id)
);

create index if not exists vyral_resource_share_grants_owner_status_idx
  on public.vyral_resource_share_grants(user_id,vyral_id,status,created_at desc);
create index if not exists vyral_resource_share_grants_recipient_idx
  on public.vyral_resource_share_grants(recipient_kind,recipient_ref,status);
create index if not exists vyral_resource_share_grants_revision_idx
  on public.vyral_resource_share_grants(master_dna_revision_id,status);
create index if not exists vyral_resource_share_grants_asset_idx
  on public.vyral_resource_share_grants(asset_id) where asset_id is not null;
create index if not exists vyral_resource_share_grants_asset_version_idx
  on public.vyral_resource_share_grants(asset_version_id) where asset_version_id is not null;
create index if not exists vyral_resource_share_grants_creator_idx
  on public.vyral_resource_share_grants(created_by);
create index if not exists vyral_resource_share_grants_revoker_idx
  on public.vyral_resource_share_grants(revoked_by) where revoked_by is not null;

-- Only a one-way SHA-256 digest is persisted. The bearer token itself is returned
-- once by a future trusted creation endpoint and is never stored in the database.
create table if not exists public.vyral_resource_share_tokens (
  grant_id uuid primary key,
  token_sha256 text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz,
  constraint vyral_resource_share_tokens_grant_fk
    foreign key (grant_id) references public.vyral_resource_share_grants(id) on delete restrict
);

create table if not exists public.vyral_resource_share_audit (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null,
  vyral_id uuid not null,
  user_id uuid not null,
  event_type text not null check (event_type in ('created','revoked','token_used','denied')),
  actor_ref text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  constraint vyral_resource_share_audit_grant_fk
    foreign key (grant_id,vyral_id,user_id)
    references public.vyral_resource_share_grants(id,vyral_id,user_id) on delete restrict
);

create index if not exists vyral_resource_share_audit_owner_idx
  on public.vyral_resource_share_audit(user_id,vyral_id,created_at desc);
create index if not exists vyral_resource_share_audit_grant_idx
  on public.vyral_resource_share_audit(grant_id,created_at desc);

-- Pinned grant scope and recipient are immutable. The only owner-side mutation is
-- active -> revoked through the narrowly scoped RPC below.
create or replace function public.validate_vyral_resource_share_grant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pinned_asset jsonb;
begin
  if new.created_by <> new.user_id then
    raise exception using errcode = '42501',
      message = 'A resource share grant must be created by its Vyral owner.';
  end if;

  if new.expires_at is not null and new.expires_at <= now() then
    raise exception using errcode = '23514',
      message = 'A resource share grant expiry must be in the future.';
  end if;

  if new.asset_id is not null then
    select item into pinned_asset
    from public.vyral_master_dna_revisions revision
    cross join lateral jsonb_array_elements(revision.snapshot -> 'assets') as items(item)
    where revision.id = new.master_dna_revision_id
      and revision.vyral_id = new.vyral_id
      and revision.user_id = new.user_id
      and item ->> 'asset_id' = new.asset_id::text
      and item ->> 'asset_version_id' = new.asset_version_id::text
    limit 1;

    if pinned_asset is null then
      raise exception using errcode = '23514',
        message = 'The granted Asset version must be present in the pinned Master DNA revision.';
    end if;

    if not exists (
      select 1 from public.vyral_asset_versions version
      where version.id = new.asset_version_id
        and version.asset_id = new.asset_id
        and version.vyral_id = new.vyral_id
        and version.user_id = new.user_id
    ) then
      raise exception using errcode = '23514',
        message = 'The granted Asset version must belong to the same Vyral and owner.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_vyral_resource_share_grant_insert() from public, anon, authenticated;
drop trigger if exists vyral_resource_share_grant_validate_insert on public.vyral_resource_share_grants;
create trigger vyral_resource_share_grant_validate_insert
before insert on public.vyral_resource_share_grants
for each row execute function public.validate_vyral_resource_share_grant_insert();

create or replace function public.prevent_vyral_resource_share_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'Resource share audit events are immutable.';
end;
$$;

revoke all on function public.prevent_vyral_resource_share_audit_mutation() from public, anon, authenticated;
drop trigger if exists vyral_resource_share_audit_immutable on public.vyral_resource_share_audit;
create trigger vyral_resource_share_audit_immutable
before update or delete on public.vyral_resource_share_audit
for each row execute function public.prevent_vyral_resource_share_audit_mutation();

create or replace function public.guard_vyral_resource_share_grant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.vyral_id is distinct from old.vyral_id
     or new.user_id is distinct from old.user_id
     or new.master_dna_revision_id is distinct from old.master_dna_revision_id
     or new.recipient_kind is distinct from old.recipient_kind
     or new.recipient_ref is distinct from old.recipient_ref
     or new.scopes is distinct from old.scopes
     or new.asset_id is distinct from old.asset_id
     or new.asset_version_id is distinct from old.asset_version_id
     or new.expires_at is distinct from old.expires_at
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '55000',
      message = 'Vyral resource share grant scope is immutable; create a new grant instead.';
  end if;

  if old.status <> 'active' or new.status <> 'revoked'
     or new.revoked_at is null or new.revoked_by is null then
    raise exception using errcode = '55000',
      message = 'A resource share grant may only transition once from active to revoked.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_vyral_resource_share_grant_update() from public, anon, authenticated;
drop trigger if exists vyral_resource_share_grant_immutable_scope on public.vyral_resource_share_grants;
create trigger vyral_resource_share_grant_immutable_scope
before update on public.vyral_resource_share_grants
for each row execute function public.guard_vyral_resource_share_grant_update();

create or replace function public.revoke_vyral_resource_share_grant(p_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'A signed-in VYRA owner is required.';
  end if;

  update public.vyral_resource_share_grants g
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = auth.uid()
  where g.id = p_grant_id
    and g.user_id = auth.uid()
    and g.status = 'active'
  returning g.id into affected_id;

  if affected_id is null then
    return false;
  end if;

  insert into public.vyral_resource_share_audit
    (grant_id,vyral_id,user_id,event_type,actor_ref,details)
  select g.id,g.vyral_id,g.user_id,'revoked',auth.uid()::text,
    jsonb_build_object('revocation','owner_requested')
  from public.vyral_resource_share_grants g
  where g.id = affected_id;

  update public.vyral_resource_share_tokens
  set disabled_at = now()
  where grant_id = affected_id and disabled_at is null;

  return true;
end;
$$;

revoke all on function public.revoke_vyral_resource_share_grant(uuid) from public, anon;
grant execute on function public.revoke_vyral_resource_share_grant(uuid) to authenticated;

alter table public.vyral_resource_share_grants enable row level security;
alter table public.vyral_resource_share_tokens enable row level security;
alter table public.vyral_resource_share_audit enable row level security;

create policy "vyral_resource_share_grants_select_own"
  on public.vyral_resource_share_grants for select to authenticated
  using (user_id = (select auth.uid()));

create policy "vyral_resource_share_audit_select_own"
  on public.vyral_resource_share_audit for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.vyral_resource_share_grants from public, anon, authenticated;
grant select on public.vyral_resource_share_grants to authenticated;
grant select, insert, update on public.vyral_resource_share_grants to service_role;

revoke all on public.vyral_resource_share_tokens from public, anon, authenticated;
grant all on public.vyral_resource_share_tokens to service_role;

revoke all on public.vyral_resource_share_audit from public, anon, authenticated;
grant select on public.vyral_resource_share_audit to authenticated;
grant select, insert on public.vyral_resource_share_audit to service_role;

comment on table public.vyral_resource_share_grants is
  'Owner-created, immutable-scope grants pinned to one Master DNA revision and optional exact Asset version. Third-party retrieval remains disabled until resolver enforcement is implemented.';
comment on table public.vyral_resource_share_tokens is
  'Service-role-only SHA-256 token digests; raw bearer tokens are never persisted.';
comment on table public.vyral_resource_share_audit is
  'Append-only owner-visible audit events for resource share grants; never store bearer tokens or signed URLs.';
