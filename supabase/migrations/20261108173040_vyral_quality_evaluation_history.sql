-- Immutable, evidence-backed Vyral quality evaluation history.
-- Stores the exact Master DNA revision and versioned standard used for every grade.
-- Apply to the isolated Development project first; do not apply to Production.

create table if not exists public.vyral_quality_evaluations (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  master_dna_revision_id uuid not null,
  master_dna_revision integer not null check (master_dna_revision > 0),
  snapshot_fingerprint text not null check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  engine_version integer not null check (engine_version > 0),
  standard_id text not null check (char_length(standard_id) between 1 and 128),
  standard_version integer not null check (standard_version > 0),
  standard_profile jsonb not null check (jsonb_typeof(standard_profile) = 'object'),
  status text not null check (status in ('graded','incomplete_evidence','blocked')),
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  grade text check (grade is null or grade in ('S','A','B','C','D','F')),
  evaluation jsonb not null check (jsonb_typeof(evaluation) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vyral_quality_evaluations_owner_fk
    foreign key (vyral_id,user_id) references public.vyrals(id,user_id) on delete cascade,
  constraint vyral_quality_evaluations_master_revision_fk
    foreign key (master_dna_revision_id,vyral_id,user_id)
    references public.vyral_master_dna_revisions(id,vyral_id,user_id) on delete cascade,
  constraint vyral_quality_evaluations_id_scope_unique unique (id,vyral_id,user_id),
  constraint vyral_quality_evaluations_grade_state_check check (
    (status = 'graded' and score is not null and grade is not null)
    or (status in ('incomplete_evidence','blocked') and score is null and grade is null)
  )
);

create index if not exists vyral_quality_evaluations_owner_history_idx
  on public.vyral_quality_evaluations(user_id,vyral_id,created_at desc);

create or replace function public.validate_vyral_quality_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_revision integer;
  source_fingerprint text;
begin
  select revision, vyral_fingerprint
    into source_revision, source_fingerprint
    from public.vyral_master_dna_revisions
   where id = new.master_dna_revision_id
     and vyral_id = new.vyral_id
     and user_id = new.user_id;

  if not found
     or source_revision <> new.master_dna_revision
     or source_fingerprint <> new.snapshot_fingerprint then
    raise exception using errcode = '23514',
      message = 'Quality evaluation must match its exact immutable Master DNA revision and fingerprint.';
  end if;

  if new.standard_profile ->> 'id' is distinct from new.standard_id
     or (new.standard_profile ->> 'version')::integer is distinct from new.standard_version then
    raise exception using errcode = '23514',
      message = 'Quality evaluation standard identity must match its pinned standard profile.';
  end if;

  if new.evaluation ->> 'vyralId' is distinct from new.vyral_id::text
     or new.evaluation ->> 'snapshotFingerprint' is distinct from new.snapshot_fingerprint
     or (new.evaluation ->> 'engineVersion')::integer is distinct from new.engine_version
     or new.evaluation ->> 'status' is distinct from new.status
     or (new.evaluation -> 'standard' ->> 'id') is distinct from new.standard_id
     or (new.evaluation -> 'standard' ->> 'version')::integer is distinct from new.standard_version
     or nullif(new.evaluation ->> 'score','')::numeric is distinct from new.score
     or (new.evaluation ->> 'grade') is distinct from new.grade then
    raise exception using errcode = '23514',
      message = 'Quality evaluation columns must match the immutable evaluation payload.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_vyral_quality_evaluation() from public, anon, authenticated;
drop trigger if exists vyral_quality_evaluation_validate on public.vyral_quality_evaluations;
create trigger vyral_quality_evaluation_validate
before insert on public.vyral_quality_evaluations
for each row execute function public.validate_vyral_quality_evaluation();

create or replace function public.prevent_vyral_quality_evaluation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Allow parent Vyral / Master DNA deletion to clean up its own history.
  -- Direct row edits and deletes remain forbidden.
  if pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using errcode = '55000',
    message = 'Quality evaluation history is immutable; create a new evaluation instead.';
end;
$$;

revoke all on function public.prevent_vyral_quality_evaluation_mutation() from public, anon, authenticated;
drop trigger if exists vyral_quality_evaluation_immutable on public.vyral_quality_evaluations;
create trigger vyral_quality_evaluation_immutable
before update or delete on public.vyral_quality_evaluations
for each row execute function public.prevent_vyral_quality_evaluation_mutation();

alter table public.vyral_quality_evaluations enable row level security;
create policy "vyral_quality_evaluations_select_own"
  on public.vyral_quality_evaluations for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.vyral_quality_evaluations from public, anon, authenticated;
grant select on public.vyral_quality_evaluations to authenticated;
grant select, insert on public.vyral_quality_evaluations to service_role;

comment on table public.vyral_quality_evaluations is
  'Append-only, owner-scoped quality results pinned to immutable Master DNA revisions and exact versioned standard profiles.';
