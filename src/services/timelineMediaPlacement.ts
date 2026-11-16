export type TimelineMediaClipPlacement = {
  id: string;
  name: string;
  start: number;
  duration: number;
  assetId?: string;
  assetVersionId?: string;
  assetMimeType?: string;
  sourceIn?: number;
  sourceOut?: number;
  waveform?: number[];
};

export type TimelineMediaTrackRow = {
  id: string;
  name: string;
  clips: TimelineMediaClipPlacement[];
};

export type TimelineMediaPlacementResult = {
  tracks: TimelineMediaTrackRow[];
  trackId: string;
  rowIndex: number;
  createdTrack: boolean;
};

export type TimelineMediaKind = 'video' | 'image' | 'audio';

const EPSILON = 0.000001;

/**
 * Place a newly uploaded media clip on the lowest row of its media layer.
 * If any part of the requested interval overlaps a clip on that row, append
 * a new row. Video and Image intentionally share the same Video layer.
 */
export function placeTimelineMediaClip(
  tracks: TimelineMediaTrackRow[],
  clip: TimelineMediaClipPlacement,
  kind: TimelineMediaKind,
  createId: () => string,
): TimelineMediaPlacementResult {
  if (!clip.id || !clip.assetId || !clip.assetVersionId || !clip.assetMimeType) {
    throw new Error('A timeline clip must reference an immutable Asset Version.');
  }
  if (!Number.isFinite(clip.start) || clip.start < 0 ||
      !Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error('Timeline clip start and duration must be valid non-negative values.');
  }
  if (kind === 'audio' && !clip.assetMimeType.toLowerCase().startsWith('audio/')) {
    throw new Error('Audio media must reference an audio Asset Version.');
  }
  if (kind === 'video' && !clip.assetMimeType.toLowerCase().startsWith('video/')) {
    throw new Error('Video media must reference a video Asset Version.');
  }
  if (kind === 'image' && !clip.assetMimeType.toLowerCase().startsWith('image/')) {
    throw new Error('Image media must reference an image Asset Version.');
  }

  const end = clip.start + clip.duration;
  const last = tracks[tracks.length - 1];
  const overlaps = (last?.clips ?? []).some((existing) => {
    const existingEnd = existing.start + existing.duration;
    return clip.start < existingEnd - EPSILON && end > existing.start + EPSILON;
  });

  if (last && !overlaps) {
    const next = tracks.map((track, index) => index === tracks.length - 1
      ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) }
      : track);
    return { tracks: next, trackId: last.id, rowIndex: tracks.length - 1, createdTrack: false };
  }

  const prefix = kind === 'audio' ? 'Audio' : 'Video';
  const rowIndex = tracks.length;
  const track = {
    id: createId(),
    name: prefix + ' ' + (rowIndex + 1),
    clips: [clip],
  };
  return { tracks: [...tracks, track], trackId: track.id, rowIndex, createdTrack: true };
}
