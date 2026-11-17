-- Project-native generation destination.
-- Keep the legacy target_vyral_id column for historical jobs only; new jobs bind
-- directly to the canonical Workspace project (vyral_storyboards) identity.

create unique index if not exists vyral_storyboards_id_user_unique
  on public.vyral_storyboards (id, user_id);

alter table public.generation_jobs
  add column if not exists target_project_id uuid;

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'generation_jobs_target_project_owner_fk'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_target_project_owner_fk
      foreign key (target_project_id, user_id)
      references public.vyral_storyboards (id, user_id)
      on delete restrict;
  end if;
end;
$constraint$;

create index if not exists generation_jobs_target_project_idx
  on public.generation_jobs (user_id, target_project_id, created_at desc)
  where target_project_id is not null;

create or replace function public.create_runway_media_job_for_project(
  p_user_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_approved_max_credit_units bigint,
  p_target_project_id uuid
) returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project public.vyral_storyboards;
  v_job public.generation_jobs;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_quote_id is null or p_target_project_id is null then
    raise exception 'Customer, quote and Project destination are required.' using errcode = '22023';
  end if;

  select * into v_project
    from public.vyral_storyboards
   where id = p_target_project_id and user_id = p_user_id
   for share;
  if not found then
    raise exception 'Project destination not found for this customer.' using errcode = 'P0002';
  end if;

  -- An idempotent replay may only reuse a job already bound to this same Project.
  select * into v_job
    from public.generation_jobs
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_job.target_project_id is not null
       and v_job.target_project_id <> p_target_project_id then
      raise exception 'Generation idempotency key is already bound to another Project.' using errcode = '23505';
    end if;
    if v_job.target_vyral_id is not null then
      raise exception 'This idempotency key belongs to a historical Vyral-targeted job.' using errcode = '23505';
    end if;
  end if;

  v_job := public.create_media_generation_job_and_reserve(
    p_user_id, p_quote_id, p_idempotency_key, p_approved_max_credit_units
  );

  if v_job.target_vyral_id is not null then
    raise exception 'A legacy Vyral-targeted job cannot be rebound to a Project.' using errcode = '23505';
  end if;
  if v_job.target_project_id is not null
     and v_job.target_project_id <> p_target_project_id then
    raise exception 'Generation job destination conflicts with the selected Project.' using errcode = '23505';
  end if;

  update public.generation_jobs
     set target_project_id = p_target_project_id,
         updated_at = pg_catalog.now()
   where id = v_job.id and user_id = p_user_id
   returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.create_runway_media_job_for_project(uuid,uuid,text,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.create_runway_media_job_for_project(uuid,uuid,text,bigint,uuid)
  to service_role;

comment on column public.generation_jobs.target_project_id is
  'Canonical Workspace project destination for new generated media. Historical Vyral-targeted jobs remain on target_vyral_id until terminal recovery.';
