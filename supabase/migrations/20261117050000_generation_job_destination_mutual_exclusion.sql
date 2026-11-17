-- A generation job may target either the legacy Project Assets Vyral container
-- or the canonical Project directly, never both. Keep both NULL valid for
-- historical jobs that predate explicit destination binding.
do $constraint$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'generation_jobs_destination_mutually_exclusive'
       and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_destination_mutually_exclusive
      check (target_vyral_id is null or target_project_id is null);
  end if;
end;
$constraint$;

comment on constraint generation_jobs_destination_mutually_exclusive
  on public.generation_jobs is
  'A generation job can target a Project Assets Vyral or a canonical Project, but never both; NULL/NULL remains valid for historical jobs.';
