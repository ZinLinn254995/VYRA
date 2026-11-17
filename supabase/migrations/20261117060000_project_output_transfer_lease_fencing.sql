-- Project output transfer must support canonical Project destinations and fence stale workers.
-- A lease token is rotated on every claim; only the current lease may record stored/failed.
alter table public.media_generation_job_outputs
  add column if not exists transfer_lease_token uuid;

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
  v_lease_token uuid;
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
     or (v_job.target_project_id is null and v_job.target_vyral_id is null) then
    raise exception 'Only successful destination-bound Runway jobs can transfer outputs.' using errcode = '55000';
  end if;

  select * into v_output from public.media_generation_job_outputs
   where job_id = p_job_id and output_index = p_output_index for update;
  if not found then raise exception 'Runway output reference not found.' using errcode = 'P0002'; end if;

  if v_output.transfer_status = 'ingested' then
    return jsonb_build_object('claimed', false, 'status', 'ingested',
      'target_project_id', v_job.target_project_id, 'target_vyral_id', v_job.target_vyral_id,
      'project_file_id', v_output.project_file_id, 'output_id', v_output.id,
      'asset_id', v_output.asset_id, 'asset_version_id', v_output.asset_version_id);
  end if;
  if v_output.expires_at <= pg_catalog.now() and v_output.storage_path is null then
    update public.media_generation_job_outputs set transfer_status = 'failed',
      transfer_error_code = 'provider_output_expired', transfer_lease_expires_at = null,
      transfer_lease_token = null
     where id = v_output.id;
    update public.generation_jobs set asset_ingestion_status = 'failed',
      asset_ingestion_error_code = 'provider_output_expired', updated_at = pg_catalog.now()
     where id = p_job_id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error_code', 'provider_output_expired');
  end if;
  if v_output.transfer_status in ('downloading','ingesting')
     and v_output.transfer_lease_expires_at > pg_catalog.now() then
    return jsonb_build_object('claimed', false, 'status', v_output.transfer_status,
      'target_project_id', v_job.target_project_id, 'target_vyral_id', v_job.target_vyral_id);
  end if;
  if v_output.transfer_attempts >= 20 then
    update public.media_generation_job_outputs set transfer_status = 'failed',
      transfer_error_code = 'transfer_retry_limit', transfer_lease_expires_at = null,
      transfer_lease_token = null
     where id = v_output.id;
    update public.generation_jobs set asset_ingestion_status = 'failed',
      asset_ingestion_error_code = 'transfer_retry_limit', updated_at = pg_catalog.now()
     where id = p_job_id;
    return jsonb_build_object('claimed', false, 'status', 'failed', 'error_code', 'transfer_retry_limit');
  end if;

  v_lease_token := gen_random_uuid();
  update public.media_generation_job_outputs
     set transfer_status = case when storage_path is null then 'downloading' else 'ingesting' end,
         transfer_attempts = transfer_attempts + 1,
         transfer_lease_expires_at = pg_catalog.now() + interval '10 minutes',
         transfer_lease_token = v_lease_token,
         transfer_error_code = null
   where id = v_output.id returning * into v_output;
  update public.generation_jobs set asset_ingestion_status =
      case when v_output.storage_path is null then 'downloading' else 'ingesting' end,
      asset_ingestion_started_at = coalesce(asset_ingestion_started_at, pg_catalog.now()),
      asset_ingestion_error_code = null, updated_at = pg_catalog.now()
   where id = p_job_id;

  return jsonb_build_object('claimed', true, 'status', v_output.transfer_status,
    'output_id', v_output.id, 'output_url', v_output.output_url,
    'target_project_id', v_job.target_project_id, 'target_vyral_id', v_job.target_vyral_id,
    'provider_task_id', v_job.provider_task_id, 'output_index', v_output.output_index,
    'storage_path', v_output.storage_path, 'lease_token', v_lease_token);
end;
$function$;

drop function public.record_runway_project_output_transfer(uuid,uuid,integer,text,text,uuid,text,text,bigint,text);

