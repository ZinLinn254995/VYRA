-- Durable, single-claim Runway submission boundary.
-- Claiming marks the outcome unknown before any network request. A worker must
-- reconcile that state rather than blindly submitting a second billable task.
alter table public.generation_jobs
  add column if not exists provider_task_id text,
  add column if not exists provider_submission_started_at timestamptz,
  add column if not exists provider_submission_outcome text
    check (provider_submission_outcome is null or provider_submission_outcome in ('accepted','rejected','unknown'));

create unique index if not exists generation_jobs_runway_task_unique
  on public.generation_jobs(provider_task_id)
  where provider_task_id is not null;

create unique index if not exists media_generation_job_events_one_submitted
  on public.media_generation_job_events(job_id)
  where event_type = 'submitted';

create or replace function public.claim_runway_media_job(p_user_id uuid, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
  v_quote public.media_generation_quotes;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null then
    raise exception 'A customer and generation job are required.' using errcode = '22023';
  end if;

  select * into v_job
    from public.generation_jobs
   where id = p_job_id and user_id = p_user_id
   for update;
  if not found then
    raise exception 'Generation job not found.' using errcode = 'P0002';
  end if;

  if v_job.status <> 'pending' then
    return jsonb_build_object('claimed', false, 'status', v_job.status,
      'provider_task_id', v_job.provider_task_id,
      'submission_outcome', v_job.provider_submission_outcome);
  end if;
  if v_job.request_parameters ->> 'provider' <> 'runway' then
    raise exception 'Generation job is not a Runway job.' using errcode = '22023';
  end if;

  select * into v_quote
    from public.media_generation_quotes
   where id = (v_job.request_parameters ->> 'quote_id')::uuid
     and user_id = p_user_id
   for share;
  if not found or v_quote.status <> 'used' or v_quote.provider <> 'runway' then
    raise exception 'The reserved Runway quote is unavailable.' using errcode = '55000';
  end if;

  -- Claim before the network call. If the worker crashes or times out, this job
  -- cannot be claimed again automatically because the provider may have accepted it.
  update public.generation_jobs
     set status = 'submitted',
         provider_submission_started_at = pg_catalog.now(),
         provider_submission_outcome = 'unknown',
         updated_at = pg_catalog.now()
   where id = p_job_id
   returning * into v_job;

  return jsonb_build_object(
    'claimed', true,
    'job', jsonb_build_object('id', v_job.id, 'user_id', v_job.user_id,
      'capability', v_job.capability, 'model_id', v_job.model_id),
    'quote', jsonb_build_object('id', v_quote.id, 'task', v_quote.task,
      'quality', v_quote.quality, 'provider_config_id', v_quote.provider_config_id,
      'provider_model_id', v_quote.provider_model_id, 'request_payload', v_quote.request_payload)
  );
end;
$function$;

create or replace function public.record_runway_media_submission(
  p_user_id uuid,
  p_job_id uuid,
  p_outcome text,
  p_provider_task_id text default null,
  p_provider_request_id text default null,
  p_http_status integer default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
  v_quote public.media_generation_quotes;
  v_event_type text;
  v_attempt public.provider_attempts;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null or p_outcome not in ('accepted','rejected','unknown')
     or (p_http_status is not null and p_http_status not between 100 and 599)
     or (p_failure_code is not null and char_length(p_failure_code) > 80)
     or (p_provider_request_id is not null and char_length(p_provider_request_id) > 240) then
    raise exception 'Invalid Runway submission result.' using errcode = '22023';
  end if;
  if p_outcome = 'accepted' and (p_provider_task_id is null or
      p_provider_task_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'A valid provider task ID is required for an accepted submission.' using errcode = '22023';
  end if;
  if p_outcome <> 'accepted' and p_provider_task_id is not null then
    raise exception 'A provider task ID is only valid for an accepted submission.' using errcode = '22023';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'Generation job not found.' using errcode = 'P0002'; end if;
  if v_job.provider_submission_started_at is null then
    raise exception 'Runway job has not been claimed.' using errcode = '55000';
  end if;
  if v_job.provider_submission_outcome in ('accepted','rejected') then
    if v_job.provider_submission_outcome = p_outcome and
       v_job.provider_task_id is not distinct from p_provider_task_id then
      return jsonb_build_object('recorded', true, 'idempotent', true, 'status', v_job.status);
    end if;
    raise exception 'Runway submission result conflicts with an earlier result.' using errcode = '23505';
  end if;

  select * into v_quote from public.media_generation_quotes
   where id = (v_job.request_parameters ->> 'quote_id')::uuid and user_id = p_user_id;
  if not found then raise exception 'Runway quote not found.' using errcode = 'P0002'; end if;

  if p_outcome = 'accepted' then
    update public.generation_jobs
       set status = 'submitted', provider_task_id = p_provider_task_id,
           provider_request_id = nullif(p_provider_request_id, ''),
           provider_submission_outcome = 'accepted', updated_at = pg_catalog.now()
     where id = p_job_id returning * into v_job;

    insert into public.provider_attempts(
      user_id, generation_job_id, provider, model_id, provider_request_id, status, usage
    ) values (
      p_user_id, p_job_id, 'runway', v_quote.provider_model_id,
      nullif(p_provider_request_id, ''), 'submitted',
      jsonb_build_object('provider_task_id', p_provider_task_id, 'http_status', p_http_status)
    ) on conflict do nothing;

    insert into public.media_generation_job_events(
      job_id, provider, task, quality, event_type, provider_task_id, model_id, http_status,
      started_at
    ) values (
      p_job_id, 'runway', v_quote.task, v_quote.quality, 'submitted',
      p_provider_task_id, v_quote.provider_model_id, p_http_status,
      v_job.provider_submission_started_at
    ) on conflict do nothing;
  elsif p_outcome = 'rejected' then
    update public.generation_jobs
       set status = 'failed', provider_submission_outcome = 'rejected',
           provider_request_id = nullif(p_provider_request_id, ''), updated_at = pg_catalog.now()
     where id = p_job_id returning * into v_job;
    insert into public.media_generation_job_events(
      job_id, provider, task, quality, event_type, model_id, http_status, failure_code,
      started_at, completed_at
    ) values (
      p_job_id, 'runway', v_quote.task, v_quote.quality, 'failed',
      v_quote.provider_model_id, p_http_status, nullif(p_failure_code, ''),
      v_job.provider_submission_started_at, pg_catalog.now()
    ) on conflict do nothing;
  else
    update public.generation_jobs
       set status = 'unknown', provider_submission_outcome = 'unknown',
           provider_request_id = nullif(p_provider_request_id, ''), updated_at = pg_catalog.now()
     where id = p_job_id returning * into v_job;
  end if;

  return jsonb_build_object('recorded', true, 'idempotent', false,
    'status', v_job.status, 'provider_task_id', v_job.provider_task_id);
end;
$function$;

revoke all on function public.claim_runway_media_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_runway_media_job(uuid,uuid) to service_role;
revoke all on function public.record_runway_media_submission(uuid,uuid,text,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.record_runway_media_submission(uuid,uuid,text,text,text,integer,text)
  to service_role;
