export interface SavedMediaImage {
  id: string;
  title: string;
  dataUrl: string;
  model: string;
  costUsd: number | null;
  createdAt: string;
}

const DB_NAME = 'vyra-media-library';
const STORE_NAME = 'generated-images';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support persistent media storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open the Media Library database.'));
  });
}

export async function saveGeneratedImage(
  image: Omit<SavedMediaImage, 'id' | 'createdAt'>,
): Promise<SavedMediaImage> {
  const record: SavedMediaImage = {
    ...image,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'image-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save this image. Browser storage may be full.'));
      transaction.onabort = () => reject(new Error('Saving the image was cancelled. Browser storage may be full.'));
    });
    return record;
  } finally {
    db.close();
  }
}

export async function getSavedImages(): Promise<SavedMediaImage[]> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedMediaImage[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const records = request.result as SavedMediaImage[];
        resolve(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
      request.onerror = () => reject(new Error('Could not load saved media.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteSavedImage(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not remove this image.'));
    });
  } finally {
    db.close();
  }
}
