export type MasterTimelineClip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  waveform?: number[];
  content?: string;
};

export type MasterTimelineTrack = {
  id: string;
  name: string;
  clips: MasterTimelineClip[];
  muted?: boolean;
  volume?: number;
  visible?: boolean;
  collapsed?: boolean;
};

export type MasterTimelineData = {
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  sceneInstances?: Array<{
    id: string; sceneId: string; sourceIn: number; sourceOut: number;
    sceneProjectId?: string; renderRevisionId?: string | null;
  }>;
  transitions: Record<string, { effect: string; duration: number }>;
  audioTracks: MasterTimelineTrack[];
  textTracks: MasterTimelineTrack[];
};

export type TimelineClipKind = 'audio' | 'text';
export type TimelineFailure =
  | 'invalid-timeline' | 'invalid-time' | 'track-not-found' | 'clip-not-found'
  | 'clip-collision' | 'invalid-duration' | 'invalid-content' | 'invalid-transition';

export type TimelineResult =
  | { ok: true; value: MasterTimelineData; affectedClipId?: string; createdClipId?: string }
  | { ok: false; reason: TimelineFailure };

const fail = (reason: TimelineFailure): TimelineResult => ({ ok: false, reason });
const finite = (value: number) => Number.isFinite(value);
const MIN_CLIP_DURATION = 0.2;
const COLLISION_EPSILON = 0.001;

const tracksFor = (timeline: MasterTimelineData, kind: TimelineClipKind) =>
  kind === 'audio' ? timeline.audioTracks : timeline.textTracks;

const withTracks = (timeline: MasterTimelineData, kind: TimelineClipKind, tracks: MasterTimelineTrack[]): MasterTimelineData =>
  kind === 'audio' ? { ...timeline, audioTracks: tracks } : { ...timeline, textTracks: tracks };

const findClip = (timeline: MasterTimelineData, kind: TimelineClipKind, trackId: string, clipId: string) => {
  const track = tracksFor(timeline, kind).find((item) => item.id === trackId);
  const clip = track?.clips.find((item) => item.id === clipId);
  return { track, clip };
};

const nearestFreeStart = (clips: MasterTimelineClip[], clipId: string, desiredStart: number, duration: number): number | null => {
  const occupied = clips.filter((clip) => clip.id !== clipId).sort((a, b) => a.start - b.start);
  const end = desiredStart + duration;
  const collided = occupied.filter((clip) =>
    desiredStart < clip.start + clip.duration - COLLISION_EPSILON &&
    end > clip.start + COLLISION_EPSILON
  );
  if (!collided.length) return desiredStart;
  if (collided.length > 1) return null;
  const candidates = collided
    .flatMap((clip) => [clip.start - duration, clip.start + clip.duration])
    .filter((start) => start >= 0)
    .filter((start) => occupied.every((clip) =>
      start + duration <= clip.start + COLLISION_EPSILON ||
      start >= clip.start + clip.duration - COLLISION_EPSILON
    ))
    .sort((a, b) => Math.abs(a - desiredStart) - Math.abs(b - desiredStart));
  return candidates[0] ?? null;
};

export const moveMasterTimelineClip = (
  timeline: MasterTimelineData,
  kind: TimelineClipKind,
  sourceTrackId: string,
  clipId: string,
  destinationTrackId: string,
  desiredStart: number,
): TimelineResult => {
  if (!timeline || !Array.isArray(timeline.audioTracks) || !Array.isArray(timeline.textTracks)) return fail('invalid-timeline');
  if (!finite(desiredStart) || desiredStart < 0) return fail('invalid-time');
  const tracks = tracksFor(timeline, kind);
  const source = tracks.find((track) => track.id === sourceTrackId);
  const destination = tracks.find((track) => track.id === destinationTrackId);
  if (!source || !destination) return fail('track-not-found');
  const clip = source.clips.find((item) => item.id === clipId);
  if (!clip) return fail('clip-not-found');
  if (!finite(clip.duration) || clip.duration < MIN_CLIP_DURATION) return fail('invalid-duration');
  const resolvedStart = nearestFreeStart(destination.clips, clipId, desiredStart, clip.duration);
  if (resolvedStart === null) {
    // Match MasterTimelineEditor.settleClipDrop: if the destination gap cannot
    // fit the clip, restore it to its exact original track and time.
    if (sourceTrackId === destinationTrackId) return { ok: true, value: timeline, affectedClipId: clipId };
    const restoredTracks = tracks.map((track) => {
      if (track.id === sourceTrackId) {
        const without = track.clips.filter((item) => item.id !== clipId);
        return { ...track, clips: [...without, { ...clip }] };
      }
      if (track.id === destinationTrackId) return { ...track, clips: track.clips.filter((item) => item.id !== clipId) };
      return track;
    }).filter((track) => track.clips.length > 0);
    return { ok: true, value: withTracks(timeline, kind, restoredTracks), affectedClipId: clipId };
  }

  const nextTracks = tracks.map((track) => {
    if (sourceTrackId === destinationTrackId && track.id === sourceTrackId) {
      return { ...track, clips: track.clips.map((item) => item.id === clipId ? { ...item, start: resolvedStart } : item) };
    }
    if (track.id === sourceTrackId) return { ...track, clips: track.clips.filter((item) => item.id !== clipId) };
    if (track.id === destinationTrackId) return { ...track, clips: [...track.clips, { ...clip, start: resolvedStart }] };
    return track;
  }).filter((track) => track.clips.length > 0);
  return { ok: true, value: withTracks(timeline, kind, nextTracks), affectedClipId: clipId };
};

