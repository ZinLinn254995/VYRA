-- Explicitly scope the registry's only RLS policy to the privileged server role.
drop policy if exists vyral_quality_standards_service_role_only on public.vyral_quality_standards;
create policy vyral_quality_standards_service_role_only
  on public.vyral_quality_standards
  for all to service_role
  using (true)
  with check (true);
