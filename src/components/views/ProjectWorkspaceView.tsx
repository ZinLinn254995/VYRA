/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useStudio } from '../../context/StudioContext';
import { getSavedAudio, getSavedVideo, saveGeneratedAudio, saveGeneratedVideo } from '../../services/mediaLibraryStorage';
import { Scene, AspectRatio } from '../../types';
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

// Split narration into readable captions for both SRT and burned-in exports.
// Intl.Segmenter supports languages such as Burmese that do not separate every word with spaces.
const splitCaptionText = (text: string, maxChars = 42): string[] => {
  const value = text.trim();
  if (!value) return [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string | string[], options?: { granularity: string }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  const tokens = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(value), (part) => part.segment)
    : value.split(/(\\s+)/).filter(Boolean);
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
  } = useStudio();

  // If no active project, show selector
  const project = activeProject || projects[0];

  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    project?.scenes[0]?.id || ''
  );

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
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceName, setVoiceName] = useState('alloy');
  const [voiceoverStatus, setVoiceoverStatus] = useState('');
  const [voiceoverError, setVoiceoverError] = useState('');
  const [generatedVoiceoverUrl, setGeneratedVoiceoverUrl] = useState('');
  const [clipStatus, setClipStatus] = useState('');
  const [clipError, setClipError] = useState('');
  const [generatedClipUrl, setGeneratedClipUrl] = useState('');
  const [clipCostUsd, setClipCostUsd] = useState<number | null>(null);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
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


  const currentScene = project?.scenes.find((s) => s.id === selectedSceneId) || project?.scenes[0];
  const currentSceneIndex = project?.scenes.findIndex((s) => s.id === selectedSceneId) ?? 0;
  // Restore this scene's generated clip from IndexedDB when returning to the workspace.
  useEffect(() => {
    let cancelled = false;
    const videoId = currentScene?.generatedVideoId;
    if (!videoId) {
      setGeneratedClipUrl('');
      return () => { cancelled = true; };
    }
    getSavedVideo(videoId)
      .then((saved) => {
        if (!cancelled && saved) setGeneratedClipUrl(URL.createObjectURL(saved.blob));
      })
      .catch(() => {
        if (!cancelled) setClipError('This scene’s saved clip could not be loaded from this device.');
      });
    return () => { cancelled = true; };
  }, [currentScene?.generatedVideoId]);

  // Restore this scene's saved voiceover from IndexedDB when returning to the workspace.
  useEffect(() => {
    let cancelled = false;
    const audioId = currentScene?.generatedAudioId;
    if (!audioId) {
      setGeneratedVoiceoverUrl('');
      setVoiceoverStatus('');
      return () => { cancelled = true; };
    }
    getSavedAudio(audioId)
      .then((saved) => {
        if (!cancelled && saved) {
          setGeneratedVoiceoverUrl(URL.createObjectURL(saved.blob));
          setVoiceoverStatus('Voiceover restored from this device.');
          setVoiceName(saved.voice || 'alloy');
        }
      })
      .catch(() => {
        if (!cancelled) setVoiceoverError('This scene’s saved voiceover could not be loaded from this device.');
      });
    return () => { cancelled = true; };
  }, [currentScene?.id, currentScene?.generatedAudioId]);

  // Compute total duration and words
  const totalDuration = project?.scenes.reduce((acc, sc) => acc + sc.duration, 0) || 0;
  const totalWords = project?.scenes.reduce((acc, sc) => {
    return acc + (sc.narration ? sc.narration.trim().split(/\s+/).length : 0);
  }, 0) || 0;
  const estimatedReadingTime = Math.round((totalWords / 150) * 60); // 150 wpm

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
    setClipError('');
    setClipStatus('');
    setClipCostUsd(null);
    setGeneratedClipUrl('');
    setIsGeneratingClip(true);
    try {
      let apiKey = '';
      let selectedModels: Partial<Record<'text' | 'image' | 'video' | 'audio', string>> = {};
      try {
        apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
        selectedModels = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as typeof selectedModels;
      } catch { /* Show setup guidance below if session storage is unavailable. */ }
      const model = selectedModels.video;
      if (!apiKey || !model) throw new Error('Connect OpenRouter and select a Video model in Settings before generating a clip.');
      const prompt = [
        'Generate a cinematic 4-second video clip for one scene in a larger video.',
        'Visual direction: ' + currentScene.visualPrompt,
        'Camera movement: ' + currentScene.cameraMovement,
        'Narrative context: ' + currentScene.narration,
        'Overall visual style: ' + project.visualStyle,
        'Aspect ratio: ' + project.aspectRatio,
        'Keep motion coherent and visually polished. Do not add captions, subtitles, watermarks, or UI text.',
      ].join('\n');
      setClipStatus('Submitting video generation job…');
      const response = await fetch('/api/providers/openrouter/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, prompt, aspect_ratio: project.aspectRatio, duration: 4 }),
      });
      const submitted = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
      if (!response.ok || !submitted.jobId) throw new Error(submitted.error || 'Could not start video generation. Check the selected Video model and retry.');
      let completed = false;
      let generatedCostUsd: number | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        setClipStatus(attempt === 0 ? 'Video job queued. Waiting for the model…' : 'Generating video… status check ' + (attempt + 1) + ' of 40');
        await new Promise<void>((resolve) => window.setTimeout(resolve, 15000));
        const statusResponse = await fetch('/api/providers/openrouter/videos/' + encodeURIComponent(submitted.jobId!), { headers: { 'x-openrouter-api-key': apiKey } });
        const status = await statusResponse.json().catch(() => ({})) as { status?: string; error?: string; costUsd?: number | null };
        if (!statusResponse.ok) throw new Error(status.error || 'Could not check video generation status.');
        if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'expired') throw new Error(status.error || 'The video generation job ' + status.status + '. You can retry with another model.');
        if (status.status === 'completed') {
          completed = true;
          setClipStatus('Video generated. Downloading clip…');
          generatedCostUsd = typeof status.costUsd === 'number' ? status.costUsd : null;
          setClipCostUsd(generatedCostUsd);
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
      let savedVideoId: string | undefined;
      try {
        const saved = await saveGeneratedVideo({
          title: project.title + ' — Scene ' + currentScene.order,
          blob,
          model,
          costUsd: generatedCostUsd,
          projectId: project.id,
          sceneId: currentScene.id,
        });
        savedVideoId = saved.id;
        updateScene(project.id, currentScene.id, { generatedVideoId: saved.id, status: 'ready' });
      } catch {
        setClipError('Video generated, but could not save it to this device. Download it now before leaving this page.');
      }
      setGeneratedClipUrl(URL.createObjectURL(blob));
      setClipStatus(savedVideoId
        ? 'Clip saved to this device and linked to this scene. It will be available after refresh.'
        : 'Your 4-second clip is ready. Use Download Clip to save the MP4.');
      showToast(savedVideoId ? 'AI video clip generated and saved' : 'AI video clip generated; local save failed', savedVideoId ? 'success' : 'warning');
    } catch (error) {
      setClipError(error instanceof Error ? error.message : 'Video generation failed. Please retry.');
      setClipStatus('');
    } finally {
      setIsGeneratingClip(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!project || !currentScene || isGeneratingVoiceover) return;
    const narration = currentScene.narration.trim();
    if (!narration) {
      setVoiceoverError('Add narration text for this scene first.');
      return;
    }
    setVoiceoverError('');
    setVoiceoverStatus('Generating voiceover… this may take a little while.');
    setGeneratedVoiceoverUrl('');
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
      const response = await fetch('/api/providers/openrouter/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, input: narration, voice: voiceName.trim() || 'alloy', speed: 1 }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Voiceover generation failed. Check the selected model and voice.');
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('The provider returned an invalid or empty audio file.');
      const saved = await saveGeneratedAudio({
        title: project.title + ' — Scene ' + currentScene.order + ' Voiceover',
        blob,
        model,
        voice: voiceName.trim() || 'alloy',
        projectId: project.id,
        sceneId: currentScene.id,
      });
      updateScene(project.id, currentScene.id, { generatedAudioId: saved.id });
      setGeneratedVoiceoverUrl(URL.createObjectURL(blob));
      setVoiceoverStatus('Voiceover generated and saved on this device. It remains available after refresh.');
      showToast('AI voiceover generated and saved', 'success');
    } catch (error) {
      setVoiceoverError(error instanceof Error ? error.message : 'Voiceover generation failed. Please retry.');
      setVoiceoverStatus('');
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const handleExportSubtitles = () => {
    if (!project) return;
    const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
    const entries: Array<{ start: number; end: number; text: string }> = [];
    let sceneStart = 0;

    for (const scene of scenes) {
      const narration = scene.narration.trim();
      const duration = Math.max(0.5, Number.isFinite(scene.duration) ? scene.duration : 0.5);
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
    showToast('SRT subtitles exported using storyboard scene timings', 'success');
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

      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This browser cannot encode an export format supported by VYRA. Try an updated Chrome or Edge browser.');
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const recordingFinished = new Promise<Blob>((resolve, reject) => {
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }));
        recorder!.onerror = () => reject(new Error('The browser stopped recording unexpectedly. Please try exporting again.'));
      });
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
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Could not decode the saved clip for scene ' + scene.order + '.'));
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
            const wordsForLine = caption.split(/\s+/);
            const lines: string[] = [];
            let line = '';
            for (const word of wordsForLine) {
              const candidate = line ? line + ' ' + word : word;
              if (context.measureText(candidate).width > maxTextWidth && line) {
                lines.push(line);
                line = word;
              } else {
                line = candidate;
              }
            }
            if (line) lines.push(line);
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
        const audioFinished = audioSource
          ? new Promise<void>((resolve) => { audioSource.onended = () => resolve(); })
          : Promise.resolve();
        if (audioSource && audioBuffer && audioContext) {
          audioSource.buffer = audioBuffer;
          if (!audioDestination) throw new Error('Could not initialize the voiceover audio track.');
          audioSource.connect(audioDestination);
          audioStartTime = audioContext.currentTime;
          audioSource.start();
        }
        const videoFinished = new Promise<void>((resolve, reject) => {
          let animationFrame = 0;
          const draw = () => {
            if (video.ended || video.paused) return;
            drawFrame();
            animationFrame = window.requestAnimationFrame(draw);
          };
          video.onended = () => {
            window.cancelAnimationFrame(animationFrame);
            drawFrame();
            resolve();
          };
          video.onerror = () => {
            window.cancelAnimationFrame(animationFrame);
            reject(new Error('Playback failed while exporting scene ' + scene.order + '.'));
          };
          video.play().then(() => {
            draw();
          }).catch((error) => {
            window.cancelAnimationFrame(animationFrame);
            reject(new Error('The browser could not play scene ' + scene.order + ' for export: ' + (error instanceof Error ? error.message : 'playback blocked')));
          });
        });
        await Promise.all([videoFinished, audioFinished]);
        if (audioSource) {
          try { audioSource.disconnect(); } catch { /* already disconnected */ }
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
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
      const link = document.createElement('a');
      const baseName = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vyra-video';
      const extension = output.type.includes('mp4') ? 'mp4' : 'webm';
      link.href = outputUrl;
      link.download = baseName + '-final.' + extension;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(outputUrl), 60000);
      const voiceoverCount = audioClips.filter(Boolean).length;
      showToast(voiceoverCount ? 'Full video exported with voiceovers' : 'Full video exported without voiceovers', 'success');
      setExportProgress('Export complete. Downloaded ' + scenes.length + ' scenes as one ' + extension.toUpperCase() + ' video' + (voiceoverCount ? ' with voiceover audio for ' + voiceoverCount + ' of ' + scenes.length + ' scenes.' : '. Generate scene voiceovers to include narration audio next time.'));
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
            title="Export editable SRT subtitles using planned scene durations"
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
                  src={currentScene.mediaUrl}
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
                    updateScene(project.id, currentScene.id, { narration: e.target.value })
                  }
                  placeholder="Enter the voiceover script for this scene..."
                  className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] leading-relaxed"
                />
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
                  </div>
                  <button type="button" onClick={() => void handleGenerateVoiceover()} disabled={isGeneratingVoiceover || !currentScene.narration.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#8D7CFF] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#8D7CFF]/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGeneratingVoiceover ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingVoiceover ? 'Generating…' : 'Generate Voiceover'}
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 light:text-slate-600" htmlFor="vyra-voice-name">Voice name (model-dependent)</label>
                  <input id="vyra-voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} maxLength={80} placeholder="e.g. alloy" className="w-full px-3 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]" />
                </div>
                {voiceoverStatus && <p role="status" className="text-[11px] text-slate-300 light:text-slate-600">{voiceoverStatus}</p>}
                {voiceoverError && <p role="alert" className="text-[11px] text-rose-400">{voiceoverError}</p>}
                {generatedVoiceoverUrl && (
                  <div className="space-y-2">
                    <audio src={generatedVoiceoverUrl} controls preload="metadata" className="w-full" />
                    <a href={generatedVoiceoverUrl} download={(project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'vyra') + '-scene-' + (currentScene.order || 1) + '-voiceover.mp3'} className="inline-flex items-center gap-2 rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2 text-xs font-semibold text-[#55F4FF] hover:bg-[#1E2345] light:hover:bg-slate-100">
                      <Download className="h-3.5 w-3.5" /> Download Voiceover
                    </a>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">Voiceover audio is saved locally in IndexedDB and linked to this scene. Full-video export mixes saved scene voiceovers when available.</p>
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
                    updateScene(project.id, currentScene.id, { visualPrompt: e.target.value })
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
                      Creates a real 4-second clip using your selected OpenRouter Video model. API usage may incur charges.
                    </p>
                  </div>
                  <button type="button" onClick={() => void handleGenerateClip()} disabled={isGeneratingClip || !currentScene?.visualPrompt.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] transition-colors hover:bg-[#55F4FF]/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {isGeneratingClip ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090B18] border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isGeneratingClip ? 'Generating…' : 'Generate 4s Clip'}
                  </button>
                </div>
                {clipStatus && <p role="status" className="text-[11px] text-slate-300 light:text-slate-600">{clipStatus}</p>}
                {clipError && <p role="alert" className="text-[11px] text-rose-400">{clipError}</p>}
                {generatedClipUrl && (
                  <div className="space-y-2">
                    <video src={generatedClipUrl} controls playsInline className="w-full max-h-80 rounded-lg bg-black" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {clipCostUsd !== null ? <span className="text-[11px] text-slate-400">Reported generation cost: {'$' + clipCostUsd.toFixed(4)} USD</span> : <span className="text-[11px] text-slate-400">Generated clip · 4 seconds</span>}
                      <a href={generatedClipUrl} download={project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-scene-' + (currentScene.order || 1) + '.mp4'} className="inline-flex items-center gap-2 rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2 text-xs font-semibold text-[#55F4FF] hover:bg-[#1E2345] light:hover:bg-slate-100">
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
                      updateScene(project.id, currentScene.id, { cameraMovement: e.target.value })
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
                  <label className="text-[11px] font-semibold text-slate-400">
                    Visual Media Source
                  </label>
                  <select
                    value={currentScene.mediaUrl}
                    onChange={(e) =>
                      updateScene(project.id, currentScene.id, { mediaUrl: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none truncate"
                  >
                    <option value="/src/assets/images/scene_quantum_chip_1792925206672.jpg">
                      Quantum Optical Chip Macro
                    </option>
                    <option value="/src/assets/images/hero_cyber_city_1792925206979.jpg">
                      Tokyo 2088 Sky-Rail Cityscape
                    </option>
                    <option value="/src/assets/images/scene_avatar_presenter_1792925207281.jpg">
                      Holographic Anchor Avatar
                    </option>
                    <option value="/src/assets/images/scene_eco_habitat_1792925207788.jpg">
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
