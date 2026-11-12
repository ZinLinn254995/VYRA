-- Auditable, owner/admin-controlled lifecycle for media credit pricing.
alter table public.media_credit_pricing_policies
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists activated_by uuid references auth.users(id),
  add column if not exists activated_at timestamptz;

create or replace function public.activate_media_credit_pricing_policy(
  p_policy_id uuid, p_actor_user_id uuid
) returns public.media_credit_pricing_policies
language plpgsql security definer set search_path = ''
as $function$
declare
  v_target public.media_credit_pricing_policies;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_policy_id is null or p_actor_user_id is null then
    raise exception 'Policy and administrator identity are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.platform_admins where user_id=p_actor_user_id and role in ('owner','admin')) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-credit-pricing-policy-activation',0));
  select * into v_target from public.media_credit_pricing_policies where id=p_policy_id for update;
  if not found then raise exception 'Pricing policy not found.' using errcode = 'P0002'; end if;
  if v_target.status='active' then return v_target; end if;
  if v_target.status <> 'draft' then raise exception 'Only a draft pricing policy can be activated.' using errcode = '55000'; end if;
  if v_target.credits_per_usd <= 0 or v_target.rounding_mode <> 'ceil' then
    raise exception 'Pricing policy values are invalid.' using errcode = '22023';
  end if;
  update public.media_credit_pricing_policies set status='retired',updated_at=pg_catalog.now()
   where status='active' and id<>p_policy_id;
  update public.media_credit_pricing_policies
   set status='active',effective_at=pg_catalog.now(),activated_by=p_actor_user_id,
       activated_at=pg_catalog.now(),updated_at=pg_catalog.now()
   where id=p_policy_id returning * into v_target;
  return v_target;
end;
$function$;
revoke all on function public.activate_media_credit_pricing_policy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_media_credit_pricing_policy(uuid,uuid) to service_role;
