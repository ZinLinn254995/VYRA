/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../../context/StudioContext';
import { confirmSpendBeforeGeneration } from '../../services/spendConfirmation';
import { deleteSavedAudio, deleteSavedVideo, deleteVideoGenerationJob, getSavedAudio, getSavedVideo, getSavedImages, getVideoGenerationJobs, saveGeneratedAudio, saveGeneratedImage, saveGeneratedVideo, saveVideoGenerationJob, updateVideoGenerationJob } from '../../services/mediaLibraryStorage';
import { Scene, AspectRatio, ProductionStage } from '../../types';
import heroCyberCity from '../../assets/images/hero_cyber_city_1792925206979.jpg';
import sceneQuantumChip from '../../assets/images/scene_quantum_chip_1792925206672.jpg';
import sceneAvatarPresenter from '../../assets/images/scene_avatar_presenter_1792925207281.jpg';
import sceneEcoHabitat from '../../assets/images/scene_eco_habitat_1792925207788.jpg';
import {
  Play,
  Pause,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Clock,
  Film,
  Send,
  Download,
  RotateCcw,
  Volume2,
  Maximize2,
  Smartphone,
  Monitor,
  Square,
  FileText,
  Video,
} from 'lucide-react';

// Use the actual media MIME type for download extensions instead of assuming MP4/MP3.
type OpenRouterVideoModel = {
  id: string;
  supportedDurations?: number[];
  supportedResolutions?: string[];
  supportedAspectRatios?: string[];
  supportedFrameImages?: string[];
};
type OpenRouterAudioModel = { id: string; supportedVoiceIds?: string[] };

// Prevent duplicate recovery polling when the workspace is remounted in this tab.
const activeVideoRecoveryJobs = new Set<string>();

const getMediaFileExtension = (mimeType: string, kind: 'video' | 'audio'): string => {
  const mime = mimeType.split(';', 1)[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/ogg': 'ogv',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  return extensions[mime] || (kind === 'video' ? 'video' : 'audio');
};

// Split narration into readable captions for both SRT and burned-in exports.
// Intl.Segmenter supports languages such as Burmese that do not separate every word with spaces.
const splitCaptionText = (text: string, maxChars = 42): string[] => {
  const value = text.trim();
  if (!value) return [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string | string[], options?: { granularity: string }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  const tokens = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(value), (part) => part.segment)
    : value.split(/(\s+)/).filter(Boolean);
  const chunks: string[] = [];
  let line = '';
  const pushLongToken = (token: string) => {
    const GraphemeSegmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
    const graphemes = GraphemeSegmenter
      ? Array.from(GraphemeSegmenter.segment(token), (part) => part.segment)
      : Array.from(token);
    for (const grapheme of graphemes) {
      if (line.length + grapheme.length > maxChars && line.trim()) {
        chunks.push(line.trim());
        line = '';
      }
      line += grapheme;
    }
  };
  for (const token of tokens) {
    const candidate = line + token;
    if (candidate.trim().length <= maxChars) {
      line = candidate;
    } else if (line.trim()) {
      chunks.push(line.trim());
      line = '';
      if (token.trim().length > maxChars) pushLongToken(token.trim());
      else line = token.trimStart();
    } else if (token.trim().length > maxChars) {
      pushLongToken(token.trim());
    } else {
      line = token.trimStart();
    }
  }
  if (line.trim()) chunks.push(line.trim());
  return chunks;
};

// Wrap captions by rendered width, including scripts such as Burmese that may not use spaces.
const wrapCaptionLines = (context: CanvasRenderingContext2D, caption: string, maxWidth: number): string[] => {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string | string[], options?: { granularity: string }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  const tokens = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(caption), (part) => part.segment)
    : caption.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const graphemesFor = (value: string) => Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment)
    : Array.from(value);
  for (const token of tokens) {
    if (!token.trim() && !line) continue;
    const candidate = line + token;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line.trim()) {
      lines.push(line.trim());
      line = '';
    }
    const cleanToken = token.trimStart();
    if (context.measureText(cleanToken).width <= maxWidth) {
      line = cleanToken;
      continue;
    }
    for (const grapheme of graphemesFor(cleanToken)) {
      const next = line + grapheme;
      if (context.measureText(next).width > maxWidth && line.trim()) {
        lines.push(line.trim());
        line = '';
      }
      line += grapheme;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
};

