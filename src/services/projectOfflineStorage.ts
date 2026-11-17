/**
 * Dedicated, durable local replica storage for Project files.
 *
 * This module deliberately does not upload to Cloud. Import completes into the
 * device's VYRA Offline Storage first, then returns a stable Project File ID and
 * a durable sync-queue entry for a separate background sync worker.
 */

export type ProjectOfflineReplicaState = 'copying' | 'available' | 'failed';
export type ProjectCloudReplicaState = 'not_queued' | 'queued' | 'uploading' | 'synced' | 'failed';

export type ProjectOfflineFileRecord = {
  id: string;
  projectId: string;
  folderId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  localState: ProjectOfflineReplicaState;
  cloudState: ProjectCloudReplicaState;
  storageBackend: 'opfs' | 'indexeddb';
  storageKey: string;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectOfflineSyncOperation = {
  operationId: string;
  kind: 'upload';
  projectFileId: string;
  projectId: string;
  state: 'queued' | 'uploading' | 'failed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

export type ProjectLocalCopyProgress = (progress: {
  projectFileId: string;
  fileName: string;
  completedBytes: number;
  totalBytes: number;
}) => void;

const DATABASE_NAME = 'vyra-project-offline';
const DATABASE_VERSION = 1;
const FILE_STORE = 'projectFiles';
const BLOB_STORE = 'fallbackBlobs';
const SYNC_STORE = 'syncOperations';
const LARGE_COPY_PROGRESS_THRESHOLD = 32 * 1024 * 1024;
const COPY_CHUNK_BYTES = 8 * 1024 * 1024;
const HASH_MAX_BYTES = 64 * 1024 * 1024;

type OpfsWritable = {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};
type OpfsFileHandle = {
  createWritable(options?: { keepExistingData?: boolean }): Promise<OpfsWritable>;
  getFile(): Promise<File>;
};
type OpfsDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string): Promise<void>;
};
type StorageWithOpfs = StorageManager & {
  getDirectory?: () => Promise<OpfsDirectoryHandle>;
  persist?: () => Promise<boolean>;
};

let databasePromise: Promise<IDBDatabase> | null = null;
let opfsDirectoryPromise: Promise<OpfsDirectoryHandle | null> | null = null;

function createId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random IDs are required for Project file storage.');
  }
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not support local Project storage.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE, { keyPath: 'operationId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open VYRA Offline Storage.'));
    };
    request.onblocked = () => reject(new Error('VYRA Offline Storage is busy in another app tab.'));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local Storage operation failed.'));
  });
}

async function storeValue<T>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save local Storage data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local Storage write was interrupted.'));
  });
}

async function getValue<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestResult(transaction.objectStore(storeName).get(key)) as T | undefined;
  return result ?? null;
}

async function getAllValues<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

async function deleteValue(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove local Storage data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local Storage removal was interrupted.'));
  });
}

async function getOpfsDirectory(): Promise<OpfsDirectoryHandle | null> {
  if (opfsDirectoryPromise) return opfsDirectoryPromise;
  opfsDirectoryPromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.storage) return null;
    const storage = navigator.storage as StorageWithOpfs;
    if (!storage.getDirectory) return null;
    try {
      return await storage.getDirectory();
    } catch {
      return null;
    }
  })();
  return opfsDirectoryPromise;
}

export async function requestProjectOfflinePersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) return false;
  const storage = navigator.storage as StorageWithOpfs;
  if (!storage.persist) return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function getProjectOfflineStorageEstimate(): Promise<{
  usageBytes: number | null;
  quotaBytes: number | null;
  persistent: boolean | null;
}> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { usageBytes: null, quotaBytes: null, persistent: null };
  }
  const storage = navigator.storage as StorageWithOpfs;
  let estimate: StorageEstimate | null = null;
  let persistent: boolean | null = null;
  try { estimate = storage.estimate ? await storage.estimate() : null; } catch { /* optional browser API */ }
  try { persistent = storage.persisted ? await storage.persisted() : null; } catch { /* optional browser API */ }
  return {
    usageBytes: typeof estimate?.usage === 'number' ? estimate.usage : null,
    quotaBytes: typeof estimate?.quota === 'number' ? estimate.quota : null,
    persistent,
  };
}

