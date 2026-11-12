import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [chat, service, server, entry, promotion] = await Promise.all([
  readFile(new URL('../src/components/ai/AIChatPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/aiService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/server/ai.ts', import.meta.url), 'utf8'),
  readFile(new URL('../server.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/promote-vyral-vision-field/index.ts', import.meta.url), 'utf8'),
]);

test('Vyral chat verifies DNA before creating a separate vision derivative', () => {
  assert.match(chat, /reconstructVyralDnaV3FromPackage/);
  assert.match(chat, /encodeVyralDnaV3PngFromPackage/);
  assert.match(chat, /createVyralVisionPreview/);
  assert.match(chat, /lossless DNA remains unchanged/);
});

test('AI Chat validates Universal File DNA and clearly separates byte identity from semantic inspection', () => {
  assert.match(chat, /validateVyralFileDnaV1Record/);
  assert.match(chat, /reconstructVyralFileDnaFromPackage/);
  assert.match(chat, /analyzeVyralFileStructureV1/);
  assert.match(chat, /File DNA record references a different Asset/);
  assert.match(chat, /pinned to a different Asset version/);
  assert.match(chat, /independently re-analyzed source bytes/);
  assert.match(chat, /full-package original version/);
  assert.match(chat, /exact source bytes reconstructed from DNA/);
  assert.match(chat, /structureProfile/);
  assert.match(chat, /structureFacts/);
  assert.match(chat, /structureNotes/);
  assert.match(chat, /semantic content was not inferred or attached to Vision/);
  assert.match(chat, /File DNA binaries are integrity-checked but their audio\/video\/document contents are not decoded or attached to Vision/);
});

test('up to four labelled Vyral asset previews are forwarded through the authenticated Gemini proxy', () => {
  assert.match(chat, /visionImages/);
  assert.match(chat, /v3Records\.slice\(0, 4\)/);
  assert.match(chat, /assetName/);
  assert.match(service, /request\.visionImages\?\.length/);
  assert.match(service, /visionImages:\s*request\.visionImages/);
  assert.match(service, /if \(request\.visionImages\?\.length\) \{/);
  assert.match(service, /No text-only preview was substituted/);
  assert.match(server, /if \(\!\(await requireVerifiedVYraSession\(req, res\)\)\) return;/);
  assert.match(server, /visionImages\.length > 4/);
  assert.match(server, /inlineData:\s*\{\s*mimeType:\s*item\.mimeType,\s*data:\s*item\.data\s*\}/);
});
test('server rejects oversized, malformed, or MIME-mismatched vision payloads', () => {
  assert.match(server, /data\.length > 1_200_000/);
  assert.match(server, /imageBytes\.byteLength > 600 \* 1024/);
  assert.match(server, /exceeds the 600 KB limit/);
  assert.match(server, /totalImageBytes > 2_400 \* 1024/);
  assert.match(server, /MIME type does not match its file signature/);
  assert.match(server, /totalImageBytes > 2_400 \* 1024/);
  assert.match(entry, /express\.json\(\{ limit: '8mb' \}\)/);
});


test('new Asset uploads persist automatic AI observations against the exact source version', async () => {
  const details = await readFile(new URL('../src/components/profile/VyralDetailsContent.tsx', import.meta.url), 'utf8');
  assert.match(details, /suggestVyralAssetDetails\(file/);
  assert.match(details, /record-vyral-vision-observation/);
  assert.match(details, /assetId,\s*versionId: version\.id/);
  assert.match(details, /analysis_origin: 'automatic_upload_analysis'/);
  assert.match(details, /analysis_basis: 'uploaded_source_metadata_and_supported_derived_preview'/);
  assert.match(details, /visionRecord\?\.status !== 'recorded'/);
  assert.match(details, /does not\\s*\\/\\/ creator-confirm the model's claims/);
  assert.match(details, /accessToken && !isVyralPackageAsset/);
  assert.match(details, /ai_details_status: isVyralPackageAsset/);
  assert.match(details, /vyral_vision_creator_evidence/);
  assert.match(details, /visionReviews/);
  assert.match(details, /AI Vision observations/);
  assert.match(details, /Confirm observation/);
  assert.match(details, /reviewVisionObservation\(item\.id, 'creator_confirmed'\)/);
  assert.match(details, /Confirm a Knowledge field/);
  assert.match(details, /promotablePaths = Object.keys\(fields\)/);
  assert.match(details, /knowledgeFieldName = observationFieldPath\.slice/);
  assert.match(details, /body: \{ observationId, fieldPath, observationFieldPath, acceptedValue, note \}/);
  assert.match(details, /data\?\.status !== 'field_confirmed'/);
  assert.match(details, /Confirmed Knowledge:/);
  assert.match(details, /evidence_kind === 'field_confirmation'/);
});

test('Vision field promotion is limited to editable knowledge fields and exact source evidence', () => {
  assert.match(promotion, /dnaPathParts\[0\] !== 'knowledge'/);
  assert.match(promotion, /forbiddenDnaSegments/);
  assert.match(promotion, /Protected DNA identity, provenance, integrity and licensing fields cannot be promoted/);
  assert.match(promotion, /stableJson\(field\.value\) !== stableJson\(body\.acceptedValue\)/);
  assert.match(promotion, /creator confirmation before field promotion/);
  assert.match(promotion, /review\.asset_version_id !== version\.id/);
  assert.match(promotion, /review\.source_sha256 !== observation\.source_sha256\.toLowerCase\(\)/);
});

test('Creator evidence resolver verifies both the review and original Vision observation', async () => {
  const proposal = await readFile(new URL('../supabase/functions/manage-vyral-asset-dna-proposal/index.ts', import.meta.url), 'utf8');
  assert.match(proposal, /observationResult/);
  assert.match(proposal, /observations\.has\(record\.observation_id\)/);
  assert.match(proposal, /reviews\.get\(record\.review_evidence_id\)\?\.observation_id === record\.observation_id/);
  assert.match(proposal, /fieldPath === record\.field_path && sameJson\(operation\.after, record\.accepted_value\)/);
});
