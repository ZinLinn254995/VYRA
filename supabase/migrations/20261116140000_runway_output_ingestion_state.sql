-- Durable, retryable handoff from a successful Runway task to canonical Vyral ingestion.
-- This migration deliberately separates provider success from Asset readiness.
alter table public.generation_jobs
  add column if not exists asset_ingestion_status text not null default 'pending'
    check (asset_ingestion_status in ('pending','downloading','ingesting','ready','failed','recovery_required')),
  add column if not exists asset_ingestion_started_at timestamptz,
  add column if not exists asset_ingestion_completed_at timestamptz,
  add column if not exists asset_ingestion_error_code text
    check (asset_ingestion_error_code is null or char_length(asset_ingestion_error_code) <= 80);

alter table public.media_generation_job_outputs
  add column if not exists transfer_status text not null default 'pending'
    check (transfer_status in ('pending','downloading','stored','ingesting','ingested','failed')),
  add column if not exists transfer_attempts integer not null default 0
    check (transfer_attempts between 0 and 20),
  add column if not exists transfer_lease_expires_at timestamptz,
  add column if not exists storage_path text,
  add column if not exists asset_id uuid,
  add column if not exists asset_version_id uuid,
  add column if not exists sha256 text
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint
    check (size_bytes is null or size_bytes > 0),
  add column if not exists transfer_error_code text
    check (transfer_error_code is null or char_length(transfer_error_code) <= 80);

create unique index if not exists media_generation_job_outputs_storage_path_unique
  on public.media_generation_job_outputs(storage_path) where storage_path is not null;
create index if not exists media_generation_job_outputs_transfer_queue
  on public.media_generation_job_outputs(job_id, output_index, transfer_status);

