import {
  createSupabaseVyralAssetIngestionPort,
  ingestGeneratedVyralAsset,
  type VyralAssetIngestionResult,
} from './vyralAssetIngestion';

type Db = any;
type RunwayTask = 'image' | 'video' | 'audio';
type TransferPayload = {
  jobId: string;
  outputIndex: number;
  targetVyralId: string;
  status: string;
  storagePath?: string;
  signedUrl?: string;
  sha256?: string;
  mimeType?: string;
  sizeBytes?: number;
  assetId?: string;
  assetVersionId?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
};

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function stableAssetId(jobId: string, outputIndex: number): Promise<string> {
  const hex = await sha256('vyra-runway-output:' + jobId + ':' + outputIndex);
  const chars = hex.slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' +
    value.slice(16, 20) + '-' + value.slice(20);
}

async function existingReadyAsset(db: Db, assetId: string, userId: string, targetVyralId: string) {
  const { data: asset, error: assetError } = await db.from('vyral_assets')
    .select('id,vyral_id,user_id,processing_status,storage_path,mime_type,size_bytes,sha256')
    .eq('id', assetId).eq('user_id', userId).maybeSingle();
  if (assetError) throw assetError;
  if (!asset) return null;
  if (asset.vyral_id !== targetVyralId || asset.processing_status !== 'ready') {
    throw new Error('A prior Asset ingestion attempt needs recovery; the staged source has been preserved.');
  }
  const [{ data: version, error: versionError }, { data: dna, error: dnaError }, { data: fingerprint, error: fingerprintError }] = await Promise.all([
    db.from('vyral_asset_versions').select('id,storage_path,mime_type,size_bytes,sha256')
      .eq('asset_id', assetId).eq('user_id', userId).eq('version_number', 1).maybeSingle(),
    db.from('vyral_dna_records').select('id').eq('asset_id', assetId).eq('user_id', userId).limit(1),
    db.from('vyral_fingerprints').select('id').eq('asset_id', assetId).eq('user_id', userId)
      .eq('algorithm', 'SHA-256').eq('value', asset.sha256).limit(1),
  ]);
  if (versionError || dnaError || fingerprintError) throw versionError ?? dnaError ?? fingerprintError;
  if (!version || version.storage_path !== asset.storage_path || version.sha256 !== asset.sha256 ||
      version.mime_type !== asset.mime_type || Number(version.size_bytes) !== Number(asset.size_bytes) ||
      !dna?.length || !fingerprint?.length) {
    throw new Error('A prior Asset exists without complete DNA and Fingerprint evidence; recovery is required.');
  }
  return {
    assetId: asset.id, versionId: version.id, storagePath: asset.storage_path,
    sha256: asset.sha256, mimeType: asset.mime_type, sizeBytes: Number(asset.size_bytes),
  };
}

/**
 * Move one successful Runway output into its job-bound Project Assets Vyral.
 * A deterministic Asset UUID makes a retry after a lost completion response safe.
 */
