import { supabase } from '../context/AuthContext';
import {
  getProjectOfflineFile,
  getProjectOfflineFileBlob,
  installProjectCloudFileToOfflineStorage,
} from './projectOfflineStorage';
import { getProjectMediaLibraryItemPlaybackSource } from './mediaLibraryCloud';
import { createVyralMediaPlaybackUrl } from './vyralAssetPlayback';
import type { ProjectRenderSource } from './projectRenderManifest';

export type ProjectRenderMediaKind = 'video' | 'image' | 'audio';
export type ProjectRenderResolvedSource = {
  sourceKey: string;
  projectId: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  blob: Blob;
  replica: 'offline' | 'restored' | 'legacy-cache-or-cloud';
};

type ProjectRenderSourceResolverPorts = {
  getOfflineRecord: typeof getProjectOfflineFile;
  getOfflineBlob: typeof getProjectOfflineFileBlob;
  getProjectCloudSource: typeof getProjectMediaLibraryItemPlaybackSource;
  installCloudReplica: typeof installProjectCloudFileToOfflineStorage;
  getLegacyPlaybackUrl: (source: { assetId: string; assetVersionId: string }, kind: ProjectRenderMediaKind) => Promise<string>;
  fetchBlob: (url: string) => Promise<Blob>;
};

const defaultPorts: ProjectRenderSourceResolverPorts = {
  getOfflineRecord: getProjectOfflineFile,
  getOfflineBlob: getProjectOfflineFileBlob,
  getProjectCloudSource: getProjectMediaLibraryItemPlaybackSource,
  installCloudReplica: installProjectCloudFileToOfflineStorage,
  getLegacyPlaybackUrl: async (source, kind) => {
    if (!supabase) throw new Error('Cloud media is not configured in this environment.');
    const result = await createVyralMediaPlaybackUrl(supabase, { assetId: source.assetId, versionId: source.assetVersionId }, kind);
    return result.signedUrl;
  },
  fetchBlob: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('The render source could not be downloaded (' + response.status + ').');
    return response.blob();
  },
};

async function assertStoredContentHash(blob: Blob, expectedHash: string | null): Promise<void> {
  if (!expectedHash) return;
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    throw new Error('The Offline Project File has invalid SHA-256 metadata.');
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('The Offline Project File integrity check is unavailable in this environment.');
  }
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('The Offline Project File failed its SHA-256 integrity check.');
  }
}

function assertMediaKind(mimeType: string, expectedKind: ProjectRenderMediaKind): void {
  if (!mimeType.toLowerCase().startsWith(expectedKind + '/')) {
    throw new Error('The render source MIME type does not match the expected ' + expectedKind + ' media type.');
  }
}

/** Resolve immutable source bytes. Project replicas are always preferred; Cloud restores keep the same Project File ID. */
export async function resolveProjectRenderSourceBlob(input: {
  projectId: string;
  source: ProjectRenderSource;
  expectedKind: ProjectRenderMediaKind;
}, ports: ProjectRenderSourceResolverPorts = defaultPorts): Promise<ProjectRenderResolvedSource> {
  if (!input.projectId || !input.source) throw new Error('A Project and immutable render source are required.');
  const { source, projectId, expectedKind } = input;

  if (source.kind === 'project-file') {
    if (!source.projectFileId) throw new Error('A stable Project File ID is required.');
    const record = await ports.getOfflineRecord(source.projectFileId);
    if (record && record.projectId !== projectId) throw new Error('The Project File belongs to a different Project.');
    if (record?.deletedAt) throw new Error('The Project File is pending deletion and cannot be rendered.');
    if (record?.localState === 'available') {
      assertMediaKind(record.mimeType, expectedKind);
      const blob = await ports.getOfflineBlob(source.projectFileId);
      if (blob && blob.size === record.sizeBytes) {
        await assertStoredContentHash(blob, record.contentHash);
        return {
          sourceKey: 'project-file:' + source.projectFileId,
          projectId,
          mimeType: record.mimeType,
          fileName: record.fileName,
          sizeBytes: record.sizeBytes,
          blob,
          replica: 'offline',
        };
      }
    }

    const cloud = await ports.getProjectCloudSource(source.projectFileId, projectId, expectedKind);
    assertMediaKind(cloud.mimeType, expectedKind);
    if (source.mimeType && source.mimeType.toLowerCase() !== cloud.mimeType.toLowerCase()) {
      throw new Error('The Cloud Project File MIME type differs from the immutable render manifest.');
    }
    const downloaded = await ports.fetchBlob(cloud.signedUrl);
    if (downloaded.size !== cloud.sizeBytes) throw new Error('The downloaded Project File size does not match its Cloud manifest.');
    await assertStoredContentHash(downloaded, cloud.expectedSha256);
    const installedRecord = await ports.installCloudReplica({
      projectId,
      projectFileId: cloud.projectFileId,
      fileName: cloud.fileName,
      mimeType: cloud.mimeType,
      blob: downloaded,
      expectedSha256: cloud.expectedSha256,
    });
    if (
      installedRecord.id !== source.projectFileId ||
      installedRecord.projectId !== projectId ||
      installedRecord.deletedAt ||
      installedRecord.localState !== 'available' ||
      installedRecord.mimeType.toLowerCase() !== cloud.mimeType.toLowerCase() ||
      installedRecord.sizeBytes !== cloud.sizeBytes
    ) {
      throw new Error('The restored Project File metadata does not match its immutable render source.');
    }
    const installed = await ports.getOfflineBlob(source.projectFileId);
    if (!installed || installed.size !== cloud.sizeBytes) throw new Error('The Project File could not be verified after Offline Storage restore.');
    await assertStoredContentHash(installed, cloud.expectedSha256 || installedRecord.contentHash);
    return {
      sourceKey: 'project-file:' + source.projectFileId,
      projectId,
      mimeType: cloud.mimeType,
      fileName: cloud.fileName,
      sizeBytes: cloud.sizeBytes,
      blob: installed,
      replica: 'restored',
    };
  }

  if (!source.assetId || !source.assetVersionId) throw new Error('A legacy Asset ID and immutable Version ID are required.');
  const signedUrl = await ports.getLegacyPlaybackUrl({ assetId: source.assetId, assetVersionId: source.assetVersionId }, expectedKind);
  const blob = await ports.fetchBlob(signedUrl);
  if (!blob.size) throw new Error('The legacy Asset Version returned an empty media file.');
  const declaredMimeType = source.mimeType?.trim().toLowerCase() || '';
  const downloadedMimeType = blob.type.trim().toLowerCase();
  const mimeEssence = (value: string) => value.split(';', 1)[0].trim();
  if (declaredMimeType && downloadedMimeType &&
      mimeEssence(declaredMimeType) !== mimeEssence(downloadedMimeType)) {
    throw new Error('The downloaded legacy Asset MIME type differs from its immutable render manifest.');
  }
  const mimeType = declaredMimeType || downloadedMimeType || expectedKind + '/octet-stream';
  assertMediaKind(mimeType, expectedKind);
  if (downloadedMimeType) assertMediaKind(downloadedMimeType, expectedKind);
  return {
    sourceKey: 'legacy-asset:' + source.assetId + ':' + source.assetVersionId,
    projectId,
    mimeType,
    fileName: source.assetId + '-' + source.assetVersionId,
    sizeBytes: blob.size,
    blob,
    replica: 'legacy-cache-or-cloud',
  };
}
