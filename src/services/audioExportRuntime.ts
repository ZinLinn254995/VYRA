export type AudioExportTrackWindow = { startsAt: number; endsAt: number };
export type NarrationDuckingSchedule = { startsAt: number; attackEndsAt: number; holdStartsAt: number; releaseEndsAt: number; level: number };
export type SceneSoundEffectSchedule = { startsAt: number; endsAt: number; volume: number; fadeInSeconds: number; fadeOutSeconds: number; fadeOutStartsAt: number };
const clamp = (value: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
export function createAudioExportTrackWindow(startsAt: number, duration: number, loop: boolean): AudioExportTrackWindow {
  return { startsAt, endsAt: loop ? Number.POSITIVE_INFINITY : startsAt + duration };
}
export function createNarrationDuckingSchedule(narrationStartsAt: number, narrationDuration: number, trackWindow: AudioExportTrackWindow, duckingLevel: number): NarrationDuckingSchedule | null {
  const startsAt = Math.max(narrationStartsAt, trackWindow.startsAt);
  const endsAt = Math.min(narrationStartsAt + narrationDuration, trackWindow.endsAt);
  if (endsAt <= startsAt) return null;
  return { startsAt, attackEndsAt: startsAt + Math.min(0.12, (endsAt - startsAt) / 2), holdStartsAt: Math.max(startsAt, endsAt - 0.08), releaseEndsAt: endsAt + 0.18, level: clamp(duckingLevel, 0.1, 0.8, 0.25) };
}
export function createSceneSoundEffectSchedule(sceneStartsAt: number, sceneDuration: number, startOffsetSeconds: number, volumeValue: number, fadeInValue: number, fadeOutValue: number): SceneSoundEffectSchedule | null {
  const offset = clamp(startOffsetSeconds, 0, 86400, 0);
  if (offset >= sceneDuration) return null;
  const startsAt = sceneStartsAt + offset;
  const endsAt = sceneStartsAt + sceneDuration;
  const fadeOutSeconds = clamp(fadeOutValue, 0, 30, 0);
  return { startsAt, endsAt, volume: clamp(volumeValue, 0, 1, 1), fadeInSeconds: clamp(fadeInValue, 0, 30, 0), fadeOutSeconds, fadeOutStartsAt: Math.max(startsAt, endsAt - fadeOutSeconds) };
}
