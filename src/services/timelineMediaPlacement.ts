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
 * Scenes behaves as one continuous clip train anchored at 0s.
 * Empty row starts at 0; a playhead inside a clip inserts after it;
 * a playhead between clips inserts at that boundary; any trailing empty
 * space after the final clip is ignored and insertion appends to the train.
 */
export function getScenesInsertionTime(
  clips: Array<Pick<TimelineMediaClipPlacement, 'start' | 'duration'>>,
  playheadTime: number,
): number {
  if (clips.length === 0) return 0;
  const ordered = [...clips].sort((a, b) => a.start - b.start);
  const playhead = Math.max(0, Number.isFinite(playheadTime) ? playheadTime : 0);
  let previousEnd = 0;

  for (const clip of ordered) {
    const start = Math.max(0, clip.start);
    const end = start + Math.max(0, clip.duration);
    if (playhead < start - EPSILON) return previousEnd;
    if (playhead < end - EPSILON) return end;
    previousEnd = Math.max(previousEnd, end);
  }
  return previousEnd;
}

/**
 * Return the insertion slot in the original visual order. A playhead inside
 * a clip inserts after it; a playhead in a gap inserts before the next clip;
 * after the final clip appends. Empty Scenes always starts at slot zero.
 */
export function getScenesInsertionIndex(
  clips: Array<Pick<TimelineMediaClipPlacement, 'start' | 'duration'>>,
  playheadTime: number,
): number {
  const ordered = [...clips].sort((a, b) => a.start - b.start);
  const playhead = Math.max(0, Number.isFinite(playheadTime) ? playheadTime : 0);
  for (let index = 0; index < ordered.length; index += 1) {
    const clip = ordered[index];
    if (playhead < clip.start - EPSILON) return index;
    if (playhead < clip.start + clip.duration - EPSILON) return index + 1;
  }
  return ordered.length;
}

/** Rebuild absolute start times as one gapless train beginning at 0s. */
export function buildScenesClipTrainLayout<T extends Pick<TimelineMediaClipPlacement, 'id' | 'start' | 'duration'>>(
  clips: T[],
): Array<T & { start: number }> {
  let cursor = 0;
  return [...clips]
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    .map((clip) => {
      const placed = { ...clip, start: cursor };
      cursor += Math.max(0, clip.duration);
      return placed;
    });
}

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
        { ...visualRow, name: 'Scenes', clips: [...visualRow.clips, clip].sort((a, b) => a.start - b.start) },
        ...tracks.slice(1),
      ];
      return { tracks: next, trackId: visualRow.id, rowIndex: 0, createdTrack: false };
    }
    const track = { id: createId(), name: 'Scenes', clips: [clip] };
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
    name: 'Scenes',
    clips,
  }];
}
