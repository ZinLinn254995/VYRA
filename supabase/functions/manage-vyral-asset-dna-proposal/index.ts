import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const object = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildPlan = (assessment: Record<string, any>, assessmentVersion: number, identity: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string }) => {
  const rules: Record<string, any> = {
    source_binding_mismatch: { code:'source_binding_mismatch', priority:'critical', target:'source_binding', action:'Rebind the DNA record to the exact Asset ID, Version ID, byte length and SHA-256.', acceptanceEvidence:'Asset, Version and DNA source identifiers, size and SHA-256 match exactly.' },
    source_file_storage_integrity_unverified: { code:'source_file_storage_integrity_unverified', priority:'critical', target:'source_integrity', action:'Verify original stored file bytes against immutable Asset Version size and SHA-256.', acceptanceEvidence:'Downloaded source byte length and computed SHA-256 match the pinned Asset Version.' },
    dna_schema_invalid: { code:'dna_schema_invalid', priority:'high', target:'schema', action:'Repair the DNA record to the declared schema version and rerun deterministic validation.', acceptanceEvidence:'Schema validator passes with no missing required fields or invalid types.' },
    reconstruction_payload_integrity_unverified: { code:'reconstruction_payload_integrity_unverified', priority:'critical', target:'payload', action:'Regenerate or re-upload the reconstruction payload, then verify every chunk/tile hash, byte length and coverage.', acceptanceEvidence:'All payload component hashes and aggregate integrity checks pass.' },
    declared_reconstruction_payload_missing: { code:'declared_reconstruction_payload_missing', priority:'high', target:'payload', action:'Generate the payload required by the declared recovery level, or downgrade the recovery declaration.', acceptanceEvidence:'Declared recovery level is backed by a present, validated payload.' },
    reconstruction_test_snapshot_mismatch: { code:'reconstruction_test_snapshot_mismatch', priority:'critical', target:'reconstruction', action:'Discard this test as evidence and rerun against the exact Asset Version, DNA record and source SHA-256.', acceptanceEvidence:'Test record pins the current Asset Version ID, DNA record ID and source SHA-256.' },
    exact_reconstruction_test_failed: { code:'exact_reconstruction_test_failed', priority:'high', target:'reconstruction', action:'Compare failed output using modality-specific metrics; update only evidence-supported DNA fields in a new DNA version.', acceptanceEvidence:'New-version reconstruction passes predeclared exactness criteria; historical records remain unchanged.' },
    reconstruction_test_mode_or_payload_mismatch: { code:'reconstruction_test_mode_or_payload_mismatch', priority:'high', target:'reconstruction', action:'Align recovery level, test mode and payload type; decoded-sample success cannot claim original-file byte recovery.', acceptanceEvidence:'Test mode equals the declared recovery level and payload proves that level.' },
  };
  const blockers: string[] = Array.isArray(assessment.blockers) ? assessment.blockers.filter((x: unknown) => typeof x === 'string') : [];
  const limitations: string[] = Array.isArray(assessment.limitations) ? assessment.limitations.filter((x: unknown) => typeof x === 'string') : [];
  const notes: Record<string,string> = { provenance_not_independently_verified:'Collect independent provenance evidence; creator declarations alone do not establish source history.', no_structured_knowledge_facts:'Capture verifiable structured facts with observation source and confidence.', decoded_sample_recovery_does_not_restore_original_encoded_file_bytes:'Decoded-sample exactness is not original-file byte exactness.', semantic_description_is_not_binary_reconstruction:'Semantic DNA may guide regeneration but does not contain a verified binary payload.', source_file_exact_claim_not_test_verified:'Do not advertise source-file exact recovery until a byte-exact test passes.' };
  return { planVersion:1, sourceAssessmentVersion:assessmentVersion, sourceIdentity:identity, improvements:blockers.filter((code) => rules[code]).map((code) => rules[code]), unmappedBlockers:[...new Set(blockers.filter((code) => !rules[code]))], informational:limitations.filter((code) => notes[code]).map((code) => notes[code]), safety:['This plan is advisory and does not mutate Asset DNA.','Accepted changes must create a new immutable DNA version.','Reassess and retest; never rewrite historical assessments or attempts.','Unknown blockers require engineering review and are never silently auto-fixed.'] };
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return reply({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (!userId) return reply({ error: 'A valid signed-in user session is required.' }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: 'Request body must be valid JSON.' }, 400); }
  const action = body.action;
  if (action === 'create') {
    const assessmentId = typeof body.assessmentId === 'string' ? body.assessmentId : '';
    if (!UUID.test(assessmentId)) return reply({ error: 'A valid assessment ID is required.' }, 400);
    const { data: assessmentRow, error: assessmentError } = await context.supabaseAdmin
      .from('vyral_asset_dna_assessments')
      .select('id,vyral_id,user_id,asset_id,asset_version_id,dna_record_id,source_sha256,assessment_version,assessment')
      .eq('id', assessmentId).eq('user_id', userId).maybeSingle();
    if (assessmentError) return reply({ error: 'Could not load the owner-scoped assessment.' }, 500);
    if (!assessmentRow || !object(assessmentRow.assessment)) return reply({ error: 'Assessment was not found.' }, 404);
    const identity = assessmentRow.assessment.identity;
    if (!object(identity) || identity.assetId !== assessmentRow.asset_id ||
        identity.assetVersionId !== assessmentRow.asset_version_id ||
        identity.dnaRecordId !== assessmentRow.dna_record_id ||
        String(identity.sourceSha256).toLowerCase() !== assessmentRow.source_sha256) {
      return reply({ error: 'Assessment identity does not match its immutable database snapshot.' }, 409);
    }
    const [version, dna] = await Promise.all([
      context.supabaseAdmin.from('vyral_asset_versions').select('id').eq('id', assessmentRow.asset_version_id)
        .eq('asset_id', assessmentRow.asset_id).eq('user_id', userId).maybeSingle(),
      context.supabaseAdmin.from('vyral_dna_records').select('id').eq('id', assessmentRow.dna_record_id)
        .eq('asset_id', assessmentRow.asset_id).eq('user_id', userId).eq('scope','asset').maybeSingle(),
    ]);
    if (version.error || dna.error) return reply({ error: 'Could not verify the proposal source snapshot.' }, 500);
    if (!version.data || !dna.data) return reply({ error: 'The source Asset Version or DNA record no longer exists.' }, 409);
    const [latestVersion, latestDna] = await Promise.all([
      context.supabaseAdmin.from('vyral_asset_versions').select('id').eq('asset_id', assessmentRow.asset_id)
        .eq('user_id', userId).order('version_number', { ascending: false }).limit(1).maybeSingle(),
      context.supabaseAdmin.from('vyral_dna_records').select('id').eq('asset_id', assessmentRow.asset_id)
        .eq('user_id', userId).eq('scope','asset').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latestVersion.error || latestDna.error) return reply({ error: 'Could not verify the latest Asset snapshot.' }, 500);
    if (latestVersion.data?.id !== assessmentRow.asset_version_id || latestDna.data?.id !== assessmentRow.dna_record_id) {
      return reply({ error: 'The assessment is no longer pinned to the latest Asset and DNA snapshot. Run a fresh assessment.' }, 409);
    }
    const plan = buildPlan(assessmentRow.assessment, Number(assessmentRow.assessment_version), {
      assetId: String(identity.assetId), assetVersionId: String(identity.assetVersionId),
      dnaRecordId: String(identity.dnaRecordId), sourceSha256: String(identity.sourceSha256),
    });
    const snapshot = { ...plan, assessmentId, createdFromAssessmentAt: new Date().toISOString() };
    const { data: inserted, error: insertError } = await context.supabaseAdmin
      .from('vyral_asset_dna_improvement_proposals')
      .insert({
        vyral_id: assessmentRow.vyral_id, user_id: userId, asset_id: assessmentRow.asset_id,
        asset_version_id: assessmentRow.asset_version_id, dna_record_id: assessmentRow.dna_record_id,
        assessment_id: assessmentId, source_sha256: assessmentRow.source_sha256,
        plan_version: plan.planVersion, proposal_snapshot: snapshot,
      }).select('id,status,created_at').maybeSingle();
    if (!insertError && inserted) return reply({ proposal: inserted, plan });
    if (insertError?.code === '23505') {
      const { data: existing, error: existingError } = await context.supabaseAdmin
        .from('vyral_asset_dna_improvement_proposals').select('id,status,created_at,proposal_snapshot')
        .eq('assessment_id', assessmentId).eq('user_id', userId).maybeSingle();
      if (!existingError && existing) return reply({ proposal: existing, plan: existing.proposal_snapshot ?? plan, reused: true });
    }
    return reply({ error: 'Could not persist the immutable improvement proposal.', detail: insertError?.message ?? null }, 500);
  }
  if (action === 'prepare_change_set') {
    const proposalId = typeof body.proposalId === 'string' ? body.proposalId : '';
    if (!UUID.test(proposalId)) return reply({ error: 'A valid proposal ID is required.' }, 400);
    const { data: proposal, error } = await context.supabaseAdmin
      .from('vyral_asset_dna_improvement_proposals')
      .select('id,user_id,asset_id,asset_version_id,dna_record_id,source_sha256,status,proposal_snapshot,change_set,change_set_sha256,change_set_status')
      .eq('id', proposalId).eq('user_id', userId).maybeSingle();
    if (error) return reply({ error: 'Could not load the owner-scoped proposal.' }, 500);
    if (!proposal) return reply({ error: 'Proposal was not found.' }, 404);
    if (proposal.status !== 'approved') return reply({ error: 'Only an approved proposal can prepare a change set.', status: proposal.status }, 409);
    if (proposal.change_set) return reply({ changeSet: proposal.change_set, sha256: proposal.change_set_sha256, status: proposal.change_set_status, reused: true });
    const [latestVersion, latestDna] = await Promise.all([
      context.supabaseAdmin.from('vyral_asset_versions').select('id').eq('asset_id', proposal.asset_id)
        .eq('user_id', userId).order('version_number', { ascending: false }).limit(1).maybeSingle(),
      context.supabaseAdmin.from('vyral_dna_records').select('id').eq('asset_id', proposal.asset_id)
        .eq('user_id', userId).eq('scope','asset').order('revision_number', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latestVersion.error || latestDna.error) return reply({ error: 'Could not verify the pinned source snapshot.' }, 500);
    if (latestVersion.data?.id !== proposal.asset_version_id || latestDna.data?.id !== proposal.dna_record_id) {
      await context.supabaseAdmin.from('vyral_asset_dna_improvement_proposals')
        .update({ status: 'stale' }).eq('id', proposalId).eq('user_id', userId).eq('status','approved');
      return reply({ error: 'The Asset or DNA revision changed after approval. A fresh assessment and proposal are required.', status: 'stale' }, 409);
    }
    const snapshot = object(proposal.proposal_snapshot) ? proposal.proposal_snapshot : {};
    const improvements = Array.isArray(snapshot.improvements) ? snapshot.improvements : [];
    const unmapped = Array.isArray(snapshot.unmappedBlockers) ? snapshot.unmappedBlockers : [];
    const informational = Array.isArray(snapshot.informational) ? snapshot.informational : [];
    // A proposal plan is not a safe executable patch. Persist remediation tasks,
    // but keep operations empty and the set blocked until evidence supplies exact before/after values.
    const changeSet = {
      schema: 'vyra.dna-change-set',
      schemaVersion: 1,
      proposalId,
      source: { assetId: proposal.asset_id, assetVersionId: proposal.asset_version_id,
        dnaRecordId: proposal.dna_record_id, sourceSha256: proposal.source_sha256 },
      tasks: [
        ...improvements.map((item: any) => ({ kind: 'remediation', code: item.code ?? 'unclassified',
          target: item.target ?? 'review_required', requiredEvidence: item.acceptanceEvidence ?? 'Engineering review and deterministic validation required.' })),
        ...unmapped.map((code: unknown) => ({ kind: 'unmapped_blocker', code: String(code), requiredEvidence: 'Explicit engineering mapping and test required.' })),
        ...informational.map((code: unknown) => ({ kind: 'evidence_gap', code: String(code), requiredEvidence: 'Collect and validate the missing evidence.' })),
      ],
      operations: [],
      applicability: { status: 'blocked', reason: 'No exact before/after DNA patch is justified by the current assessment snapshot. Verification tasks cannot be applied as DNA mutations.' },
      createdAt: new Date().toISOString(),
    };
    const canonical = JSON.stringify(changeSet);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2,'0')).join('');
    const { data: updated, error: saveError } = await context.supabaseAdmin
      .from('vyral_asset_dna_improvement_proposals')
      .update({ change_set: changeSet, change_set_sha256: sha256, change_set_status: 'blocked', change_set_prepared_at: new Date().toISOString() })
      .eq('id', proposalId).eq('user_id', userId).eq('status','approved').is('change_set', null)
      .select('id,change_set,change_set_sha256,change_set_status').maybeSingle();
    if (saveError || !updated) return reply({ error: 'Change set could not be saved; refresh the proposal before retrying.' }, 409);
    return reply({ changeSet: updated.change_set, sha256: updated.change_set_sha256,
      status: updated.change_set_status, dnaChanged: false, operationsApplied: 0 });
  }
  if (action === 'approve' || action === 'reject') {
    const proposalId = typeof body.proposalId === 'string' ? body.proposalId : '';
    if (!UUID.test(proposalId)) return reply({ error: 'A valid proposal ID is required.' }, 400);
    const { data: proposal, error: proposalError } = await context.supabaseAdmin
      .from('vyral_asset_dna_improvement_proposals')
      .select('id,user_id,asset_id,asset_version_id,dna_record_id,status')
      .eq('id', proposalId).eq('user_id', userId).maybeSingle();
    if (proposalError) return reply({ error: 'Could not load the owner-scoped proposal.' }, 500);
    if (!proposal) return reply({ error: 'Proposal was not found.' }, 404);
    if (proposal.status !== 'proposed') return reply({ error: 'This proposal has already been reviewed or is no longer actionable.', status: proposal.status }, 409);
    if (action === 'approve') {
      const [latestVersion, latestDna] = await Promise.all([
        context.supabaseAdmin.from('vyral_asset_versions').select('id').eq('asset_id', proposal.asset_id)
          .eq('user_id', userId).order('version_number', { ascending: false }).limit(1).maybeSingle(),
        context.supabaseAdmin.from('vyral_dna_records').select('id').eq('asset_id', proposal.asset_id)
          .eq('user_id', userId).eq('scope','asset').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (latestVersion.error || latestDna.error) return reply({ error: 'Could not verify the latest Asset snapshot.' }, 500);
      if (latestVersion.data?.id !== proposal.asset_version_id || latestDna.data?.id !== proposal.dna_record_id) {
        await context.supabaseAdmin.from('vyral_asset_dna_improvement_proposals')
          .update({ status: 'stale' }).eq('id', proposalId).eq('user_id', userId).eq('status','proposed');
        return reply({ error: 'The Asset or DNA changed after this plan was created. A fresh assessment is required.', status: 'stale' }, 409);
      }
    }
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const { data: updated, error: updateError } = await context.supabaseAdmin
      .from('vyral_asset_dna_improvement_proposals')
      .update({ status: nextStatus, reviewed_at: new Date().toISOString() })
      .eq('id', proposalId).eq('user_id', userId).eq('status','proposed')
      .select('id,status,reviewed_at').maybeSingle();
    if (updateError || !updated) return reply({ error: 'Proposal review could not be saved; refresh its state before retrying.' }, 409);
    return reply({ proposal: updated, dnaChanged: false, nextStep: nextStatus === 'approved'
      ? 'Approval is recorded only. A separate version-creation operation must validate and apply reviewed changes.'
      : 'The proposal was rejected. Canonical DNA remains unchanged.' });
  }
  return reply({ error: 'Unsupported action. Use create, approve, or reject.' }, 400);
});
