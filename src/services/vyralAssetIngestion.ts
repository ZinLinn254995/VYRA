import { createVyralFileDnaV1 } from './vyralFileDnaV1';
import { buildVyralGeneratedAssetMetadata, type VyralGeneratedAssetProvenanceInput } from './vyralGeneratedAssetProvenance';

export type VyralAssetKind = 'image' | 'video' | 'audio' | 'model_3d' | 'archive' | 'document' | 'other';
export type VyralAssetIngestionInput = {
  vyralId: string;
  userId: string;
  file: File;
  folderId?: string | null;
  metadata?: Record<string, unknown>;
  maxBytes?: number;
};
export type VyralAssetIngestionResult = {
  assetId: string;
  versionId: string;
  storagePath: string;
  sha256: string;
  assetType: VyralAssetKind;
  mimeType: string;
  sizeBytes: number;
  dnaKind: 'raster-v3' | 'universal-file-v1';
  audioTechnicalMetadata?: { schemaVersion: 1; sourceSha256: string; durationSeconds: number; waveformPeaks: number[]; extraction: 'browser-audio-decode' };
};

export type VyralAssetInsert = {
  id: string; vyral_id: string; user_id: string; folder_id: string | null;
  name: string; original_filename: string; asset_type: VyralAssetKind; mime_type: string;
  size_bytes: number; storage_path: string; sha256: string; processing_status: 'uploading';
  metadata: Record<string, unknown>;
};
export type VyralAssetVersionInsert = {
  asset_id: string; vyral_id: string; user_id: string; version_number: 1;
  storage_path: string; mime_type: string; size_bytes: number; sha256: string;
  source_kind: 'original'; metadata: { original_filename: string; audio_technical_metadata?: { schemaVersion: 1; sourceSha256: string; durationSeconds: number; waveformPeaks: number[]; extraction: 'browser-audio-decode' } };
};
export type VyralAssetDnaInsert = {
  id: string; vyral_id: string; user_id: string; asset_id: string; scope: 'asset';
  schema_version: 1; dna_status: 'evolving'; source_kind: 'system'; verification_status: 'observed';
  payload: Record<string, unknown>; reconstruction_data: Record<string, unknown>;
};

/** Adapter keeps the ingestion lifecycle testable and independent of React/UI state. */
export type VyralAssetIngestionPort = {
  createAsset(record: VyralAssetInsert): Promise<void>;
  uploadOriginal(path: string, file: File, mimeType: string): Promise<void>;
  createVersion(record: VyralAssetVersionInsert): Promise<string>;
  createFingerprint(input: { assetId: string; versionId: string; userId: string; sha256: string }): Promise<void>;
  extractRasterDna(assetId: string, versionId: string): Promise<{ status: string; error?: string }>;
  insertDna(record: VyralAssetDnaInsert): Promise<void>;
  hasDnaRecord(assetId: string, userId: string): Promise<boolean>;
  markReady(assetId: string, userId: string): Promise<void>;
  removeStorage(path: string): Promise<void>;
  deleteFingerprints(assetId: string): Promise<void>;
  deleteVersions(assetId: string): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
};

export class VyralAssetIngestionError extends Error {
  readonly assetId: string | null;
  readonly preservedForRecovery: boolean;
  readonly cleanupErrors: string[];
  constructor(message: string, options: { assetId?: string | null; preservedForRecovery?: boolean; cleanupErrors?: string[] } = {}) {
    super(message);
    this.name = 'VyralAssetIngestionError';
    this.assetId = options.assetId ?? null;
    this.preservedForRecovery = options.preservedForRecovery ?? false;
    this.cleanupErrors = options.cleanupErrors ?? [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RASTER_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const sha256Hex = async (buffer: ArrayBuffer) => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export function classifyVyralAssetFile(file: Pick<File, 'name' | 'type'>): VyralAssetKind {
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (['glb', 'gltf', 'obj', 'fbx', 'stl', 'usdz', 'blend'].includes(ext)) return 'model_3d';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (mime.startsWith('text/') || mime === 'application/pdf' || mime.includes('document') ||
      ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'md', 'json'].includes(ext)) return 'document';
  return 'other';
}


/** Normalize decoded PCM into bounded, deterministic peak samples for the Timeline waveform. */
export function buildAudioWaveformPeaks(channels: readonly ArrayLike<number>[], bucketCount = 96): number[] {
  if (!channels.length || !Number.isInteger(bucketCount) || bucketCount < 8 || bucketCount > 256) return [];
  const length = Math.max(...channels.map((channel) => channel.length));
  if (!length) return [];
  const peaks: number[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor(bucket * length / bucketCount);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * length / bucketCount));
    let peak = 0;
    for (const channel of channels) {
      for (let index = start; index < Math.min(end, channel.length); index++) {
        const sample = Number(channel[index]);
        if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
      }
    }
    peaks.push(Math.max(0.015, Math.min(1, peak)));
  }
  return peaks;
}

