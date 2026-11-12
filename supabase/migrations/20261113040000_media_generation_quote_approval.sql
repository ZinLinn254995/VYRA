-- Persist explicit customer approval for a short-lived media quote.
-- This does not create a generation job or reserve/charge customer credits.
alter table public.media_generation_quotes
  add column if not exists approval_confirmed_at timestamptz,
  add column if not exists approved_max_cost_usd numeric(18,6),
  add column if not exists approval_idempotency_key text;

alter table public.media_generation_quotes
  add constraint media_generation_quotes_approved_budget_nonnegative
  check (approved_max_cost_usd is null or approved_max_cost_usd >= 0);

alter table public.media_generation_quotes
  add constraint media_generation_quotes_approval_key_length
  check (approval_idempotency_key is null or char_length(approval_idempotency_key) between 16 and 128);

create unique index if not exists media_generation_quotes_user_approval_key_unique
  on public.media_generation_quotes(user_id, approval_idempotency_key)
  where approval_idempotency_key is not null;

create or replace function public.approve_media_generation_quote(
  p_user_id uuid, p_quote_id uuid, p_max_cost_usd numeric, p_idempotency_key text
)
returns public.media_generation_quotes
language plpgsql security definer set search_path = ''
as $function$
declare v_quote public.media_generation_quotes; v_existing public.media_generation_quotes;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_quote_id is null or p_max_cost_usd is null or p_max_cost_usd < 0
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Invalid quote approval input.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.media_generation_quotes
   where user_id = p_user_id and approval_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.id <> p_quote_id or v_existing.approved_max_cost_usd is distinct from p_max_cost_usd then
      raise exception 'Approval idempotency key was already used with different parameters.' using errcode = '23505';
    end if;
    return v_existing;
  end if;
  select * into v_quote from public.media_generation_quotes
   where id = p_quote_id and user_id = p_user_id for update;
  if not found then raise exception 'Quote not found.' using errcode = 'P0002'; end if;
  if v_quote.status <> 'quoted' then raise exception 'Quote is not awaiting approval.' using errcode = '55000'; end if;
  if v_quote.expires_at <= pg_catalog.now() then raise exception 'Quote expired.' using errcode = 'P0001'; end if;
  if p_max_cost_usd < v_quote.estimated_cost_usd then
    raise exception 'Approved maximum is below the quoted estimate.' using errcode = '22023';
  end if;
  update public.media_generation_quotes
     set status = 'approved', approval_confirmed_at = pg_catalog.now(),
         approved_max_cost_usd = p_max_cost_usd, approval_idempotency_key = p_idempotency_key,
         updated_at = pg_catalog.now()
   where id = p_quote_id and user_id = p_user_id returning * into v_quote;
  return v_quote;
end;
$function$;

revoke all on function public.approve_media_generation_quote(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.approve_media_generation_quote(uuid, uuid, numeric, text) to service_role;
