-- The legacy classification RPC is owner-scoped and now has equivalent table grants/RLS.
-- Run it with caller privileges rather than exposing a SECURITY DEFINER function in public.
alter function public.set_vyral_master_dna_asset_classification(uuid,text,text,uuid,text)
  security invoker;