create function public.record_runway_project_output_transfer(
  p_user_id uuid,
  p_job_id uuid,
  p_output_index integer,
  p_status text,
  p_storage_path text default null,
  p_project_file_id uuid default null,
  p_sha256 text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_error_code text default null,
  p_lease_token uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.generation_jobs;
  v_output public.media_generation_job_outputs;
  v_item public.media_library_items;
  v_remaining integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_job_id is null or p_output_index is null
     or p_status not in ('stored','ingested','failed')
     or p_error_code is not null and char_length(p_error_code) > 80 then
    raise exception 'Invalid Project output transfer result.' using errcode = '22023';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id for update;
  if not found or v_job.target_project_id is null then
    raise exception 'Project generation job not found.' using errcode = 'P0002';
  end if;
  select * into v_output from public.media_generation_job_outputs
   where job_id = p_job_id and output_index = p_output_index for update;
  if not found then raise exception 'Project output not found.' using errcode = 'P0002'; end if;

  if p_status in ('stored','failed') then
    if p_lease_token is null or v_output.transfer_lease_token is distinct from p_lease_token
       or v_output.transfer_lease_expires_at is null
       or v_output.transfer_lease_expires_at <= pg_catalog.now() then
      raise exception 'Project output transfer lease is stale or no longer owned.' using errcode = '55000';
    end if;
  end if;

  if p_status in ('stored','ingested') then
    if p_storage_path is null
       or p_storage_path !~ ('^' || p_user_id::text || '/media-library/' || v_job.target_project_id::text || '/')
       or p_storage_path ~ '(^|/)(/|$)'
       or p_storage_path ~ '(^|/)\.\.?(/|$)'
       or position(chr(92) in p_storage_path) > 0
       or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
       or p_mime_type is null or p_size_bytes is null or p_size_bytes <= 0 then
      raise exception 'Project output Storage metadata is invalid.' using errcode = '22023';
    end if;
  end if;

  if p_status = 'ingested' then
    if p_project_file_id is null then
      raise exception 'A project file ID is required for completed output.' using errcode = '22023';
    end if;
    select * into v_item from public.media_library_items
     where id = p_project_file_id and user_id = p_user_id
       and project_id = v_job.target_project_id and universe_id is null
       and source_asset_id is null and bucket_id = 'vyral-assets'
       and storage_path = p_storage_path and mime_type = p_mime_type
       and size_bytes = p_size_bytes
       and metadata->>'generation_job_id' = p_job_id::text
       and metadata->>'output_index' = p_output_index::text;
    if not found then
      raise exception 'The generated file is not indexed in the bound Project.' using errcode = '55000';
    end if;
    if v_item.metadata->>'sha256' is distinct from p_sha256 then
      raise exception 'The generated file fingerprint does not match its Storage record.' using errcode = '55000';
    end if;
  end if;

  if v_output.transfer_status = 'ingested' then
    if p_status = 'ingested' and v_output.project_file_id = p_project_file_id
       and v_output.sha256 = p_sha256 then
      return jsonb_build_object('recorded', true, 'idempotent', true, 'status', 'ingested');
    end if;
    raise exception 'An ingested Project output is immutable.' using errcode = '23505';
  end if;

  if p_status = 'ingested' and v_output.transfer_status <> 'stored' then
    raise exception 'Project output must be stored before completion.' using errcode = '55000';
  end if;

  update public.media_generation_job_outputs set
    transfer_status = p_status,
    storage_path = coalesce(p_storage_path, storage_path),
    staging_storage_path = null,
    project_file_id = coalesce(p_project_file_id, project_file_id),
    sha256 = coalesce(p_sha256, sha256),
    mime_type = coalesce(p_mime_type, mime_type),
    size_bytes = coalesce(p_size_bytes, size_bytes),
    transfer_error_code = p_error_code,
    transfer_lease_expires_at = null,
    transfer_lease_token = null
   where id = v_output.id returning * into v_output;

  select count(*) into v_remaining from public.media_generation_job_outputs
   where job_id = p_job_id and transfer_status <> 'ingested';
  update public.generation_jobs set
    asset_ingestion_status = case
      when v_remaining = 0 then 'ready'
      when p_status = 'failed' then 'failed'
      else 'downloading' end,
    asset_ingestion_completed_at = case when v_remaining = 0 then pg_catalog.now() else null end,
    asset_ingestion_error_code = case when p_status = 'failed' then p_error_code else null end,
    updated_at = pg_catalog.now()
   where id = p_job_id and user_id = p_user_id;

  return jsonb_build_object('recorded', true, 'idempotent', false,
    'status', v_output.transfer_status, 'remaining_outputs', v_remaining,
    'project_file_id', v_output.project_file_id);
end;
$function$;

revoke all on function public.record_runway_project_output_transfer(uuid,uuid,integer,text,text,uuid,text,text,bigint,text,uuid)
  from public, anon, authenticated;
grant execute on function public.record_runway_project_output_transfer(uuid,uuid,integer,text,text,uuid,text,text,bigint,text,uuid)
  to service_role;

comment on column public.media_generation_job_outputs.transfer_lease_token is
  'Rotating fencing token; stale workers cannot overwrite a newer Project output transfer attempt.';
