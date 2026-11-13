-- Server-owned pending actions and approval lifecycle for the VYRA AI Operator.
-- All writes are service-role RPCs after the Edge Function authenticates the caller.
create table if not exists public.ai_operator_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null check (length(session_id) between 1 and 160),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  capability_id text not null check (length(capability_id) between 1 and 120),
  plan jsonb not null check (pg_catalog.octet_length(plan::text) <= 16000),
  status text not null default 'pending'
    check (status in ('pending','approved','executing','completed','rejected','expired','failed')),
  expires_at timestamptz not null,
  approved_at timestamptz,
  execution_started_at timestamptz,
  completed_at timestamptz,
  result_summary jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, idempotency_key),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index if not exists ai_operator_pending_actions_owner_session_idx
  on public.ai_operator_pending_actions(user_id, session_id, created_at desc);
create index if not exists ai_operator_pending_actions_expiry_idx
  on public.ai_operator_pending_actions(expires_at) where status in ('pending','approved');

create table if not exists public.ai_operator_action_audit (
  id bigint generated always as identity primary key,
  action_id uuid references public.ai_operator_pending_actions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  capability_id text not null,
  event text not null check (event in ('proposed','approved','claimed','completed','rejected','expired','failed')),
  detail jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(detail::text) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.ai_operator_pending_actions enable row level security;
alter table public.ai_operator_action_audit enable row level security;
drop policy if exists "Users can read their own AI Operator actions" on public.ai_operator_pending_actions;
create policy "Users can read their own AI Operator actions"
  on public.ai_operator_pending_actions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can read their own AI Operator audit" on public.ai_operator_action_audit;
create policy "Users can read their own AI Operator audit"
  on public.ai_operator_action_audit for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_operator_pending_actions from anon, authenticated;
revoke all on public.ai_operator_action_audit from anon, authenticated;
grant select on public.ai_operator_pending_actions, public.ai_operator_action_audit to authenticated;
grant all on public.ai_operator_pending_actions, public.ai_operator_action_audit to service_role;

create or replace function public.create_ai_operator_pending_action(
  p_user_id uuid, p_session_id text, p_idempotency_key text,
  p_capability_id text, p_plan jsonb, p_expires_at timestamptz
) returns public.ai_operator_pending_actions
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.ai_operator_pending_actions;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception 'Service role required.' using errcode='42501';
  end if;
  if p_user_id is null or p_session_id is null or length(p_session_id) not between 1 and 160
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160
     or p_capability_id is null or length(p_capability_id) not between 1 and 120
     or p_plan is null or pg_catalog.octet_length(p_plan::text) > 16000
     or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '15 minutes' then
    raise exception 'Invalid pending action.' using errcode='22023';
  end if;
  insert into public.ai_operator_pending_actions
    (user_id,session_id,idempotency_key,capability_id,plan,expires_at)
  values (p_user_id,p_session_id,p_idempotency_key,p_capability_id,p_plan,p_expires_at)
  on conflict (user_id,session_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning * into v_row;
  if v_row.user_id <> p_user_id or v_row.session_id <> p_session_id then
    raise exception 'Idempotency scope mismatch.' using errcode='42501';
  end if;
  insert into public.ai_operator_action_audit(action_id,user_id,session_id,capability_id,event)
    values(v_row.id,p_user_id,p_session_id,p_capability_id,'proposed')
    on conflict do nothing;
  return v_row;
end;
$function$;

create or replace function public.approve_ai_operator_pending_action(
  p_user_id uuid, p_session_id text, p_action_id uuid
) returns public.ai_operator_pending_actions
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.ai_operator_pending_actions;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception 'Service role required.' using errcode='42501';
  end if;
  select * into v_row from public.ai_operator_pending_actions
    where id=p_action_id and user_id=p_user_id and session_id=p_session_id for update;
  if not found then raise exception 'Pending action not found.' using errcode='P0002'; end if;
  if v_row.status <> 'pending' or v_row.expires_at <= pg_catalog.now() then
    if v_row.status='pending' and v_row.expires_at <= pg_catalog.now() then
      update public.ai_operator_pending_actions set status='expired',updated_at=pg_catalog.now() where id=v_row.id returning * into v_row;
      insert into public.ai_operator_action_audit(action_id,user_id,session_id,capability_id,event)
        values(v_row.id,p_user_id,p_session_id,v_row.capability_id,'expired');
    end if;
    raise exception 'Pending action is no longer approvable.' using errcode='55000';
  end if;
  update public.ai_operator_pending_actions
    set status='approved',approved_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=v_row.id returning * into v_row;
  insert into public.ai_operator_action_audit(action_id,user_id,session_id,capability_id,event)
    values(v_row.id,p_user_id,p_session_id,v_row.capability_id,'approved');
  return v_row;
end;
$function$;

create or replace function public.claim_ai_operator_pending_action(
  p_user_id uuid, p_session_id text, p_action_id uuid
) returns public.ai_operator_pending_actions
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.ai_operator_pending_actions;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception 'Service role required.' using errcode='42501';
  end if;
  update public.ai_operator_pending_actions
    set status='executing',execution_started_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=p_action_id and user_id=p_user_id and session_id=p_session_id
      and status='approved' and expires_at > pg_catalog.now()
    returning * into v_row;
  if not found then raise exception 'Approved action cannot be claimed.' using errcode='55000'; end if;
  insert into public.ai_operator_action_audit(action_id,user_id,session_id,capability_id,event)
    values(v_row.id,p_user_id,p_session_id,v_row.capability_id,'claimed');
  return v_row;
end;
$function$;

create or replace function public.finish_ai_operator_pending_action(
  p_user_id uuid, p_session_id text, p_action_id uuid,
  p_status text, p_result_summary jsonb default null, p_failure_code text default null
) returns public.ai_operator_pending_actions
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.ai_operator_pending_actions; v_event text;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception 'Service role required.' using errcode='42501';
  end if;
  if p_status not in ('completed','failed') or
     (p_result_summary is not null and pg_catalog.octet_length(p_result_summary::text)>4000) then
    raise exception 'Invalid action completion.' using errcode='22023';
  end if;
  update public.ai_operator_pending_actions
    set status=p_status,completed_at=pg_catalog.now(),updated_at=pg_catalog.now(),
        result_summary=p_result_summary,failure_code=case when p_status='failed' then left(p_failure_code,120) else null end
    where id=p_action_id and user_id=p_user_id and session_id=p_session_id and status='executing'
    returning * into v_row;
  if not found then raise exception 'Action is not currently executing.' using errcode='55000'; end if;
  v_event := case when p_status='completed' then 'completed' else 'failed' end;
  insert into public.ai_operator_action_audit(action_id,user_id,session_id,capability_id,event,detail)
    values(v_row.id,p_user_id,p_session_id,v_row.capability_id,v_event,
      case when p_status='failed' then pg_catalog.jsonb_build_object('code',left(p_failure_code,120)) else '{}'::jsonb end);
  return v_row;
end;
$function$;

revoke all on function public.create_ai_operator_pending_action(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.approve_ai_operator_pending_action(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.claim_ai_operator_pending_action(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_ai_operator_pending_action(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_ai_operator_pending_action(uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.approve_ai_operator_pending_action(uuid,text,uuid) to service_role;
grant execute on function public.claim_ai_operator_pending_action(uuid,text,uuid) to service_role;
grant execute on function public.finish_ai_operator_pending_action(uuid,text,uuid,text,jsonb,text) to service_role;
