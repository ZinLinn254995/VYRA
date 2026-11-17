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
    await ports.installCloudReplica({
      projectId,
      projectFileId: cloud.projectFileId,
      fileName: cloud.fileName,
      mimeType: cloud.mimeType,
      blob: downloaded,
      expectedSha256: cloud.expectedSha256,
    });
    const installed = await ports.getOfflineBlob(source.projectFileId);
    if (!installed || installed.size !== cloud.sizeBytes) throw new Error('The Project File could not be verified after Offline Storage restore.');
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
  const mimeType = source.mimeType || blob.type || expectedKind + '/octet-stream';
  assertMediaKind(mimeType, expectedKind);
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
