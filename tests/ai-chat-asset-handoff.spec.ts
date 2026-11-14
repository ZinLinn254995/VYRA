import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('AI Chat routes Vyral creation and attached Asset proposals through the shared executor', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  assert.match(edge, /'vyral\.propose_create': 'propose_vyral_create'/);
  assert.match(edge, /'asset\.propose_upload': 'propose_vyral_asset_upload'/);
  assert.match(edge, /for \(const capabilityId of Object\.keys\(PROPOSAL_CAPABILITY_TOOLS\)/);
  assert.match(edge, /createVyralCreateProposal\(admin, execution\.userId, sessionId, rawArguments, toolCallId\)/);
  assert.match(edge, /createVyralAssetUploadProposal\(admin, execution\.userId, sessionId, rawArguments, toolCallId, attachment/);
  assert.match(edge, /runtime\.uploadAttachment/);
  assert.match(edge, /const attachment = isPlainRecord\(runtime\.uploadAttachment\)/);
});

test('confirmed Vyral creation uses the atomic owner-scoped RPC and verifies the single Root DNA record', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const start = edge.indexOf("registerAiCapabilityAdapter({\n  capabilityId: 'vyral.create'");
  const end = edge.indexOf('async function executePendingVyralCreateApproval', start);
  const block = edge.slice(start, end);
  assert.ok(start >= 0 && end > start, 'The confirmed Vyral create adapter must exist.');
  assert.match(block, /validateVyralCreatePendingAction/);
  assert.match(block, /\.eq\('user_id', execution\.userId\)\.eq\('session_id', sessionId\)/);
  assert.match(block, /userClient\.rpc\('create_vyral_identity_with_dna'/);
  assert.doesNotMatch(block, /admin\.rpc\('create_vyral_identity_with_dna'/);
  assert.match(block, /\.eq\('scope', 'vyral'\)\.is\('asset_id', null\)\.limit\(2\)/);
  assert.match(block, /rootDna\.length !== 1/);
  assert.match(block, /p_status: 'completed'/);
  assert.ok(block.indexOf('rootDna.length !== 1') < block.indexOf("p_status: 'completed'"),
    'Creation cannot be reported complete before the identity and exactly one Root DNA are verified.');
});

test('approved Asset upload is bound to the exact local file, owner and destination Vyral', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const start = page.indexOf("if (operatorAction?.type === 'asset-upload-approved')");
  const end = page.indexOf('// A provider response or post-response Asset transfer', start);
  const browserFlow = page.slice(start, end);
  assert.ok(start >= 0 && end > start, 'The approved upload handoff must exist in AI Chat.');
  assert.match(browserFlow, /pendingVyralUploadFilesRef\.current\.get\(clientDraftId\)/);
  assert.match(browserFlow, /sourceFile\.name !== fileName/);
  assert.match(browserFlow, /sourceFile\.size !== sizeBytes/);
  assert.match(browserFlow, /sourceFile\.type[\s\S]*?mimeType\.toLowerCase\(\)/);
  assert.match(browserFlow, /authData\.user\?\.id !== requestOwnerId/);
  assert.match(browserFlow, /\.eq\('id', vyralId\)\.eq\('user_id', authData\.user\.id\)/);
  assert.match(edge, /type: 'asset-upload-approved'/);
  assert.match(edge, /clientDraftId: plan\.parameters\.clientDraftId/);
  assert.match(edge, /vyralId: plan\.target\.vyralId/);
  assert.match(edge, /fileName: plan\.parameters\.fileName/);
  assert.match(edge, /mimeType: plan\.parameters\.mimeType/);
  assert.match(edge, /sizeBytes: plan\.parameters\.sizeBytes/);
});

test('approved upload uses canonical Asset DNA ingestion and indexes the same Asset in Cloud My Media Library', () => {
  const page = read('src/components/ai/AIChatPage.tsx');
  const ingestion = read('src/services/vyralAssetIngestion.ts');
  const start = page.indexOf("if (operatorAction?.type === 'asset-upload-approved')");
  const end = page.indexOf('// A provider response or post-response Asset transfer', start);
  const block = page.slice(start, end);
  assert.match(block, /await ingestVyralAsset\(createSupabaseVyralAssetIngestionPort\(supabase\)/);
  assert.match(block, /vyralId: destination\.id, userId: authData\.user\.id, file: sourceFile, assetName/);
  assert.match(block, /await registerVyralAssetInMediaLibrary\(/);
  assert.match(block, /assetId: ingested\.assetId/);
  assert.match(block, /sourceKind: 'vyral_asset'/);
  assert.match(block, /await supabase\.functions\.invoke\('vyra-openai-chat',[\s\S]*?assetUploadCompletion/);
  assert.match(block, /completion\?\.status !== 'completed'/);
  assert.match(ingestion, /await port\.uploadOriginal\(storagePath, file, mimeType\)/);
  assert.match(ingestion, /await port\.createVersion\(/);
  assert.match(ingestion, /await port\.createFingerprint\(/);
  assert.match(ingestion, /extractRasterDna\(assetId, versionId/);
  assert.match(ingestion, /await port\.markReady\(assetId, input\.userId\)/);
});

test('server accepts upload completion only after re-verifying owner, immutable Version and Asset DNA', () => {
  const edge = read('supabase/functions/vyra-openai-chat/index.ts');
  const start = edge.indexOf('async function completeVyralAssetUpload(');
  const end = edge.indexOf('\nasync function ', start + 10);
  const block = edge.slice(start, end);
  assert.ok(start >= 0 && end > start, 'The server-side upload completion verifier must exist.');
  assert.match(block, /\.eq\('id', completion\.actionId\)\.eq\('user_id', userId\)\.eq\('session_id', sessionId\)/);
  assert.match(block, /pending\.capability_id !== 'asset\.upload'/);
  assert.match(block, /pending\.status !== 'executing'/);
  assert.match(block, /asset\.original_filename !== plan\.parameters\.fileName/);
  assert.match(block, /asset\.processing_status !== 'ready'/);
  assert.match(block, /version\.sha256 !== asset\.sha256/);
  assert.match(block, /\.eq\('scope', 'asset'\)/);
  assert.match(block, /p_status: 'completed'/);
  assert.ok(block.indexOf('!dna') < block.indexOf("p_status: 'completed'"),
    'The server must verify Asset DNA before completing the upload audit.');
});
