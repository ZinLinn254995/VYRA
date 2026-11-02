import type { ProjectAudioTrack, Scene } from '../types';

export interface AudioExportValidationIssue {
  trackId: string;
  trackName: string;
  message: string;
}

/**
 * Validate saved project audio metadata before the browser starts decoding or
 * recording. This deliberately does not claim that local media bytes exist;
 * the export pipeline verifies those against IndexedDB immediately afterward.
 */
export function validateProjectAudioTracksForExport(
  tracks: ProjectAudioTrack[] = [],
  scenes: Scene[] = [],
): AudioExportValidationIssue[] {
  const issues: AudioExportValidationIssue[] = [];
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const seenIds = new Set<string>();

  for (const track of tracks) {
    if (!track.enabled) continue;
    const add = (message: string) => issues.push({
      trackId: track.id,
      trackName: track.name || 'Unnamed audio track',
      message,
    });

    if (!track.id || seenIds.has(track.id)) add('Track has a missing or duplicate identifier.');
    if (track.id) seenIds.add(track.id);
    if (!track.mediaId) add('Track has no linked audio file. Re-upload the audio.');
    if (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1) {
      add('Volume must be between 0 and 1.');
    }
    if (!Number.isFinite(track.startTimeSeconds) || track.startTimeSeconds < 0) {
      add('Start time must be zero or greater.');
    }
    if (!Number.isFinite(track.fadeInSeconds) || track.fadeInSeconds < 0
      || !Number.isFinite(track.fadeOutSeconds) || track.fadeOutSeconds < 0) {
      add('Fade durations must be valid non-negative numbers.');
    }
    if (track.sceneId) {
      if (track.kind !== 'sound_effect') add('Only sound effects can be assigned to one scene.');
      if (!sceneIds.has(track.sceneId)) add('The selected scene no longer exists. Choose another scene or make this track project-wide.');
    }
    if (track.duckingEnabled && track.kind !== 'music') {
      add('Narration ducking is available for music tracks only.');
    }
    if (track.duckingEnabled && (!Number.isFinite(track.duckingLevel)
      || (track.duckingLevel as number) < 0.1 || (track.duckingLevel as number) > 0.8)) {
      add('Narration ducking level must be between 0.1 and 0.8.');
    }
  }

  return issues;
}
