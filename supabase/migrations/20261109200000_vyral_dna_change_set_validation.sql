-- Store a one-time, immutable validation report while keeping the change-set payload/hash immutable.
alter table public.vyral_asset_dna_improvement_proposals
  add column if not exists change_set_validation_report jsonb,
  add column if not exists change_set_checked_at timestamptz,
  add column if not exists change_set_validator_version integer,
  add constraint vyral_asset_dna_proposal_change_set_validation_object
    check (change_set_validation_report is null or jsonb_typeof(change_set_validation_report) = 'object'),
  add constraint vyral_asset_dna_proposal_change_set_validation_pair
    check (
      (change_set_validation_report is null and change_set_checked_at is null and change_set_validator_version is null)
      or
      (change_set_validation_report is not null and change_set_checked_at is not null and change_set_validator_version is not null)
    );

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
    new.change_set_prepared_at is distinct from old.change_set_prepared_at
  ) then raise exception 'Prepared DNA change-set payload and hash are immutable'; end if;

  if old.change_set is null and new.change_set is not null and
     (old.status <> 'approved' or new.change_set_status not in ('blocked','ready')) then
    raise exception 'Only an approved proposal can receive a prepared change set';
  end if;

  if old.change_set_validation_report is not null and (
    new.change_set_validation_report is distinct from old.change_set_validation_report or
    new.change_set_checked_at is distinct from old.change_set_checked_at or
    new.change_set_validator_version is distinct from old.change_set_validator_version
  ) then raise exception 'DNA change-set validation evidence is immutable'; end if;

  if old.change_set_validation_report is null and new.change_set_validation_report is not null then
    if old.change_set is null or coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Only the trusted validator can attach validation evidence';
    end if;
    if new.change_set_checked_at is null or new.change_set_validator_version <> 1 then
      raise exception 'Validation evidence requires a timestamp and supported validator version';
    end if;
    if new.change_set_status not in ('blocked','validated','invalid') then
      raise exception 'Validation result must be blocked, validated or invalid';
    end if;
  elsif new.change_set_status is distinct from old.change_set_status and old.change_set_validation_report is not null then
    raise exception 'Validated change-set status is immutable';
  end if;

  if new.status <> old.status and not (
    (old.status = 'proposed' and new.status in ('approved','rejected','stale')) or
    (old.status = 'approved' and new.status in ('stale','applied'))
  ) then raise exception 'Invalid DNA improvement proposal state transition'; end if;
  if new.status in ('approved','rejected') and new.reviewed_at is null then
    raise exception 'Reviewed proposal requires reviewed_at'; end if;
  if new.status = 'applied' and (
    old.status <> 'approved' or new.applied_at is null or old.change_set_status <> 'validated'
    or old.change_set_validation_report is null
  ) then raise exception 'Only an approved proposal with a validated change set can be applied'; end if;
  return new;
end;
$$;
