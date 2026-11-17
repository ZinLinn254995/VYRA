-- Immutable, version-pinned approval workflow for Asset DNA improvement plans.
create table if not exists public.vyral_asset_dna_improvement_proposals (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  asset_id uuid not null,
  asset_version_id uuid not null,
  dna_record_id uuid not null,
  assessment_id uuid not null unique references public.vyral_asset_dna_assessments(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  plan_version integer not null check (plan_version > 0),
  proposal_snapshot jsonb not null check (jsonb_typeof(proposal_snapshot) = 'object'),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','stale','applied')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  constraint vyral_asset_dna_proposal_asset_fk
    foreign key (asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_dna_proposal_version_fk
    foreign key (asset_version_id,asset_id,user_id)
    references public.vyral_asset_versions(id,asset_id,user_id) on delete cascade,
  constraint vyral_asset_dna_proposal_record_fk
    foreign key (dna_record_id,vyral_id,user_id)
    references public.vyral_dna_records(id,vyral_id,user_id) on delete cascade
);
create index if not exists vyral_asset_dna_proposals_owner_latest_idx
  on public.vyral_asset_dna_improvement_proposals(user_id,asset_id,created_at desc);
alter table public.vyral_asset_dna_improvement_proposals enable row level security;
revoke all on public.vyral_asset_dna_improvement_proposals from public, anon, authenticated;
grant select on public.vyral_asset_dna_improvement_proposals to authenticated;
grant select, insert, update on public.vyral_asset_dna_improvement_proposals to service_role;
create policy "vyral_asset_dna_improvement_proposals_select_own"
  on public.vyral_asset_dna_improvement_proposals for select to authenticated
  using (user_id = (select auth.uid()));
create or replace function public.guard_vyral_asset_dna_proposal_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.vyral_id <> old.vyral_id or new.user_id <> old.user_id
    or new.asset_id <> old.asset_id or new.asset_version_id <> old.asset_version_id
    or new.dna_record_id <> old.dna_record_id or new.assessment_id <> old.assessment_id
    or new.source_sha256 <> old.source_sha256 or new.plan_version <> old.plan_version
    or new.proposal_snapshot <> old.proposal_snapshot or new.created_at <> old.created_at then
    raise exception 'DNA improvement proposal snapshot is immutable';
  end if;
  if not (
    (old.status = 'proposed' and new.status in ('approved','rejected','stale')) or
    (old.status = 'approved' and new.status in ('stale','applied'))
  ) then
    raise exception 'Invalid DNA improvement proposal state transition';
  end if;
  if new.status in ('approved','rejected') and new.reviewed_at is null then
    raise exception 'Reviewed proposal requires reviewed_at';
  end if;
  if new.status = 'applied' and (old.status <> 'approved' or new.applied_at is null) then
    raise exception 'Only an approved proposal can be marked applied';
  end if;
  return new;
end;
$$;
drop trigger if exists vyral_asset_dna_proposal_update_guard on public.vyral_asset_dna_improvement_proposals;
create trigger vyral_asset_dna_proposal_update_guard
  before update on public.vyral_asset_dna_improvement_proposals
  for each row execute function public.guard_vyral_asset_dna_proposal_update();
comment on table public.vyral_asset_dna_improvement_proposals is
  'Owner-readable, append-only snapshot of Asset DNA improvement recommendations. Approval never mutates canonical DNA.';
