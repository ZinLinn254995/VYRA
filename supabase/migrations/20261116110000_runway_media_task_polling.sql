-- Safe Runway task polling and private output handoff.
-- Provider output URLs are signed, temporary credentials: never expose them to customers.
alter table public.generation_jobs
  add column if not exists provider_last_polled_at timestamptz,
  add column if not exists provider_task_status text
    check (provider_task_status is null or provider_task_status in ('pending','processing','succeeded','failed','cancelled','unknown')),
  add column if not exists provider_output_count integer
    check (provider_output_count is null or provider_output_count between 0 and 16);

create table if not exists public.media_generation_job_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  output_index integer not null check (output_index between 0 and 15),
  output_url text not null check (
    char_length(output_url) between 9 and 8192 and output_url ~ '^https://'
  ),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  constraint media_generation_job_outputs_job_index_unique unique (job_id, output_index)
);
create index if not exists media_generation_job_outputs_expiry_idx
  on public.media_generation_job_outputs(expires_at);
alter table public.media_generation_job_outputs enable row level security;
revoke all on public.media_generation_job_outputs from public, anon, authenticated;
grant select, insert on public.media_generation_job_outputs to service_role;

create unique index if not exists media_generation_job_events_one_processing
  on public.media_generation_job_events(job_id) where event_type = 'processing';
create unique index if not exists media_generation_job_events_one_succeeded
  on public.media_generation_job_events(job_id) where event_type = 'succeeded';
create unique index if not exists media_generation_job_events_one_failed
  on public.media_generation_job_events(job_id) where event_type = 'failed';
create unique index if not exists media_generation_job_events_one_cancelled
  on public.media_generation_job_events(job_id) where event_type = 'cancelled';

