import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { buildVyralDnaImprovementPlanV1 } from '../../../src/services/vyralDnaImprovementPlanV1.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const object = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    const plan = buildVyralDnaImprovementPlanV1({
      assessmentVersion: Number(assessmentRow.assessment_version),
      identity: {
        assetId: String(identity.assetId), assetVersionId: String(identity.assetVersionId),
        dnaRecordId: String(identity.dnaRecordId), sourceSha256: String(identity.sourceSha256),
      },
      blockers: Array.isArray(assessmentRow.assessment.blockers) ? assessmentRow.assessment.blockers : [],
      limitations: Array.isArray(assessmentRow.assessment.limitations) ? assessmentRow.assessment.limitations : [],
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
