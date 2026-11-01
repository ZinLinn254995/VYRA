export interface SavedMediaImage {
  id: string;
  title: string;
  dataUrl: string;
  model: string;
  costUsd: number | null;
  /** Provider-issued generation reference, when available. */
  generationId?: string;
  projectId?: string;
  sceneId?: string;
  createdAt: string;
}

export interface SavedMediaAudio {
  id: string;
  title: string;
  blob: Blob;
  model: string;
  voice: string;
  costUsd?: number | null;
  /** Provider-issued generation reference, when available. */
  generationId?: string;
  projectId: string;
  sceneId: string;
  createdAt: string;
}

export interface SavedMediaVideo {
  id: string;
  title: string;
  blob: Blob;
  model: string;
  costUsd: number | null;
  /** OpenRouter generation reference; distinct from the asynchronous video Job ID. */
  generationId?: string;
  projectId: string;
  sceneId: string;
  createdAt: string;
}

const DB_NAME = 'vyra-media-library';
const STORE_NAME = 'generated-images';
const DB_VERSION = 6;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support persistent media storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('generated-audio')) {
        const audio = db.createObjectStore('generated-audio', { keyPath: 'id' });
        audio.createIndex('createdAt', 'createdAt');
        audio.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('generated-videos')) {
        const videos = db.createObjectStore('generated-videos', { keyPath: 'id' });
        videos.createIndex('createdAt', 'createdAt');
        videos.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('video-generation-jobs')) {
        const jobs = db.createObjectStore('video-generation-jobs', { keyPath: 'jobId' });
        jobs.createIndex('projectId', 'projectId');
        jobs.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Media Library storage is blocked by another open VYRA tab. Close other VYRA tabs and try again.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Could not open the Media Library database.'));
    };
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


export async function saveGeneratedAudio(
  audio: Omit<SavedMediaAudio, 'id' | 'createdAt'>,
): Promise<SavedMediaAudio> {
  const record: SavedMediaAudio = {
    ...audio,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'audio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('generated-audio', 'readwrite');
      transaction.objectStore('generated-audio').put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save the voiceover. Browser storage may be full.'));
      transaction.onabort = () => reject(new Error('Saving the voiceover was cancelled. Browser storage may be full.'));
    });
    return record;
  } finally {
    db.close();
  }
}

export async function getSavedAudio(id: string): Promise<SavedMediaAudio | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedMediaAudio | undefined>((resolve, reject) => {
      const request = db.transaction('generated-audio', 'readonly').objectStore('generated-audio').get(id);
      request.onsuccess = () => resolve(request.result as SavedMediaAudio | undefined);
      request.onerror = () => reject(new Error('Could not load this saved voiceover.'));
    });
  } finally {
    db.close();
  }
}

export async function getSavedAudios(): Promise<SavedMediaAudio[]> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedMediaAudio[]>((resolve, reject) => {
      const request = db.transaction('generated-audio', 'readonly').objectStore('generated-audio').getAll();
      request.onsuccess = () => {
        const records = request.result as SavedMediaAudio[];
        resolve(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
      request.onerror = () => reject(new Error('Could not load saved voiceovers.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteSavedAudio(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('generated-audio', 'readwrite');
      transaction.objectStore('generated-audio').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not remove this voiceover.'));
      transaction.onabort = () => reject(new Error('Removing this voiceover was cancelled.'));
    });
  } finally {
    db.close();
  }
}

export async function saveGeneratedVideo(
  video: Omit<SavedMediaVideo, 'id' | 'createdAt'>,
): Promise<SavedMediaVideo> {
  const record: SavedMediaVideo = {
    ...video,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'video-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('generated-videos', 'readwrite');
      transaction.objectStore('generated-videos').put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save the video. Browser storage may be full.'));
      transaction.onabort = () => reject(new Error('Saving the video was cancelled. Browser storage may be full.'));
    });
    return record;
  } finally {
    db.close();
  }
}

export async function getSavedVideos(): Promise<SavedMediaVideo[]> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedMediaVideo[]>((resolve, reject) => {
      const request = db.transaction('generated-videos', 'readonly').objectStore('generated-videos').getAll();
      request.onsuccess = () => {
        const records = request.result as SavedMediaVideo[];
        resolve(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
      request.onerror = () => reject(new Error('Could not load saved videos.'));
    });
  } finally {
    db.close();
  }
}

export async function getSavedVideo(id: string): Promise<SavedMediaVideo | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedMediaVideo | undefined>((resolve, reject) => {
      const request = db.transaction('generated-videos', 'readonly').objectStore('generated-videos').get(id);
      request.onsuccess = () => resolve(request.result as SavedMediaVideo | undefined);
      request.onerror = () => reject(new Error('Could not load this saved video.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteSavedVideo(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('generated-videos', 'readwrite');
      transaction.objectStore('generated-videos').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not remove this video.'));
      transaction.onabort = () => reject(new Error('Removing this video was cancelled.'));
    });
  } finally {
    db.close();
  }
}


/**
 * A provider job is persisted separately from the generated media blob so a
 * browser refresh or closed tab cannot lose the OpenRouter job identifier.
 * API keys are deliberately never stored in this record.
 */
export type VideoGenerationJobStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'needs_attention';

export interface SavedVideoGenerationJob {
  jobId: string;
  projectId: string;
  projectTitle: string;
  sceneId: string;
  sceneOrder: number;
  model: string;
  prompt: string;
  visualPrompt: string;
  cameraMovement: string;
  narration: string;
  dialogue?: string;
  duration: number;
  aspectRatio: string;
  resolution?: string;
  /** Scene clip already linked before this provider job started. */
  previousVideoId?: string;
  /** IndexedDB media record saved for this provider job, before the scene link is committed. */
  savedVideoId?: string;
  status: VideoGenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  costUsd?: number | null;
  /** OpenRouter generation reference; distinct from jobId. */
  generationId?: string;
  lastError?: string;
}

