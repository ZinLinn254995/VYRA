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
 * Video and Image always occupy one shared visual row, even when clips overlap.
 * Audio remains on its own independent track and may use additional rows.
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

  if (kind !== 'audio') {
    const visualRow = tracks[0];
    if (visualRow) {
      const next = [
        { ...visualRow, name: 'Video 1', clips: [...visualRow.clips, clip].sort((a, b) => a.start - b.start) },
        ...tracks.slice(1),
      ];
      return { tracks: next, trackId: visualRow.id, rowIndex: 0, createdTrack: false };
    }
    const track = { id: createId(), name: 'Video 1', clips: [clip] };
    return { tracks: [track], trackId: track.id, rowIndex: 0, createdTrack: true };
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
  const rowIndex = tracks.length;
  const track = { id: createId(), name: 'Audio ' + (rowIndex + 1), clips: [clip] };
  return { tracks: [...tracks, track], trackId: track.id, rowIndex, createdTrack: true };
}


/**
 * Combine AI Director media and creator-uploaded media into exactly one
 * shared Video row. Overlapping clips remain on that row as layered clips.
 */
export function mergeTimelineVideoRows(
  directorClips: TimelineMediaClipPlacement[],
  uploadedTracks: TimelineMediaTrackRow[],
): TimelineMediaTrackRow[] {
  const clips = [
    ...directorClips,
    ...uploadedTracks.flatMap((track) => track.clips),
  ].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  if (clips.length === 0) return [];
  return [{
    id: 'video-layer-row-1',
    name: 'Video',
    clips,
  }];
}
