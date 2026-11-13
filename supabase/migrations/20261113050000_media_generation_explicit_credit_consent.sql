-- Durable customer consent for maximum VYRA credit reservation.
-- No active pricing policy is seeded; generation remains safely blocked.
alter table public.media_generation_quotes
  add column if not exists credit_approval_confirmed_at timestamptz,
  add column if not exists credit_approval_idempotency_key text;
create unique index if not exists media_generation_quotes_credit_approval_key
  on public.media_generation_quotes(user_id, credit_approval_idempotency_key)
  where credit_approval_idempotency_key is not null;

create or replace function public.approve_media_generation_credit_ceiling(
  p_user_id uuid, p_quote_id uuid, p_approved_max_credit_units bigint, p_idempotency_key text
) returns public.media_generation_quotes
language plpgsql security definer set search_path = ''
as $function$
declare
  v_quote public.media_generation_quotes;
  v_policy public.media_credit_pricing_policies;
  v_required_credits bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_quote_id is null or p_approved_max_credit_units is null
     or p_approved_max_credit_units <= 0 or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Invalid credit approval input.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':media-credit-approval:' || p_idempotency_key, 0));
  select * into v_quote from public.media_generation_quotes where id=p_quote_id and user_id=p_user_id for update;
  if not found then raise exception 'Quote not found.' using errcode = 'P0002'; end if;
  if v_quote.credit_approval_idempotency_key is not null then
    if v_quote.credit_approval_idempotency_key=p_idempotency_key
       and v_quote.approved_max_credit_units=p_approved_max_credit_units
       and v_quote.credit_approval_confirmed_at is not null then return v_quote; end if;
    raise exception 'Quote already has a different credit approval.' using errcode = '23505';
  end if;
  if v_quote.status <> 'approved' or v_quote.approval_confirmed_at is null or v_quote.approved_max_cost_usd is null then
    raise exception 'Quote must have an explicit USD approval first.' using errcode = '55000';
  end if;
  if v_quote.expires_at <= pg_catalog.now() then raise exception 'Approved quote expired.' using errcode = 'P0001'; end if;
  select * into v_policy from public.media_credit_pricing_policies
   where status='active' and effective_at <= pg_catalog.now() order by effective_at desc limit 1 for share;
  if not found then raise exception 'CREDIT_PRICING_NOT_CONFIGURED' using errcode = '55000'; end if;
  v_required_credits := pg_catalog.ceil(v_quote.approved_max_cost_usd * v_policy.credits_per_usd)::bigint;
  if p_approved_max_credit_units < v_required_credits then
    raise exception 'Approved credit ceiling is below the policy-derived maximum.' using errcode = '22023';
  end if;
  update public.media_generation_quotes set approved_max_credit_units=p_approved_max_credit_units,
    pricing_policy_id=v_policy.id, credit_approval_confirmed_at=pg_catalog.now(),
    credit_approval_idempotency_key=p_idempotency_key, updated_at=pg_catalog.now()
   where id=p_quote_id and user_id=p_user_id returning * into v_quote;
  return v_quote;
end;
$function$;
revoke all on function public.approve_media_generation_credit_ceiling(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.approve_media_generation_credit_ceiling(uuid,uuid,bigint,text) to service_role;

create or replace function public.create_media_generation_job_and_reserve(
  p_user_id uuid, p_quote_id uuid, p_idempotency_key text, p_approved_max_credit_units bigint
) returns public.generation_jobs
language plpgsql security definer set search_path = ''
as $function$
declare
  v_quote public.media_generation_quotes;
  v_policy public.media_credit_pricing_policies;
  v_job public.generation_jobs;
  v_required_credits bigint;
  v_existing public.generation_jobs;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required.' using errcode = '42501'; end if;
  if p_user_id is null or p_quote_id is null or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 160
     or p_approved_max_credit_units is null or p_approved_max_credit_units <= 0 then
    raise exception 'Invalid generation job reservation input.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':media-job:' || p_idempotency_key, 0));
  select * into v_existing from public.generation_jobs where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_parameters ->> 'quote_id' is distinct from p_quote_id::text then
      raise exception 'Generation idempotency key was reused for a different quote.' using errcode = '23505';
    end if;
    return v_existing;
  end if;
  select * into v_quote from public.media_generation_quotes where id=p_quote_id and user_id=p_user_id for update;
  if not found then raise exception 'Approved quote not found.' using errcode = 'P0002'; end if;
  if v_quote.status <> 'approved' or v_quote.approval_confirmed_at is null then raise exception 'Quote must be explicitly approved first.' using errcode = '55000'; end if;
  if v_quote.expires_at <= pg_catalog.now() then raise exception 'Approved quote expired.' using errcode = 'P0001'; end if;
  if v_quote.approved_max_cost_usd is null or v_quote.approved_max_cost_usd < v_quote.estimated_cost_usd then
    raise exception 'Approved USD ceiling is below estimate.' using errcode = '22023';
  end if;
  if v_quote.credit_approval_confirmed_at is null or v_quote.credit_approval_idempotency_key is null
     or v_quote.approved_max_credit_units is null or v_quote.approved_max_credit_units <> p_approved_max_credit_units
     or v_quote.pricing_policy_id is null then
    raise exception 'Explicit customer credit approval is required.' using errcode = '55000';
  end if;
  select * into v_policy from public.media_credit_pricing_policies
   where id=v_quote.pricing_policy_id and status='active' and effective_at <= pg_catalog.now() for share;
  if not found then raise exception 'CREDIT_PRICING_POLICY_CHANGED' using errcode = '55000'; end if;
  v_required_credits := pg_catalog.ceil(v_quote.approved_max_cost_usd * v_policy.credits_per_usd)::bigint;
  if p_approved_max_credit_units < v_required_credits then
    raise exception 'Customer-approved credit ceiling is below the policy-derived maximum.' using errcode = '22023';
  end if;
  insert into public.generation_jobs(user_id,idempotency_key,capability,model_id,status,estimate_status,estimated_cost_usd,request_parameters)
  values (p_user_id,p_idempotency_key,v_quote.task,v_quote.provider_model_id,'pending','approximate',v_quote.estimated_cost_usd,
    jsonb_build_object('quote_id',v_quote.id,'provider',v_quote.provider,'provider_config_id',v_quote.provider_config_id,
      'quality',v_quote.quality,'selection_mode',v_quote.selection_mode,'request_fingerprint',v_quote.request_fingerprint,
      'pricing_policy_id',v_policy.id,'pricing_policy_version',v_policy.version,
      'approved_max_credit_units',p_approved_max_credit_units,'approved_max_cost_usd',v_quote.approved_max_cost_usd,
      'credit_approval_confirmed_at',v_quote.credit_approval_confirmed_at,
      'credit_approval_idempotency_key',v_quote.credit_approval_idempotency_key))
  returning * into v_job;
  perform public.apply_credit_ledger_entry(p_user_id,v_job.id,'media-reserve:' || v_job.id::text,'reserve',
    p_approved_max_credit_units,'Maximum approved media generation reserve',
    jsonb_build_object('quote_id',v_quote.id,'pricing_policy_id',v_policy.id,'pricing_policy_version',v_policy.version,
      'credit_approval_confirmed_at',v_quote.credit_approval_confirmed_at));
  update public.media_generation_quotes set status='used',updated_at=pg_catalog.now() where id=v_quote.id and user_id=p_user_id;
  return v_job;
end;
$function$;
revoke all on function public.create_media_generation_job_and_reserve(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.create_media_generation_job_and_reserve(uuid,uuid,text,bigint) to service_role;