/** Inspect the exact source File. Unsupported codecs keep the Asset but omit Timeline metadata. */
export async function extractAudioTechnicalMetadata(
  file: File,
  sourceSha256: string,
): Promise<{ schemaVersion: 1; sourceSha256: string; durationSeconds: number; waveformPeaks: number[]; extraction: 'browser-audio-decode' } | null> {
  if (!file.type.toLowerCase().startsWith('audio/') || typeof Audio === 'undefined' || typeof URL === 'undefined') return null;
  const objectUrl = URL.createObjectURL(file);
  let audioContext: AudioContext | null = null;
  try {
    const durationSeconds = await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      const timeout = globalThis.setTimeout(() => reject(new Error('Audio metadata timeout.')), 15000);
      const cleanup = () => { globalThis.clearTimeout(timeout); audio.removeAttribute('src'); audio.load(); };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        if (Number.isFinite(duration) && duration > 0 && duration <= 3600) resolve(duration);
        else reject(new Error('Unsupported or invalid audio duration.'));
      };
      audio.onerror = () => { cleanup(); reject(new Error('The browser could not read audio metadata.')); };
      audio.src = objectUrl;
    });
    let waveformPeaks: number[] = [];
    const AudioContextConstructor = globalThis.AudioContext;
    if (AudioContextConstructor && file.size <= 10 * 1024 * 1024 && durationSeconds <= 300) {
      try {
        audioContext = new AudioContextConstructor();
        const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
        waveformPeaks = buildAudioWaveformPeaks(
          Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)), 96,
        );
      } catch { /* Keep valid duration and omit unsupported waveform data. */ }
    }
    return { schemaVersion: 1, sourceSha256, durationSeconds, waveformPeaks, extraction: 'browser-audio-decode' };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    if (audioContext && audioContext.state !== 'closed') {
      try { await audioContext.close(); } catch { /* Best-effort decoder cleanup. */ }
    }
  }
}

