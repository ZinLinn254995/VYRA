-- Authenticated, read-only wallet summary derived from the append-only credit ledger.
-- No browser-facing financial write operation is introduced by this migration.

create or replace function public.get_credit_wallet()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_available bigint;
  v_reserved bigint;
  v_username text;
  v_display_name text;
  v_recent_activity jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.username, p.display_name
  into v_username, v_display_name
  from public.profiles p
  where p.id = v_user_id;

  select
    coalesce(sum(e.available_delta), 0)::bigint,
    coalesce(sum(e.reserved_delta), 0)::bigint
  into v_available, v_reserved
  from public.credit_ledger_entries e
  where e.user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', activity.id,
        'entryType', activity.entry_type,
        'availableDelta', activity.available_delta::text,
        'reservedDelta', activity.reserved_delta::text,
        'note', activity.note,
        'createdAt', activity.created_at,
        'counterpartyUsername', counterparty.username,
        'counterpartyDisplayName', counterparty.display_name
      ) order by activity.created_at desc
    ),
    '[]'::jsonb
  )
  into v_recent_activity
  from (
    select e.id, e.entry_type, e.available_delta, e.reserved_delta,
           e.note, e.created_at, e.metadata
    from public.credit_ledger_entries e
    where e.user_id = v_user_id
    order by e.created_at desc, e.id desc
    limit 50
  ) activity
  left join public.profiles counterparty
    on counterparty.id = nullif(activity.metadata ->> 'counterparty_user_id', '')::uuid;

  return jsonb_build_object(
    'account', jsonb_build_object(
      'username', v_username,
      'displayName', v_display_name
    ),
    'availableBalance', v_available::text,
    'reservedBalance', v_reserved::text,
    'recentActivity', v_recent_activity
  );
end;
$$;

revoke all on function public.get_credit_wallet() from public, anon;
grant execute on function public.get_credit_wallet() to authenticated;

comment on function public.get_credit_wallet() is
  'Authenticated read-only wallet snapshot. Balances are calculated from the append-only ledger; recent activity excludes private metadata.';
