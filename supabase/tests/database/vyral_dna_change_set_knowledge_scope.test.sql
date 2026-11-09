begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select ok(position('pointer_parts[2] <> ''knowledge''' in pg_get_functiondef('public.apply_vyral_asset_dna_change_set(uuid,uuid,text,uuid,jsonb)'::regprocedure))>0,'Database application permits only knowledge-field patches');
select ok(position('change_set->>''proposalId'' <> proposal.id::text' in pg_get_functiondef('public.apply_vyral_asset_dna_change_set(uuid,uuid,text,uuid,jsonb)'::regprocedure))>0,'Change set must be bound to the exact proposal');
select ok(position('knowledge' in pg_get_functiondef('public.apply_vyral_asset_dna_change_set(uuid,uuid,text,uuid,jsonb)'::regprocedure))>0,'Application guard retains DNA knowledge scope');
select * from finish();
rollback;
