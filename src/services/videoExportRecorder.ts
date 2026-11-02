export const VIDEO_EXPORT_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export type VideoExportRecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
};

export function createVideoExportRecorder(
  stream: MediaStream,
  Recorder: VideoExportRecorderConstructor,
): { recorder: MediaRecorder; mimeType: string } {
  let lastError: unknown;
  for (const candidate of VIDEO_EXPORT_MIME_CANDIDATES) {
    if (!Recorder.isTypeSupported(candidate)) continue;
    try {
      return {
        recorder: new Recorder(stream, { mimeType: candidate, videoBitsPerSecond: 6_000_000 }),
        mimeType: candidate,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(
      'This browser rejected every supported export format. Try an updated Chrome or Edge browser. Details: ' +
      lastError.message,
    );
  }
  throw new Error('This browser cannot encode an export format supported by VYRA. Try an updated Chrome or Edge browser.');
}