create or replace function public.claim_runway_media_task_poll(p_user_id uuid, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null then
    raise exception 'A customer and generation job are required.' using errcode = '22023';
  end if;
  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'Generation job not found.' using errcode = 'P0002'; end if;
  if v_job.request_parameters ->> 'provider' <> 'runway' then
    raise exception 'Generation job is not a Runway job.' using errcode = '22023';
  end if;
  if v_job.provider_task_id is null or v_job.provider_submission_outcome <> 'accepted' then
    return jsonb_build_object('claimed', false, 'status', v_job.status,
      'provider_task_status', v_job.provider_task_status);
  end if;
  if v_job.status in ('succeeded','failed','cancelled') then
    return jsonb_build_object('claimed', false, 'status', v_job.status,
      'provider_task_status', v_job.provider_task_status,
      'output_count', coalesce(v_job.provider_output_count, 0));
  end if;
  if v_job.provider_last_polled_at is not null
     and v_job.provider_last_polled_at > pg_catalog.now() - interval '5 seconds' then
    return jsonb_build_object('claimed', false, 'throttled', true,
      'status', v_job.status, 'provider_task_status', v_job.provider_task_status);
  end if;
  update public.generation_jobs
     set provider_last_polled_at = pg_catalog.now(), updated_at = pg_catalog.now()
   where id = p_job_id returning * into v_job;
  return jsonb_build_object('claimed', true, 'provider_task_id', v_job.provider_task_id,
    'status', v_job.status);
end;
$function$;

create or replace function public.record_runway_media_task_snapshot(
  p_user_id uuid,
  p_job_id uuid,
  p_provider_task_id text,
  p_status text,
  p_failure_code text default null,
  p_output_urls jsonb default '[]'::jsonb,
  p_started_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
  v_quote public.media_generation_quotes;
  v_event text;
  v_new_status text;
  v_output_count integer;
  v_url text;
  v_index integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null or p_provider_task_id is null or p_status is null
     or p_status not in ('pending','processing','succeeded','failed','cancelled','unknown')
     or p_failure_code is not null and char_length(p_failure_code) > 80
     or p_output_urls is null or jsonb_typeof(p_output_urls) <> 'array'
     or jsonb_array_length(p_output_urls) > 16 then
    raise exception 'Invalid Runway task snapshot.' using errcode = '22023';
  end if;
  v_output_count := jsonb_array_length(p_output_urls);
  if p_status = 'succeeded' and v_output_count = 0 then
    raise exception 'A successful Runway task must include at least one output.' using errcode = '22023';
  end if;
  for v_url in select jsonb_array_elements_text(p_output_urls) loop
    if char_length(v_url) not between 9 and 8192 or v_url !~ '^https://' then
      raise exception 'Runway output URL is invalid.' using errcode = '22023';
    end if;
  end loop;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'Generation job not found.' using errcode = 'P0002'; end if;
  if v_job.provider_task_id is distinct from p_provider_task_id
     or v_job.provider_submission_outcome <> 'accepted' then
    raise exception 'Runway task does not match the accepted job submission.' using errcode = '55000';
  end if;
  if v_job.status in ('succeeded','failed','cancelled') then
    if v_job.provider_task_status = p_status then
      return jsonb_build_object('recorded', true, 'idempotent', true,
        'status', v_job.status, 'output_count', coalesce(v_job.provider_output_count, 0));
    end if;
    raise exception 'Runway task snapshot conflicts with a terminal job state.' using errcode = '23505';
  end if;

  if v_job.provider_task_status = 'processing' and p_status = 'pending' then
    return jsonb_build_object('recorded', true, 'idempotent', true,
      'stale_snapshot_ignored', true, 'status', v_job.status,
      'output_count', coalesce(v_job.provider_output_count, 0));
  end if;

  select * into v_quote from public.media_generation_quotes
   where id = (v_job.request_parameters ->> 'quote_id')::uuid and user_id = p_user_id;
  if not found then raise exception 'Runway quote not found.' using errcode = 'P0002'; end if;

  v_new_status := case p_status
    when 'pending' then 'submitted'
    when 'processing' then 'processing'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    else 'unknown'
  end;
  v_event := case p_status
    when 'processing' then 'processing'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    else null
  end;

  if p_status = 'succeeded' then
    for v_url in select jsonb_array_elements_text(p_output_urls) loop
      insert into public.media_generation_job_outputs(job_id, output_index, output_url)
      values (p_job_id, v_index, v_url)
      on conflict (job_id, output_index) do update set output_url = excluded.output_url;
      v_index := v_index + 1;
    end loop;
  end if;

  update public.generation_jobs
     set status = v_new_status,
         provider_task_status = p_status,
         provider_output_count = v_output_count,
         updated_at = pg_catalog.now()
   where id = p_job_id returning * into v_job;

  update public.provider_attempts
     set status = case p_status
       when 'pending' then 'submitted'
       when 'processing' then 'processing'
       when 'succeeded' then 'succeeded'
       when 'failed' then 'failed'
       when 'cancelled' then 'failed'
       else 'unknown'
     end,
     completed_at = case when p_status in ('succeeded','failed','cancelled') then coalesce(p_completed_at, pg_catalog.now()) else null end,
     usage = usage || jsonb_build_object('provider_task_status', p_status, 'output_count', v_output_count)
   where generation_job_id = p_job_id and user_id = p_user_id and provider = 'runway';

  if v_event is not null then
    insert into public.media_generation_job_events(
      job_id, provider, task, quality, event_type, provider_task_id, model_id,
      failure_code, started_at, completed_at
    ) values (
      p_job_id, 'runway', v_quote.task, v_quote.quality, v_event,
      p_provider_task_id, v_quote.provider_model_id,
      case when p_status = 'failed' then nullif(p_failure_code, '') else null end,
      coalesce(p_started_at, v_job.provider_submission_started_at),
      case when p_status in ('succeeded','failed','cancelled') then coalesce(p_completed_at, pg_catalog.now()) else null end
    ) on conflict do nothing;
  end if;

  return jsonb_build_object('recorded', true, 'idempotent', false,
    'status', v_job.status, 'provider_task_status', p_status,
    'output_count', v_output_count);
end;
$function$;

revoke all on function public.claim_runway_media_task_poll(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_runway_media_task_poll(uuid,uuid) to service_role;
revoke all on function public.record_runway_media_task_snapshot(uuid,uuid,text,text,text,jsonb,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_runway_media_task_snapshot(uuid,uuid,text,text,text,jsonb,timestamptz,timestamptz)
  to service_role;
