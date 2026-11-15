-- Bind every new Runway generation job to the Project Assets Vyral container.
-- The existing reservation RPC remains the single source of truth for quote and credit
-- validation; this wrapper adds an owner-checked destination in the same transaction.

alter table public.generation_jobs
  add column if not exists target_vyral_id uuid;

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'generation_jobs_target_vyral_owner_fk'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_target_vyral_owner_fk
      foreign key (target_vyral_id, user_id)
      references public.vyrals (id, user_id)
      on delete restrict;
  end if;
end;
$constraint$;

create index if not exists generation_jobs_target_vyral_idx
  on public.generation_jobs (user_id, target_vyral_id, created_at desc)
  where target_vyral_id is not null;

create or replace function public.create_runway_media_job_for_project_asset(
  p_user_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_approved_max_credit_units bigint,
  p_target_vyral_id uuid
) returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vyral public.vyrals;
  v_job public.generation_jobs;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_quote_id is null or p_target_vyral_id is null then
    raise exception 'Customer, quote and Project Assets destination are required.' using errcode = '22023';
  end if;

  select * into v_vyral
    from public.vyrals
   where id = p_target_vyral_id and user_id = p_user_id
   for share;
  if not found then
    raise exception 'Project Assets destination not found for this customer.' using errcode = 'P0002';
  end if;
  if v_vyral.metadata ->> 'universe_scope' is distinct from 'storyboard'
     or nullif(v_vyral.metadata ->> 'storyboard_id', '') is null then
    raise exception 'Generation destination must be a Project-scoped Assets Vyral.' using errcode = '22023';
  end if;

  -- Replaying the same idempotency key must never move an existing job to another Project.
  select * into v_job
    from public.generation_jobs
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;
  if found and v_job.target_vyral_id is not null
     and v_job.target_vyral_id <> p_target_vyral_id then
    raise exception 'Generation idempotency key is already bound to another Project.' using errcode = '23505';
  end if;

  v_job := public.create_media_generation_job_and_reserve(
    p_user_id, p_quote_id, p_idempotency_key, p_approved_max_credit_units
  );

  if v_job.target_vyral_id is not null and v_job.target_vyral_id <> p_target_vyral_id then
    raise exception 'Generation job destination conflicts with the existing Project.' using errcode = '23505';
  end if;

  update public.generation_jobs
     set target_vyral_id = p_target_vyral_id,
         updated_at = pg_catalog.now()
   where id = v_job.id and user_id = p_user_id
   returning * into v_job;

  return v_job;
end;
$function$;

revoke all on function public.create_runway_media_job_for_project_asset(uuid,uuid,text,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.create_runway_media_job_for_project_asset(uuid,uuid,text,bigint,uuid)
  to service_role;

comment on column public.generation_jobs.target_vyral_id is
  'Owner-verified Project Assets Vyral destination for generated media; set atomically with the approved reservation.';
