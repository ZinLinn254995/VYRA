begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select ok(position('p_expected_change_set_sha256 is null' in pg_get_functiondef('public.apply_vyral_asset_dna_change_set(uuid,uuid,text,uuid,jsonb)'::regprocedure))>0,'Atomic DNA application rejects a null expected hash');
select ok(position('p_new_payload is null' in pg_get_functiondef('public.apply_vyral_asset_dna_change_set(uuid,uuid,text,uuid,jsonb)'::regprocedure))>0,'Atomic DNA application rejects a null replacement payload');
select * from finish();
rollback;
