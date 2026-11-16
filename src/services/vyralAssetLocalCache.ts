export type VyralLocalAssetCopy = {
  userId: string;
  assetId: string;
  versionId: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  cachedAt: number;
};

const DATABASE_NAME = 'vyra-local-assets';
const DATABASE_VERSION = 1;
const STORE_NAME = 'asset-copies';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local asset storage is unavailable in this browser.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local asset storage.'));
    request.onblocked = () => reject(new Error('Local asset storage is blocked by another tab.'));
  });
}

function cacheKey(userId: string, assetId: string, versionId: string): string {
  return userId + ':' + assetId + ':' + versionId;
}

/**
 * Keep an offline copy only after the canonical cloud Asset Version is ready.
 * Cache failures never invalidate a successfully uploaded cloud Asset.
 */
export async function saveVyralAssetLocalCopy(input: Omit<VyralLocalAssetCopy, 'cachedAt'>): Promise<boolean> {
  if (!input.userId || !input.assetId || !input.versionId || !(input.blob instanceof Blob) || input.blob.size < 1) return false;
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        ...input,
        key: cacheKey(input.userId, input.assetId, input.versionId),
        cachedAt: Date.now(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the offline Asset copy.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline Asset save was interrupted.'));
    });
    return true;
  } catch {
    // Browser storage may be disabled or full. The cloud copy remains authoritative.
    return false;
  } finally {
    database?.close();
  }
}

export async function getVyralAssetLocalCopy(
  userId: string,
  assetId: string,
  versionId: string,
): Promise<VyralLocalAssetCopy | null> {
  if (!userId || !assetId || !versionId) return null;
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    return await new Promise<VyralLocalAssetCopy | null>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(cacheKey(userId, assetId, versionId));
      request.onsuccess = () => {
        const record = request.result as (VyralLocalAssetCopy & { key: string }) | undefined;
        if (!record || record.userId !== userId || record.assetId !== assetId || record.versionId !== versionId ||
            !(record.blob instanceof Blob) || record.blob.size !== record.sizeBytes) {
          resolve(null);
          return;
        }
        resolve(record);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the offline Asset copy.'));
    });
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function removeVyralAssetLocalCopy(userId: string, assetId: string, versionId: string): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(cacheKey(userId, assetId, versionId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove the offline Asset copy.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline Asset removal was interrupted.'));
    });
  } finally {
    database?.close();
  }
}