export const trimMasterTimelineClip = (
  timeline: MasterTimelineData,
  kind: TimelineClipKind,
  trackId: string,
  clipId: string,
  edge: 'start' | 'end',
  requestedTime: number,
): TimelineResult => {
  if (!timeline || !Array.isArray(timeline.audioTracks) || !Array.isArray(timeline.textTracks)) return fail('invalid-timeline');
  if (!finite(requestedTime) || requestedTime < 0) return fail('invalid-time');
  const tracks = tracksFor(timeline, kind);
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return fail('track-not-found');
  const clip = track.clips.find((item) => item.id === clipId);
  if (!clip) return fail('clip-not-found');
  if (!finite(clip.start) || !finite(clip.duration) || clip.duration < MIN_CLIP_DURATION) return fail('invalid-duration');
  const others = track.clips.filter((item) => item.id !== clipId);
  const originalEnd = clip.start + clip.duration;
  const previousEnd = others
    .filter((item) => item.start + item.duration <= clip.start + 0.0001)
    .reduce((end, item) => Math.max(end, item.start + item.duration), 0);
  const nextStartBoundary = others
    .filter((item) => item.start >= originalEnd - 0.0001)
    .reduce((start, item) => Math.min(start, item.start), Number.POSITIVE_INFINITY);
  let start = clip.start;
  let duration = clip.duration;
  if (edge === 'start') {
    start = Math.max(previousEnd, Math.min(originalEnd - MIN_CLIP_DURATION, requestedTime));
    duration = originalEnd - start;
  } else {
    const maxEnd = Number.isFinite(nextStartBoundary) ? nextStartBoundary : Number.POSITIVE_INFINITY;
    duration = Math.max(MIN_CLIP_DURATION, Math.min(maxEnd - clip.start, requestedTime - clip.start));
  }
  const nextTracks = tracks.map((item) => item.id !== trackId ? item : {
    ...item, clips: item.clips.map((entry) => entry.id === clipId ? { ...entry, start, duration } : entry),
  });
  return { ok: true, value: withTracks(timeline, kind, nextTracks), affectedClipId: clipId };
};

export const splitMasterTimelineClip = (
  timeline: MasterTimelineData,
  kind: TimelineClipKind,
  trackId: string,
  clipId: string,
  splitTime: number,
  createId: () => string,
): TimelineResult => {
  if (!timeline || !Array.isArray(timeline.audioTracks) || !Array.isArray(timeline.textTracks)) return fail('invalid-timeline');
  if (!finite(splitTime) || splitTime < 0) return fail('invalid-time');
  const tracks = tracksFor(timeline, kind);
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return fail('track-not-found');
  const clip = track.clips.find((item) => item.id === clipId);
  if (!clip) return fail('clip-not-found');
  const end = clip.start + clip.duration;
  if (splitTime <= clip.start + MIN_CLIP_DURATION || splitTime >= end - MIN_CLIP_DURATION) return fail('invalid-time');
  const newId = createId();
  if (!newId || tracks.some((item) => item.clips.some((entry) => entry.id === newId))) return fail('invalid-timeline');
  const rightClip = { ...clip, id: newId, start: splitTime, duration: end - splitTime };
  const nextTracks = tracks.map((item) => item.id !== trackId ? item : {
    ...item,
    clips: item.clips.flatMap((entry) => entry.id !== clipId ? [entry] : [
      { ...entry, duration: splitTime - entry.start }, rightClip,
    ]),
  });
  return { ok: true, value: withTracks(timeline, kind, nextTracks), affectedClipId: clipId, createdClipId: newId };
};

export const updateMasterTimelineClipText = (
  timeline: MasterTimelineData,
  trackId: string,
  clipId: string,
  field: 'name' | 'content',
  value: string,
): TimelineResult => {
  if (!timeline || !Array.isArray(timeline.textTracks)) return fail('invalid-timeline');
  const normalized = value.trim();
  if (!normalized || normalized.length > (field === 'name' ? 180 : 1000)) return fail('invalid-content');
  const track = timeline.textTracks.find((item) => item.id === trackId);
  if (!track) return fail('track-not-found');
  if (!track.clips.some((item) => item.id === clipId)) return fail('clip-not-found');
  const nextTracks = timeline.textTracks.map((item) => item.id !== trackId ? item : {
    ...item, clips: item.clips.map((clip) => clip.id !== clipId ? clip : { ...clip, [field]: normalized }),
  });
  return { ok: true, value: { ...timeline, textTracks: nextTracks }, affectedClipId: clipId };
};
