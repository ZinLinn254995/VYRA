-- Persist a canonical, hash-pinned DNA change-set proposal separately from its human-readable plan.
alter table public.vyral_asset_dna_improvement_proposals
  add column if not exists change_set jsonb,
  add column if not exists change_set_sha256 text,
  add column if not exists change_set_status text not null default 'not_prepared'
    check (change_set_status in ('not_prepared','blocked','ready','validated','invalid')),
  add column if not exists change_set_prepared_at timestamptz,
  add constraint vyral_asset_dna_proposal_change_set_object
    check (change_set is null or jsonb_typeof(change_set) = 'object'),
  add constraint vyral_asset_dna_proposal_change_set_hash
    check (change_set_sha256 is null or change_set_sha256 ~ '^[a-f0-9]{64}$'),
  add constraint vyral_asset_dna_proposal_change_set_pair
    check ((change_set is null and change_set_sha256 is null) or (change_set is not null and change_set_sha256 is not null));

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
  if old.change_set is not null and (
    new.change_set is distinct from old.change_set or
    new.change_set_sha256 is distinct from old.change_set_sha256 or
    new.change_set_prepared_at is distinct from old.change_set_prepared_at or
    new.change_set_status is distinct from old.change_set_status
  ) then raise exception 'Prepared DNA change set is immutable'; end if;
  if old.change_set is null and new.change_set is not null and
     (old.status <> 'approved' or new.change_set_status not in ('blocked','ready')) then
    raise exception 'Only an approved proposal can receive a prepared change set';
  end if;
  if new.status <> old.status and not (
    (old.status = 'proposed' and new.status in ('approved','rejected','stale')) or
    (old.status = 'approved' and new.status in ('stale','applied'))
  ) then raise exception 'Invalid DNA improvement proposal state transition'; end if;
  if new.status in ('approved','rejected') and new.reviewed_at is null then
    raise exception 'Reviewed proposal requires reviewed_at'; end if;
  if new.status = 'applied' and (old.status <> 'approved' or new.applied_at is null or old.change_set_status <> 'validated') then
    raise exception 'Only an approved proposal with a validated change set can be applied'; end if;
  return new;
end;
$$;
comment on column public.vyral_asset_dna_improvement_proposals.change_set is
  'Canonical immutable remediation/change-set snapshot. A blocked verification-only set cannot be applied as DNA mutations.';