export const ProjectWorkspaceView: React.FC = () => {
  const {
    activeProject,
    updateProject,
    addScene,
    updateScene,
    removeScene,
    reorderScenes,
    submitForReview,
    navigateToReviewQueue,
    showToast,
    projects,
    setActiveProjectId,
    setCurrentSection,
  } = useStudio();

  // If no active project, show selector
  const project = activeProject || projects[0];
  // Keep a live scene snapshot so async generation cannot attach media after its inputs change.
  const latestScenesRef = useRef(project?.scenes || []);
  latestScenesRef.current = project?.scenes || [];

  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    project?.scenes[0]?.id || ''
  );
  // Async generation handlers must read the latest selection after scene switches.
  const selectedSceneIdRef = useRef(selectedSceneId);
  selectedSceneIdRef.current = selectedSceneId;

  // Synchronize selected scene when project changes
  useEffect(() => {
    if (project && (!selectedSceneId || !project.scenes.some((s) => s.id === selectedSceneId))) {
      setSelectedSceneId(project.scenes[0]?.id || '');
    }
  }, [project, selectedSceneId]);

  // Video playback preview state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playProgress, setPlayProgress] = useState<number>(0); // 0 to 100
  const [previewAspectRatio, setPreviewAspectRatio] = useState<AspectRatio>(
    project?.aspectRatio || '16:9'
  );

  // Generated clips stay in memory until downloaded; large video files are not written into localStorage.
  const [isGeneratingClip, setIsGeneratingClip] = useState(false);
  const [recoveryCycle, setRecoveryCycle] = useState(0);
  const attemptedRecoveryJobsRef = useRef(new Set<string>());
  const [isGeneratingSceneImage, setIsGeneratingSceneImage] = useState(false);
  const [sceneImageUrl, setSceneImageUrl] = useState('');
  const [sceneImageError, setSceneImageError] = useState('');
  const [sceneImageCostUsd, setSceneImageCostUsd] = useState<number | null>(null);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [supportedVoiceIds, setSupportedVoiceIds] = useState<string[]>([]);
  const [videoModelMetadata, setVideoModelMetadata] = useState<OpenRouterVideoModel | null>(null);
  const [clipDuration, setClipDuration] = useState(4);
  const [clipAspectRatio, setClipAspectRatio] = useState<string>(project?.aspectRatio || '16:9');
  const [clipResolution, setClipResolution] = useState('');
  const [voiceoverStatus, setVoiceoverStatus] = useState('');
  const [voiceoverError, setVoiceoverError] = useState('');
  const [generatedVoiceoverUrl, setGeneratedVoiceoverUrl] = useState('');
  const [generatedVoiceoverMimeType, setGeneratedVoiceoverMimeType] = useState('');
  const [clipStatus, setClipStatus] = useState('');
  const [clipError, setClipError] = useState('');
  const [generatedClipUrl, setGeneratedClipUrl] = useState('');
  const [generatedClipMimeType, setGeneratedClipMimeType] = useState('');
  const [clipCostUsd, setClipCostUsd] = useState<number | null>(null);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [finalVideoPreviewUrl, setFinalVideoPreviewUrl] = useState('');
  const [exportProgress, setExportProgress] = useState('');
  const [burnInSubtitles, setBurnInSubtitles] = useState(true);

  useEffect(() => {
    return () => {
      if (generatedClipUrl) URL.revokeObjectURL(generatedClipUrl);
    };
  }, [generatedClipUrl]);

  useEffect(() => {
    return () => {
      if (generatedVoiceoverUrl) URL.revokeObjectURL(generatedVoiceoverUrl);
    };
  }, [generatedVoiceoverUrl]);

  useEffect(() => {
    return () => {
      if (finalVideoPreviewUrl) URL.revokeObjectURL(finalVideoPreviewUrl);
    };
  }, [finalVideoPreviewUrl]);

  useEffect(() => {
    let cancelled = false;
    setFinalVideoPreviewUrl('');
    if (!project?.finalVideoId) return () => { cancelled = true; };
    getSavedVideo(project.finalVideoId).then((saved) => {
      if (!cancelled && saved) setFinalVideoPreviewUrl(URL.createObjectURL(saved.blob));
    }).catch(() => {
      if (!cancelled) showToast('The saved final preview could not be restored from this device.', 'warning');
    });
    return () => { cancelled = true; };
  }, [project?.id, project?.finalVideoId]);



  useEffect(() => {
    try {
      const catalog = JSON.parse(sessionStorage.getItem('vyra_openrouter_catalog_v1') || '{}') as { video?: OpenRouterVideoModel[]; audio?: OpenRouterAudioModel[] };
      const selections = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as { video?: string; audio?: string };
      const selected = catalog.video?.find((model) => model.id === selections.video) || null;
      setVideoModelMetadata(selected);
      const selectedAudio = catalog.audio?.find((model) => model.id === selections.audio);
      const voices = selectedAudio?.supportedVoiceIds?.filter((voice) => typeof voice === 'string' && voice.trim()) || [];
      setSupportedVoiceIds(voices);
      setVoiceName((current) => voices.includes(current) ? current : voices[0] || '');
      const durations = selected?.supportedDurations?.filter((value) => Number.isInteger(value) && value > 0) || [];
      setClipDuration(durations.includes(4) ? 4 : durations[0] || 4);
      const ratios = selected?.supportedAspectRatios || [];
      setClipAspectRatio(ratios.includes(project?.aspectRatio || '16:9') ? (project?.aspectRatio || '16:9') : ratios[0] || project?.aspectRatio || '16:9');
      setClipResolution(selected?.supportedResolutions?.[0] || '');
    } catch {
      setVideoModelMetadata(null);
      setSupportedVoiceIds([]);
      setClipDuration(4);
      setClipAspectRatio(project?.aspectRatio || '16:9');
      setClipResolution('');
    }
  }, [project?.id, project?.aspectRatio]);

  const currentScene = project?.scenes.find((s) => s.id === selectedSceneId) || project?.scenes[0];

  useEffect(() => {
    let cancelled = false;
    setSceneImageUrl('');
    setSceneImageError('');
    setSceneImageCostUsd(null);
    if (!currentScene?.generatedImageId) return () => { cancelled = true; };
    getSavedImages().then((images) => {
      if (cancelled) return;
      const saved = images.find((image) => image.id === currentScene.generatedImageId);
      if (saved) {
        setSceneImageUrl(saved.dataUrl);
        setSceneImageCostUsd(saved.costUsd);
      } else {
        setSceneImageError('This scene image could not be found in this device’s media storage. Generate it again if needed.');
      }
    }).catch((error) => {
      if (!cancelled) setSceneImageError(error instanceof Error ? error.message : 'Could not restore this scene image.');
    });
    return () => { cancelled = true; };
  }, [project?.id, currentScene?.id, currentScene?.generatedImageId]);

  const currentSceneIndex = project?.scenes.findIndex((s) => s.id === selectedSceneId) ?? 0;
  // Restore this scene's generated clip from IndexedDB when returning to the workspace.
  useEffect(() => {
    let cancelled = false;
    const videoId = currentScene?.generatedVideoId;
    // Clear the previous scene's preview immediately so a missing record cannot leave stale media visible.
    setGeneratedClipUrl('');
    setGeneratedClipMimeType('');
    setClipError('');
    setClipStatus('');
    setClipCostUsd(null);
    if (!videoId) {
      return () => { cancelled = true; };
    }
    getSavedVideo(videoId)
      .then((saved) => {
        if (!cancelled && saved) {
          setGeneratedClipMimeType(saved.blob.type || '');
          setGeneratedClipUrl(URL.createObjectURL(saved.blob));
        }
      })
      .catch(() => {
        if (!cancelled) setClipError('This scene’s saved clip could not be loaded from this device.');
      });
    return () => { cancelled = true; };
  }, [currentScene?.id, currentScene?.generatedVideoId]);

  // Restore this scene's saved voiceover from IndexedDB when returning to the workspace.
  useEffect(() => {
    let cancelled = false;
    const audioId = currentScene?.generatedAudioId;
    // Clear the previous scene's preview immediately so a missing record cannot leave stale audio visible.
    setGeneratedVoiceoverUrl('');
    setGeneratedVoiceoverMimeType('');
    setVoiceoverError('');
    setVoiceoverStatus('');
    if (!audioId) {
      return () => { cancelled = true; };
    }
    getSavedAudio(audioId)
      .then((saved) => {
        if (!cancelled && saved) {
          setGeneratedVoiceoverMimeType(saved.blob.type || '');
          setGeneratedVoiceoverUrl(URL.createObjectURL(saved.blob));
          setVoiceoverStatus('Voiceover restored from this device.');
          setVoiceName(saved.voice || '');
        }
      })
      .catch(() => {
        if (!cancelled) setVoiceoverError('This scene’s saved voiceover could not be loaded from this device.');
      });
    return () => { cancelled = true; };
  }, [currentScene?.id, currentScene?.generatedAudioId]);

  // Recover any provider job saved before a refresh or browser close.
  // The API key remains session-only and is never written to IndexedDB.
  useEffect(() => {
    if (!project) return;
    let jobs: Awaited<ReturnType<typeof getVideoGenerationJobs>> = [];
    let recoveryJob: typeof jobs[number] | undefined;
    let apiKey = '';
    try {
      apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
    } catch { /* Storage may be unavailable in a restricted browser. */ }

    getVideoGenerationJobs(project.id).then(async (savedJobs) => {
      jobs = savedJobs;
      const recoverableJobs = jobs.filter((job) =>
        ['pending', 'in_progress', 'completed', 'needs_attention'].includes(job.status)
      );
      recoveryJob = recoverableJobs.filter((job) => !attemptedRecoveryJobsRef.current.has(job.jobId)).find((job) => {
        const scene = latestScenesRef.current.find((item) => item.id === job.sceneId);
        return Boolean(scene && scene.visualPrompt === job.visualPrompt && scene.cameraMovement === job.cameraMovement && scene.narration === job.narration && (scene.dialogue || '') === (job.dialogue || ''));
      }) || recoverableJobs.find((job) => !attemptedRecoveryJobsRef.current.has(job.jobId));
      if (!recoveryJob) return;
      attemptedRecoveryJobsRef.current.add(recoveryJob.jobId);
      const targetScene = latestScenesRef.current.find((scene) => scene.id === recoveryJob?.sceneId);
      if (!targetScene) {
        setClipStatus('A saved video job belongs to a scene that no longer exists. Its Job ID remains saved for review.');
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      if (recoveryJob.savedVideoId && targetScene.generatedVideoId === recoveryJob.savedVideoId) {
        await deleteVideoGenerationJob(recoveryJob.jobId).catch(() => undefined);
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      if (recoveryJob.savedVideoId) {
        const alreadySaved = await getSavedVideo(recoveryJob.savedVideoId).catch(() => undefined);
        if (alreadySaved) {
          if (targetScene.generatedVideoId && targetScene.generatedVideoId !== recoveryJob.previousVideoId) {
            await updateVideoGenerationJob(recoveryJob.jobId, { status: 'needs_attention', lastError: 'The scene now points to a different clip; the recovered media was not attached.' });
            setClipStatus('A saved video result is ready, but this scene has since been linked to another clip. Review the job before replacing it.');
            setRecoveryCycle((cycle) => cycle + 1);
            return;
          }
          updateScene(recoveryJob.projectId, recoveryJob.sceneId, { generatedVideoId: alreadySaved.id, status: 'ready' });
          if (selectedSceneIdRef.current === recoveryJob.sceneId) {
            setGeneratedClipMimeType(alreadySaved.blob.type || '');
            setGeneratedClipUrl(URL.createObjectURL(alreadySaved.blob));
            setClipStatus('Recovered the saved video file and restored its scene link.');
          }
          showToast('Saved video clip link recovered', 'success');
          setRecoveryCycle((cycle) => cycle + 1);
          return;
        }
      }
      if (targetScene.generatedVideoId && targetScene.generatedVideoId !== recoveryJob.previousVideoId) {
        await updateVideoGenerationJob(recoveryJob.jobId, { status: 'needs_attention', lastError: 'The scene now points to a different clip; the job was not allowed to overwrite it.' });
        setClipStatus('A saved video job exists, but this scene now contains a different clip. Review the previous job before generating another.');
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      if (!apiKey) {
        setClipStatus('A saved video job (' + recoveryJob.jobId + ') is waiting. Reconnect OpenRouter in Settings to resume it; do not start another generation.');
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      const job = recoveryJob;
      if (targetScene.visualPrompt !== job.visualPrompt || targetScene.cameraMovement !== job.cameraMovement || targetScene.narration !== job.narration || (targetScene.dialogue || '') !== (job.dialogue || '')) {
        setClipStatus('A saved video job exists, but this scene has changed since it was submitted. Review the previous job before generating a replacement.');
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      if (activeVideoRecoveryJobs.has(job.jobId)) {
        setRecoveryCycle((cycle) => cycle + 1);
        return;
      }
      activeVideoRecoveryJobs.add(job.jobId);
      setIsGeneratingClip(true);
      setClipError('');
      setClipStatus(job.status === 'completed' ? 'Video job completed earlier. Downloading the saved result…' : 'Resuming saved video job…');

      const resume = async () => {
        try {
          let completed = job.status === 'completed';
          let costUsd = job.costUsd ?? null;
          let generationId = job.generationId ?? undefined;
          let nextDelayMs = 30_000;
          for (let attempt = 0; !completed && attempt < 40; attempt += 1) {
            if (attempt > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, nextDelayMs));
            nextDelayMs = 30_000;
            let response: Response;
            try {
              response = await fetch('/api/providers/openrouter/videos/' + encodeURIComponent(job.jobId), {
                headers: { 'x-openrouter-api-key': apiKey },
              });
            } catch {
              if (attempt === 39) throw new Error('Could not reconnect to the video status service. The saved job is still available to resume.');
              continue;
            }
            const status = await response.json().catch(() => ({})) as { status?: string; error?: string; costUsd?: number | null; generationId?: string | null };
            if (!response.ok) {
              if (response.status === 404) {
                await updateVideoGenerationJob(job.jobId, { status: 'expired', lastError: status.error || 'The provider no longer has this job.' });
                throw new Error(status.error || 'The saved video job was not found or has expired. Check OpenRouter activity before generating again.');
              }
              if ((response.status === 429 || response.status >= 500) && attempt < 39) {
                const retryAfter = response.headers.get('retry-after');
                const seconds = retryAfter ? Number(retryAfter) : NaN;
                const date = retryAfter ? Date.parse(retryAfter) : NaN;
                const requested = Number.isFinite(seconds) ? seconds * 1000
                  : Number.isFinite(date) ? date - Date.now()
                    : Math.min(60_000, 15_000 * (2 ** Math.min(attempt, 2)));
                nextDelayMs = Math.min(120_000, Math.max(1_000, requested));
                setClipStatus('Temporary status-service issue. Resuming the same job in ' + Math.ceil(nextDelayMs / 1000) + 's…');
                continue;
              }
              throw new Error(status.error || 'Could not check the saved video job.');
            }
            if (typeof status.generationId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(status.generationId)) generationId = status.generationId;
            if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'expired') {
              await updateVideoGenerationJob(job.jobId, { status: status.status, lastError: status.error || 'The provider job ' + status.status + '.' });
              throw new Error(status.error || 'The saved video job ' + status.status + '.');
            }
            if (status.status === 'completed') {
              completed = true;
              costUsd = typeof status.costUsd === 'number' && Number.isFinite(status.costUsd) && status.costUsd >= 0 ? status.costUsd : costUsd;
              await updateVideoGenerationJob(job.jobId, { status: 'completed', costUsd, generationId });
              break;
            }
            await updateVideoGenerationJob(job.jobId, { status: status.status === 'pending' ? 'pending' : 'in_progress', ...(generationId ? { generationId } : {}), lastError: undefined });
            setClipStatus('Resuming saved video job… status check ' + (attempt + 1) + ' of 40');
          }
          if (!completed) {
            await updateVideoGenerationJob(job.jobId, { status: 'needs_attention', lastError: 'The job is still processing after repeated status checks.' });
            throw new Error('The saved video job is taking longer than expected. It remains saved; resume it later instead of submitting another job.');
          }

          setClipStatus('Video generated. Downloading clip…');
          const contentResponse = await fetch('/api/providers/openrouter/videos/' + encodeURIComponent(job.jobId) + '/content', {
            headers: { 'x-openrouter-api-key': apiKey },
          });
          if (!contentResponse.ok) {
            const data = await contentResponse.json().catch(() => ({})) as { error?: string };
            await updateVideoGenerationJob(job.jobId, { status: 'completed', costUsd, lastError: data.error || 'The completed video could not be downloaded.' });
            throw new Error(data.error || 'The video is complete, but its file could not be downloaded. Retry recovery later.');
          }
          const blob = await contentResponse.blob();
          if (!blob.size || !blob.type.startsWith('video/')) {
            await updateVideoGenerationJob(job.jobId, { status: 'completed', costUsd, lastError: 'The provider returned an invalid video file.' });
            throw new Error('The provider returned an invalid or empty video file. The completed job remains saved.');
          }
          const latestScene = latestScenesRef.current.find((scene) => scene.id === job.sceneId);
          if (!latestScene || latestScene.visualPrompt !== job.visualPrompt || latestScene.cameraMovement !== job.cameraMovement || latestScene.narration !== job.narration) {
            await updateVideoGenerationJob(job.jobId, { status: 'needs_attention', costUsd, lastError: 'The scene changed after this job was submitted; its result was not attached.' });
            throw new Error('The saved result was not attached because this scene changed after generation started.');
          }
          const saved = await saveGeneratedVideo({
            title: job.projectTitle + ' — Scene ' + job.sceneOrder,
            blob,
            model: job.model,
            costUsd,
            generationId,
            projectId: job.projectId,
            sceneId: job.sceneId,
          });
          await updateVideoGenerationJob(job.jobId, { savedVideoId: saved.id, status: 'completed', costUsd, lastError: undefined });
          updateScene(job.projectId, job.sceneId, { generatedVideoId: saved.id, status: 'ready' });
          if (selectedSceneIdRef.current === job.sceneId) {
            setGeneratedClipMimeType(blob.type || '');
            setGeneratedClipUrl(URL.createObjectURL(blob));
            setClipCostUsd(costUsd);
            setClipStatus('Recovered video clip and saved it to this device.');
          }
          showToast('Previous video generation recovered successfully', 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not resume the saved video job.';
          if (selectedSceneIdRef.current === job.sceneId) {
            setClipError(message);
            setClipStatus('');
          }
          await updateVideoGenerationJob(job.jobId, { lastError: message }).catch(() => undefined);
        } finally {
          activeVideoRecoveryJobs.delete(job.jobId);
          setIsGeneratingClip(false);
          setRecoveryCycle((cycle) => cycle + 1);
        }
      };
      void resume();
    }).catch((error) => {
      setClipError(error instanceof Error ? error.message : 'Could not inspect saved video jobs.');
    });
  }, [project?.id, recoveryCycle]);

  // Compute total duration and words
  const totalDuration = project?.scenes.reduce((acc, sc) => acc + sc.duration, 0) || 0;
  const totalWords = project?.scenes.reduce((acc, sc) => {
    return acc + (sc.narration ? sc.narration.trim().split(/\s+/).length : 0);
  }, 0) || 0;
  const estimatedReadingTime = Math.round((totalWords / 150) * 60); // 150 wpm

  const productionStages: { id: ProductionStage; label: string }[] = [
    { id: 'idea', label: 'Idea' },
    { id: 'script_review', label: 'Script' },
    { id: 'visual_review', label: 'Visuals' },
    { id: 'voice_review', label: 'Voice' },
    { id: 'sample_review', label: 'Sample' },
    { id: 'full_production', label: 'Full video' },
    { id: 'final_review', label: 'Final preview' },
    { id: 'publish_ready', label: 'Publish' },
  ];
  const isLegacyWorkflow = !project?.productionStage;
  const activeProductionStage = project?.productionStage || 'idea';
  const activeProductionIndex = productionStages.findIndex((stage) => stage.id === activeProductionStage);
  const imageGenerationUnlocked = !project?.productionStage || project.productionStage === 'visual_review';
  const voiceGenerationUnlocked = !project?.productionStage || project.productionStage === 'voice_review';
  const videoGenerationUnlocked = !project?.productionStage || ['sample_review', 'full_production'].includes(project.productionStage);


  // Playback timer simulation
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlayProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 2;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleNextScene = () => {
    if (!project) return;
    const nextIdx = (currentSceneIndex + 1) % project.scenes.length;
    setSelectedSceneId(project.scenes[nextIdx].id);
    setPlayProgress(0);
  };

  const handlePrevScene = () => {
    if (!project) return;
    const prevIdx = (currentSceneIndex - 1 + project.scenes.length) % project.scenes.length;
    setSelectedSceneId(project.scenes[prevIdx].id);
    setPlayProgress(0);
  };

  const handleGenerateClip = async () => {
    if (!project || !currentScene || isGeneratingClip) return;
    if (!videoGenerationUnlocked) { setClipError('Approve the voice samples first to unlock sample animation.'); return; }
    const existingJobs = await getVideoGenerationJobs(project.id).catch(() => []);
    for (const previousJob of existingJobs) {
      if (previousJob.sceneId === currentScene.id && previousJob.savedVideoId && previousJob.savedVideoId === currentScene.generatedVideoId) {
        await deleteVideoGenerationJob(previousJob.jobId).catch(() => undefined);
      }
    }
    const existingJob = existingJobs.find((job) => job.sceneId === currentScene.id && ['pending', 'in_progress', 'completed', 'needs_attention'].includes(job.status) && job.savedVideoId !== currentScene.generatedVideoId && job.visualPrompt === currentScene.visualPrompt && job.cameraMovement === currentScene.cameraMovement && job.narration === currentScene.narration);
    if (existingJob) {
      setClipStatus('An existing video job (' + existingJob.jobId + ') is already saved. Resume or check that job before starting another generation.');
      return;
    }
    const targetScene = currentScene;
    setClipError('');
    setClipStatus('');
    setClipCostUsd(null);
    setGeneratedClipUrl('');
    setGeneratedClipMimeType('');
    setIsGeneratingClip(true);
    let activeVideoJobId: string | null = null;
    let activeVideoJobStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'needs_attention' = 'pending';
    try {
      let apiKey = '';
      let selectedModels: Partial<Record<'text' | 'image' | 'video' | 'audio', string>> = {};
      try {
        apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
        selectedModels = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as typeof selectedModels;
      } catch { /* Show setup guidance below if session storage is unavailable. */ }
      const model = selectedModels.video;
      if (!apiKey || !model) throw new Error('Connect OpenRouter and select a Video model in Settings before generating a clip.');
      let videoReferencePayload: Record<string, unknown> = {};
      if (targetScene.generatedImageId) {
        const savedImages = await getSavedImages();
        const referenceImage = savedImages.find((image) => image.id === targetScene.generatedImageId);
        if (!referenceImage) throw new Error('The approved scene image is missing from this device. Regenerate the scene image before creating its video clip.');
        const imageReference = { type: 'image_url', image_url: { url: referenceImage.dataUrl } };
        videoReferencePayload = videoModelMetadata?.supportedFrameImages?.includes('first_frame')
          ? { frame_images: [{ ...imageReference, frame_type: 'first_frame' }] }
          : { input_references: [imageReference] };
      }
      const prompt = [
        'Generate a ' + (project.videoType || 'video') + ' clip lasting ' + clipDuration + ' seconds for one scene in a larger production.',
        project.creativeDirection ? 'Creative direction: ' + project.creativeDirection : '',
        project.visualStyleDescription ? 'Specific visual treatment: ' + project.visualStyleDescription : '',
        project.audioDirection ? 'Audio and soundtrack direction: ' + project.audioDirection : '',
        'Visual direction: ' + targetScene.visualPrompt,
        'Camera movement: ' + targetScene.cameraMovement,
        'Narrative context: ' + (targetScene.dialogue || targetScene.narration || 'No spoken narration; rely on the visual action and requested sound design.'),
        targetScene.shotType ? 'Shot type: ' + targetScene.shotType : '',
        targetScene.onScreenText ? 'Required on-screen text: ' + targetScene.onScreenText : '',
        targetScene.soundDesign ? 'Scene sound design: ' + targetScene.soundDesign : '',
        targetScene.transition ? 'Transition to next scene: ' + targetScene.transition : '',
        'Overall visual style: ' + project.visualStyle,
        Object.keys(videoReferencePayload).length ? 'Use the supplied scene reference image to preserve the character design, clothing, colors, and composition. Animate that scene naturally.' : 'Create the scene directly from its visual direction using text-to-video generation.',
        'Aspect ratio: ' + clipAspectRatio,
        'Keep motion coherent and visually polished. Do not add unrequested captions, subtitles, watermarks, or UI text.',
      ].join('\n');
      if (!(await confirmSpendBeforeGeneration({
        operation: 'Generate scene video clip',
        capability: 'video',
        model,
        apiKey,
        parameters: { durationSeconds: clipDuration, resolution: clipResolution || undefined },
      }))) {
        setIsGeneratingClip(false);
        setClipStatus('Generation cancelled. No video request was sent.');
        return;
      }
      if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Submitting video generation job…');
      const response = await fetch('/api/providers/openrouter/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, prompt, aspect_ratio: clipAspectRatio, duration: clipDuration, ...(clipResolution ? { resolution: clipResolution } : {}), ...videoReferencePayload }),
      });
      const submitted = await response.json().catch(() => ({})) as { jobId?: string; generationId?: string | null; error?: string };
      if (!response.ok || !submitted.jobId) throw new Error(submitted.error || 'Could not start video generation. Check the selected Video model and retry.');
      activeVideoJobId = submitted.jobId;
      const savedJob = {
        jobId: submitted.jobId,
        projectId: project.id,
        projectTitle: project.title,
        sceneId: targetScene.id,
        sceneOrder: targetScene.order,
        model,
        prompt,
        visualPrompt: targetScene.visualPrompt,
        cameraMovement: targetScene.cameraMovement,
        narration: targetScene.narration,
        dialogue: targetScene.dialogue || '',
        duration: clipDuration,
        aspectRatio: clipAspectRatio,
        ...(clipResolution ? { resolution: clipResolution } : {}),
        ...(targetScene.generatedVideoId ? { previousVideoId: targetScene.generatedVideoId } : {}),
        ...(typeof submitted.generationId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(submitted.generationId) ? { generationId: submitted.generationId } : {}),
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      try {
        await saveVideoGenerationJob(savedJob);
      } catch {
        if (selectedSceneIdRef.current === targetScene.id) setClipError('The provider accepted this video job, but VYRA could not persist its Job ID. Keep this workspace open and do not submit another generation.');
      }
      let completed = false;
      let generatedCostUsd: number | null = null;
      let generatedGenerationId = typeof submitted.generationId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(submitted.generationId) ? submitted.generationId : undefined;
      let nextPollDelayMs = 30_000;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (attempt > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, nextPollDelayMs));
        }
        nextPollDelayMs = 30_000;
        if (selectedSceneIdRef.current === targetScene.id) {
          setClipStatus(attempt === 0 ? 'Checking video job status…' : 'Generating video… status check ' + (attempt + 1) + ' of 40');
        }

        let statusResponse: Response;
        try {
          statusResponse = await fetch('/api/providers/openrouter/videos/' + encodeURIComponent(submitted.jobId!), {
            headers: { 'x-openrouter-api-key': apiKey },
          });
        } catch {
          // A temporary network interruption should not abandon a paid provider job.
          if (attempt === 39) throw new Error('Could not reach the video status service after repeated retries. Check your connection before retrying generation.');
          if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Connection interrupted. Retrying the existing video job…');
          continue;
        }

        const status = await statusResponse.json().catch(() => ({})) as { status?: string; error?: string; costUsd?: number | null; generationId?: string | null };
        if (!statusResponse.ok) {
          // An expired/missing job is terminal. Never keep polling it as though
          // the provider were temporarily unavailable.
          if (statusResponse.status === 404) {
            activeVideoJobStatus = 'expired';
            await updateVideoGenerationJob(submitted.jobId, { status: 'expired', lastError: status.error || 'The provider no longer has this job.' }).catch(() => undefined);
            throw new Error(status.error || 'This video job was not found or has expired. Check your OpenRouter activity before starting another generation.');
          }
          // Retry rate limits and transient server errors against the SAME job ID.
          // Honor Retry-After where available, otherwise use capped backoff.
          if ((statusResponse.status === 429 || statusResponse.status >= 500) && attempt < 39) {
            const retryAfter = statusResponse.headers.get('retry-after');
            const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
            const retryAfterDate = retryAfter ? Date.parse(retryAfter) : NaN;
            const requestedDelay = Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds * 1000
              : Number.isFinite(retryAfterDate)
                ? retryAfterDate - Date.now()
                : Math.min(60_000, 15_000 * (2 ** Math.min(attempt, 2)));
            nextPollDelayMs = Math.min(120_000, Math.max(1_000, requestedDelay));
            if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Temporary status-service issue. Retrying the existing video job in ' + Math.ceil(nextPollDelayMs / 1000) + 's…');
            continue;
          }
          throw new Error(status.error || 'Could not check video generation status.');
        }
        if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'expired') {
          activeVideoJobStatus = status.status;
          await updateVideoGenerationJob(submitted.jobId, { status: status.status, lastError: status.error || 'The provider job ' + status.status + '.' }).catch(() => undefined);
          throw new Error(status.error || 'The video generation job ' + status.status + '. You can retry with another model.');
        }
        if (typeof status.generationId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(status.generationId)) generatedGenerationId = status.generationId;
        activeVideoJobStatus = status.status === 'pending' ? 'pending' : 'in_progress';
        await updateVideoGenerationJob(submitted.jobId, { status: activeVideoJobStatus, ...(generatedGenerationId ? { generationId: generatedGenerationId } : {}), lastError: undefined }).catch(() => undefined);
        if (status.status === 'completed') {
          completed = true;
          if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Video generated. Downloading clip…');
          generatedCostUsd = typeof status.costUsd === 'number' && Number.isFinite(status.costUsd) && status.costUsd >= 0 ? status.costUsd : null;
          activeVideoJobStatus = 'completed';
          await updateVideoGenerationJob(submitted.jobId, { status: 'completed', costUsd: generatedCostUsd, ...(generatedGenerationId ? { generationId: generatedGenerationId } : {}), lastError: undefined }).catch(() => undefined);
          if (selectedSceneIdRef.current === targetScene.id) setClipCostUsd(generatedCostUsd);
          break;
        }
      }
      if (!completed) throw new Error('Video generation is taking longer than expected. Retry later; check your OpenRouter account before submitting another job.');
      const contentResponse = await fetch('/api/providers/openrouter/videos/' + encodeURIComponent(submitted.jobId) + '/content', { headers: { 'x-openrouter-api-key': apiKey } });
      if (!contentResponse.ok) {
        const data = await contentResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'The video was generated but could not be downloaded. Please retry the download.');
      }
      const blob = await contentResponse.blob();
      if (!blob.size || !blob.type.startsWith('video/')) throw new Error('The video provider returned an invalid or empty video file.');
      const latestScene = latestScenesRef.current.find((scene) => scene.id === targetScene.id);
      if (!latestScene || latestScene.visualPrompt !== targetScene.visualPrompt || latestScene.cameraMovement !== targetScene.cameraMovement || latestScene.narration !== targetScene.narration || (latestScene.dialogue || '') !== (targetScene.dialogue || '')) {
        await updateVideoGenerationJob(submitted.jobId, { status: 'needs_attention', costUsd: generatedCostUsd, lastError: 'The scene changed after this job was submitted; its result was not attached.' }).catch(() => undefined);
        if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Discarded this result because the scene script or visual direction changed during generation. Generate a fresh clip for the updated scene.');
        return;
      }
      let savedVideoId: string | undefined;
      try {
        const saved = await saveGeneratedVideo({
          title: project.title + ' — Scene ' + targetScene.order,
          blob,
          model,
          costUsd: generatedCostUsd,
          generationId: generatedGenerationId,
          projectId: project.id,
          sceneId: targetScene.id,
        });
        savedVideoId = saved.id;
        // IndexedDB writes are asynchronous too; re-check inputs immediately before linking.
        const sceneBeforeLink = latestScenesRef.current.find((scene) => scene.id === targetScene.id);
        if (!sceneBeforeLink || sceneBeforeLink.visualPrompt !== targetScene.visualPrompt || sceneBeforeLink.cameraMovement !== targetScene.cameraMovement || sceneBeforeLink.narration !== targetScene.narration || (sceneBeforeLink.dialogue || '') !== (targetScene.dialogue || '')) {
          savedVideoId = undefined;
          // The media was persisted while the scene changed; remove the unlinked blob
          // so stale generations do not silently accumulate in the local Media Library.
          await deleteSavedVideo(saved.id).catch(() => undefined);
          if (selectedSceneIdRef.current === targetScene.id) setClipStatus('Discarded this result because the scene changed while saving. Generate a fresh clip for the updated scene.');
          return;
        }
        await updateVideoGenerationJob(submitted.jobId, { savedVideoId: saved.id, status: 'completed', costUsd: generatedCostUsd, ...(generatedGenerationId ? { generationId: generatedGenerationId } : {}), lastError: undefined }).catch(() => undefined);
        updateScene(project.id, targetScene.id, { generatedVideoId: saved.id, status: 'ready' });
      } catch {
        if (selectedSceneIdRef.current === targetScene.id) setClipError('Video generated, but could not save it to this device. Download it now before leaving this page.');
      }
      // The user may switch scenes while the provider job is running. The clip is
      // linked to targetScene above; only update the visible preview if that scene
      // is still selected, otherwise the scene-change effect will restore its media.
      if (selectedSceneIdRef.current === targetScene.id) {
        setGeneratedClipMimeType(blob.type || '');
        setGeneratedClipUrl(URL.createObjectURL(blob));
        setClipStatus(savedVideoId
          ? 'Clip saved to this device and linked to this scene. It will be available after refresh.'
          : 'Your ' + clipDuration + '-second clip is ready. Use Download Clip to save the video.');
      }
      showToast(savedVideoId ? 'AI video clip generated and saved' : 'AI video clip generated; local save failed', savedVideoId ? 'success' : 'warning');
    } catch (error) {
      if (activeVideoJobId) {
        const message = error instanceof Error ? error.message : 'Video generation failed. Please retry.';
        await updateVideoGenerationJob(activeVideoJobId, { status: activeVideoJobStatus === 'pending' || activeVideoJobStatus === 'in_progress' ? 'needs_attention' : activeVideoJobStatus, lastError: message }).catch(() => undefined);
      }
      if (selectedSceneIdRef.current === targetScene.id) {
        setClipError(error instanceof Error ? error.message : 'Video generation failed. Please retry.');
        setClipStatus('');
      }
    } finally {
      setIsGeneratingClip(false);
    }
  };

  const handleGenerateSceneImage = async () => {
    if (!project || !currentScene || isGeneratingSceneImage) return;
    if (!imageGenerationUnlocked) { setSceneImageError('Approve the script and dialogue first to unlock scene image generation.'); return; }
    let apiKey = '';
    let selectedModels: Partial<Record<'text' | 'image' | 'video' | 'audio', string>> = {};
    try {
      apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
      selectedModels = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as typeof selectedModels;
    } catch { /* Show setup guidance below. */ }
    const model = selectedModels.image;
    if (!apiKey || !model) {
      setSceneImageError('Connect OpenRouter and discover/select an Image model in Settings first.');
      return;
    }
    const targetScene = currentScene;
    const prompt = [
      targetScene.visualPrompt.trim(),
      'Visual style: ' + project.visualStyle.replace(/_/g, ' '),
      project.visualStyleDescription ? 'Specific visual treatment: ' + project.visualStyleDescription : '',
      project.creativeDirection ? 'Creative direction: ' + project.creativeDirection : '',
      project.videoType ? 'Video type: ' + project.videoType : '',
      'Scene ' + targetScene.order + ' from the video "' + project.title + '".',
      'Create a clean cinematic frame with no captions, no watermarks, and no written text.',
      'Keep the character design coherent with the project style and scene description.',
    ].join('\n');
    if (!(await confirmSpendBeforeGeneration({
      operation: 'Generate scene image',
      capability: 'image',
      model,
      apiKey,
      parameters: { imageCount: 1, inputImageCount: 0 },
    }))) {
      setSceneImageError('Generation cancelled. No image request was sent.');
      return;
    }
    setSceneImageError('');
    setSceneImageUrl('');
    setSceneImageCostUsd(null);
    setIsGeneratingSceneImage(true);
    try {
      const response = await fetch('/api/providers/openrouter/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, prompt, aspect_ratio: project.aspectRatio }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        imageDataUrl?: string;
        costUsd?: number | null;
        generationId?: string | null;
        model?: string;
      };
      if (!response.ok || typeof data.imageDataUrl !== 'string' || !data.imageDataUrl.startsWith('data:image/')) {
        throw new Error(data.error || 'The image model did not return a valid image. Check the selected model and retry.');
      }
      const saved = await saveGeneratedImage({
        title: project.title + ' — Scene ' + targetScene.order,
        dataUrl: data.imageDataUrl,
        model: typeof data.model === 'string' ? data.model : model,
        costUsd: typeof data.costUsd === 'number' && Number.isFinite(data.costUsd) && data.costUsd >= 0 ? data.costUsd : null,
        generationId: typeof data.generationId === 'string' ? data.generationId : undefined,
        projectId: project.id,
        sceneId: targetScene.id,
      });
      updateScene(project.id, targetScene.id, { generatedImageId: saved.id });
      if (selectedSceneIdRef.current === targetScene.id) {
        setSceneImageUrl(saved.dataUrl);
        setSceneImageCostUsd(saved.costUsd);
      }
      showToast('Scene image generated and saved on this device', 'success');
    } catch (error) {
      if (selectedSceneIdRef.current === targetScene.id) {
        setSceneImageError(error instanceof Error ? error.message : 'Scene image generation failed. Please retry.');
      }
    } finally {
      setIsGeneratingSceneImage(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!project || !currentScene || isGeneratingVoiceover) return;
    if (!voiceGenerationUnlocked) { setVoiceoverError('Approve the visual direction first to unlock voice generation.'); return; }
    const targetScene = currentScene;
    const narration = (targetScene.dialogue || targetScene.narration).trim();
    if (!narration) {
      setVoiceoverError('This scene has no dialogue or narration. Voice generation is optional for silent, music-only, and text-led videos.');
      return;
    }
    setVoiceoverError('');
    setVoiceoverStatus('Generating voiceover… this may take a little while.');
    setGeneratedVoiceoverUrl('');
    setGeneratedVoiceoverMimeType('');
    setIsGeneratingVoiceover(true);
    try {
      let apiKey = '';
      let selectedModels: Partial<Record<'text' | 'image' | 'video' | 'audio', string>> = {};
      try {
        apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
        selectedModels = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as typeof selectedModels;
      } catch { /* setup guidance below */ }
      const model = selectedModels.audio;
      if (!apiKey || !model) throw new Error('Connect OpenRouter and discover/select a Speech / Voiceover model in Settings first.');
      if (!(await confirmSpendBeforeGeneration({
        operation: 'Generate scene voiceover',
        capability: 'audio',
        model,
        apiKey,
        parameters: { inputCharacters: narration.length },
      }))) {
        setVoiceoverStatus('Generation cancelled. No audio request was sent.');
        setIsGeneratingVoiceover(false);
        return;
      }
      const response = await fetch('/api/providers/openrouter/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, input: narration, voice: voiceName.trim(), speed: 1 }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Voiceover generation failed. Check the selected model and voice.');
      }
      const generationHeader = response.headers.get('x-generation-id');
      const generationId = generationHeader && /^[a-zA-Z0-9_-]{1,200}$/.test(generationHeader) ? generationHeader : undefined;
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('The provider returned an invalid or empty audio file.');
      const latestScene = latestScenesRef.current.find((scene) => scene.id === targetScene.id);
      if (!latestScene || latestScene.narration.trim() !== narration) {
        if (selectedSceneIdRef.current === targetScene.id) setVoiceoverStatus('Discarded this result because the narration changed during generation. Generate voiceover again for the updated script.');
        return;
      }
      let saved: Awaited<ReturnType<typeof saveGeneratedAudio>>;
      try {
        saved = await saveGeneratedAudio({
          title: project.title + ' — Scene ' + targetScene.order + ' Voiceover',
          blob,
          model,
          voice: voiceName.trim(),
          generationId,
          projectId: project.id,
          sceneId: targetScene.id,
        });
      } catch {
        // Keep a successful provider result usable even when local IndexedDB storage fails.
        // The existing preview/download controls let the user save the audio manually.
        const latestAfterSaveFailure = latestScenesRef.current.find((scene) => scene.id === targetScene.id);
        if (!latestAfterSaveFailure || latestAfterSaveFailure.narration.trim() !== narration) {
          if (selectedSceneIdRef.current === targetScene.id) setVoiceoverStatus('Discarded this result because the narration changed while saving. Generate voiceover again for the updated script.');
          return;
        }
        if (selectedSceneIdRef.current === targetScene.id) {
          setGeneratedVoiceoverMimeType(blob.type || '');
          setGeneratedVoiceoverUrl(URL.createObjectURL(blob));
          setVoiceoverStatus('Voiceover generated, but could not be saved on this device. Download it now; it will not be available after refresh.');
          setVoiceoverError('Local storage failed. Download the generated voiceover before leaving this page.');
        }
        showToast('Voiceover generated but could not be saved locally', 'warning');
        return;
      }
      // IndexedDB writes are asynchronous too; re-check narration immediately before linking.
      const sceneBeforeLink = latestScenesRef.current.find((scene) => scene.id === targetScene.id);
      if (!sceneBeforeLink || sceneBeforeLink.narration.trim() !== narration) {
        // Do not leave an unlinked stale voiceover in local Media Library storage.
        await deleteSavedAudio(saved.id).catch(() => undefined);
        if (selectedSceneIdRef.current === targetScene.id) setVoiceoverStatus('Discarded this result because the narration changed while saving. Generate voiceover again for the updated script.');
        return;
      }
      updateScene(project.id, targetScene.id, { generatedAudioId: saved.id });
      // Avoid replacing another scene's currently visible voiceover preview.
      if (selectedSceneIdRef.current === targetScene.id) {
        setGeneratedVoiceoverMimeType(blob.type || '');
        setGeneratedVoiceoverUrl(URL.createObjectURL(blob));
        setVoiceoverStatus('Voiceover generated and saved on this device. It remains available after refresh.');
      }
      showToast('AI voiceover generated and saved', 'success');
    } catch (error) {
      if (selectedSceneIdRef.current === targetScene.id) {
        setVoiceoverError(error instanceof Error ? error.message : 'Voiceover generation failed. Please retry.');
        setVoiceoverStatus('');
      }
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const handleExportSubtitles = async () => {
    if (!project) return;
    const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
    const entries: Array<{ start: number; end: number; text: string }> = [];
    const readMediaDuration = (blob: Blob, kind: 'video' | 'audio'): Promise<number> => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const media = document.createElement(kind);
      media.preload = 'metadata';
      let timeoutId: number | undefined;
      let settled = false;
      const cleanup = () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        media.onloadedmetadata = null;
        media.onerror = null;
        URL.revokeObjectURL(url);
        media.removeAttribute('src');
        media.load();
      };
      const finish = (duration?: number, error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (duration !== undefined && Number.isFinite(duration) && duration > 0) resolve(duration);
        else reject(error || new Error('Invalid media duration'));
      };
      timeoutId = window.setTimeout(() => finish(undefined, new Error('Timed out while reading media duration')), 8000);
      media.onloadedmetadata = () => finish(media.duration);
      media.onerror = () => finish(undefined, new Error('Could not read media duration'));
      media.src = url;
      media.load();
    });
    let sceneStart = 0;

    for (const scene of scenes) {
      const narration = scene.narration.trim();
      let duration = Math.max(0.5, Number.isFinite(scene.duration) ? scene.duration : 0.5);
      // Match subtitle offsets to the actual export timeline where local clips exist.
      // Full-video export holds a scene until both its video and voiceover finish.
      try {
        const savedVideo = scene.generatedVideoId ? await getSavedVideo(scene.generatedVideoId) : undefined;
        const savedAudio = scene.generatedAudioId ? await getSavedAudio(scene.generatedAudioId) : undefined;
        if (savedVideo) {
          const videoDuration = await readMediaDuration(savedVideo.blob, 'video');
          let audioDuration = 0;
          if (savedAudio) {
            try { audioDuration = await readMediaDuration(savedAudio.blob, 'audio'); } catch { /* Keep video duration if audio metadata is unavailable. */ }
          }
          duration = Math.max(videoDuration, audioDuration, 0.5);
        }
      } catch {
        // If local media is unavailable, retain the storyboard's planned duration.
      }
      if (narration) {
        const chunks = splitCaptionText(narration);
        const weights = chunks.map((chunk) => Math.max(1, chunk.length));
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let elapsed = 0;
        chunks.forEach((text, index) => {
          const start = sceneStart + elapsed;
          elapsed += duration * (weights[index] / totalWeight);
          entries.push({ start, end: sceneStart + (index === chunks.length - 1 ? duration : elapsed), text });
        });
      }
      sceneStart += duration;
    }

    if (!entries.length) {
      showToast('Add narration to at least one scene before exporting subtitles', 'warning');
      return;
    }
    const formatTime = (seconds: number) => {
      const milliseconds = Math.max(0, Math.round(seconds * 1000));
      const hours = Math.floor(milliseconds / 3600000);
      const minutes = Math.floor((milliseconds % 3600000) / 60000);
      const secs = Math.floor((milliseconds % 60000) / 1000);
      const millis = milliseconds % 1000;
      return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':') + ',' + String(millis).padStart(3, '0');
    };
    const srt = entries.map((entry, index) =>
      (index + 1) + '\n' + formatTime(entry.start) + ' --> ' + formatTime(Math.max(entry.start + 0.25, entry.end)) + '\n' + entry.text + '\n'
    ).join('\n');
    const blob = new Blob([srt], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'vyra') + '-subtitles.srt';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('SRT subtitles exported using saved media durations where available', 'success');
  };

  const handleExportSpec = () => {
    if (!project) return;
    const spec = JSON.stringify(project, null, 2);
    const blob = new Blob([spec], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_storyboard_spec.json`;
    a.click();
    showToast('Storyboard specification exported to JSON', 'success');
  };

  const handleExportVideo = async () => {
    if (!project || isExportingVideo) return;
    const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
    if (scenes.length === 0) {
      setClipError('Add at least one storyboard scene before exporting the full video.');
      return;
    }
    const missing = scenes.filter((scene) => !scene.generatedVideoId);
    if (missing.length) {
      setClipError('Generate and save a video clip for every scene before exporting the full video. Missing clips: ' + missing.map((scene) => scene.order).join(', ') + '.');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      setClipError('This browser does not support in-browser video export. Try a recent desktop Chrome or Edge browser.');
      return;
    }

    setClipError('');
    setExportProgress('Loading saved scene clips…');
    setIsExportingVideo(true);
    const sourceUrls: string[] = [];
    let recorder: MediaRecorder | undefined;
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let audioDestination: MediaStreamAudioDestinationNode | undefined;
    try {
      const savedClips = await Promise.all(scenes.map(async (scene) => {
        const saved = await getSavedVideo(scene.generatedVideoId!);
        if (!saved) throw new Error('Scene ' + scene.order + ' clip is missing from this device. Generate it again before exporting.');
        const savedAudio = scene.generatedAudioId ? await getSavedAudio(scene.generatedAudioId) : undefined;
        if (scene.generatedAudioId && !savedAudio) {
          throw new Error('Scene ' + scene.order + ' references a voiceover that is missing from this device. Regenerate the voiceover or remove the missing voiceover link before exporting.');
        }
        return { scene, blob: saved.blob, audioBlob: savedAudio?.blob };
      }));

      const aspect = project.aspectRatio;
      const canvas = document.createElement('canvas');
      canvas.width = aspect === '9:16' ? 720 : aspect === '1:1' ? 720 : 1280;
      canvas.height = aspect === '9:16' ? 1280 : aspect === '1:1' ? 720 : 720;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not initialize the video export canvas.');
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      stream = canvas.captureStream(30);
      const audioClips = await Promise.all(savedClips.map(async (clip) => {
        if (!clip.audioBlob) return undefined;
        if (typeof window.AudioContext === 'undefined') throw new Error('This browser cannot mix voiceover audio into exported video. Try a recent desktop Chrome or Edge browser.');
        const context = audioContext || new AudioContext();
        audioContext = context;
        const bytes = await clip.audioBlob.arrayBuffer();
        try {
          return await context.decodeAudioData(bytes);
        } catch {
          throw new Error('Could not decode the saved voiceover for scene ' + clip.scene.order + '. Regenerate that voiceover and try again.');
        }
      }));
      if (audioContext && audioClips.some(Boolean)) {
        await audioContext.resume();
        audioDestination = audioContext.createMediaStreamDestination();
        audioDestination.stream.getAudioTracks().forEach((track) => stream!.addTrack(track));
      }

      // Some browsers report a MIME type as supported but still reject it in the
      // MediaRecorder constructor. Try each supported candidate instead of failing
      // the entire export when the preferred MP4 codec cannot actually be created.
      const mimeCandidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      let mimeType = '';
      let recorderInitError: unknown;
      for (const candidate of mimeCandidates) {
        if (!MediaRecorder.isTypeSupported(candidate)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: candidate, videoBitsPerSecond: 6_000_000 });
          mimeType = candidate;
          break;
        } catch (error) {
          recorderInitError = error;
        }
      }
      if (!recorder || !mimeType) {
        throw new Error(
          recorderInitError instanceof Error
            ? 'This browser rejected every supported export format. Try an updated Chrome or Edge browser. Details: ' + recorderInitError.message
            : 'This browser cannot encode an export format supported by VYRA. Try an updated Chrome or Edge browser.'
        );
      }
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const recordingFinished = new Promise<Blob>((resolve, reject) => {
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }));
        recorder!.onerror = () => reject(new Error('The browser stopped recording unexpectedly. Please try exporting again.'));
      });
      // Mark recorder failures as handled immediately. The original promise is
      // still awaited during finalization, but an early recorder error while a
      // scene is rendering must not surface as an unhandled rejection.
      void recordingFinished.catch(() => undefined);
      recorder.start(1000);

      for (let index = 0; index < savedClips.length; index += 1) {
        const { scene, blob } = savedClips[index];
        const audioBuffer = audioClips[index];
        setExportProgress('Rendering scene ' + (index + 1) + ' of ' + savedClips.length + '…');
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        const sourceUrl = URL.createObjectURL(blob);
        sourceUrls.push(sourceUrl);
        video.src = sourceUrl;
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Timed out while loading the saved clip for scene ' + scene.order + '. Try re-saving that clip and exporting again.'));
          }, 10000);
          const cleanup = () => {
            window.clearTimeout(timeoutId);
            video.onloadedmetadata = null;
            video.onerror = null;
          };
          video.onloadedmetadata = () => {
            cleanup();
            resolve();
          };
          video.onerror = () => {
            cleanup();
            reject(new Error('Could not decode the saved clip for scene ' + scene.order + '.'));
          };
          video.load();
        });
        if (!video.videoWidth || !video.videoHeight) throw new Error('Scene ' + scene.order + ' clip has invalid video dimensions.');
        const captionChunks = burnInSubtitles ? splitCaptionText(scene.narration, 42) : [];
        let audioStartTime: number | undefined;
        const drawFrame = () => {
          context.fillStyle = '#000';
          context.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

          if (captionChunks.length > 0) {
            const videoDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Math.max(1, scene.duration);
            const clipDuration = Math.max(videoDuration, audioBuffer?.duration || 0);
            const audioElapsed = audioContext && audioStartTime !== undefined ? Math.max(0, audioContext.currentTime - audioStartTime) : 0;
            const captionElapsed = Math.max(video.currentTime, audioElapsed);
            const captionIndex = Math.min(captionChunks.length - 1, Math.floor((captionElapsed / clipDuration) * captionChunks.length));
            const caption = captionChunks[captionIndex];
            const fontSize = Math.max(20, Math.round(canvas.width * 0.032));
            context.save();
            context.font = '600 ' + fontSize + 'px Arial, sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            const maxTextWidth = canvas.width * 0.88;
            const lines = wrapCaptionLines(context, caption, maxTextWidth);
            const lineHeight = fontSize * 1.3;
            const paddingX = fontSize * 0.55;
            const paddingY = fontSize * 0.35;
            const blockHeight = lines.length * lineHeight + paddingY * 2;
            const centerY = canvas.height * 0.84;
            const blockWidth = Math.min(maxTextWidth + paddingX * 2, canvas.width * 0.94);
            context.fillStyle = 'rgba(0, 0, 0, 0.72)';
            context.fillRect((canvas.width - blockWidth) / 2, centerY - blockHeight / 2, blockWidth, blockHeight);
            context.fillStyle = '#FFFFFF';
            lines.forEach((text, lineIndex) => {
              context.fillText(text, canvas.width / 2, centerY - ((lines.length - 1) * lineHeight) / 2 + lineIndex * lineHeight, maxTextWidth);
            });
            context.restore();
          }
        };
        drawFrame();
        const audioSource = audioBuffer && audioContext ? audioContext.createBufferSource() : undefined;
        let audioTimeout: number | undefined;
        const audioFinished = audioSource && audioBuffer
          ? new Promise<void>((resolve, reject) => {
              // Audio can outlive the video. Keep its own watchdog so a stalled
              // AudioBufferSourceNode cannot leave the whole export pending forever.
              audioTimeout = window.setTimeout(() => {
                try { audioSource.stop(); } catch { /* source may already have stopped */ }
                reject(new Error('Voiceover playback timed out while exporting scene ' + scene.order + '. Regenerate that voiceover and try again.'));
              }, Math.max(30000, (audioBuffer.duration + 15) * 1000));
              audioSource.onended = () => {
                if (audioTimeout !== undefined) window.clearTimeout(audioTimeout);
                resolve();
              };
            })
          : Promise.resolve();
        if (audioSource && audioBuffer) {
          audioSource.buffer = audioBuffer;
          if (!audioDestination) throw new Error('Could not initialize the voiceover audio track.');
          audioSource.connect(audioDestination);
        }
        let animationFrame = 0;
        const videoFinished = new Promise<void>((resolve, reject) => {
          // Avoid leaving export stuck forever if a saved clip stalls or the audio
          // track never completes. Allow the longer media duration plus a buffer.
          const mediaDuration = Math.max(
            Number.isFinite(video.duration) ? video.duration : 0,
            audioBuffer?.duration || 0,
          );
          const playbackTimeout = window.setTimeout(() => {
            window.cancelAnimationFrame(animationFrame);
            video.pause();
            reject(new Error('Playback timed out while exporting scene ' + scene.order + '. Check that clip and voiceover play correctly, then try exporting again.'));
          }, Math.max(30000, (mediaDuration + 15) * 1000));
          const finish = (error?: Error) => {
            window.clearTimeout(playbackTimeout);
            if (error) reject(error);
            else resolve();
          };
          const draw = () => {
            const videoIsPlaying = !video.ended && !video.paused;
            const audioIsPlaying = Boolean(
              audioSource && audioContext && audioStartTime !== undefined &&
              audioContext.currentTime - audioStartTime < (audioBuffer?.duration || 0)
            );
            if (videoIsPlaying || audioIsPlaying) {
              drawFrame();
              animationFrame = window.requestAnimationFrame(draw);
            }
          };
          video.onended = () => {
            drawFrame();
            finish();
          };
          video.onerror = () => {
            window.cancelAnimationFrame(animationFrame);
            finish(new Error('Playback failed while exporting scene ' + scene.order + '.'));
          };
          video.play().then(() => {
            // Start narration only after video playback is accepted by the browser,
            // reducing the startup offset between the scene and its voiceover.
            if (audioSource && audioBuffer && audioContext) {
              audioStartTime = audioContext.currentTime;
              audioSource.start();
            }
            draw();
          }).catch((error) => {
            window.cancelAnimationFrame(animationFrame);
            finish(new Error('The browser could not play scene ' + scene.order + ' for export: ' + (error instanceof Error ? error.message : 'playback blocked')));
          });
        });
        try {
          await Promise.all([videoFinished, audioFinished]);
          drawFrame();
        } finally {
          // A video error can finish Promise.all before narration ends. Always
          // clear its watchdog and release playback resources on both success and failure.
          if (audioTimeout !== undefined) window.clearTimeout(audioTimeout);
          window.cancelAnimationFrame(animationFrame);
          if (audioSource) {
            try { audioSource.stop(); } catch { /* source may already have stopped */ }
            try { audioSource.disconnect(); } catch { /* already disconnected */ }
          }
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
      }

      setExportProgress('Finalizing video file…');
      const output = await new Promise<Blob>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          if (recorder?.state === 'recording') recorder.stop();
          reject(new Error('Export took too long to finalize. Try fewer or shorter clips.'));
        }, 15000);
        recordingFinished.then((blob) => {
          window.clearTimeout(timeout);
          resolve(blob);
        }).catch((error) => {
          window.clearTimeout(timeout);
          reject(error);
        });
        if (recorder?.state === 'recording') recorder.stop();
      });
      if (!output.size) throw new Error('The browser created an empty export file. Please try again.');
      const outputUrl = URL.createObjectURL(output);
      setFinalVideoPreviewUrl(outputUrl);
      try {
        const savedFinal = await saveGeneratedVideo({
          title: project.title + ' — Final Video',
          blob: output,
          model: 'VYRA Browser Compositor',
          costUsd: null,
          projectId: project.id,
          sceneId: 'final',
        });
        updateProject(project.id, { finalVideoId: savedFinal.id, finalVideoExportedAt: new Date().toISOString() });
      } catch {
        showToast('Video downloaded, but the final preview could not be saved on this device.', 'warning');
      }
      const link = document.createElement('a');
      const baseName = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vyra-video';
      const extension = output.type.includes('mp4') ? 'mp4' : 'webm';
      link.href = outputUrl;
      link.download = baseName + '-final.' + extension;
      document.body.appendChild(link);
      link.click();
      link.remove();
      const voiceoverCount = audioClips.filter(Boolean).length;
      showToast(voiceoverCount ? 'Full video exported with voiceovers' : 'Full video exported without voiceovers', 'success');
      setExportProgress('Export complete. Downloaded ' + scenes.length + ' scenes as one ' + extension.toUpperCase() + ' video' + (extension === 'webm' ? ' (this browser does not support MP4 recording; try a browser with MP4/H.264 MediaRecorder support for MP4).' : '') + (voiceoverCount ? ' with voiceover audio for ' + voiceoverCount + ' of ' + scenes.length + ' scenes.' : '. Generate scene voiceovers to include narration audio next time.'));
    } catch (error) {
      if (recorder?.state === 'recording') recorder.stop();
      setClipError(error instanceof Error ? error.message : 'Video export failed. Please try again.');
      setExportProgress('');
    } finally {
      sourceUrls.forEach((url) => URL.revokeObjectURL(url));
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext) void audioContext.close().catch(() => undefined);
      setIsExportingVideo(false);
    }
  };


  if (!project) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Film className="w-8 h-8 mx-auto mb-2 text-[#55F4FF]" />
        <p>No project loaded. Please select a project from the catalog.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-4 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200">
        <div className="space-y-1 min-w-0 xl:flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 light:text-slate-500">
            <span>Project:</span>
            {/* Quick Project Switcher Dropdown */}
            <select
              value={project.id}
              onChange={(e) => setActiveProjectId(e.target.value)}
              className="bg-[#090B18] light:bg-slate-100 border border-[#2B3058] light:border-slate-300 rounded px-2 py-0.5 text-xs text-white light:text-slate-900 font-semibold focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status})
                </option>
              ))}
            </select>
            <span aria-hidden="true">·</span>
            <span className="capitalize text-slate-300 light:text-slate-700">
              {project.status.replace('_', ' ')}
            </span>
          </div>

          <input
            type="text"
            value={project.title}
            onChange={(e) => updateProject(project.id, { title: e.target.value })}
            className="text-base sm:text-lg font-bold text-white light:text-slate-900 bg-transparent border-b border-transparent hover:border-[#55F4FF] focus:border-[#55F4FF] focus:outline-none w-full max-w-xl transition-colors"
          />
        </div>

        {/* Storyboard Telemetry (Duration, word count, aspect ratio) */}
        <div className="flex flex-wrap items-center gap-3 min-w-0 xl:justify-end">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 px-3 py-1.5 rounded-lg bg-[#090B18] light:bg-slate-100 text-xs border border-[#2B3058] light:border-slate-200">
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-[#55F4FF]" />
              <strong className="font-mono tabular-nums text-white light:text-slate-900">
                {totalDuration}s
              </strong>
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="flex items-center gap-1 text-slate-400">
              <FileText className="w-3.5 h-3.5 text-[#8D7CFF]" />
              <span className="font-mono tabular-nums text-white light:text-slate-900">
                {totalWords} words (~{estimatedReadingTime}s pace)
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleExportVideo()}
            disabled={isExportingVideo || project.scenes.length === 0 || project.scenes.some((scene) => !scene.generatedVideoId)}
            title={project.scenes.some((scene) => !scene.generatedVideoId) ? 'Generate and save a clip for every scene to export the full video' : 'Export all scene clips as one video, including saved voiceovers where available'}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2B3058] light:border-slate-300 text-xs font-semibold text-[#55F4FF] light:text-indigo-600 hover:bg-[#1E2345] light:hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportingVideo ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Video className="w-3.5 h-3.5" />}
            <span>{isExportingVideo ? 'Exporting…' : 'Export Full Video'}</span>
          </button>
                    <label className="inline-flex items-center gap-2 px-2 py-2 text-xs text-slate-300 light:text-slate-700 cursor-pointer" title="Include narration captions directly in the exported video">
            <input type="checkbox" checked={burnInSubtitles} onChange={(event) => setBurnInSubtitles(event.target.checked)} className="accent-indigo-500" />
            Burn in subtitles
          </label>
          <button
            type="button"
            onClick={handleExportSubtitles}
            disabled={!project.scenes.some((scene) => scene.narration.trim())}
            title="Export editable SRT subtitles using saved clip and voiceover durations where available"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2B3058] light:border-slate-300 text-xs font-semibold text-slate-300 light:text-slate-700 hover:bg-[#1E2345] light:hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Subtitles (.srt)</span>
          </button>
          <button
            onClick={handleExportSpec}
            title="Export Storyboard Spec JSON"
            className="p-2 rounded-lg border border-[#2B3058] light:border-slate-300 text-slate-400 hover:text-white light:hover:text-slate-900 hover:bg-[#1E2345] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              submitForReview(project.id);
              navigateToReviewQueue(project.id);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#8D7CFF] text-[#090B18] hover:bg-[#8D7CFF]/90 transition-all shadow-[0_0_12px_rgba(141,124,255,0.25)]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send to Review Queue</span>
          </button>
        </div>
      </div>

      {(project.videoType || project.creativeDirection || project.visualStyleDescription || project.audioDirection) && (
        <section className="rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-white light:text-slate-900">Creative Brief</h2>
            {project.videoType && <span className="rounded-full bg-[#55F4FF]/10 text-[#55F4FF] px-2 py-1 text-[10px] font-semibold">{project.videoType}</span>}
            {project.language && <span className="rounded-full bg-slate-500/10 text-slate-400 px-2 py-1 text-[10px]">{project.language}</span>}
            {project.audience && <span className="rounded-full bg-slate-500/10 text-slate-400 px-2 py-1 text-[10px]">Audience: {project.audience}</span>}
          </div>
          {project.creativeDirection && <p className="text-xs text-slate-300 light:text-slate-700">{project.creativeDirection}</p>}
          {project.visualStyleDescription && <p className="text-[11px] text-slate-400 light:text-slate-500">Visuals: {project.visualStyleDescription}</p>}
          {project.audioDirection && <p className="text-[11px] text-slate-400 light:text-slate-500">Audio: {project.audioDirection}</p>}
        </section>
      )}

      {/* Approval-gated production progress. Chat remains the primary control surface. */}
      <section className="rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white light:text-slate-900">Production Checkpoints</h2>
            <p className="text-[11px] text-slate-400 light:text-slate-500">{isLegacyWorkflow ? 'Existing project: checkpoint tracking starts when you approve the idea or script in AI Ideas Chat.' : 'Each stage must be reviewed before the next one unlocks.'} Paid media generation is never started by approval alone.</p>
          </div>
          <button type="button" onClick={() => setCurrentSection('ideas')} className="inline-flex items-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] hover:bg-[#55F4FF]/90">
            <Sparkles className="w-3.5 h-3.5" />
            Continue in AI Ideas Chat
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {productionStages.map((stage, index) => {
            const completed = index < activeProductionIndex;
            const active = index === activeProductionIndex;
            return (
              <div key={stage.id} aria-current={active ? 'step' : undefined} className={'rounded-lg border px-2 py-2 text-center ' + (active ? 'border-[#55F4FF] bg-[#55F4FF]/10' : completed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-[#2B3058] light:border-slate-200')}>
                <div className={'text-[10px] font-semibold ' + (active ? 'text-[#55F4FF]' : completed ? 'text-emerald-400' : 'text-slate-500')}>{completed ? '✓ ' : String(index + 1).padStart(2, '0') + ' '}{stage.label}</div>
              </div>
            );
          })}
        </div>
        {project.productionStageNotes && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="text-[10px] font-bold text-amber-300">Targeted revision request</p>
            <p className="text-xs text-slate-300 light:text-slate-700">{project.productionStageNotes}</p>
          </div>
        )}
      </section>

      {finalVideoPreviewUrl && (
        <section className="rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white light:text-slate-900">Full Video Preview</h2>
            <span className="text-[10px] text-emerald-400">Saved on this device</span>
          </div>
          <video src={finalVideoPreviewUrl} controls playsInline className="w-full max-h-[560px] rounded-lg bg-black" />
          <p className="text-[11px] text-slate-400 light:text-slate-500">Review the assembled video here. If changes are needed, request the specific scene or voice correction in AI Ideas Chat before final approval.</p>
        </section>
      )}

      {/* 2. Main Studio Grid: Left Media Preview + Right Scene Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start min-w-0">
        {/* LEFT COLUMN: Media Preview & Playback Monitor (5 cols on large) */}
        <div className="xl:col-span-5 min-w-0 space-y-4">
          <div className="p-4 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white light:text-slate-900 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#55F4FF]" />
                <span>Scene Preview Monitor</span>
              </span>

              {/* Aspect Ratio Switcher */}
              <div className="flex items-center gap-1 p-0.5 bg-[#090B18] light:bg-slate-100 rounded-md">
                {[
                  { id: '9:16', icon: <Smartphone className="w-3 h-3" /> },
                  { id: '16:9', icon: <Monitor className="w-3 h-3" /> },
                  { id: '1:1', icon: <Square className="w-3 h-3" /> },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setPreviewAspectRatio(r.id as AspectRatio)}
                    title={`Preview as ${r.id}`}
                    className={`p-1 rounded text-xs transition-colors ${
                      previewAspectRatio === r.id
                        ? 'bg-[#1E2345] light:bg-white text-[#55F4FF] light:text-[#6366F1]'
                        : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {r.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Video Viewport Stage */}
            <div
              className={`mx-auto relative bg-[#090B18] rounded-lg overflow-hidden border border-[#2B3058] flex items-center justify-center transition-all ${
                previewAspectRatio === '9:16'
                  ? 'w-[240px] aspect-[9/16]'
                  : previewAspectRatio === '1:1'
                  ? 'w-full aspect-square max-w-[340px]'
                  : 'w-full aspect-video'
              }`}
            >
              {currentScene?.mediaUrl ? (
                <img
                  src={sceneImageUrl || currentScene.mediaUrl}
                  alt={`Scene ${currentSceneIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <div className="text-center p-6 text-slate-500 text-xs">
                  <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No visual media assigned
                </div>
              )}

              {/* Subtitle simulation overlay */}
              {project.subtitleStyle !== 'none' && currentScene?.narration && (
                <div
                  className={`absolute inset-x-3 bottom-12 text-center pointer-events-none transition-all ${
                    project.subtitleStyle === 'dynamic_pop'
                      ? 'bg-black/80 text-[#55F4FF] font-black text-xs sm:text-sm px-3 py-1.5 rounded-lg shadow-lg'
                      : project.subtitleStyle === 'karaoke_neon'
                      ? 'bg-gradient-to-r from-[#8D7CFF]/90 to-[#55F4FF]/90 text-[#090B18] font-extrabold text-xs px-2 py-1 rounded'
                      : 'bg-black/60 text-white font-medium text-xs px-2 py-1'
                  }`}
                >
                  {currentScene.narration.slice(0, 85)}...
                </div>
              )}

              {/* Scrim Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              {/* Scene Indicator Stamp */}
              <div className="absolute top-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/70 backdrop-blur-xs text-white">
                SCENE 0{currentSceneIndex + 1} / 0{project.scenes.length}
              </div>

              {/* Play/Pause Center Trigger */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? 'Pause preview playback' : 'Play preview playback'}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-[#55F4FF]/90 text-[#090B18] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </div>
              </button>
            </div>

            {/* Playback Controls & Scrubber */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono tabular-nums">
                  0:0{Math.floor((playProgress / 100) * (currentScene?.duration || 10))} / 0:0
                  {currentScene?.duration || 10}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {currentScene?.cameraMovement}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                value={playProgress}
                onChange={(e) => setPlayProgress(Number(e.target.value))}
                className="w-full accent-[#55F4FF] cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handlePrevScene}
                    className="p-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-[#1E2345] transition-colors"
                  >
                    Prev Scene
                  </button>
                  <button
                    onClick={handleNextScene}
                    className="p-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-[#1E2345] transition-colors"
                  >
                    Next Scene
                  </button>
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  <span className="capitalize text-[11px]">
                    {project.narrationStyle.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Scene Sequencer Timeline & Script Editor (7 cols) */}
        <div className="xl:col-span-7 min-w-0 space-y-4">
          {/* Active Scene Editor Panel */}
          {currentScene ? (
            <div className="p-5 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#2B3058]/60 light:border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#55F4FF] text-[#090B18] font-mono text-xs font-bold flex items-center justify-center">
                    0{currentScene.order}
                  </span>
                  <h3 className="text-sm font-bold text-white light:text-slate-900">
                    Scene Sequence Editor
                  </h3>
                </div>

                {/* Duration Slider */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Duration:</span>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={currentScene.duration}
                    onChange={(e) =>
                      updateScene(project.id, currentScene.id, {
                        duration: Math.max(2, Number(e.target.value)),
                      })
                    }
                    className="w-14 px-2 py-1 text-xs font-mono font-bold text-center rounded bg-[#090B18] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1] border border-[#2B3058] light:border-slate-300 focus:outline-none"
                  />
                  <span className="text-slate-500 font-mono">sec</span>
                </div>
              </div>

              {/* Narration Script Textarea */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-semibold text-slate-300 light:text-slate-700">
                    Narration Script (Spoken Voiceover)
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {currentScene.narration.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={currentScene.narration}
                  onChange={(e) =>
                    updateScene(project.id, currentScene.id, { narration: e.target.value, generatedAudioId: undefined, generatedVideoId: undefined })
                  }
                  placeholder="Enter the voiceover script for this scene..."
                  className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] leading-relaxed"
                />
              </div>

              {currentScene.dialogue !== undefined && currentScene.dialogue !== '' && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 light:text-slate-700 text-xs">Character Dialogue</label>
                  <textarea
                    rows={2}
                    value={currentScene.dialogue || ''}
                    onChange={(e) => updateScene(project.id, currentScene.id, { dialogue: e.target.value, generatedAudioId: undefined, generatedVideoId: undefined })}
                    placeholder="Edit the character's spoken dialogue..."
                    className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] leading-relaxed"
                  />
                </div>
              )}

              {/* Generate an optional reference image for this scene. */}
              <div className="space-y-3 rounded-xl border border-[#2B3058] light:border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#55F4FF]" />
                      Generate Scene Image
                    </h3>
                    <p className="text-[11px] text-slate-400 light:text-slate-500">Optional reference image for this scene. Video models can also generate directly from the visual prompt. API usage may incur charges.</p>
                    {!imageGenerationUnlocked && <p className="text-[10px] text-amber-400">Unlocks after the script and dialogue are approved in AI Ideas Chat.</p>}
                  </div>
                  <button type="button" onClick={() => void handleGenerateSceneImage()} disabled={isGeneratingSceneImage || !imageGenerationUnlocked || !currentScene.visualPrompt.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] transition-colors hover:bg-[#55F4FF]/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGeneratingSceneImage ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090B18] border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingSceneImage ? 'Generating…' : sceneImageUrl ? 'Regenerate Scene Image' : 'Generate Scene Image'}
                  </button>
                </div>
                {sceneImageUrl && (
                  <div className="space-y-1">
                    <img src={sceneImageUrl} alt={'Generated visual for scene ' + currentScene.order} className="w-full max-h-64 rounded-lg object-contain bg-black/30" />
                    <p className="text-[10px] text-slate-400">{sceneImageCostUsd === null ? "Generated image saved on this device." : "Reported image cost: $" + sceneImageCostUsd.toFixed(4) + " USD"}</p>
                  </div>
                )}
                {sceneImageError && <p role="alert" className="text-[11px] text-rose-400">{sceneImageError}</p>}
              </div>

              {/* Real OpenRouter text-to-speech generation for the selected scene */}
              <div className="space-y-3 rounded-xl border border-[#2B3058] light:border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-[#8D7CFF]" />
                      Generate AI Voiceover
                    </h3>
                    <p className="text-[11px] text-slate-400 light:text-slate-500">Turns this scene’s narration into spoken audio. API usage may incur charges; voice names vary by model.</p>
                    {!voiceGenerationUnlocked && <p className="text-[10px] text-amber-400">Unlocks after every scene image is generated and approved.</p>}
                  </div>
                  <button type="button" onClick={() => void handleGenerateVoiceover()} disabled={isGeneratingVoiceover || !voiceGenerationUnlocked || !(currentScene.dialogue || currentScene.narration).trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#8D7CFF] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#8D7CFF]/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGeneratingVoiceover ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingVoiceover ? 'Generating…' : 'Generate Voiceover'}
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 light:text-slate-600" htmlFor="vyra-voice-name">Voice name (model-dependent)</label>
                  {supportedVoiceIds.length > 0 ? <select id="vyra-voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]">{supportedVoiceIds.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select> : <input id="vyra-voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} maxLength={80} placeholder="Enter this model's voice ID" className="w-full px-3 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]" />}
                  <p className="text-[10px] text-slate-500">{supportedVoiceIds.length > 0 ? 'Choose a voice published for the selected Speech model.' : 'This model did not publish voice IDs. Check its documentation; VYRA does not guess a voice ID.'}</p>
                </div>
                {voiceoverStatus && <p role="status" className="text-[11px] text-slate-300 light:text-slate-600">{voiceoverStatus}</p>}
                {voiceoverError && <p role="alert" className="text-[11px] text-rose-400">{voiceoverError}</p>}
                {generatedVoiceoverUrl && (
                  <div className="space-y-2">
                    <audio src={generatedVoiceoverUrl} controls preload="metadata" className="w-full" />
                    <a href={generatedVoiceoverUrl} download={(project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'vyra') + '-scene-' + (currentScene.order || 1) + '-voiceover.' + getMediaFileExtension(generatedVoiceoverMimeType, 'audio')} className="inline-flex items-center gap-2 rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2 text-xs font-semibold text-[#55F4FF] hover:bg-[#1E2345] light:hover:bg-slate-100">
                      <Download className="h-3.5 w-3.5" /> Download Voiceover
                    </a>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  {voiceoverStatus.includes('could not be saved on this device')
                    ? 'This voiceover is only available in this page session. Download it before leaving; it will not be available after refresh.'
                    : 'Voiceover audio is saved locally in IndexedDB and linked to this scene. Full-video export mixes saved scene voiceovers when available.'}
                </p>
              </div>

              {/* Visual Prompt Specification */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
                  Visual Generation Prompt & Lighting
                </label>
                <textarea
                  rows={2}
                  value={currentScene.visualPrompt}
                  onChange={(e) =>
                    updateScene(project.id, currentScene.id, { visualPrompt: e.target.value, generatedVideoId: undefined })
                  }
                  placeholder="Detailed visual prompt describing scene environment, materials, lighting..."
                  className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              {/* Real OpenRouter video generation for the selected scene */}
              <div className="space-y-3 rounded-xl border border-[#2B3058] light:border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-2">
                      <Video className="w-4 h-4 text-[#55F4FF]" />
                      Generate AI Video Clip
                    </h3>
                    <p className="text-[11px] text-slate-400 light:text-slate-500">
                      Creates a real clip using your selected OpenRouter Video model and its published capabilities. API usage may incur charges.
                    </p>
                    {!videoGenerationUnlocked && <p className="text-[10px] text-amber-400">Unlocks after all scene voice samples are generated and approved.</p>}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="space-y-1 text-[10px] text-slate-400 light:text-slate-600">
                        <span>Clip duration</span>
                        <select value={clipDuration} onChange={(e) => setClipDuration(Number(e.target.value))} disabled={isGeneratingClip} className="w-full rounded-lg border border-[#2B3058] light:border-slate-300 bg-[#090B18] light:bg-slate-50 px-2 py-2 text-xs text-white light:text-slate-900">
                          {(videoModelMetadata?.supportedDurations?.length ? videoModelMetadata.supportedDurations : [4]).map((duration) => <option key={duration} value={duration}>{duration} seconds</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400 light:text-slate-600">
                        <span>Aspect ratio</span>
                        <select value={clipAspectRatio} onChange={(e) => setClipAspectRatio(e.target.value)} disabled={isGeneratingClip} className="w-full rounded-lg border border-[#2B3058] light:border-slate-300 bg-[#090B18] light:bg-slate-50 px-2 py-2 text-xs text-white light:text-slate-900">
                          {(videoModelMetadata?.supportedAspectRatios?.length ? videoModelMetadata.supportedAspectRatios : [project.aspectRatio]).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400 light:text-slate-600">
                        <span>Resolution</span>
                        <select value={clipResolution} onChange={(e) => setClipResolution(e.target.value)} disabled={isGeneratingClip} className="w-full rounded-lg border border-[#2B3058] light:border-slate-300 bg-[#090B18] light:bg-slate-50 px-2 py-2 text-xs text-white light:text-slate-900">
                          <option value="">Model default</option>
                          {(videoModelMetadata?.supportedResolutions || []).map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
                        </select>
                      </label>
                    </div>
                    {!videoModelMetadata?.supportedDurations?.length && <p className="mt-2 text-[10px] text-amber-400">This model did not publish supported durations. VYRA will try 4 seconds; check the model details if the request is rejected.</p>}
                  </div>
                  <button type="button" onClick={() => void handleGenerateClip()} disabled={isGeneratingClip || !videoGenerationUnlocked || !currentScene?.visualPrompt.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] transition-colors hover:bg-[#55F4FF]/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGeneratingClip ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090B18] border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingClip ? 'Generating…' : 'Generate ' + clipDuration + 's Clip'}
                  </button>
                </div>
                {clipStatus && <p role="status" className="text-[11px] text-slate-300 light:text-slate-600">{clipStatus}</p>}
                {clipError && <p role="alert" className="text-[11px] text-rose-400">{clipError}</p>}
                {generatedClipUrl && (
                  <div className="space-y-2">
                    <video src={generatedClipUrl} controls playsInline className="w-full max-h-80 rounded-lg bg-black" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {clipCostUsd !== null ? <span className="text-[11px] text-slate-400">Reported generation cost: {'$' + clipCostUsd.toFixed(4)} USD</span> : <span className="text-[11px] text-slate-400">Generated clip · {clipDuration} seconds</span>}
                      <a href={generatedClipUrl} download={project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-scene-' + (currentScene.order || 1) + '.' + getMediaFileExtension(generatedClipMimeType, 'video')} className="inline-flex items-center gap-2 rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2 text-xs font-semibold text-[#55F4FF] hover:bg-[#1E2345] light:hover:bg-slate-100">
                        <Download className="h-3.5 w-3.5" />
                        Download Clip
                      </a>
                    </div>
                    <p className="text-[10px] text-slate-500">Clip is saved on this device and remains available after refresh. Generate a clip for every scene to enable full-video export.</p>
                  </div>
                )}
              </div>

              {/* Camera Movement Selector & Media switcher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    Camera Motion
                  </label>
                  <select
                    value={currentScene.cameraMovement}
                    onChange={(e) =>
                      updateScene(project.id, currentScene.id, { cameraMovement: e.target.value, generatedVideoId: undefined })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none"
                  >
                    <option value="Slow inward macro push with shallow depth of field">
                      Slow Inward Push (Macro)
                    </option>
                    <option value="Cinematic tracking pass across the skyline">
                      Cinematic Tracking Pass
                    </option>
                    <option value="Dynamic ascending tilt into the golden sunset horizon">
                      Ascending Tilt
                    </option>
                    <option value="Smooth arc pan from left to center">Arc Pan (Avatar)</option>
                    <option value="Static tripod lock-off">Static Lock-off</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="vyra-visual-media-source" className="text-[11px] font-semibold text-slate-400">
                    Visual Media Source
                  </label>
                  <select
                    id="vyra-visual-media-source"
                    value={currentScene.mediaUrl}
                    onChange={(e) =>
                      updateScene(project.id, currentScene.id, { mediaUrl: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none truncate"
                  >
                    <option value={sceneQuantumChip}>
                      Quantum Optical Chip Macro
                    </option>
                    <option value={heroCyberCity}>
                      Tokyo 2088 Sky-Rail Cityscape
                    </option>
                    <option value={sceneAvatarPresenter}>
                      Holographic Anchor Avatar
                    </option>
                    <option value={sceneEcoHabitat}>
                      Alpine Biosphere Eco-Habitat
                    </option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {exportProgress && <p role="status" className="rounded-lg border border-[#2B3058] light:border-slate-200 px-3 py-2 text-[11px] text-slate-300 light:text-slate-600">{exportProgress}</p>}

          {/* Scene Sequencer Timeline List (Reordering, Adding, Deleting) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-white light:text-slate-900 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#8D7CFF]" />
                <span>Storyboard Timeline ({project.scenes.length} Scenes)</span>
              </span>
              <button
                onClick={() => addScene(project.id)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Scene</span>
              </button>
            </div>

            <div className="space-y-2">
              {project.scenes.map((sc, idx) => {
                const isSelected = sc.id === selectedSceneId;
                return (
                  <div
                    key={sc.id}
                    onClick={() => setSelectedSceneId(sc.id)}
                    className={`p-2 sm:p-3 rounded-lg border transition-all cursor-pointer flex items-center gap-2 sm:gap-3 min-w-0 ${
                      isSelected
                        ? 'border-[#55F4FF] bg-[#171A35] light:bg-slate-100 shadow-xs'
                        : 'border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-white hover:border-slate-500'
                    }`}
                  >
                    {/* Scene Order Badge */}
                    <span className="font-mono text-xs font-bold text-slate-400 w-6 text-center">
                      0{sc.order}
                    </span>

                    {/* Thumbnail */}
                    <div className="w-12 sm:w-16 h-10 rounded bg-slate-900 overflow-hidden shrink-0">
                      <img
                        src={sc.mediaUrl}
                        alt={`Scene ${sc.order}`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Script Snippet */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white light:text-slate-900 truncate font-medium">
                        {sc.narration || '(Empty script)'}
                      </p>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono tabular-nums">{sc.duration}s</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{sc.cameraMovement}</span>
                      </div>
                    </div>

                    {/* Reordering & Delete Controls */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        disabled={idx === 0}
                        onClick={() => reorderScenes(project.id, idx, idx - 1)}
                        title="Move scene up"
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        disabled={idx === project.scenes.length - 1}
                        onClick={() => reorderScenes(project.id, idx, idx + 1)}
                        title="Move scene down"
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      {project.scenes.length > 1 && (
                        <button
                          onClick={() => removeScene(project.id, sc.id)}
                          title="Delete scene"
                          className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