export async function ingestVyralAsset(
  port: VyralAssetIngestionPort,
  input: VyralAssetIngestionInput,
): Promise<VyralAssetIngestionResult> {
  if (!UUID.test(input.vyralId) || !UUID.test(input.userId)) throw new Error('A valid signed-in user and Vyral are required.');
  if (!(input.file instanceof Blob) || typeof input.file.name !== 'string' || !input.file.name.trim()) {
    throw new Error('A named source File is required.');
  }
  const maxBytes = input.maxBytes ?? 100 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || input.file.size < 1 || input.file.size > maxBytes) {
    throw new Error('The source file is empty or exceeds the configured upload limit.');
  }

  const file = input.file;
  const assetId = globalThis.crypto.randomUUID();
  const mimeType = file.type || 'application/octet-stream';
  const assetType = classifyVyralAssetFile(file);
  const extension = file.name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? 'bin';
  const storagePath = input.userId + '/' + input.vyralId + '/' + assetId + '/v1/' + assetId + '.' + extension;
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const rasterDna = assetType === 'image' && RASTER_MIMES.has(mimeType.toLowerCase());
  const audioTechnicalMetadata = assetType === 'audio' ? await extractAudioTechnicalMetadata(file, sha256) : null;
  let versionId: string | null = null;
  let storageUploaded = false;
  let dnaCommitted = false;

  try {
    await port.createAsset({
      id: assetId, vyral_id: input.vyralId, user_id: input.userId, folder_id: input.folderId ?? null,
      name: file.name, original_filename: file.name, asset_type: assetType, mime_type: mimeType,
      size_bytes: file.size, storage_path: storagePath, sha256, processing_status: 'uploading',
      metadata: {
        ...(input.metadata ?? {}),
        upload_source: input.metadata?.upload_source === 'media_generation' ? 'media_generation' : 'creator_workspace',
        hash_algorithm: 'SHA-256', visibility: 'private', ai_details_status: 'pending',
        identity_name_origin: 'system_default', identity_description_origin: 'system_default',
        ...(audioTechnicalMetadata ? { audio_technical_metadata: audioTechnicalMetadata } : {}),
      },
    });
    // A lost upload response can still mean the object was stored; always attempt cleanup on failure.
    storageUploaded = true;
    await port.uploadOriginal(storagePath, file, mimeType);
    versionId = await port.createVersion({
      asset_id: assetId, vyral_id: input.vyralId, user_id: input.userId, version_number: 1,
      storage_path: storagePath, mime_type: mimeType, size_bytes: file.size, sha256,
      source_kind: 'original', metadata: { original_filename: file.name, ...(audioTechnicalMetadata ? { audio_technical_metadata: audioTechnicalMetadata } : {}) },
    });
    if (!UUID.test(versionId)) throw new Error('The original Asset Version record did not return a valid ID.');
    await port.createFingerprint({ assetId, versionId, userId: input.userId, sha256 });

    if (rasterDna) {
      const extraction = await port.extractRasterDna(assetId, versionId);
      if (extraction.status !== 'extracted') {
        const alreadyCommitted = await port.hasDnaRecord(assetId, input.userId);
        if (alreadyCommitted) {
          dnaCommitted = true;
          throw new VyralAssetIngestionError('Raster DNA extraction may already have committed. Preserve the Asset and resume recovery.', {
            assetId, preservedForRecovery: true,
          });
        }
        throw new Error('Required raster DNA v3 extraction failed: ' + (extraction.error || 'server extraction did not complete.'));
      }
      dnaCommitted = true;
    } else {
      const fileDna = await createVyralFileDnaV1({
        record_id: globalThis.crypto.randomUUID(),
        source: { asset_id: assetId, asset_version_id: versionId },
        bytes: new Uint8Array(bytes), mime_type: mimeType, filename: file.name, include_payload: false,
      });
      if (fileDna.record.file.sha256 !== sha256 || fileDna.record.file.size_bytes !== file.size) {
        throw new Error('Universal File DNA did not match the uploaded source bytes.');
      }
      await port.insertDna({
        id: fileDna.record.record_id, vyral_id: input.vyralId, user_id: input.userId,
        asset_id: assetId, scope: 'asset', schema_version: 1, dna_status: 'evolving',
        source_kind: 'system', verification_status: 'observed',
        payload: {
          dna_schema_id: 'vyra.asset-file-dna', dna_schema_version: 1, dna_record: fileDna.record,
          source_version_id: versionId, source_file_sha256: sha256,
          extraction_kind: 'deterministic_binary_file_identity',
        },
        reconstruction_data: {
          source_preservation: 'original_binary_retained', reconstruction_ready: false,
          recovery_level: 'identity-only', encoded_source_bytes_recoverable: false,
        },
      });
      dnaCommitted = true;
    }

    await port.markReady(assetId, input.userId);
    return {
      assetId, versionId, storagePath, sha256, assetType, mimeType,
      sizeBytes: file.size, dnaKind: rasterDna ? 'raster-v3' : 'universal-file-v1',
      ...(audioTechnicalMetadata ? { audioTechnicalMetadata } : {}),
    };
  } catch (cause) {
    let preserve = dnaCommitted || (cause instanceof VyralAssetIngestionError && cause.preservedForRecovery);
    if (!preserve && versionId) {
      try { preserve = await port.hasDnaRecord(assetId, input.userId); }
      catch { preserve = true; }
    }
    if (preserve) {
      const message = cause instanceof Error ? cause.message : 'Asset ingestion did not finish.';
      throw new VyralAssetIngestionError(message + ' The original bytes and DNA evidence were preserved for recovery.', {
        assetId, preservedForRecovery: true,
      });
    }

    const cleanupErrors: string[] = [];
    if (storageUploaded) {
      try { await port.removeStorage(storagePath); } catch (error) { cleanupErrors.push('Storage cleanup: ' + (error instanceof Error ? error.message : 'failed')); }
    }
    if (versionId) {
      try { await port.deleteFingerprints(assetId); } catch (error) { cleanupErrors.push('Fingerprint cleanup: ' + (error instanceof Error ? error.message : 'failed')); }
      try { await port.deleteVersions(assetId); } catch (error) { cleanupErrors.push('Version cleanup: ' + (error instanceof Error ? error.message : 'failed')); }
    }
    try { await port.deleteAsset(assetId); } catch (error) { cleanupErrors.push('Asset cleanup: ' + (error instanceof Error ? error.message : 'failed')); }
    throw new VyralAssetIngestionError(cause instanceof Error ? cause.message : 'Asset ingestion failed.', {
      assetId, cleanupErrors,
    });
  }
}

