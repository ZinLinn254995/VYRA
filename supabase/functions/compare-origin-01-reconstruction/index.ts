import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import {
  ImageMagick,
  initializeImageMagick,
} from 'npm:@imagemagick/magick-wasm@0.0.30';

const BUCKET = 'vyral-assets';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const ORIGIN = {
  vyralId: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  originalAssetId: '2c496cd5-84c4-44b1-b02a-fca4265cc592',
  originalVersionId: 'b4376fd9-a577-464e-91b4-e33791559e7f',
  candidates: {
    'a40f067c-0ed1-4b93-814f-4f2f925ff320': {
      versionId: 'b23dafc8-f5b8-447b-b06b-77553c590a08',
      dnaId: '8856e567-0221-4011-b9c2-22c228faa449',
      provider: 'Google Gemini',
      method: 'blind_reconstruction_from_dna_only_package',
      modelName: 'Gemini',
    },
    'a63edc73-0247-4477-84b9-f942080de694': {
      versionId: '273ecd4f-4045-490d-8616-993995a3bec4',
      dnaId: '95b1ca66-01f5-4ecd-a679-bd891c8549ad',
      provider: 'xAI',
      method: 'blind_visual_reconstruction_from_dna_only_package',
      modelName: 'Grok',
    },
    '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23': {
      versionId: '07e940be-b5c2-4163-b45b-34ad9c66e318',
      dnaId: '5460940d-4343-44bc-a109-a0141e5a17d4',
      provider: 'Anthropic',
      method: 'blind_reconstruction_from_dna_only_package',
      modelName: 'Claude',
    },
  } as Record<string, { versionId: string; dnaId: string; provider: string; method: string; modelName: string }>,
  packageId: 'c5afacb6-174a-498a-88f2-476b24f08e87',
  masterDnaRecordId: 'b1c8b6a3-205c-4472-991d-0b73aa9e3bff',
  ownerId: 'c9801424-1e4d-4604-99d3-791a8a389b48',
};

const wasmBytes = await Deno.readFile(
  new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')),
);
await initializeImageMagick(wasmBytes);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const decodeRgb = async (bytes: Uint8Array) => ImageMagick.read(bytes, (image) => {
  const width = image.width;
  const height = image.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error('Image dimensions exceed the supported 8-megapixel comparison limit.');
  }
  const pixels = image.getPixels((collection) => collection.toByteArray(0, 0, width, height, 'rgb')?.slice() ?? null);
  if (!pixels || pixels.byteLength !== width * height * 3) throw new Error('Could not decode a complete RGB pixel buffer.');
  return { width, height, rgb: pixels };
});

const samplePatch = (rgb: Uint8Array, width: number, height: number, x0: number, y0: number, patchWidth: number, patchHeight: number) => {
  let r = 0; let g = 0; let b = 0; let count = 0;
  for (let y = y0; y < Math.min(height, y0 + patchHeight); y++) {
    for (let x = x0; x < Math.min(width, x0 + patchWidth); x++) {
      const i = (y * width + x) * 3;
      r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; count++;
    }
  }
  return count ? [r / count, g / count, b / count].map((v) => Number(v.toFixed(2))) : null;
};

const round = (value: number) => Number(value.toFixed(6));