export async function ingestRunwayProjectOutput(
  db: Db,
  input: { userId: string; jobId: string; outputIndex?: number; fetchImpl?: typeof fetch },
): Promise<{ ingestion: VyralAssetIngestionResult | Awaited<ReturnType<typeof existingReadyAsset>>; completion: Record<string, unknown> }> {
  const outputIndex = input.outputIndex ?? 0;
  if (!UUID.test(input.userId) || !UUID.test(input.jobId) ||
      !Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex > 15) {
    throw new Error('A valid signed-in user, generation job and output index are required.');
  }

  const { data: job, error: jobError } = await db.from('generation_jobs')
    .select('id,quote_id,target_vyral_id,provider_task_id')
    .eq('id', input.jobId).eq('user_id', input.userId).maybeSingle();
  if (jobError || !job || !UUID.test(job.target_vyral_id) || !UUID.test(job.quote_id)) {
    throw jobError ?? new Error('The generation job has no verified Project Assets destination.');
  }
  const { data: quote, error: quoteError } = await db.from('media_generation_quotes')
    .select('task,provider,provider_model_id,request_fingerprint,request_payload')
    .eq('id', job.quote_id).eq('user_id', input.userId).maybeSingle();
  if (quoteError || !quote || !['image', 'video', 'audio'].includes(quote.task) ||
      typeof quote.provider !== 'string' || typeof quote.provider_model_id !== 'string' ||
      typeof quote.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(quote.request_fingerprint) ||
      !quote.request_payload || typeof quote.request_payload !== 'object' ||
      typeof quote.request_payload.input?.promptText !== 'string') {
    throw quoteError ?? new Error('The approved generation provenance is incomplete.');
  }
  const task = quote.task as RunwayTask;
  const promptSha256 = await sha256(quote.request_payload.input.promptText);
  const provenance = {
    generationJobId: input.jobId,
    task,
    provider: quote.provider,
    model: quote.provider_model_id,
    requestFingerprint: quote.request_fingerprint,
    promptSha256,
    generationId: typeof job.provider_task_id === 'string' ? job.provider_task_id : null,
    quoteId: job.quote_id,
    actualCostUsd: null,
  };
  const assetId = await stableAssetId(input.jobId, outputIndex);

  const { data: transferred, error: transferError } = await db.functions.invoke('transfer-runway-media-output', {
    body: { jobId: input.jobId, outputIndex },
  });
  if (transferError || !transferred || typeof transferred !== 'object') {
    throw transferError ?? new Error('The private Runway output transfer did not return a valid result.');
  }
  const transfer = transferred as TransferPayload;
  if (transfer.jobId !== input.jobId || transfer.outputIndex !== outputIndex ||
      transfer.targetVyralId !== job.target_vyral_id) {
    throw new Error('The transferred output does not match this Project generation job.');
  }

  const existing = await existingReadyAsset(db, assetId, input.userId, job.target_vyral_id);
  let ingestion: VyralAssetIngestionResult | Awaited<ReturnType<typeof existingReadyAsset>>;
  if (existing) {
    ingestion = existing;
  } else {
    if (transfer.status !== 'stored' || typeof transfer.signedUrl !== 'string' ||
        typeof transfer.storagePath !== 'string' || typeof transfer.sha256 !== 'string' ||
        typeof transfer.mimeType !== 'string' || !Number.isSafeInteger(transfer.sizeBytes) ||
        Number(transfer.sizeBytes) <= 0 || !EXTENSIONS[transfer.mimeType]) {
      throw new Error('The Runway output is not yet available for canonical Asset ingestion.');
    }
    const sourceUrl = new URL(transfer.signedUrl);
    if (sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) {
      throw new Error('The private staged output URL is invalid.');
    }
    const response = await (input.fetchImpl ?? fetch)(sourceUrl, { cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('The private staged output could not be downloaded.');
    const blob = await response.blob();
    if (blob.size !== transfer.sizeBytes || blob.type && blob.type.toLowerCase() !== transfer.mimeType) {
      throw new Error('The staged output size or MIME type changed before ingestion.');
    }
    const bytes = await blob.arrayBuffer();
    const digest = await sha256(bytes);
    if (digest !== transfer.sha256) throw new Error('The staged output SHA-256 does not match the server transfer record.');
    const file = new File([bytes], 'runway-' + input.jobId + '-' + outputIndex + '.' + EXTENSIONS[transfer.mimeType], {
      type: transfer.mimeType,
    });
    ingestion = await ingestGeneratedVyralAsset(createSupabaseVyralAssetIngestionPort(db), {
      vyralId: job.target_vyral_id,
      userId: input.userId,
      assetId,
      assetName: 'Generated ' + task + ' ' + (outputIndex + 1),
      file,
      provenance,
    });
  }

  if (!ingestion) throw new Error('The canonical Project Asset could not be recovered.');
  const { data: completed, error: completionError } = await db.functions.invoke('complete-runway-media-output', {
    body: {
      jobId: input.jobId,
      outputIndex,
      assetId: ingestion.assetId,
      assetVersionId: 'versionId' in ingestion ? ingestion.versionId : '',
    },
  });
  if (completionError || !completed || completed.status !== 'ingested') {
    throw completionError ?? new Error('The Asset is ready, but the generation completion record needs a safe retry.');
  }
  return { ingestion: ingestion as VyralAssetIngestionResult, completion: completed };
}
