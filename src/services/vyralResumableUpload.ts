type ResumableUploadRecord = {
  key: string;
  uploadUrl: string;
  sizeBytes: number;
  lastModified: number;
  updatedAt: number;
};

const DATABASE_NAME = 'vyra-resumable-uploads';
const STORE_NAME = 'uploads';
const CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 1500, 3500, 7000, 12000];

function openUploadDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open upload recovery storage.'));
  });
}

async function readUpload(key: string): Promise<ResumableUploadRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openUploadDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as ResumableUploadRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function writeUpload(record: ResumableUploadRecord): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openUploadDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

async function removeUpload(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openUploadDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

const encodeMetadata = (value: string) => btoa(unescape(encodeURIComponent(value)));

function waitForRetry(delay: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

function getUploadKey(db: any, path: string, file: File): string {
  return [db.supabaseUrl, path, file.size, file.lastModified].join('|');
}

export async function clearVyralResumableUpload(db: any, path: string, file: File): Promise<void> {
  await removeUpload(getUploadKey(db, path, file)).catch(() => undefined);
}

async function resumableSupabaseUpload(db: any, path: string, file: File, mimeType: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) throw new Error('A valid sign-in session is required for file upload.');

  const configuredUrl = new URL(db.supabaseUrl);
  const directHost = configuredUrl.hostname.endsWith('.supabase.co')
    ? configuredUrl.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
    : configuredUrl.hostname;
  const endpoint = configuredUrl.protocol + '//' + directHost + '/storage/v1/upload/resumable';
  const headers = {
    authorization: 'Bearer ' + accessToken,
    apikey: db.supabaseKey,
    'Tus-Resumable': '1.0.0',
  };
  const key = getUploadKey(db, path, file);
  let saved = await readUpload(key).catch(() => null);
  let uploadUrl = saved && saved.sizeBytes === file.size && saved.lastModified === file.lastModified
    ? saved.uploadUrl : null;

  const createUpload = async (): Promise<string> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Upload-Length': String(file.size),
        'Upload-Metadata': [
          'bucketName ' + encodeMetadata('vyral-assets'),
          'objectName ' + encodeMetadata(path),
          'contentType ' + encodeMetadata(mimeType),
          'cacheControl ' + encodeMetadata('3600'),
        ].join(','),
        'x-upsert': 'false',
      },
    });
    if (response.status !== 201) throw new Error('Could not start resumable upload (' + response.status + '): ' + (await response.text()).slice(0, 400));
    const location = response.headers.get('Location');
    if (!location) throw new Error('Storage did not return a resumable upload address.');
    const absoluteUrl = new URL(location, endpoint).toString();
    await writeUpload({ key, uploadUrl: absoluteUrl, sizeBytes: file.size, lastModified: file.lastModified, updatedAt: Date.now() }).catch(() => undefined);
    return absoluteUrl;
  };

  const getOffset = async (url: string): Promise<number> => {
    const response = await fetch(url, { method: 'HEAD', headers });
    if (response.status === 404 || response.status === 410) return -1;
    if (!response.ok) throw new Error('Could not resume upload (' + response.status + ').');
    const offset = Number(response.headers.get('Upload-Offset'));
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) throw new Error('Storage returned an invalid upload position.');
    return offset;
  };

  if (uploadUrl) {
    try {
      if (await getOffset(uploadUrl) < 0) {
        await removeUpload(key).catch(() => undefined);
        uploadUrl = null;
      }
    } catch {
      // A transient HEAD failure must not discard the saved resume address.
      throw new Error('Could not reconnect to the previous upload. Please retry; the saved upload position is preserved.');
    }
  }
  if (!uploadUrl) uploadUrl = await createUpload();

  let offset = await getOffset(uploadUrl);
  if (offset < 0) {
    await removeUpload(key).catch(() => undefined);
    uploadUrl = await createUpload();
    offset = 0;
  }

  while (offset < file.size) {
    let completedChunk = false;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_DELAYS.length && !completedChunk; attempt += 1) {
      if (RETRY_DELAYS[attempt]) await waitForRetry(RETRY_DELAYS[attempt]);
      try {
        const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
        const response = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            ...headers,
            'Content-Type': 'application/offset+octet-stream',
            'Upload-Offset': String(offset),
          },
          body: chunk,
        });
        if (response.status === 204) {
          const nextOffset = Number(response.headers.get('Upload-Offset'));
          if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > file.size) {
            throw new Error('Storage returned an invalid chunk position.');
          }
          offset = nextOffset;
          await writeUpload({ key, uploadUrl, sizeBytes: file.size, lastModified: file.lastModified, updatedAt: Date.now() }).catch(() => undefined);
          completedChunk = true;
          continue;
        }
        if (response.status === 404 || response.status === 410) {
          await removeUpload(key).catch(() => undefined);
          uploadUrl = await createUpload();
          offset = 0;
          completedChunk = true;
          continue;
        }
        lastError = new Error('File chunk upload failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
      } catch (cause) {
        lastError = cause instanceof Error ? cause : new Error('File chunk upload was interrupted.');
      }
      // The server may have accepted a chunk even when its response was lost.
      try {
        const serverOffset = await getOffset(uploadUrl);
        if (serverOffset < 0) {
          await removeUpload(key).catch(() => undefined);
          uploadUrl = await createUpload();
          offset = 0;
        } else {
          offset = serverOffset;
        }
        if (offset >= file.size) completedChunk = true;
      } catch (resumeCause) {
        lastError = resumeCause instanceof Error ? resumeCause : lastError;
      }
    }
    if (!completedChunk) {
      throw new Error('Upload paused at ' + Math.round(offset / file.size * 100) + '%. Retry to continue from the saved position. ' + (lastError?.message ?? 'Network unavailable.'));
    }
  }

  // Keep the completed TUS session until the Asset, Version and DNA are committed.
  // A retry can HEAD this session and skip bytes already accepted by Storage.
}

export async function uploadVyralAssetResumably(db: any, path: string, file: File, mimeType: string): Promise<void> {
  if (typeof fetch !== 'function' || typeof URL === 'undefined') {
    const { error } = await db.storage.from('vyral-assets').upload(path, file, {
      contentType: mimeType, upsert: false, cacheControl: '3600',
    });
    if (error) throw error;
    return;
  }
  await resumableSupabaseUpload(db, path, file, mimeType);
}