async function calculateSmallFileHash(file: File): Promise<string | null> {
  if (file.size > HASH_MAX_BYTES || typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function copyToOpfs(file: File, storageKey: string, projectFileId: string, onProgress?: ProjectLocalCopyProgress): Promise<void> {
  const directory = await getOpfsDirectory();
  if (!directory) throw new Error('OPFS is unavailable.');
  const handle = await directory.getFileHandle(storageKey, { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });
  let completedBytes = 0;
  try {
    for (let offset = 0; offset < file.size; offset += COPY_CHUNK_BYTES) {
      const chunk = await file.slice(offset, Math.min(file.size, offset + COPY_CHUNK_BYTES)).arrayBuffer();
      await writable.write(chunk);
      completedBytes += chunk.byteLength;
      if (file.size >= LARGE_COPY_PROGRESS_THRESHOLD) {
        onProgress?.({ projectFileId, fileName: file.name, completedBytes, totalBytes: file.size });
      }
    }
    await writable.close();
  } catch (error) {
    try { await writable.abort?.(); } catch { /* best-effort rollback */ }
    try { await directory.removeEntry(storageKey); } catch { /* best-effort rollback */ }
    throw error;
  }
}

function emitOfflineStorageChanged(projectFileId: string): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vyra:project-offline-file-ready', { detail: { projectFileId } }));
  }
}

/**
 * Copy a Device File into VYRA Offline Storage before exposing it to the Project.
 * The source File is never moved or modified. Cloud transfer is intentionally
 * delegated to a background worker that consumes the durable sync queue.
 */
export async function importProjectFileToOfflineStorage(input: {
  projectId: string;
  folderId?: string | null;
  file: File;
  projectFileId?: string;
  onProgress?: ProjectLocalCopyProgress;
}): Promise<{ file: ProjectOfflineFileRecord; syncOperation: ProjectOfflineSyncOperation }> {
  if (!input.projectId) throw new Error('A Project is required to import a file.');
  if (!input.file || input.file.size <= 0) throw new Error('The selected file is empty.');
  const projectFileId = input.projectFileId || createId();
  const storageKey = projectFileId + '.blob';
  const now = new Date().toISOString();
  const directory = await getOpfsDirectory();
  let storageBackend: 'opfs' | 'indexeddb' = directory ? 'opfs' : 'indexeddb';

  const initialRecord: ProjectOfflineFileRecord = {
    id: projectFileId,
    projectId: input.projectId,
    folderId: input.folderId ?? null,
    fileName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    sizeBytes: input.file.size,
    lastModified: input.file.lastModified || Date.now(),
    localState: 'copying',
    cloudState: 'not_queued',
    storageBackend,
    storageKey,
    contentHash: null,
    createdAt: now,
    updatedAt: now,
  };
  await storeValue(FILE_STORE, initialRecord);

  try {
    if (directory) {
      try {
        await copyToOpfs(input.file, storageKey, projectFileId, input.onProgress);
      } catch {
        // OPFS may be unavailable or out of quota. Fall back to IndexedDB if possible.
        storageBackend = 'indexeddb';
        await storeValue(BLOB_STORE, { key: storageKey, blob: input.file, projectFileId });
      }
    } else {
      await storeValue(BLOB_STORE, { key: storageKey, blob: input.file, projectFileId });
    }

    const [contentHash] = await Promise.all([calculateSmallFileHash(input.file)]);
    const readyAt = new Date().toISOString();
    const readyRecord: ProjectOfflineFileRecord = {
      ...initialRecord,
      storageBackend,
      localState: 'available',
      cloudState: 'queued',
      contentHash,
      updatedAt: readyAt,
    };
    const syncOperation: ProjectOfflineSyncOperation = {
      operationId: 'upload:' + projectFileId,
      kind: 'upload',
      projectFileId,
      projectId: input.projectId,
      state: 'queued',
      attempts: 0,
      createdAt: readyAt,
      updatedAt: readyAt,
      lastError: null,
    };
    // Commit the ready metadata and durable upload operation before announcing
    // availability. If the queue write fails, do not expose a file that cannot
    // be recovered/synchronized.
    await storeValue(FILE_STORE, readyRecord);
    await storeValue(SYNC_STORE, syncOperation);
    emitOfflineStorageChanged(projectFileId);
    return { file: readyRecord, syncOperation };
  } catch (error) {
    const failedRecord = { ...initialRecord, storageBackend, localState: 'failed' as const, updatedAt: new Date().toISOString() };
    try { await storeValue(FILE_STORE, failedRecord); } catch { /* preserve original error */ }
    throw error instanceof Error ? error : new Error('Could not copy the file into VYRA Offline Storage.');
  }
}