export async function saveVideoGenerationJob(job: SavedVideoGenerationJob): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('video-generation-jobs', 'readwrite');
      transaction.objectStore('video-generation-jobs').put(job);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save the video job. Browser storage may be unavailable.'));
      transaction.onabort = () => reject(new Error('Saving the video job was cancelled.'));
    });
  } finally {
    db.close();
  }
}

export async function getVideoGenerationJob(jobId: string): Promise<SavedVideoGenerationJob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedVideoGenerationJob | undefined>((resolve, reject) => {
      const request = db.transaction('video-generation-jobs', 'readonly').objectStore('video-generation-jobs').get(jobId);
      request.onsuccess = () => resolve(request.result as SavedVideoGenerationJob | undefined);
      request.onerror = () => reject(new Error('Could not load the saved video job.'));
    });
  } finally {
    db.close();
  }
}

export async function getVideoGenerationJobs(projectId?: string): Promise<SavedVideoGenerationJob[]> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedVideoGenerationJob[]>((resolve, reject) => {
      const store = db.transaction('video-generation-jobs', 'readonly').objectStore('video-generation-jobs');
      const request = projectId
        ? store.index('projectId').getAll(projectId)
        : store.getAll();
      request.onsuccess = () => {
        const jobs = request.result as SavedVideoGenerationJob[];
        resolve(jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      };
      request.onerror = () => reject(new Error('Could not load saved video jobs.'));
    });
  } finally {
    db.close();
  }
}

export async function updateVideoGenerationJob(
  jobId: string,
  updates: Partial<Omit<SavedVideoGenerationJob, 'jobId' | 'projectId' | 'sceneId' | 'createdAt'>>,
): Promise<SavedVideoGenerationJob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedVideoGenerationJob | undefined>((resolve, reject) => {
      const transaction = db.transaction('video-generation-jobs', 'readwrite');
      const store = transaction.objectStore('video-generation-jobs');
      const request = store.get(jobId);
      let updated: SavedVideoGenerationJob | undefined;
      request.onsuccess = () => {
        const current = request.result as SavedVideoGenerationJob | undefined;
        if (!current) return;
        updated = { ...current, ...updates, jobId: current.jobId, projectId: current.projectId, sceneId: current.sceneId, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
        store.put(updated);
      };
      request.onerror = () => reject(new Error('Could not update the saved video job.'));
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(new Error('Could not update the saved video job.'));
      transaction.onabort = () => reject(new Error('Updating the saved video job was cancelled.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteVideoGenerationJob(jobId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('video-generation-jobs', 'readwrite');
      transaction.objectStore('video-generation-jobs').delete(jobId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not remove the completed video job.'));
      transaction.onabort = () => reject(new Error('Removing the video job was cancelled.'));
    });
  } finally {
    db.close();
  }
}


/**
 * Update the cost on a linked video job and its saved media record atomically.
 * If either record is missing, neither record is modified.
 */
export async function updateLinkedVideoGenerationCost(
  jobId: string,
  videoId: string,
  costUsd: number,
): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error('Invalid provider-reported cost.');
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['video-generation-jobs', 'generated-videos'], 'readwrite');
      const jobs = transaction.objectStore('video-generation-jobs');
      const videos = transaction.objectStore('generated-videos');
      let job: SavedVideoGenerationJob | undefined;
      let video: SavedMediaVideo | undefined;
      let jobLoaded = false;
      let videoLoaded = false;
      const applyWhenReady = () => {
        if (!jobLoaded || !videoLoaded) return;
        if (!job || !video) {
          transaction.abort();
          return;
        }
        jobs.put({ ...job, costUsd, updatedAt: new Date().toISOString() });
        videos.put({ ...video, costUsd });
      };
      const jobRequest = jobs.get(jobId);
      const videoRequest = videos.get(videoId);
      jobRequest.onsuccess = () => {
        job = jobRequest.result as SavedVideoGenerationJob | undefined;
        jobLoaded = true;
        applyWhenReady();
      };
      videoRequest.onsuccess = () => {
        video = videoRequest.result as SavedMediaVideo | undefined;
        videoLoaded = true;
        applyWhenReady();
      };
      jobRequest.onerror = () => { try { transaction.abort(); } catch { /* transaction already finished */ } };
      videoRequest.onerror = () => { try { transaction.abort(); } catch { /* transaction already finished */ } };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save the linked video generation cost.'));
      transaction.onabort = () => reject(new Error('Could not update both the video job and saved video cost. No partial cost update was saved.'));
    });
  } finally {
    db.close();
  }
}

/** Persist a provider-reported cost without rewriting media blobs or generation references. */
export async function updateSavedMediaCost(
  kind: 'image' | 'audio' | 'video',
  id: string,
  costUsd: number,
): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error('Invalid provider-reported cost.');
  const db = await openDatabase();
  const storeName = kind === 'image' ? STORE_NAME : kind === 'audio' ? 'generated-audio' : 'generated-videos';
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          transaction.abort();
          reject(new Error('Saved media record no longer exists.'));
          return;
        }
        store.put({ ...request.result, costUsd });
      };
      request.onerror = () => reject(new Error('Could not read the saved media cost record.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Could not save the provider-reported cost.'));
      transaction.onabort = () => reject(new Error('Saving the provider-reported cost was cancelled.'));
    });
  } finally {
    db.close();
  }
}
