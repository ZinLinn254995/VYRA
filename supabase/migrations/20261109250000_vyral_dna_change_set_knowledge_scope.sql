-- Restrict creator-confirmed DNA change sets to non-identity knowledge fields only.
-- Bind atomic DNA revision application to the exact approved proposal snapshot.
CREATE OR REPLACE FUNCTION public.apply_vyral_asset_dna_change_set(p_proposal_id uuid, p_user_id uuid, p_expected_change_set_sha256 text, p_new_dna_record_id uuid, p_new_payload jsonb)
 RETURNS TABLE(dna_record_id uuid, revision_number integer, proposal_status text, reused boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  proposal public.vyral_asset_dna_improvement_proposals%rowtype;
  current_dna public.vyral_dna_records%rowtype;
  latest_version_id uuid;
  expected_payload jsonb;
  operation jsonb;
  operation_index integer := 0;
  operation_count integer := 0;
  pointer_parts text[];
  field_path text;
  parent_value jsonb;
  current_value jsonb;
  evidence_ref jsonb;
  evidence_valid boolean;
  new_revision integer;
  new_record_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the trusted server can apply a validated DNA change set';
  end if;
  if p_proposal_id is null or p_user_id is null or p_new_dna_record_id is null
    or p_expected_change_set_sha256 !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_new_payload) <> 'object' then
    raise exception 'Invalid DNA change-set application request';
  end if;

  select * into proposal
  from public.vyral_asset_dna_improvement_proposals
  where id = p_proposal_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Owner-scoped DNA proposal was not found'; end if;

  if proposal.status = 'applied' then
    return query select proposal.applied_dna_record_id,
      (select d.revision_number from public.vyral_dna_records d where d.id = proposal.applied_dna_record_id),
      proposal.status, true;
    return;
  end if;
  if proposal.status <> 'approved' or proposal.change_set is null
    or proposal.change_set->>'proposalId' <> proposal.id::text
    or proposal.change_set->>'schema' <> 'vyra.dna-change-set'
    or (proposal.change_set->>'schemaVersion')::integer <> 1
    or proposal.change_set#>>'{source,assetId}' <> proposal.asset_id::text
    or proposal.change_set#>>'{source,assetVersionId}' <> proposal.asset_version_id::text
    or proposal.change_set#>>'{source,dnaRecordId}' <> proposal.dna_record_id::text
    or proposal.change_set#>>'{source,sourceSha256}' <> proposal.source_sha256
    or proposal.change_set_status <> 'validated'
    or proposal.change_set_sha256 <> p_expected_change_set_sha256
    or proposal.change_set_validation_report is null
    or proposal.change_set_validation_report->>'status' <> 'validated'
    or proposal.change_set_validation_report->>'changeSetSha256' <> proposal.change_set_sha256
    or proposal.change_set_validation_report#>>'{checks,hash}' <> 'pass'
    or proposal.change_set_validation_report#>>'{checks,schema}' <> 'pass'
    or proposal.change_set_validation_report#>>'{checks,sourceBinding}' <> 'pass'
    or proposal.change_set_validation_report#>>'{checks,operations}' <> 'pass'
    or proposal.change_set_validation_report#>>'{checks,evidence}' <> 'pass' then
    raise exception 'Proposal does not contain a fully validated, hash-pinned DNA change set';
  end if;

  perform 1 from public.vyral_assets a
    where a.id = proposal.asset_id and a.vyral_id = proposal.vyral_id and a.user_id = p_user_id
    for update;
  if not found then raise exception 'Source Asset ownership could not be verified'; end if;

  select v.id into latest_version_id
  from public.vyral_asset_versions v
  where v.asset_id = proposal.asset_id and v.user_id = p_user_id
  order by v.version_number desc limit 1;
  if latest_version_id is distinct from proposal.asset_version_id then
    raise exception 'Asset Version changed after validation; reassess before applying';
  end if;

  select d.* into current_dna
  from public.vyral_dna_records d
  where d.asset_id = proposal.asset_id and d.user_id = p_user_id and d.scope = 'asset'
  order by d.revision_number desc limit 1
  for update;
  if not found or current_dna.id <> proposal.dna_record_id then
    raise exception 'DNA revision changed after validation; reassess before applying';
  end if;
  if current_dna.payload#>>'{dna_record,source,asset_version_id}' <> proposal.asset_version_id::text
    or lower(current_dna.payload#>>'{dna_record,source,sha256}') <> proposal.source_sha256 then
    raise exception 'Current DNA source binding no longer matches the approved snapshot';
  end if;

  if jsonb_typeof(proposal.change_set->'operations') <> 'array' then
    raise exception 'Validated change set operations are malformed';
  end if;
  operation_count := jsonb_array_length(proposal.change_set->'operations');
  if operation_count < 1 or (proposal.change_set_validation_report->>'validatedOperationCount')::integer <> operation_count then
    raise exception 'A non-empty, fully validated operation list is required';
  end if;

  expected_payload := current_dna.payload;
  for operation in select value from jsonb_array_elements(proposal.change_set->'operations') loop
    operation_index := operation_index + 1;
    if operation->>'op' not in ('add','replace') or jsonb_typeof(operation->'path') <> 'string'
      or left(operation->>'path',1) <> '/' then
      raise exception 'Unsupported DNA patch operation at index %', operation_index - 1;
    end if;
    pointer_parts := string_to_array(substr(operation->>'path',2),'/');
    if coalesce(array_length(pointer_parts,1),0) < 3 then
      raise exception 'DNA patch path is too short';
    end if;
    pointer_parts := array(
      select replace(replace(part,'~1','/'),'~0','~')
      from unnest(pointer_parts) with ordinality as parts(part,ordinality)
      order by ordinality
    );
    if pointer_parts[1] <> 'dna_record'
      or pointer_parts[2] <> 'knowledge'
      or exists (
        select 1 from unnest(pointer_parts) part
        where lower(part) in ('__proto__','prototype','constructor','id','asset_id','asset_version_id',
          'source','identity','provenance','fingerprint','fingerprints','integrity','licensing','signature',
          'created_at','updated_at','revision_number','parent_dna_record_id')
      )
      or exists (select 1 from unnest(pointer_parts) part where part = '') then
      raise exception 'DNA patch targets a protected or unsupported path';
    end if;
    field_path := array_to_string(pointer_parts[2:array_length(pointer_parts,1)],'.');
    if jsonb_typeof(operation->'evidenceRefs') <> 'array' or jsonb_array_length(operation->'evidenceRefs') < 1 then
      raise exception 'DNA patch operation has no creator evidence';
    end if;
    parent_value := expected_payload #> pointer_parts[1:array_length(pointer_parts,1)-1];
    if jsonb_typeof(parent_value) <> 'object' then
      raise exception 'DNA patch parent path must already exist as an object';
    end if;
    current_value := expected_payload #> pointer_parts;
    if operation->>'op' = 'add' then
      if current_value is not null or not (operation ? 'after') then
        raise exception 'DNA add target already exists or has no after value';
      end if;
    else
      if current_value is null or current_value is distinct from operation->'before'
        or not (operation ? 'after') or operation->'before' is not distinct from operation->'after' then
        raise exception 'DNA replacement before value does not match current source';
      end if;
    end if;

    for evidence_ref in select value from jsonb_array_elements(operation->'evidenceRefs') loop
      if jsonb_typeof(evidence_ref) <> 'string' or (evidence_ref #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Creator evidence reference is invalid';
      end if;
      select exists (
        select 1
        from public.vyral_vision_creator_evidence e
        join public.vyral_vision_creator_evidence r
          on r.id = e.review_evidence_id
          and r.user_id = e.user_id and r.asset_id = e.asset_id
          and r.asset_version_id = e.asset_version_id and r.source_sha256 = e.source_sha256
          and r.observation_id = e.observation_id
          and r.evidence_kind = 'observation_review' and r.decision = 'creator_confirmed'
        join public.vyral_vision_observations o
          on o.id = e.observation_id and o.user_id = e.user_id and o.asset_id = e.asset_id
          and o.asset_version_id = e.asset_version_id and o.source_sha256 = e.source_sha256
        where e.id = (evidence_ref #>> '{}')::uuid
          and e.user_id = p_user_id and e.asset_id = proposal.asset_id
          and e.asset_version_id = proposal.asset_version_id
          and e.source_sha256 = proposal.source_sha256
          and e.evidence_kind = 'field_confirmation' and e.decision = 'creator_confirmed'
          and e.field_path = field_path and e.accepted_value = operation->'after'
      ) into evidence_valid;
      if not evidence_valid then raise exception 'Creator evidence does not authorize DNA patch operation'; end if;
    end loop;

    expected_payload := jsonb_set(expected_payload,pointer_parts,operation->'after',true);
  end loop;

  expected_payload := jsonb_set(expected_payload,'{dna_record,record_id}',to_jsonb(p_new_dna_record_id::text),false);
  if expected_payload is distinct from p_new_payload then
    raise exception 'Submitted DNA payload does not equal the validated deterministic patch result';
  end if;

  new_revision := current_dna.revision_number + 1;
  if new_revision < 1 then raise exception 'DNA revision counter overflow'; end if;

  insert into public.vyral_dna_records (
    id,vyral_id,user_id,asset_id,scope,parent_dna_record_id,revision_number,
    schema_version,dna_status,payload,reconstruction_data,source_kind,verification_status
  ) values (
    p_new_dna_record_id,current_dna.vyral_id,current_dna.user_id,current_dna.asset_id,'asset',
    current_dna.id,new_revision,current_dna.schema_version,'evolving',expected_payload,
    current_dna.reconstruction_data,'creator','observed'
  ) returning id into new_record_id;

  update public.vyral_asset_dna_improvement_proposals
  set status = 'applied', applied_at = now(), applied_dna_record_id = new_record_id
  where id = proposal.id and user_id = p_user_id and status = 'approved';

  return query select new_record_id,new_revision,'applied'::text,false;
end;
$function$
;