/**
 * Install a verified Cloud replica into this device's dedicated Offline Storage.
 * The Project File ID is preserved; this creates a local replica, never a new
 * logical Project file and never an upload queue entry.
 */
export async function installProjectCloudFileToOfflineStorage(input: {
  projectId: string;
  projectFileId: string;
  folderId?: string | null;
  fileName: string;
  mimeType: string;
  lastModified?: number;
  blob: Blob;
  expectedSha256?: string | null;
}): Promise<ProjectOfflineFileRecord> {
  if (!input.projectId || !input.projectFileId) throw new Error('A Project and Project File ID are required.');
  if (!input.blob || input.blob.size <= 0) throw new Error('The Cloud file is empty.');
  const existing = await getProjectOfflineFile(input.projectFileId);
  if (existing?.localState === 'available' && existing.projectId === input.projectId) return existing;

  const storageKey = input.projectFileId + '.blob';
  const directory = await getOpfsDirectory();
  let storageBackend: 'opfs' | 'indexeddb' = directory ? 'opfs' : 'indexeddb';
  const now = new Date().toISOString();
  const base: ProjectOfflineFileRecord = {
    id: input.projectFileId,
    projectId: input.projectId,
    folderId: input.folderId ?? existing?.folderId ?? null,
    fileName: input.fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    sizeBytes: input.blob.size,
    lastModified: input.lastModified || Date.now(),
    localState: 'copying',
    cloudState: 'synced',
    storageBackend,
    storageKey,
    contentHash: input.expectedSha256 ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await storeValue(FILE_STORE, base);
  try {
    if (directory) {
      try {
        const handle = await directory.getFileHandle(storageKey, { create: true });
        const writable = await handle.createWritable({ keepExistingData: false });
        try {
          for (let offset = 0; offset < input.blob.size; offset += COPY_CHUNK_BYTES) {
            const chunk = await input.blob.slice(offset, Math.min(input.blob.size, offset + COPY_CHUNK_BYTES)).arrayBuffer();
            await writable.write(chunk);
          }
          await writable.close();
        } catch (error) {
          try { await writable.abort?.(); } catch { /* best effort */ }
          try { await directory.removeEntry(storageKey); } catch { /* best effort */ }
          throw error;
        }
      } catch {
        storageBackend = 'indexeddb';
        await storeValue(BLOB_STORE, { key: storageKey, blob: input.blob, projectFileId: input.projectFileId });
      }
    } else {
      await storeValue(BLOB_STORE, { key: storageKey, blob: input.blob, projectFileId: input.projectFileId });
    }

    let contentHash = input.expectedSha256 ?? null;
    if (input.blob.size <= HASH_MAX_BYTES && typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await input.blob.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (input.expectedSha256 && actual.toLowerCase() !== input.expectedSha256.toLowerCase()) {
        throw new Error('The downloaded Cloud file failed its SHA-256 integrity check.');
      }
      contentHash = actual;
    }
    const ready: ProjectOfflineFileRecord = {
      ...base,
      storageBackend,
      localState: 'available',
      cloudState: 'synced',
      contentHash,
      updatedAt: new Date().toISOString(),
    };
    await storeValue(FILE_STORE, ready);
    emitOfflineStorageChanged(input.projectFileId);
    return ready;
  } catch (error) {
    const failed = { ...base, storageBackend, localState: 'failed' as const, updatedAt: new Date().toISOString() };
    try { await storeValue(FILE_STORE, failed); } catch { /* preserve original error */ }
    throw error instanceof Error ? error : new Error('Could not restore the Cloud file into Offline Storage.');
  }
}

export async function getProjectOfflineFile(projectFileId: string): Promise<ProjectOfflineFileRecord | null> {
  return getValue<ProjectOfflineFileRecord>(FILE_STORE, projectFileId);
}

export async function getProjectOfflineFileBlob(projectFileId: string): Promise<File | Blob | null> {
  const record = await getProjectOfflineFile(projectFileId);
  if (!record || record.localState !== 'available') return null;
  if (record.storageBackend === 'opfs') {
    const directory = await getOpfsDirectory();
    if (!directory) return null;
    try {
      const handle = await directory.getFileHandle(record.storageKey);
      return await handle.getFile();
    } catch {
      return null;
    }
  }
  const fallback = await getValue<{ key: string; blob: Blob }>(BLOB_STORE, record.storageKey);
  return fallback?.blob ?? null;
}

export async function getProjectOfflineFileAsFile(projectFileId: string): Promise<File | null> {
  const [record, blob] = await Promise.all([
    getProjectOfflineFile(projectFileId),
    getProjectOfflineFileBlob(projectFileId),
  ]);
  if (!record || !blob) return null;
  return new File([blob], record.fileName, { type: record.mimeType, lastModified: record.lastModified });
}

export async function listProjectOfflineFiles(projectId: string): Promise<ProjectOfflineFileRecord[]> {
  const files = await getAllValues<ProjectOfflineFileRecord>(FILE_STORE);
  return files.filter((file) => file.projectId === projectId && file.localState === 'available');
}

export async function listPendingProjectOfflineSyncOperations(limit = 20): Promise<ProjectOfflineSyncOperation[]> {
  const operations = await getAllValues<ProjectOfflineSyncOperation>(SYNC_STORE);
  return operations
    .filter((operation) => operation.state === 'queued' || operation.state === 'failed' || operation.state === 'uploading')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(1, Math.min(100, Math.floor(limit) || 20)));
}