/** Generated media uses the same private Storage, immutable Version, Fingerprint and DNA gates as creator uploads. */
export async function ingestGeneratedVyralAsset(
  port: VyralAssetIngestionPort,
  input: Omit<VyralAssetIngestionInput, 'metadata'> & { provenance: VyralGeneratedAssetProvenanceInput },
): Promise<VyralAssetIngestionResult> {
  const metadata = buildVyralGeneratedAssetMetadata(input.provenance);
  return ingestVyralAsset(port, {
    vyralId: input.vyralId,
    userId: input.userId,
    folderId: input.folderId,
    file: input.file,
    metadata,
  });
}

/** Supabase adapter for the exact same ingestion lifecycle used by creator and generated media. */
export function createSupabaseVyralAssetIngestionPort(db: any): VyralAssetIngestionPort {
  return {
    async createAsset(record) {
      const { error } = await db.from('vyral_assets').insert(record);
      if (error) throw error;
    },
    async uploadOriginal(path, file, mimeType) {
      const { error } = await db.storage.from('vyral-assets').upload(path, file, {
        contentType: mimeType, upsert: false, cacheControl: '3600',
      });
      if (error) throw error;
    },
    async createVersion(record) {
      const { data, error } = await db.from('vyral_asset_versions').insert(record).select('id').single();
      if (error || !data?.id) throw error ?? new Error('Could not create the original Asset Version.');
      return data.id as string;
    },
    async createFingerprint({ assetId, versionId, userId, sha256 }) {
      const { error } = await db.from('vyral_fingerprints').insert({
        asset_id: assetId, asset_version_id: versionId, user_id: userId,
        fingerprint_kind: 'cryptographic', algorithm: 'SHA-256', value: sha256,
        metadata: { computed_by: 'browser_web_crypto', verification_status: 'unverified', source: 'original_upload' },
      });
      if (error) throw error;
    },
    async extractRasterDna(assetId, versionId) {
      const { data, error } = await db.functions.invoke('extract-vyral-asset-dna-v3', { body: { assetId, versionId } });
      if (!error && data?.status === 'extracted') return { status: 'extracted' };
      let detail = data?.error ?? error?.message ?? 'Server-side DNA extraction did not complete.';
      const response = (error as { context?: Response } | null)?.context;
      if (response && typeof response.clone === 'function') {
        try {
          const payload = await response.clone().json();
          if (typeof payload?.error === 'string') detail = payload.error;
        } catch { /* Keep the SDK error when response is not JSON. */ }
      }
      return { status: data?.status ?? 'failed', error: detail };
    },
    async insertDna(record) {
      const { error } = await db.from('vyral_dna_records').insert(record);
      if (error) throw error;
    },
    async hasDnaRecord(assetId, userId) {
      const { data, error } = await db.from('vyral_dna_records').select('id')
        .eq('asset_id', assetId).eq('user_id', userId).limit(10);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async markReady(assetId, userId) {
      const { error } = await db.from('vyral_assets').update({ processing_status: 'ready' })
        .eq('id', assetId).eq('user_id', userId);
      if (error) throw error;
    },
    async removeStorage(path) {
      const { error } = await db.storage.from('vyral-assets').remove([path]);
      if (error) throw error;
    },
    async deleteFingerprints(assetId) {
      const { error } = await db.from('vyral_fingerprints').delete().eq('asset_id', assetId);
      if (error) throw error;
    },
    async deleteVersions(assetId) {
      const { error } = await db.from('vyral_asset_versions').delete().eq('asset_id', assetId);
      if (error) throw error;
    },
    async deleteAsset(assetId) {
      const { error } = await db.from('vyral_assets').delete().eq('id', assetId);
      if (error) throw error;
    },
  };
}