const describeImage = (image: { width: number; height: number; rgb: Uint8Array }) => {
  const { width, height, rgb } = image;
  const patchWidth = Math.max(1, Math.floor(width * 0.01));
  const patchHeight = Math.max(1, Math.floor(height * 0.01));
  const corners = [
    samplePatch(rgb, width, height, 0, 0, patchWidth, patchHeight),
    samplePatch(rgb, width, height, width - patchWidth, 0, patchWidth, patchHeight),
    samplePatch(rgb, width, height, 0, height - patchHeight, patchWidth, patchHeight),
    samplePatch(rgb, width, height, width - patchWidth, height - patchHeight, patchWidth, patchHeight),
  ].filter((value): value is number[] => value !== null);
  const background = corners.length
    ? [0, 1, 2].map((channel) => round(corners.reduce((sum, corner) => sum + corner[channel], 0) / corners.length))
    : null;
  const centerIndex = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 3;
  const center = [rgb[centerIndex], rgb[centerIndex + 1], rgb[centerIndex + 2]];
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  let redCount = 0; let sumX = 0; let sumY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = rgb[i]; const g = rgb[i + 1]; const b = rgb[i + 2];
      if (r >= 120 && r > g * 1.35 && r > b * 1.35) {
        redCount++; sumX += x; sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const redRegion = redCount ? {
    pixelCount: redCount,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    normalizedBounds: {
      x: round(minX / width), y: round(minY / height),
      width: round((maxX - minX + 1) / width), height: round((maxY - minY + 1) / height),
    },
    centroid: { x: round(sumX / redCount), y: round(sumY / redCount) },
    normalizedCentroid: { x: round(sumX / redCount / width), y: round(sumY / redCount / height) },
  } : null;
  return { width, height, backgroundCornerAverageRgb: background, centerRgb: center, redRegion };
};

const compareNormalizedGridRgb = (
  a: { width: number; height: number; rgb: Uint8Array },
  b: { width: number; height: number; rgb: Uint8Array },
) => {
  const aspectA = a.width / a.height;
  const aspectB = b.width / b.height;
  const aspectRatioDelta = Math.abs(aspectA - aspectB);
  if (aspectRatioDelta > 0.001) {
    return {
      performed: false,
      reason: 'Aspect ratios differ; normalized full-image comparison is withheld to avoid silently stretching or cropping either image.',
      gridWidth: null, gridHeight: null,
    };
  }

  // Sample both complete images at corresponding normalized cell centers.
  // This is a resized-grid comparison, not decoded-pixel equality or SSIM.
  const gridWidth = Math.max(1, Math.round(256 * Math.min(1, aspectA)));
  const gridHeight = Math.max(1, Math.round(256 / Math.max(1, aspectA)));
  let absoluteError = 0;
  const sampleCount = gridWidth * gridHeight * 3;
  for (let gy = 0; gy < gridHeight; gy++) {
    const ay = Math.min(a.height - 1, Math.floor((gy + 0.5) * a.height / gridHeight));
    const by = Math.min(b.height - 1, Math.floor((gy + 0.5) * b.height / gridHeight));
    for (let gx = 0; gx < gridWidth; gx++) {
      const ax = Math.min(a.width - 1, Math.floor((gx + 0.5) * a.width / gridWidth));
      const bx = Math.min(b.width - 1, Math.floor((gx + 0.5) * b.width / gridWidth));
      const ai = (ay * a.width + ax) * 3;
      const bi = (by * b.width + bx) * 3;
      absoluteError += Math.abs(a.rgb[ai] - b.rgb[bi]);
      absoluteError += Math.abs(a.rgb[ai + 1] - b.rgb[bi + 1]);
      absoluteError += Math.abs(a.rgb[ai + 2] - b.rgb[bi + 2]);
    }
  }
  const meanAbsoluteError = absoluteError / sampleCount;
  return {
    performed: true,
    gridWidth,
    gridHeight,
    sampleCount: gridWidth * gridHeight,
    meanAbsoluteErrorPerChannel: round(meanAbsoluteError),
    normalizedGridRgbSimilarity: round(Math.max(0, 1 - meanAbsoluteError / 255)),
    aspectRatioDelta: round(aspectRatioDelta),
    method: 'Nearest-neighbor samples at corresponding normalized cell centers across the full image; no crop or aspect-ratio distortion. Not SSIM and not exact pixel equality.',
  };
};

const compareGeometry = (a: ReturnType<typeof describeImage>, b: ReturnType<typeof describeImage>) => {
  if (!a.redRegion || !b.redRegion) return { available: false, reason: 'A red-dominant region was not detected in both images.' };
  const fields = ['x', 'y', 'width', 'height'] as const;
  const deltas = Object.fromEntries(fields.map((key) => [
    key,
    round(Math.abs(a.redRegion!.normalizedBounds[key] - b.redRegion!.normalizedBounds[key])),
  ]));
  const centroidDelta = {
    x: round(Math.abs(a.redRegion.normalizedCentroid.x - b.redRegion.normalizedCentroid.x)),
    y: round(Math.abs(a.redRegion.normalizedCentroid.y - b.redRegion.normalizedCentroid.y)),
  };
  const meanDelta = [...Object.values(deltas), ...Object.values(centroidDelta)].reduce((sum, value) => sum + value, 0) / 6;
  return { available: true, normalizedBoundsAbsoluteDelta: deltas, normalizedCentroidAbsoluteDelta: centroidDelta, geometrySimilarity: round(Math.max(0, 1 - meanDelta)) };
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const { data: context, error: authError } = await createSupabaseContext(request, { auth: 'user' });
  if (authError || !context) return json({ error: 'A valid signed-in user session is required.' }, authError?.status ?? 401);
  const userId = typeof context.userClaims?.id === 'string' ? context.userClaims.id : '';
  if (userId !== ORIGIN.ownerId) return json({ error: 'This ORIGIN-01 validation run is restricted to its owner.' }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  const selectedCandidate = typeof body.candidateAssetId === 'string' ? ORIGIN.candidates[body.candidateAssetId] : undefined;
  if (
    body.originalAssetId !== ORIGIN.originalAssetId ||
    body.originalVersionId !== ORIGIN.originalVersionId ||
    !selectedCandidate ||
    body.candidateVersionId !== selectedCandidate.versionId ||
    body.dnaRecordId !== selectedCandidate.dnaId
  ) return json({ error: 'The supplied comparison pair is not a registered ORIGIN-01 blind reconstruction candidate.' }, 400);
  const candidateAssetId = String(body.candidateAssetId);

  const [vyralResult, originalAssetResult, candidateAssetResult, originalVersionResult, candidateVersionResult, dnaResult, lineageResult] = await Promise.all([
    context.supabase.from('vyrals').select('id,metadata').eq('id', ORIGIN.vyralId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_assets').select('id,vyral_id,user_id,name,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', ORIGIN.originalAssetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_assets').select('id,vyral_id,user_id,name,storage_path,sha256,size_bytes,mime_type,processing_status').eq('id', candidateAssetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,version_number').eq('id', ORIGIN.originalVersionId).eq('asset_id', ORIGIN.originalAssetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_asset_versions').select('id,asset_id,vyral_id,user_id,storage_path,sha256,size_bytes,version_number').eq('id', selectedCandidate.versionId).eq('asset_id', candidateAssetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_dna_records').select('id,asset_id,vyral_id,user_id,source_kind,payload,verification_status').eq('id', selectedCandidate.dnaId).eq('asset_id', candidateAssetId).eq('user_id', userId).maybeSingle(),
    context.supabase.from('vyral_lineage').select('id').eq('vyral_id', ORIGIN.vyralId).eq('parent_asset_id', ORIGIN.originalAssetId).eq('child_asset_id', candidateAssetId).eq('relation_kind', 'generated_from').limit(1),
  ]);
  const queryError = [vyralResult, originalAssetResult, candidateAssetResult, originalVersionResult, candidateVersionResult, dnaResult, lineageResult].find((result) => result.error)?.error;
  if (queryError) return json({ error: 'Could not validate the registered ORIGIN-01 evidence records.' }, 500);
  const vyral = vyralResult.data;
  const original = originalAssetResult.data;
  const candidate = candidateAssetResult.data;
  const originalVersion = originalVersionResult.data;
  const candidateVersion = candidateVersionResult.data;
  const dna = dnaResult.data;
  if (!vyral || vyral.metadata?.protected !== true || !original || !candidate || !originalVersion || !candidateVersion || !dna || !lineageResult.data?.length) {
    return json({ error: 'The protected original, candidate, versions, DNA record or generated-from lineage is missing.' }, 409);
  }
  if (
    original.vyral_id !== ORIGIN.vyralId || candidate.vyral_id !== ORIGIN.vyralId ||
    originalVersion.vyral_id !== ORIGIN.vyralId || candidateVersion.vyral_id !== ORIGIN.vyralId ||
    dna.vyral_id !== ORIGIN.vyralId ||
    original.processing_status !== 'ready' || candidate.processing_status !== 'ready'
  ) return json({ error: 'The comparison records are not in a ready, same-Vyral state.' }, 409);

  // The asset row and the explicitly selected version must describe the same
  // stored object. Do not compare a stale asset pointer with another version.
  if (
    original.storage_path !== originalVersion.storage_path ||
    candidate.storage_path !== candidateVersion.storage_path ||
    original.sha256 !== originalVersion.sha256 ||
    candidate.sha256 !== candidateVersion.sha256 ||
    Number(original.size_bytes) !== Number(originalVersion.size_bytes) ||
    Number(candidate.size_bytes) !== Number(candidateVersion.size_bytes)
  ) return json({ error: 'An asset record does not match its registered comparison version.' }, 409);

  // Treat the candidate's recorded generation provenance as an assertion that
  // must remain internally consistent; it is not independent proof of what
  // Gemini actually received.
  const dnaPayload = dna.payload && typeof dna.payload === 'object' ? dna.payload as Record<string, unknown> : {};
  const dnaProvenance = dnaPayload.provenance && typeof dnaPayload.provenance === 'object'
    ? dnaPayload.provenance as Record<string, unknown> : {};
  const dnaUpload = dnaPayload.upload && typeof dnaPayload.upload === 'object'
    ? dnaPayload.upload as Record<string, unknown> : {};
  const modelReport = dnaPayload.model_report && typeof dnaPayload.model_report === 'object'
    ? dnaPayload.model_report as Record<string, unknown> : {};
  const uploadReconciliation = dnaPayload.upload_reconciliation && typeof dnaPayload.upload_reconciliation === 'object'
    ? dnaPayload.upload_reconciliation as Record<string, unknown> : {};
  const candidateUploadReconciliation = {
    status: uploadReconciliation.status ?? 'not_recorded',
    modelReportedSizeBytes: modelReport.reported_size_bytes ?? null,
    uploadedSizeBytes: candidateVersionResult.data?.size_bytes ?? null,
    modelReportedSha256Prefix: modelReport.reported_sha256_prefix ?? null,
    uploadedSha256: dnaUpload.sha256 ?? null,
    comparisonUses: 'verified_uploaded_storage_bytes',
    note: 'The verifier compares the actual uploaded bytes against the protected original. It does not claim those bytes are identical to the model-reported output unless their hash and size reconcile.',
  };
  const asNonEmptyString = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  const asJsonObject = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const modelIdentifier = asNonEmptyString(dnaProvenance.model_identifier) ??
    asNonEmptyString(modelReport.model_identifier) ?? selectedCandidate.modelName + '_model_not_recorded';
  const modelVersion = asNonEmptyString(dnaProvenance.model_version) ??
    asNonEmptyString(modelReport.model_version);
  const promptSha256Raw = asNonEmptyString(dnaProvenance.prompt_sha256) ??
    asNonEmptyString(modelReport.prompt_sha256);
  const promptSha256 = promptSha256Raw && /^[a-f0-9]{64}$/i.test(promptSha256Raw) ? promptSha256Raw.toLowerCase() : null;
  const sessionReference = asNonEmptyString(dnaProvenance.session_reference) ??
    asNonEmptyString(modelReport.session_reference);
  const toolAccess = asJsonObject(dnaProvenance.tool_access ?? modelReport.tool_access);
  const blindnessStatus = dnaProvenance.source_binary_provided_to_model === false ? 'creator_attested' : 'unverified';
  const attemptEvidence = {
    provider: selectedCandidate.provider,
    modelIdentifier,
    modelVersion,
    promptSha256,
    promptHashStatus: !promptSha256Raw ? 'not_recorded' : promptSha256 ? 'valid_sha256' : 'invalid_format',
    sessionReference,
    toolAccess,
    blindness: {
      status: blindnessStatus,
      sourceBinaryClaim: dnaProvenance.source_binary_provided_to_model === false ? 'creator_attested_not_provided' : 'not_recorded',
      independentlyVerified: false,
      note: 'The comparator cannot independently observe an external AI session. This field records creator-supplied provenance only.',
    },
    candidateOutput: {
      uploadedSha256: candidateVersion.sha256,
      uploadedSizeBytes: Number(candidateVersion.size_bytes),
      modelReportedSha256Prefix: modelReport.reported_sha256_prefix ?? null,
      modelReportedSizeBytes: modelReport.reported_size_bytes ?? null,
      uploadReconciliationStatus: uploadReconciliation.status ?? 'not_recorded',
    },
  };
  if (
    dna.source_kind !== 'generation' ||
    dnaProvenance.provider !== selectedCandidate.provider ||
    dnaProvenance.method !== selectedCandidate.method ||
    dnaProvenance.input_package_id !== ORIGIN.packageId ||
    dnaProvenance.input_package_mode !== 'dna-only' ||
    dnaProvenance.source_binary_provided_to_model !== false ||
    dnaProvenance.source_asset_id !== ORIGIN.originalAssetId ||
    dnaProvenance.source_vyral_id !== ORIGIN.vyralId ||
    dnaProvenance.source_master_dna_record_id !== ORIGIN.masterDnaRecordId ||
    dnaUpload.sha256 !== candidateVersion.sha256 ||
    Number(dnaUpload.size_bytes) !== Number(candidateVersion.size_bytes)
  ) return json({ error: 'The candidate DNA provenance does not match its registered DNA-only reconstruction record.' }, 409);

  const originalPrefix = userId + '/' + ORIGIN.vyralId + '/' + ORIGIN.originalAssetId + '/';
  const candidatePrefix = userId + '/' + ORIGIN.vyralId + '/' + candidateAssetId + '/';
  if (!originalVersion.storage_path.startsWith(originalPrefix) || !candidateVersion.storage_path.startsWith(candidatePrefix)) {
    return json({ error: 'A stored asset path failed its ownership-prefix validation.' }, 409);
  }
  const expectedSizes = [Number(originalVersion.size_bytes), Number(candidateVersion.size_bytes)];
  if (expectedSizes.some((size) => !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES)) {
    return json({ error: 'One of the stored images exceeds the 20 MB verification limit.' }, 413);
  }

  const [originalDownload, candidateDownload] = await Promise.all([
    context.supabaseAdmin.storage.from(BUCKET).download(originalVersion.storage_path),
    context.supabaseAdmin.storage.from(BUCKET).download(candidateVersion.storage_path),
  ]);
  if (originalDownload.error || !originalDownload.data || candidateDownload.error || !candidateDownload.data) {
    return json({ error: 'Could not download both private source images for independent comparison.' }, 502);
  }
  const originalBytes = new Uint8Array(await originalDownload.data.arrayBuffer());
  const candidateBytes = new Uint8Array(await candidateDownload.data.arrayBuffer());
  if (originalBytes.byteLength > MAX_BYTES || candidateBytes.byteLength > MAX_BYTES) return json({ error: 'A downloaded image exceeds the 20 MB limit.' }, 413);

  const [originalHash, candidateHash] = await Promise.all([sha256Hex(originalBytes), sha256Hex(candidateBytes)]);
  const originalIntegrity = originalBytes.byteLength === Number(originalVersion.size_bytes) && originalHash === String(originalVersion.sha256 ?? '').toLowerCase();
  const candidateIntegrity = candidateBytes.byteLength === Number(candidateVersion.size_bytes) && candidateHash === String(candidateVersion.sha256 ?? '').toLowerCase();
  const testedAt = new Date().toISOString();

  if (!originalIntegrity || !candidateIntegrity) {
    const report = {
      protocol: 'ORIGIN-01-blind-reconstruction-comparison-v3',
      testedAt,
      candidateUploadReconciliation,
      attemptEvidence,
      integrity: {
        original: { expectedSizeBytes: Number(originalVersion.size_bytes), actualSizeBytes: originalBytes.byteLength, expectedSha256: originalVersion.sha256, actualSha256: originalHash, matched: originalIntegrity },
        candidate: { expectedSizeBytes: Number(candidateVersion.size_bytes), actualSizeBytes: candidateBytes.byteLength, expectedSha256: candidateVersion.sha256, actualSha256: candidateHash, matched: candidateIntegrity },
      },
      comparison: { performed: false, reason: 'Stored file integrity must be verified before visual comparison.' },
      provenance: {
        reconstructionInput: {
          provider: selectedCandidate.provider,
          packageId: ORIGIN.packageId,
          packageMode: 'DNA-only',
          originalBinaryExposure: 'creator_attested_not_provided',
          exposureIndependentlyVerifiedByComparator: false,
        },
        comparisonInput: { originalBinaryDownloadedByVerifier: true, candidateBinaryDownloadedByVerifier: true },
      },
      claims: { reconstructionSuccess: false },
    };
    const { data: test, error: insertError } = await context.supabaseAdmin.from('vyral_reconstruction_tests').insert({
      vyral_id: ORIGIN.vyralId, user_id: userId, asset_id: candidate.id, asset_version_id: candidateVersion.id,
      dna_record_id: dna.id, model_provider: selectedCandidate.provider, model_id: modelIdentifier,
      model_version: modelVersion, prompt_sha256: promptSha256, session_reference: sessionReference,
      tool_access: toolAccess, blindness_status: blindnessStatus, attempt_evidence: attemptEvidence,
      protocol_version: 'ORIGIN-01-v3', comparison_mode: 'decoded_exact', test_status: 'inconclusive',
      exact_match: null, similarity_score: null, verifier: { engine: 'ImageMagick WASM', version: '0.0.30', execution: 'server_edge_function' },
      report, tested_at: testedAt,
    }).select('id,test_status').single();
    if (insertError) return json({ error: 'Integrity failure was detected but its evidence record could not be saved.' }, 500);
    return json({ status: 'inconclusive', testId: test.id, report });
  }

  let originalImage: Awaited<ReturnType<typeof decodeRgb>>;
  let candidateImage: Awaited<ReturnType<typeof decodeRgb>>;
  try {
    [originalImage, candidateImage] = await Promise.all([decodeRgb(originalBytes), decodeRgb(candidateBytes)]);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Could not decode both images.' }, 422);
  }
  const originalDescription = describeImage(originalImage);
  const candidateDescription = describeImage(candidateImage);
  const sameDimensions = originalImage.width === candidateImage.width && originalImage.height === candidateImage.height;
  let pixelComparison: Record<string, unknown> = { performed: false, reason: 'Image dimensions differ; direct pixel-to-pixel comparison is not valid.' };
  let exactMatch: boolean | null = false;
  let similarityScore: number | null = null;
  if (sameDimensions) {
    let exactPixels = 0; let absoluteError = 0; let differentPixels = 0;
    const pixelCount = originalImage.width * originalImage.height;
    for (let i = 0; i < originalImage.rgb.length; i += 3) {
      const dr = Math.abs(originalImage.rgb[i] - candidateImage.rgb[i]);
      const dg = Math.abs(originalImage.rgb[i + 1] - candidateImage.rgb[i + 1]);
      const db = Math.abs(originalImage.rgb[i + 2] - candidateImage.rgb[i + 2]);
      absoluteError += dr + dg + db;
      if (dr === 0 && dg === 0 && db === 0) exactPixels++;
      else differentPixels++;
    }
    const meanAbsoluteError = absoluteError / (pixelCount * 3);
    exactMatch = differentPixels === 0;
    similarityScore = round(Math.max(0, 1 - meanAbsoluteError / 255));
    pixelComparison = {
      performed: true, pixelCount, exactPixels, differentPixels,
      exactPixelRatio: round(exactPixels / pixelCount),
      meanAbsoluteErrorPerChannel: round(meanAbsoluteError),
      normalizedRgbSimilarity: similarityScore,
      method: 'Decoded RGB triplet equality and mean absolute channel error; no resize or alignment applied.',
    };
  }

  const geometry = compareGeometry(originalDescription, candidateDescription);
  const normalizedImageComparison = compareNormalizedGridRgb(originalImage, candidateImage);
  const backgroundDelta = originalDescription.backgroundCornerAverageRgb && candidateDescription.backgroundCornerAverageRgb
    ? round(Math.sqrt(originalDescription.backgroundCornerAverageRgb.reduce((sum, value, index) => sum + Math.pow(value - candidateDescription.backgroundCornerAverageRgb![index], 2), 0)))
    : null;
  const report = {
    protocol: 'ORIGIN-01-blind-reconstruction-comparison-v3',
    testedAt,
      candidateUploadReconciliation,
      attemptEvidence,
    integrity: {
      original: { expectedSizeBytes: Number(originalVersion.size_bytes), actualSizeBytes: originalBytes.byteLength, expectedSha256: originalVersion.sha256, actualSha256: originalHash, matched: originalIntegrity },
      candidate: { expectedSizeBytes: Number(candidateVersion.size_bytes), actualSizeBytes: candidateBytes.byteLength, expectedSha256: candidateVersion.sha256, actualSha256: candidateHash, matched: candidateIntegrity },
      binarySha256Equal: originalHash === candidateHash,
    },
    original: originalDescription,
    candidate: candidateDescription,
    comparison: {
      sameDimensions,
      pixelComparison,
      normalizedImageComparison,
      backgroundCornerColorEuclideanDelta: backgroundDelta,
      redRegionGeometry: geometry,
      dimensionsMatch: sameDimensions,
      exactDecodedPixelMatch: exactMatch,
      binaryFileMatch: originalHash === candidateHash,
    },
    provenance: {
      reconstructionInput: {
        provider: selectedCandidate.provider,
        packageId: ORIGIN.packageId,
        packageMode: 'DNA-only',
        originalBinaryExposure: 'creator_attested_not_provided',
        exposureIndependentlyVerifiedByComparator: false,
      },
      comparisonInput: { originalBinaryDownloadedByVerifier: true, candidateBinaryDownloadedByVerifier: true },
    },
    claims: {
      reconstructionSuccess: exactMatch === true,
      successCriterion: 'Exact decoded RGB equality at identical dimensions. Perceptual similarity is reported separately and is not treated as exact reconstruction.',
    },
    limitations: [
      'Only the first decoded frame is compared.',
      'RGB pixels are compared after ImageMagick decoding; embedded profiles are not compared as separate binary metadata.',
      'A different-dimension image receives no direct pixel similarity score; normalized-grid RGB similarity is a separate nearest-neighbor sample and is not SSIM or exact pixel equality.',
      'Normalized-grid comparison is withheld when aspect ratios differ beyond the configured tolerance.',
      'This test does not establish ownership or authorship.',
    ],
  };
  const { data: test, error: insertError } = await context.supabaseAdmin.from('vyral_reconstruction_tests').insert({
    vyral_id: ORIGIN.vyralId, user_id: userId, asset_id: candidate.id, asset_version_id: candidateVersion.id,
    dna_record_id: dna.id, model_provider: selectedCandidate.provider, model_id: modelIdentifier,
    model_version: modelVersion, prompt_sha256: promptSha256, session_reference: sessionReference,
    tool_access: toolAccess, blindness_status: blindnessStatus, attempt_evidence: attemptEvidence,
    protocol_version: 'ORIGIN-01-v3', comparison_mode: sameDimensions ? 'decoded_exact' : 'perceptual',
    test_status: exactMatch === true ? 'passed' : 'failed',
    exact_match: exactMatch, similarity_score: similarityScore,
    verifier: { engine: 'ImageMagick WASM', version: '0.0.30', execution: 'server_edge_function', pixel_format: 'RGB8' },
    report, tested_at: testedAt,
  }).select('id,test_status,exact_match,similarity_score').single();
  if (insertError) return json({ error: 'Image comparison completed but the result could not be saved.' }, 500);
  return json({ status: test.test_status, testId: test.id, exactMatch: test.exact_match, similarityScore: test.similarity_score, report });
});