export async function updateProjectOfflineCloudState(
  projectFileId: string,
  cloudState: ProjectCloudReplicaState,
  errorMessage?: string | null,
): Promise<void> {
  const record = await getProjectOfflineFile(projectFileId);
  if (!record) throw new Error('The Project file is not present in this device Offline Storage.');
  const now = new Date().toISOString();
  await storeValue(FILE_STORE, { ...record, cloudState, updatedAt: now });
  const operationId = 'upload:' + projectFileId;
  const operation = await getValue<ProjectOfflineSyncOperation>(SYNC_STORE, operationId);
  if (operation) {
    if (cloudState === 'synced') {
      await deleteValue(SYNC_STORE, operationId);
    } else {
      await storeValue(SYNC_STORE, {
        ...operation,
        state: cloudState === 'failed' ? 'failed' : cloudState === 'uploading' ? 'uploading' : 'queued',
        attempts: cloudState === 'failed' ? operation.attempts + 1 : operation.attempts,
        updatedAt: now,
        lastError: errorMessage ?? null,
      });
    }
  }
}

export async function removeProjectOfflineFile(projectFileId: string): Promise<void> {
  const record = await getProjectOfflineFile(projectFileId);
  if (!record) return;
  if (record.cloudState !== 'synced') {
    throw new Error('This file has not been safely synchronized to Cloud yet and cannot be removed from Offline Storage.');
  }
  if (record.storageBackend === 'opfs') {
    const directory = await getOpfsDirectory();
    try { await directory?.removeEntry(record.storageKey); } catch { /* idempotent removal */ }
  } else {
    await deleteValue(BLOB_STORE, record.storageKey);
  }
  await deleteValue(FILE_STORE, projectFileId);
  await deleteValue(SYNC_STORE, 'upload:' + projectFileId);
}