create or replace function public.claim_runway_output_transfer(
  p_user_id uuid,
  p_job_id uuid,
  p_output_index integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
  v_output public.media_generation_job_outputs;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null or p_output_index is null
     or p_output_index not between 0 and 15 then
    raise exception 'A valid customer, job and output index are required.' using errcode = '22023';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'Generation job not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'succeeded' or v_job.provider_task_status <> 'succeeded'
     or v_job.target_vyral_id is null then
    raise exception 'Only successful Project-bound Runway jobs can transfer outputs.' using errcode = '55000';
  end if;

  select * into v_output from public.media_generation_job_outputs
   where job_id = p_job_id and output_index = p_output_index for update;
  if not found then raise exception 'Runway output reference not found.' using errcode = 'P0002'; end if;
  if v_output.transfer_status = 'ingested' then
    return jsonb_build_object('claimed', false, 'status', 'ingested',
      'asset_id', v_output.asset_id, 'asset_version_id', v_output.asset_version_id);
  end if;
  if v_output.expires_at <= pg_catalog.now() and v_output.storage_path is null then
    update public.media_generation_job_outputs set transfer_status = 'failed',
      transfer_error_code = 'provider_output_expired', transfer_lease_expires_at = null
     where id = v_output.id;
    update public.generation_jobs set asset_ingestion_status = 'failed',
      asset_ingestion_error_code = 'provider_output_expired', updated_at = pg_catalog.now()
     where id = p_job_id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error_code', 'provider_output_expired');
  end if;
  if v_output.transfer_status = 'downloading'
     and v_output.transfer_lease_expires_at > pg_catalog.now() then
    return jsonb_build_object('claimed', false, 'status', 'downloading');
  end if;
  if v_output.transfer_attempts >= 20 then
    update public.media_generation_job_outputs set transfer_status = 'failed',
      transfer_error_code = 'transfer_retry_limit', transfer_lease_expires_at = null
     where id = v_output.id;
    update public.generation_jobs set asset_ingestion_status = 'failed',
      asset_ingestion_error_code = 'transfer_retry_limit', updated_at = pg_catalog.now()
     where id = p_job_id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error_code', 'transfer_retry_limit');
  end if;

  update public.media_generation_job_outputs
     set transfer_status = case when storage_path is null then 'downloading' else 'ingesting' end,
         transfer_attempts = transfer_attempts + 1,
         transfer_lease_expires_at = pg_catalog.now() + interval '10 minutes',
         transfer_error_code = null
   where id = v_output.id returning * into v_output;
  update public.generation_jobs set asset_ingestion_status =
      case when v_output.storage_path is null then 'downloading' else 'ingesting' end,
      asset_ingestion_started_at = coalesce(asset_ingestion_started_at, pg_catalog.now()),
      asset_ingestion_error_code = null, updated_at = pg_catalog.now()
   where id = p_job_id;

  return jsonb_build_object('claimed', true, 'status', v_output.transfer_status,
    'output_id', v_output.id, 'output_url', v_output.output_url,
    'target_vyral_id', v_job.target_vyral_id, 'provider_task_id', v_job.provider_task_id,
    'output_index', v_output.output_index, 'storage_path', v_output.storage_path);
end;
$function$;

create or replace function public.record_runway_output_transfer(
  p_user_id uuid,
  p_job_id uuid,
  p_output_index integer,
  p_status text,
  p_storage_path text default null,
  p_asset_id uuid default null,
  p_asset_version_id uuid default null,
  p_sha256 text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_output public.media_generation_job_outputs;
  v_remaining integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null or p_output_index is null
     or p_status not in ('stored','ingesting','ingested','failed')
     or p_error_code is not null and char_length(p_error_code) > 80 then
    raise exception 'Invalid output transfer result.' using errcode = '22023';
  end if;
  if p_status in ('stored','ingesting','ingested') and
     (p_storage_path is null or p_storage_path !~ ('^' || p_user_id::text || '/')) then
    raise exception 'Stored output must use the customer's private storage namespace.' using errcode = '22023';
  end if;
  if p_status = 'ingested' and
     (p_asset_id is null or p_asset_version_id is null or p_sha256 is null
      or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime_type is null
      or p_size_bytes is null or p_size_bytes <= 0) then
    raise exception 'Ingested output requires Asset, Version and verified file metadata.' using errcode = '22023';
  end if;

  select o.* into v_output
    from public.media_generation_job_outputs o
    join public.generation_jobs j on j.id = o.job_id
   where o.job_id = p_job_id and o.output_index = p_output_index
     and j.user_id = p_user_id and j.status = 'succeeded'
   for update of o;
  if not found then raise exception 'Project output not found.' using errcode = 'P0002'; end if;
  if v_output.transfer_status = 'ingested' then
    if p_status = 'ingested' and v_output.asset_id = p_asset_id
       and v_output.asset_version_id = p_asset_version_id and v_output.sha256 = p_sha256 then
      return jsonb_build_object('recorded', true, 'idempotent', true, 'status', 'ingested');
    end if;
    raise exception 'An ingested output is immutable.' using errcode = '23505';
  end if;

  update public.media_generation_job_outputs set
    transfer_status = p_status,
    storage_path = coalesce(p_storage_path, storage_path),
    asset_id = coalesce(p_asset_id, asset_id),
    asset_version_id = coalesce(p_asset_version_id, asset_version_id),
    sha256 = coalesce(p_sha256, sha256),
    mime_type = coalesce(p_mime_type, mime_type),
    size_bytes = coalesce(p_size_bytes, size_bytes),
    transfer_error_code = p_error_code,
    transfer_lease_expires_at = case when p_status in ('ingested','failed') then null else pg_catalog.now() + interval '10 minutes' end
   where id = v_output.id returning * into v_output;

  select count(*) into v_remaining from public.media_generation_job_outputs
   where job_id = p_job_id and transfer_status <> 'ingested';
  update public.generation_jobs set
    asset_ingestion_status = case
      when v_remaining = 0 then 'ready'
      when p_status = 'failed' then 'failed'
      when p_status = 'ingesting' then 'ingesting'
      else 'downloading' end,
    asset_ingestion_completed_at = case when v_remaining = 0 then pg_catalog.now() else null end,
    asset_ingestion_error_code = case when p_status = 'failed' then p_error_code else null end,
    updated_at = pg_catalog.now()
   where id = p_job_id and user_id = p_user_id;

  return jsonb_build_object('recorded', true, 'idempotent', false,
    'status', v_output.transfer_status, 'remaining_outputs', v_remaining);
end;
$function$;

revoke all on function public.claim_runway_output_transfer(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_runway_output_transfer(uuid,uuid,integer) to service_role;
revoke all on function public.record_runway_output_transfer(uuid,uuid,integer,text,text,uuid,uuid,text,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.record_runway_output_transfer(uuid,uuid,integer,text,text,uuid,uuid,text,text,bigint,text)
  to service_role;

comment on column public.generation_jobs.asset_ingestion_status is
  'Separate lifecycle from provider generation status; ready only after every output has a canonical Asset and Version.';
