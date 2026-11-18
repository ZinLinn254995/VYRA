export type ProjectRenderDecodedVideo = {
  video: HTMLVideoElement;
  durationSeconds: number;
  width: number;
  height: number;
  dispose: () => void;
};

export type ProjectRenderVideoDecoderPorts = {
  createVideo: () => HTMLVideoElement;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
};

const defaultPorts: ProjectRenderVideoDecoderPorts = {
  createVideo: () => document.createElement('video'),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

function waitForMediaEvent(
  video: HTMLVideoElement,
  successEvent: 'loadedmetadata' | 'seeked',
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Video decode was aborted.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(successEvent, onSuccess);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The Project render video could not be decoded.')); };
    const onAbort = () => { cleanup(); reject(new DOMException('Video decode was aborted.', 'AbortError')); };
    video.addEventListener(successEvent, onSuccess, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Decode and seek a private Blob-backed video to an exact source timestamp.
 * The returned element remains paused and owns its object URL until dispose().
 * Callers must dispose it when the render source is no longer needed.
 */
export async function decodeProjectRenderVideoFrame(
  input: { blob: Blob; mimeType: string; timeSeconds: number; signal?: AbortSignal },
  ports: ProjectRenderVideoDecoderPorts = defaultPorts,
): Promise<ProjectRenderDecodedVideo> {
  if (!(input.blob instanceof Blob) || input.blob.size <= 0 ||
      !/^video\//i.test(input.mimeType.trim()) ||
      !Number.isFinite(input.timeSeconds) || input.timeSeconds < 0) {
    throw new Error('A non-empty video Blob, video MIME type, and non-negative source timestamp are required.');
  }
  if (input.blob.type && input.blob.type.split(';', 1)[0].trim().toLowerCase() !==
      input.mimeType.split(';', 1)[0].trim().toLowerCase()) {
    throw new Error('The decoded video Blob MIME type differs from its immutable render source.');
  }
  if (input.signal?.aborted) throw new DOMException('Video decode was aborted.', 'AbortError');

  const video = ports.createVideo();
  const objectUrl = ports.createObjectUrl(input.blob);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
    ports.revokeObjectUrl(objectUrl);
  };

  try {
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const metadataReady = waitForMediaEvent(video, 'loadedmetadata', input.signal);
    video.src = objectUrl;
    video.load();
    if (video.readyState < 1) await metadataReady;
    const durationSeconds = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('The Project render video has invalid duration or decoded dimensions.');
    }
    if (input.timeSeconds >= durationSeconds) {
      throw new Error('The requested source timestamp is outside the video duration.');
    }

    if (Math.abs(video.currentTime - input.timeSeconds) > 0.0005) {
      const seeked = waitForMediaEvent(video, 'seeked', input.signal);
      video.currentTime = input.timeSeconds;
      await seeked;
    }
    if (video.readyState < 2) {
      await waitForMediaEvent(video, 'loadeddata', input.signal).catch(() => {
        throw new Error('The Project render video seek completed without a decoded frame.');
      });
    }
    if (input.signal?.aborted) throw new DOMException('Video decode was aborted.', 'AbortError');
    return { video, durationSeconds, width, height, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
