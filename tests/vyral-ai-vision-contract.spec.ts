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

test('Vyral image previews are prepared locally but never routed to Gemini', () => {
  assert.match(chat, /visionImages/);
  assert.match(chat, /v3Records\.slice\(0, 4\)/);
  assert.match(chat, /assetName/);
  assert.match(service, /request\.visionImages\?\.length \|\| request\.mediaFiles\?\.length/);
  assert.match(service, /OpenAI text chat is available/);
  assert.doesNotMatch(service, /Google Gemini|gemini-[0-9]/i);
  assert.match(server, /OPENAI_MULTIMODAL_NOT_ENABLED/);
  assert.doesNotMatch(server, /gemini|Google Gemini/i);
  assert.match(entry, /express\.json\(\{ limit: '8mb' \}\)/);
});

test('new Asset uploads persist automatic AI observations against the exact source version', async () => {
  const details = await readFile(new URL('../src/components/profile/VyralDetailsContent.tsx', import.meta.url), 'utf8');
  assert.match(details, /suggestVyralAssetDetails\(file/);
  assert.match(details, /record-vyral-vision-observation/);
  assert.match(details, /assetId,\s*versionId: version\.id/);
  assert.match(details, /analysis_origin: 'automatic_upload_analysis'/);
  assert.match(details, /hasSupportedAnalysisInput/);
  assert.match(details, /analysis_basis: analysisBasis/);
  assert.match(details, /derived_preview_from_source_version/);
  assert.match(details, /original_document_or_audio_content/);
  assert.match(details, /extracted_text_from_source_version/);
  assert.match(details, /const retryVisionAnalysis = async \(asset: AssetRow\)/);
  assert.match(details, /download\(sourceVersion\.storage_path\)/);
  assert.match(details, /manual_retry_after_automatic_failure/);
  assert.match(details, /reprocessed_original_source_version/);
  assert.match(details, /Retry AI analysis/);
  assert.match(details, /ai_vision_status: 'failed'/);
  assert.match(details, /ai_vision_status: 'recorded'/);
  assert.match(details, /visionRecord\?\.status !== 'recorded'/);
  assert.ok(details.includes("// creator-confirm the model's claims"));
  assert.match(details, /accessToken && vyral\.license_policy\?\.allow_ai_analysis !== false && !isVyralPackageAsset/);
  assert.match(details, /blocked_by_license/);
  assert.match(details, /ai_details_status: isVyralPackageAsset/);
  assert.match(details, /vyral_vision_creator_evidence/);
  assert.match(details, /visionReviews/);
  assert.match(details, /AI Vision observations/);
  assert.match(details, /Confirm observation/);
  assert.match(details, /type VisionQuality =/);
  assert.match(details, /assessVisionQuality\(item\.observation\)/);
  assert.match(details, /low-confidence field/);
  assert.match(details, /stated uncertainty/);
  assert.match(details, /Model confidence is self-reported/);
  assert.match(details, /Creator review remains required/);
  assert.match(details, /visionComparisonGroups\.some/);
  assert.match(details, /AI model disagreements/);
  assert.match(details, /Different AI models reported different values/);
  assert.match(details, /No model is selected automatically/);
  assert.match(details, /visionKnowledgeConflicts\.length > 0/);
  assert.match(details, /Conflicting creator-confirmed Knowledge/);
  assert.match(details, /Prefer one value/);
  assert.match(details, /Keep both as contextual/);
  assert.match(details, /competingIds\.length === recordIds\.size/);
  assert.match(details, /const assetVersionEvidenceTimeline = useMemo/);
  assert.match(details, /Asset DNA evidence timeline/);
  assert.match(details, /Each observation and fingerprint remains attached to the exact source version/);
  assert.match(details, /version\.sha256 \? version\.sha256 : 'Not recorded'/);
  assert.match(details, /versionObservations\.length/);
  assert.match(details, /versionFingerprints\.length/);
  assert.match(details, /AI-reported comparison with Version/);
  assert.match(details, /changedPaths\.length/);
  assert.match(details, /unchangedCount/);
  assert.match(details, /does not certify a real asset change/);
  assert.match(details, /verifyRasterVisualFingerprint/);
  assert.match(details, /fingerprint-vyral-raster-version/);
  assert.match(details, /Visual fingerprint · dHash-64/);
  assert.match(details, /compareVyralDHash64/);
  assert.match(details, /verification_status === 'server_verified'/);
  assert.match(details, /extract-vyral-asset-dna-v3', 'fingerprint-vyral-raster-version'/);
  assert.match(details, /Number\.isSafeInteger\(Number\(decodedImage\.width\)\)/);
  assert.match(details, /decodedImage\.channel_layout === previousDecodedImage\.channel_layout/);
  assert.match(details, /perceptual similarity/);
  assert.match(details, /verify both versions to compare them/);
  assert.match(details, /Fingerprint comparison with Version/);
  assert.match(details, /Byte-identical source/);
  assert.match(details, /Source bytes changed/);
  assert.match(details, /Exact decoded samples/);
  assert.match(details, /Decoded samples changed/);
  assert.match(details, /Not enough DNA v3 evidence/);
  assert.match(details, /sameDecodeContract/);

  assert.match(details, /previousObservation && latestObservation/);
  assert.match(details, /!isVyralPackageAsset\(entry\.asset\)/);
  assert.match(details, /const verifyAssetIntegrity = async \(asset: AssetRow, requestedVersionId\?: string\)/);
  assert.match(details, /assetVersions\.find\(\(version\) => version\.id === requestedVersionId\)/);
  assert.match(details, /Verify this version/);
  assert.match(details, /Server fingerprint verified/);
  assert.match(details, /Fingerprint mismatch/);
  assert.match(details, /Baseline fingerprint created/);
  assert.match(details, /verifyAssetIntegrity\(asset, version\.id\)/);
  assert.match(details, /SHA-256 ' \+ String\(data\.sha256/);
  assert.match(details, /creator-confirmed/);
  assert.match(details, /sourceBindingValid/);
  assert.match(details, /cannot be confirmed/);
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


test('per-version fingerprint verification hashes protected original bytes and pins evidence to the exact version', async () => {
  const verifier = await readFile(new URL('../supabase/functions/verify-vyral-asset/index.ts', import.meta.url), 'utf8');
  assert.match(verifier, /\.eq\('id', body\.versionId\)/);
  assert.match(verifier, /\.eq\('asset_id', asset\.id\)/);
  assert.match(verifier, /storage\.from\(BUCKET\)\.download\(version\.storage_path\)/);
  assert.match(verifier, /const actualSha256 = await sha256Hex\(bytes\)/);
  assert.match(verifier, /comparison_status: comparisonStatus/);
  assert.match(verifier, /fingerprint_kind: 'cryptographic'/);
  assert.match(verifier, /asset_version_id: version\.id/);
  assert.match(verifier, /status: 'mismatch'/);
  assert.match(verifier, /status: 'verified'/);
});


test('raster visual fingerprint verification is version-pinned, source-hash checked and server generated', async () => {
  const fingerprint = await readFile(new URL('../supabase/functions/fingerprint-vyral-raster-version/index.ts', import.meta.url), 'utf8');
  assert.match(fingerprint, /\.eq\('id', versionId\)/);
  assert.match(fingerprint, /\.eq\('asset_id', assetId\)/);
  assert.match(fingerprint, /isCanonicalOwnedStoragePath\(version\.storage_path, prefix\)/);
  assert.match(fingerprint, /sourceSha256 !== version\.sha256\.toLowerCase\(\)/);
  assert.match(fingerprint, /ImageMagick\.read\(original/);
  assert.match(fingerprint, /computeVyralDHash64\(samples, width, height, 4\)/);
  assert.match(fingerprint, /fingerprint_kind: 'perceptual'/);
  assert.match(fingerprint, /algorithm: VYRAL_DHASH_ALGORITHM/);
  assert.match(fingerprint, /verification_status: 'server_verified'/);
  assert.match(fingerprint, /asset_version_id: version\.id/);
  assert.match(fingerprint, /MAX_PIXELS = 10_000_000/);
  assert.match(fingerprint, /MAX_BYTES = 20 \* 1024 \* 1024/);
});

test('raster DNA extraction automatically persists a server-generated perceptual fingerprint', async () => {
  const extractor = await readFile(new URL('../supabase/functions/extract-vyral-asset-dna-v3/index.ts', import.meta.url), 'utf8');
  assert.match(extractor, /computeVyralDHash64\(samples, width, height, 4\)/);
  assert.match(extractor, /fingerprint_kind: 'perceptual'/);
  assert.match(extractor, /algorithm: VYRAL_DHASH_ALGORITHM/);
  assert.match(extractor, /computed_by: 'extract-vyral-asset-dna-v3'/);
  assert.match(extractor, /visualFingerprintStatus/);
  assert.match(extractor, /DNA extraction succeeded, but the perceptual fingerprint could not be saved/);
});
