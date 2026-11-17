-- Source-controlled idempotent definition of the authenticated Vyral identity + initial DNA RPC.
-- The original Dev migrations were applied through the database workflow; this later
-- sync migration keeps fresh environments and repository history reproducible.
create or replace function public.create_vyral_identity_with_dna(
  p_vyral_id uuid,
  p_name text,
  p_description text default ''
) returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.vyrals;
  v_created boolean := false;
  v_dna_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_vyral_id is null
     or p_name is null or char_length(btrim(p_name)) not between 1 and 100
     or p_description is null or char_length(p_description) > 1000 then
    raise exception 'Invalid Vyral identity details.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_vyral_id::text, 0));

  insert into public.vyrals (
    id, user_id, name, description, visibility, lifecycle_status, dna_status,
    dna_schema_version, license_policy, metadata
  ) values (
    p_vyral_id, v_user_id, btrim(p_name), p_description, 'private', 'draft', 'evolving',
    1,
    '{"allow_ai_analysis":true,"allow_ai_generation":true,"allow_remix":false,"allow_redistribution":false,"commercial_use":false,"require_attribution":true}'::jsonb,
    pg_catalog.jsonb_build_object(
      'identity_initialized', true,
      'package_format', '.vyral',
      'identity_name_origin', 'creator_edited',
      'identity_description_origin', case when p_description <> '' then 'creator_edited' else 'system_default' end,
      'ai_details_status', 'pending',
      'creation_source', 'global_ai_chat',
      'creation_draft_id', p_vyral_id
    )
  )
  on conflict (id) do nothing
  returning * into v_existing;

  if found then
    v_created := true;
  else
    select * into v_existing
      from public.vyrals
      where id = p_vyral_id
      for update;
    if not found or v_existing.user_id <> v_user_id
       or v_existing.metadata ->> 'creation_draft_id' is distinct from p_vyral_id::text
       or v_existing.metadata ->> 'creation_source' is distinct from 'global_ai_chat' then
      raise exception 'Vyral ID is already in use by another record.' using errcode = '23505';
    end if;
  end if;

  if not exists (
    select 1 from public.vyral_dna_records
    where vyral_id = p_vyral_id and user_id = v_user_id
      and scope = 'vyral' and asset_id is null
  ) then
    insert into public.vyral_dna_records (
      id, vyral_id, user_id, scope, schema_version, dna_status,
      source_kind, verification_status, payload, reconstruction_data
    ) values (
      gen_random_uuid(), p_vyral_id, v_user_id, 'vyral', 1, 'evolving',
      'creator', 'creator_confirmed',
      pg_catalog.jsonb_build_object(
        'identity', pg_catalog.jsonb_build_object('name', btrim(p_name), 'description', p_description),
        'authority', pg_catalog.jsonb_build_object('creator_is_source_of_truth', true),
        'knowledge', pg_catalog.jsonb_build_object('creator_defined', '[]'::jsonb, 'vision_observations', '[]'::jsonb, 'relationships', '[]'::jsonb),
        'reconstruction', pg_catalog.jsonb_build_object('dna_only_test', 'not_tested', 'exact_reconstruction_verified', false)
      ),
      '{"original_media_policy":"preserve_original_binary","reconstruction_runner":"not_connected"}'::jsonb
    );
    v_dna_created := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'vyral_id', p_vyral_id,
    'created', v_created,
    'dna_created', v_dna_created,
    'identity_dna_status', 'creator_confirmed'
  );
end;
$function$;

revoke all on function public.create_vyral_identity_with_dna(uuid, text, text) from public, anon;
grant execute on function public.create_vyral_identity_with_dna(uuid, text, text) to authenticated, service_role;
