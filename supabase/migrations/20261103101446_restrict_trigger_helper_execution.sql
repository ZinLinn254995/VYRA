-- Restrict execution of internal trigger helpers to the database owner.
-- These functions are invoked by PostgreSQL triggers, not exposed as RPC endpoints.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function public.assert_credit_transfer_balanced() from public, anon, authenticated, service_role;

-- This helper may exist on older manually provisioned environments only.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end
$$;
