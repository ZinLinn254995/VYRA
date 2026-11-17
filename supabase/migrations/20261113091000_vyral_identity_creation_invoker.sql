-- The RPC can operate under the existing owner-scoped INSERT/SELECT RLS policies.
-- Keep it SECURITY INVOKER to avoid expanding the authenticated SECURITY DEFINER surface.
alter function public.create_vyral_identity_with_dna(uuid, text, text) security invoker;