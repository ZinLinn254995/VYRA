import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Image as ImageIcon,
  Video,
  LoaderCircle,
  Pause,
  Play,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Italic,
  List,
  Palette,
  Plus,
  Pencil,
  Strikethrough,
  Underline,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { supabase } from '../../context/AuthContext';
import { createVyralAudioPlaybackUrl, createVyralImagePlaybackUrl, createVyralVideoPlaybackUrl } from '../../services/vyralAssetPlayback';
import { createSupabaseVyralAssetIngestionPort, ingestVyralAsset } from '../../services/vyralAssetIngestion';
import { mergeTimelineVideoRows, placeTimelineMediaClip } from '../../services/timelineMediaPlacement';
import { buildMasterTimelineAudioPlaybackPlan } from '../../server/masterTimelineAudioPlayback';
import { startMasterTimelineAudioPlayback, type AudioPlaybackHandle } from '../../server/masterTimelineAudioPlaybackEngine';
import { buildMasterTimelineVideoPlaybackPlan } from '../../server/masterTimelineVideoPlayback';
import { startMasterTimelineVideoPlayback, type MasterTimelineVideoPlaybackHandle } from '../../server/masterTimelineVideoPlaybackEngine';
import { buildMasterTimelineTextOverlay, type MasterTimelineTextOverlay } from '../../server/masterTimelineTextOverlay';

export type TimelineClip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  sourceIn?: number;
  sourceOut?: number;
  waveform?: number[];
  content?: string;
  assetId?: string;
  assetVersionId?: string;
  assetMimeType?: string;
  mediaKind?: 'video' | 'image' | 'audio';
  isPlaceholder?: boolean;
};

export type TimelineTrack = {
  id: string;
  name: string;
  clips: TimelineClip[];
  muted?: boolean;
  volume?: number;
  visible?: boolean;
  collapsed?: boolean;
};

export type SceneTimelineInstance = {
  id: string;
  sceneId: string;
  sourceIn: number;
  sourceOut: number;
  sceneProjectId?: string;
  renderRevisionId?: string | null;
  assetId?: string;
  assetVersionId?: string;
  assetMimeType?: string;
  videoSourceIn?: number;
  videoSourceOut?: number;
  videoClips?: TimelineClip[];
};

export type MasterTimelineData = {
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  sceneInstances?: SceneTimelineInstance[];
  videoTracks?: TimelineTrack[];
  transitions: Record<string, { effect: string; duration: number }>;
  audioTracks: TimelineTrack[];
  textTracks: TimelineTrack[];
};

type Scene = {
  id: string;
  title: string;
  duration: number;
  projectId?: string;
  latestRenderRevisionId?: string | null;
};

type Props = {
  scenes: Scene[];
  vyralId?: string;
  value?: MasterTimelineData;
  onChange: (next: MasterTimelineData) => void;
  onSceneOrderChange: (sceneIds: string[]) => void;
  onSceneDuplicate: (scene: Scene, index: number) => Scene;
  onSceneDelete: (sceneId: string) => void;
  onSelectionChange?: (selection: { kind: 'scene' | 'transition' | 'text-clip' | 'audio-clip'; id: string; trackId?: string; label?: string } | null) => void;
};

const toolbarItems = [
  { label: 'Text', Icon: Type },
  { label: 'Audio', Icon: AudioLines },
  { label: 'Image', Icon: ImageIcon },
  { label: 'Video', Icon: Video },
  { label: 'Undo', Icon: Undo2 },
  { label: 'Redo', Icon: Redo2 },
];

/**
 * Master timeline foundation:
 * - ruler and scene blocks share one horizontal scroll surface
 * - zoom changes horizontal pixels-per-second only
 * - playhead is an overlay fixed at the center of the timeline viewport
 */
export const MasterTimelineEditor: React.FC<Props> = ({ scenes, vyralId, value, onChange, onSceneDuplicate, onSceneDelete, onSelectionChange }) => {
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [selectedVisualClipId, setSelectedVisualClipId] = useState<string | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const [mediaUploadBusy, setMediaUploadBusy] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState('');
  const [timelinePlayheadTime, setTimelinePlayheadTime] = useState(0);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null);
  const [selectedTextClip, setSelectedTextClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const [selectedAudioClip, setSelectedAudioClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [audioPreviewPlaying, setAudioPreviewPlaying] = useState(false);
  const [audioPreviewError, setAudioPreviewError] = useState('');
  const [audioPreviewClipKey, setAudioPreviewClipKey] = useState<string | null>(null);
  const [masterPlaybackState, setMasterPlaybackState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [masterPlaybackError, setMasterPlaybackError] = useState('');
  const [masterPreviewTextOverlays, setMasterPreviewTextOverlays] = useState<MasterTimelineTextOverlay[]>([]);
  const masterPreviewTextSignatureRef = useRef('');
  const masterAudioContextRef = useRef<AudioContext | null>(null);
  const masterPlaybackHandleRef = useRef<AudioPlaybackHandle | null>(null);
  const masterVideoPreviewRef = useRef<HTMLVideoElement>(null);
  const masterVideoPlaybackHandleRef = useRef<MasterTimelineVideoPlaybackHandle | null>(null);
  const masterPlaybackRequestIdRef = useRef(0);
  const masterPlaybackFrameRef = useRef<number | null>(null);
  const masterPlaybackClockRef = useRef<{ contextStart: number; timelineStart: number } | null>(null);
  const masterPlaybackSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterPlaybackProgrammaticScrollRef = useRef<number | null>(null);
  const masterPlaybackTickRef = useRef<(() => void) | null>(null);
  const masterPlaybackSeekPendingRef = useRef(false);
  useEffect(() => {
    if (selectedSceneIds.length || selectedTransitionKey || selectedTextClip || selectedAudioClip) {
      setSelectedVisualClipId(null);
    }
  }, [selectedSceneIds, selectedTransitionKey, selectedTextClip, selectedAudioClip]);

  useEffect(() => {
    if (!onSelectionChange) return;
    if (selectedTextClip) {
      const track = (value?.textTracks || []).find((item) => item.id === selectedTextClip.trackId);
      const clip = track?.clips.find((item) => item.id === selectedTextClip.clipId);
      onSelectionChange({ kind: 'text-clip', id: selectedTextClip.clipId, trackId: selectedTextClip.trackId, label: clip?.name || clip?.content || 'Text clip' });
      return;
    }
    if (selectedAudioClip) {
      const track = (value?.audioTracks || []).find((item) => item.id === selectedAudioClip.trackId);
      const clip = track?.clips.find((item) => item.id === selectedAudioClip.clipId);
      onSelectionChange({ kind: 'audio-clip', id: selectedAudioClip.clipId, trackId: selectedAudioClip.trackId, label: clip?.name || 'Audio clip' });
      return;
    }
    if (selectedVisualClipId) {
      const clip = (value?.videoTracks || []).flatMap((track) => track.clips).find((item) => item.id === selectedVisualClipId);
      onSelectionChange({ kind: 'scene', id: selectedVisualClipId, label: clip?.name || 'Selected visual clip' });
      return;
    }
    if (selectedTransitionKey) {
      onSelectionChange({ kind: 'transition', id: selectedTransitionKey, label: 'Selected transition' });
      return;
    }
    if (selectedSceneIds.length) {
      const scene = scenes.find((item) => item.id === selectedSceneIds[0]);
      onSelectionChange({ kind: 'scene', id: selectedSceneIds[0], label: scene?.title || 'Selected scene' });
      return;
    }
    onSelectionChange(null);
  }, [onSelectionChange, selectedSceneIds, selectedVisualClipId, selectedTransitionKey, selectedTextClip, selectedAudioClip, scenes, value?.audioTracks, value?.textTracks, value?.videoTracks]);

  const [isTextEditMode, setIsTextEditMode] = useState(false);
  const [draggingTextClipId, setDraggingTextClipId] = useState<string | null>(null);
  const [textDragYOffset, setTextDragYOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(80);
  const pixelsPerSecondRef = useRef(80);
  const pinchRef = useRef<{ startDistance: number; startScale: number; anchorTime: number } | null>(null);
  const textDragRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    moved: boolean;
    pointerId: number;
    clipId: string;
    trackId: string;
    createdTrackId?: string | null;
    originalTrack: TimelineTrack;
    originalTrackIndex: number;
    originalStart: number;
    offsetX: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const audioDragRef = useRef<typeof textDragRef.current>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollPointerRef = useRef<{ kind: 'text' | 'audio'; x: number; y: number; pointerId: number; clip: TimelineClip } | null>(null);
  const processingAutoScrollTickRef = useRef(false);
  const suppressTextClickRef = useRef(false);
   const touchGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<MasterTimelineData[]>([]);
  const redoStackRef = useRef<MasterTimelineData[]>([]);
  const commitChange = (next: MasterTimelineData) => {
    if (value) {
      undoStackRef.current = [...undoStackRef.current, value].slice(-100);
      redoStackRef.current = [];
    }
    onChange(next);
  };
  const undoTimeline = () => {
    const previous = undoStackRef.current.pop();
    if (!previous || !value) return;
    redoStackRef.current = [...redoStackRef.current, value].slice(-100);
    onChange(previous);
  };
  const redoTimeline = () => {
    const next = redoStackRef.current.pop();
    if (!next || !value) return;
    undoStackRef.current = [...undoStackRef.current, value].slice(-100);
    onChange(next);
  };


  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    // Touch selection is handled from the original pointerdown target on pointerup.
    // The browser-generated click is consumed so a scroll/pinch release cannot
    // select whichever clip happens to be underneath the finger.
    const touchPointers = new Map<number, {
      x: number;
      y: number;
      moved: boolean;
      target: Element | null;
      ignoreSelection: boolean;
    }>();

    const onGestureClickCapture = (event: MouseEvent) => {
      // This listener is registered on document for pointer tracking, but click
      // suppression belongs exclusively to this timeline. Never intercept
      // touch-generated clicks elsewhere in the application.
      const target = event.target;
      if (!(target instanceof Node) || !element.contains(target)) return;

      // Chromium exposes whether a click came from a touch contact. Touch
      // taps are selected explicitly from the original pointerdown target;
      // consume only the timeline's follow-up click so a gesture cannot
      // select whichever clip happens to be underneath the release point.
      const touchClick = (event as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean };
      }).sourceCapabilities?.firesTouchEvents === true;

      if (!touchClick && !suppressTextClickRef.current) return;
      suppressTextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        // Android Chrome may emit compatibility mouse pointer events after touch.
        // Do not clear the pending touch-click guard before the synthetic click.
        return;
      }

      const rawTarget = event.target instanceof Element ? event.target : null;
      if (!rawTarget || !element.contains(rawTarget)) return;

      // Do not cancel pointerdown: Android needs the native pointer/touch
      // sequence for scrolling. We suppress only the generated activation
      // after classifying the gesture as a tap or a movement.

      if (touchPointers.size === 0) suppressTextClickRef.current = false;

      if (touchPointers.size > 0) {
        // A second finger turns the complete sequence into a pinch, never a tap.
        suppressTextClickRef.current = true;
        for (const pointer of touchPointers.values()) pointer.moved = true;
      }

      const ignoreSelection = Boolean(rawTarget.closest('[data-trim-handle], [data-audio-trim-handle]'));
      const selectableTarget = ignoreSelection
        ? null
        : rawTarget.closest<HTMLElement>(
            '[data-timeline-scene-id], [data-timeline-video-clip-id], [data-timeline-transition-key], [data-timeline-text-track-id][data-timeline-text-clip-id], [data-timeline-audio-track-id][data-timeline-audio-clip-id]',
          );
      touchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        moved: touchPointers.size > 0,
        target: selectableTarget || rawTarget,
        ignoreSelection,
      });
    };

    const selectTouchTarget = (target: Element) => {
       const sceneId = target.closest<HTMLElement>('[data-timeline-scene-id]')?.getAttribute('data-timeline-scene-id');
      if (sceneId) {
        setSelectedTransitionKey(null);
        setSelectedTextClip(null);
        setSelectedAudioClip(null);
        setSelectedVisualClipId(null);
        setSelectedSceneIds((current) => current[0] === sceneId ? [] : [sceneId]);
        return;
      }

      const visualClipId = target.closest<HTMLElement>('[data-timeline-video-clip-id]')?.getAttribute('data-timeline-video-clip-id');
      if (visualClipId) {
        setSelectedSceneIds([]);
        setSelectedTransitionKey(null);
        setSelectedTextClip(null);
        setSelectedAudioClip(null);
        setSelectedVisualClipId((current) => current === visualClipId ? null : visualClipId);
        return;
      }

      const transitionKey = target.closest<HTMLElement>('[data-timeline-transition-key]')?.getAttribute('data-timeline-transition-key');
      if (transitionKey) {
        setSelectedSceneIds([]);
        setSelectedVisualClipId(null);
        setSelectedTextClip(null);
        setSelectedAudioClip(null);
        setSelectedTransitionKey(transitionKey);
        return;
      }

      const textElement = target.closest<HTMLElement>('[data-timeline-text-track-id][data-timeline-text-clip-id]');
      const textTrackId = textElement?.getAttribute('data-timeline-text-track-id');
      const textClipId = textElement?.getAttribute('data-timeline-text-clip-id');
      if (textTrackId && textClipId) {
        setSelectedSceneIds([]);
        setSelectedVisualClipId(null);
        setSelectedTransitionKey(null);
        setSelectedAudioClip(null);
        setSelectedTextClip((current) =>
          current?.trackId === textTrackId && current.clipId === textClipId
            ? null
            : { trackId: textTrackId, clipId: textClipId },
        );
        return;
      }

      const audioElement = target.closest<HTMLElement>('[data-timeline-audio-track-id][data-timeline-audio-clip-id]');
      const audioTrackId = audioElement?.getAttribute('data-timeline-audio-track-id');
      const audioClipId = audioElement?.getAttribute('data-timeline-audio-clip-id');
      if (audioTrackId && audioClipId) {
        setSelectedSceneIds([]);
        setSelectedVisualClipId(null);
        setSelectedTransitionKey(null);
        setSelectedTextClip(null);
        setSelectedAudioClip((current) =>
          current?.trackId === audioTrackId && current.clipId === audioClipId
            ? null
            : { trackId: audioTrackId, clipId: audioClipId },
        );
        return;
      }

      if (!target.closest('button')) {
        setSelectedSceneIds([]);
        setSelectedVisualClipId(null);
        setSelectedTransitionKey(null);
        setSelectedTextClip(null);
        setSelectedAudioClip(null);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const pointer = touchPointers.get(event.pointerId);
      if (!pointer) return;
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
        pointer.moved = true;
        suppressTextClickRef.current = true;
         }
    };

    const onPointerEnd = (event: PointerEvent, cancelled: boolean) => {
      const pointer = touchPointers.get(event.pointerId);
      if (!pointer) return;

      // Some Android browsers suppress pointermove while native scrolling
      // takes ownership, but still deliver pointerup. Compare the final
      // coordinates as a final safety check so a pan cannot be mistaken for
      // a stationary tap on the clip that was touched at the beginning.
      const finalDistance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
      if (finalDistance > 8) {
        pointer.moved = true;
      }

      // Every touch sequence consumes its follow-up browser click. Only a
      // stationary, single-finger tap explicitly selects its original target.
      suppressTextClickRef.current = true;
      const textDrag = textDragRef.current;
      const audioDrag = audioDragRef.current;
      const longPressActive =
        (textDrag?.pointerId === event.pointerId && (textDrag.active || textDrag.moved)) ||
        (audioDrag?.pointerId === event.pointerId && (audioDrag.active || audioDrag.moved));

      if (
        !cancelled &&
        !pointer.moved &&
        !pointer.ignoreSelection &&
        pointer.target &&
        touchPointers.size === 1 &&
        !longPressActive
      ) {
        selectTouchTarget(pointer.target);
      }

      touchPointers.delete(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => onPointerEnd(event, false);
    const onPointerCancel = (event: PointerEvent) => onPointerEnd(event, true);

    const onTouchStart = (event: TouchEvent) => {
      if (!element.contains(event.target as Node)) return;

      if (event.touches.length === 1) {
        suppressTextClickRef.current = false;
        touchGestureStartRef.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }
      if (event.touches.length === 2) {
        suppressTextClickRef.current = true;
        touchGestureStartRef.current = null;
        for (const pointer of touchPointers.values()) pointer.moved = true;
        // Pinch takes priority over a pending clip long-press.
        for (const drag of [textDragRef.current, audioDragRef.current]) {
          if (drag?.timer) clearTimeout(drag.timer);
          if (drag) { drag.timer = null; drag.moved = true; }
        }
        const scale = pixelsPerSecondRef.current;
        pinchRef.current = {
          startDistance: Math.max(1, distance(event.touches)),
          startScale: scale,
          anchorTime: element.scrollLeft / scale,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!element.contains(event.target as Node)) return;

      if (event.touches.length === 1 && touchGestureStartRef.current) {
        const touch = event.touches[0];
        if (Math.hypot(touch.clientX - touchGestureStartRef.current.x, touch.clientY - touchGestureStartRef.current.y) > 8) {
          suppressTextClickRef.current = true;
           for (const pointer of touchPointers.values()) pointer.moved = true;
        }
      }
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      suppressTextClickRef.current = true;
      for (const pointer of touchPointers.values()) pointer.moved = true;
      event.preventDefault();
      const nextScale = Math.min(176, Math.max(8, pinch.startScale * distance(event.touches) / pinch.startDistance));
      setPixelsPerSecond(nextScale);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length === 0) touchGestureStartRef.current = null;
    };

    document.addEventListener('click', onGestureClickCapture, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener('click', onGestureClickCapture, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
     };
  }, []);

  useLayoutEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
    const element = scrollRef.current;
    const pinch = pinchRef.current;
    if (!element || !pinch) return;

    // Apply the scroll correction only after React has committed the new
    // timeline width; otherwise the browser clamps scrollLeft against the
    // previous (narrower) scroll range and the ruler drifts off the playhead.
    element.scrollLeft = pinch.anchorTime * pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateWidth = () => setViewportWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedSceneIds((current) => current.filter((id) => scenes.some((scene) => scene.id === id)));
  }, [scenes]);

  // Audio tracks are never auto-seeded with demo clips; only real Asset references are previewable.


  const orderedScenes = useMemo(() => {
    const instances = value?.sceneInstances || [];
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const ordered = instances
      .map((instance) => byId.get(instance.sceneId))
      .filter((scene): scene is Scene => Boolean(scene));
    const included = new Set(ordered.map((scene) => scene.id));
    return [...ordered, ...scenes.filter((scene) => !included.has(scene.id))];
  }, [scenes, value?.sceneInstances]);

  // Timeline scenes are the same immutable-duration scenes shown in the
  // Scenes tab. Trimming and splitting are intentionally not supported.
  const sceneSegments = orderedScenes.map((scene) => ({
    sourceIn: 0,
    sourceOut: scene.duration,
    duration: Math.max(0.1, scene.duration),
  }));
  const sceneDurations = sceneSegments.map((segment) => segment.duration);
  const sceneTotalDuration = sceneDurations.reduce((sum, duration) => sum + duration, 0);
  const textTracks = value?.textTracks || [];
  const textContentEnd = textTracks.flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  const audioContentEnd = (value?.audioTracks || []).flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  const videoContentEnd = (value?.videoTracks || []).flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  // Audio and Text can extend the shared timeline beyond the Scene sequence.
  // Scene source durations remain unchanged; the ruler grows to fit all content.
  const totalDuration = Math.max(1, sceneTotalDuration, textContentEnd, audioContentEnd, videoContentEnd);
  const directorVideoTrack = (() => {
    const instances = value?.sceneInstances || [];
    const clips: TimelineClip[] = [];
    let sceneStart = 0;
    orderedScenes.forEach((scene, index) => {
      const instance = instances.find((item) => item.sceneId === scene.id);
      const instanceClips = (instance?.videoClips || []).filter((clip) =>
        clip.assetId && clip.assetVersionId &&
        (clip.assetMimeType?.toLowerCase().startsWith('video/') || clip.assetMimeType?.toLowerCase().startsWith('image/')),
      );
      if (instanceClips.length) {
        for (const clip of instanceClips) {
          const mediaKind = clip.assetMimeType?.toLowerCase().startsWith('image/') ? 'image' : 'video';
          clips.push({ ...clip, start: sceneStart + clip.start, mediaKind });
        }
      } else if (instance?.assetId && instance.assetVersionId &&
        (instance.assetMimeType?.toLowerCase().startsWith('video/') || instance.assetMimeType?.toLowerCase().startsWith('image/'))) {
        const mediaKind = instance.assetMimeType.toLowerCase().startsWith('image/') ? 'image' : 'video';
        const sourceIn = instance.videoSourceIn ?? 0;
        const sourceOut = instance.videoSourceOut ?? scene.duration;
        clips.push({
          id: instance.id, name: scene.title, start: sceneStart,
          duration: Math.max(0.1, Math.min(scene.duration, sourceOut - sourceIn)),
          sourceIn, sourceOut, assetId: instance.assetId,
          assetVersionId: instance.assetVersionId, assetMimeType: instance.assetMimeType,
          mediaKind,
        });
      }
      sceneStart += sceneSegments[index]?.duration ?? scene.duration;
    });
    return clips.length ? { id: 'director-video-track', name: 'Video', clips } : null;
  })();
  // Director output and uploaded Video/Image Assets share one Scenes row.
  const visibleVideoTracks = mergeTimelineVideoRows(
    directorVideoTrack?.clips || [],
    value?.videoTracks || [],
  ) as TimelineTrack[];
  const sceneTransitionMarkers = orderedScenes.slice(0, -1).map((scene, index) => {
    const nextScene = orderedScenes[index + 1];
    const key = scene.id + ':' + nextScene.id;
    const boundary = sceneSegments.slice(0, index + 1).reduce((sum, segment) => sum + segment.duration, 0);
    return { key, boundary, transition: value?.transitions?.[key] };
  });
  const orderedVisualClips = visibleVideoTracks.flatMap((track, trackIndex) =>
    track.clips.map((clip) => ({ clip, trackIndex })),
  ).sort((a, b) => a.clip.start - b.clip.start || a.clip.duration - b.clip.duration);
  let scenesRowBoundary = 0;
  const videoTransitionMarkers = orderedVisualClips.slice(0, -1).map((entry, index) => {
    const nextEntry = orderedVisualClips[index + 1];
    const clip = entry.clip;
    const nextClip = nextEntry.clip;
    // Transition controls follow the real timeline boundary after ripple edits.
    scenesRowBoundary = clip.start + clip.duration;
    const boundary = scenesRowBoundary;
    const legacySceneBoundary = sceneTransitionMarkers.find((item) => Math.abs(item.boundary - boundary) <= 0.001);
    const key = legacySceneBoundary?.key || (clip.id + ':' + nextClip.id);
    return { key, boundary, rowIndex: entry.trackIndex, clipId: clip.id, nextClipId: nextClip.id, transition: value?.transitions?.[key] };
  });
  const updateVisualClipTiming = (
    clip: TimelineClip,
    start: number,
    duration: number,
    sourceIn: number,
    sourceOut: number,
    rippleClipStarts: Record<string, number> = {},
    rippleDelta = 0,
  ) => {
    const rippleIds = new Set(Object.keys(rippleClipStarts));
    const videoTracks = (value?.videoTracks || []).map((track) => ({
      ...track,
      clips: track.clips.map((item) => {
        if (item.id === clip.id) return { ...item, start, duration, sourceIn, sourceOut };
        return rippleIds.has(item.id) ? { ...item, start: rippleClipStarts[item.id] + rippleDelta } : item;
      }),
    }));
    const sceneInstances = (value?.sceneInstances || []).map((instance) => {
      const sceneIndex = orderedScenes.findIndex((item) => item.id === instance.sceneId);
      const currentSceneStart = sceneIndex < 0 ? 0 : orderedScenes.slice(0, sceneIndex)
        .reduce((sum, scene, index) => sum + (sceneSegments[index]?.duration ?? scene.duration), 0);
      if (instance.videoClips?.length) {
        return {
          ...instance,
          videoClips: instance.videoClips.map((item) => {
            if (item.id === clip.id) return { ...item, start: start - currentSceneStart, duration, sourceIn, sourceOut };
            return rippleIds.has(item.id) ? { ...item, start: rippleClipStarts[item.id] + rippleDelta } : item;
          }),
        };
      }
      if (instance.id === clip.id) {
        return {
          ...instance,
          videoClips: [{
            id: clip.id,
            name: clip.name,
            start: start - currentSceneStart,
            duration,
            sourceIn,
            sourceOut,
            assetId: instance.assetId,
            assetVersionId: instance.assetVersionId,
            assetMimeType: instance.assetMimeType,
            mediaKind: clip.mediaKind,
          }],
        };
      }
      return instance;
    });
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances,
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
      videoTracks,
      textTracks: value?.textTracks || [],
    });
  };


  // After a visual trim, rebase the Scenes row so its earliest clip is 00:00.
  // Text and Audio are independent layers and must retain their absolute positions.
  const normalizeScenesOrigin = () => {
    const visualClips = visibleVideoTracks.flatMap((track) => track.clips);
    if (!visualClips.length) return;
    const earliestStart = Math.min(...visualClips.map((item) => item.start));
    if (!Number.isFinite(earliestStart) || Math.abs(earliestStart) < 0.0001) return;

    const offset = -earliestStart;
    const videoTracks = (value?.videoTracks || []).map((track) => ({
      ...track,
      clips: track.clips.map((item) => ({ ...item, start: Math.max(0, item.start + offset) })),
    }));
    const sceneInstances = (value?.sceneInstances || []).map((instance) => {
      const sceneIndex = orderedScenes.findIndex((item) => item.id === instance.sceneId);
      if (instance.videoClips?.length) {
        return {
          ...instance,
          videoClips: instance.videoClips.map((item) => ({
            ...item,
            start: Math.max(0, item.start + offset),
          })),
        };
      }
      if (instance.assetId && instance.assetVersionId &&
        (instance.assetMimeType?.toLowerCase().startsWith('video/') || instance.assetMimeType?.toLowerCase().startsWith('image/'))) {
        const sourceIn = instance.videoSourceIn ?? 0;
        const sourceOut = instance.videoSourceOut ?? (orderedScenes[sceneIndex]?.duration ?? 0);
        return {
          ...instance,
          videoClips: [{
            id: instance.id,
            name: orderedScenes[sceneIndex]?.title || 'Scene media',
            start: offset,
            duration: Math.max(0.1, Math.min(orderedScenes[sceneIndex]?.duration ?? sourceOut - sourceIn, sourceOut - sourceIn)),
            sourceIn,
            sourceOut,
            assetId: instance.assetId,
            assetVersionId: instance.assetVersionId,
            assetMimeType: instance.assetMimeType,
            mediaKind: instance.assetMimeType?.toLowerCase().startsWith('image/') ? 'image' as const : 'video' as const,
          }],
        };
      }
      return instance;
    });

    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances,
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
      videoTracks,
      textTracks: value?.textTracks || [],
    });
  };

  const normalizeAudioTrackOrigin = (trackId: string) => {
    const track = (value?.audioTracks || []).find((item) => item.id === trackId);
    if (!track?.clips.length) return;
    const earliestStart = Math.min(...track.clips.map((item) => item.start));
    if (!Number.isFinite(earliestStart) || Math.abs(earliestStart) < 0.0001) return;
    const offset = -earliestStart;
    const audioTracks = (value?.audioTracks || []).map((item) => item.id !== trackId ? item : ({
      ...item,
      clips: item.clips.map((clip) => ({ ...clip, start: clip.start + offset })),
    }));
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: value?.transitions || {},
      audioTracks,
      videoTracks: value?.videoTracks || [],
      textTracks: value?.textTracks || [],
    });
  };

  const normalizeTextTrackOrigin = (trackId: string) => {
    const track = (value?.textTracks || []).find((item) => item.id === trackId);
    if (!track?.clips.length) return;
    const earliestStart = Math.min(...track.clips.map((item) => item.start));
    if (!Number.isFinite(earliestStart) || Math.abs(earliestStart) < 0.0001) return;
    const offset = -earliestStart;
    const textTracks = (value?.textTracks || []).map((item) => item.id !== trackId ? item : ({
      ...item,
      clips: item.clips.map((clip) => ({ ...clip, start: clip.start + offset })),
    }));
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
      videoTracks: value?.videoTracks || [],
      textTracks,
    });
  };

  const activeImageClip = [...visibleVideoTracks].reverse().flatMap((track) => track.clips)
    .find((clip) => (clip.mediaKind === 'image' || clip.assetMimeType?.toLowerCase().startsWith('image/')) &&
      !clip.isPlaceholder && clip.start <= timelinePlayheadTime &&
      clip.start + clip.duration > timelinePlayheadTime && Boolean(clip.assetId && clip.assetVersionId));
  useEffect(() => {
    let cancelled = false;
    if (!supabase || !activeImageClip?.assetId || !activeImageClip.assetVersionId) {
      setImagePreviewUrl(null);
      return;
    }
    void createVyralImagePlaybackUrl(supabase, { assetId: activeImageClip.assetId, versionId: activeImageClip.assetVersionId })
      .then((result) => { if (!cancelled) setImagePreviewUrl(result.signedUrl); })
      .catch(() => { if (!cancelled) setImagePreviewUrl(null); });
    return () => { cancelled = true; };
  }, [activeImageClip?.assetId, activeImageClip?.assetVersionId]);

  const visualContentEnd = visibleVideoTracks.flatMap((track) => track.clips)
    .reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  const timelineDuration = Math.max(totalDuration, visualContentEnd);
  const timelineWidth = timelineDuration * pixelsPerSecond;
  const stopMasterTimelinePlayback = () => {
    masterPlaybackRequestIdRef.current += 1;
    masterPlaybackSeekPendingRef.current = false;
    if (masterPlaybackSeekTimerRef.current) {
      clearTimeout(masterPlaybackSeekTimerRef.current);
      masterPlaybackSeekTimerRef.current = null;
    }
    if (masterPlaybackFrameRef.current !== null) {
      cancelAnimationFrame(masterPlaybackFrameRef.current);
      masterPlaybackFrameRef.current = null;
    }
    masterPlaybackClockRef.current = null;
    masterPlaybackTickRef.current = null;
    masterPreviewTextSignatureRef.current = '';
    setMasterPreviewTextOverlays([]);
    masterPlaybackHandleRef.current?.stop();
    masterPlaybackHandleRef.current = null;
    masterVideoPlaybackHandleRef.current?.stop();
    masterVideoPlaybackHandleRef.current = null;
    setMasterPlaybackState('idle');
  };

  const launchMasterTimelinePlayback = async (requestedStart?: number) => {
    masterPlaybackSeekPendingRef.current = false;
    if (!supabase) { setMasterPlaybackError('Private Vyral Asset Storage is not configured.'); return; }
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) { setMasterPlaybackError('This browser does not support multi-track Audio playback.'); return; }
    const timelineStart = Math.max(0, Math.min(totalDuration, requestedStart ?? ((scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecondRef.current)));
    const audioPlan = buildMasterTimelineAudioPlaybackPlan({ audioTracks: value?.audioTracks || [] }, timelineStart);
    const videoPlan = buildMasterTimelineVideoPlaybackPlan(orderedScenes, value?.sceneInstances, timelineStart, value?.videoTracks || []);
    if (!audioPlan.length && !videoPlan.length) {
      setMasterPlaybackError('There are no verified Audio or Video Asset clips after the current Playhead.');
      setMasterPlaybackState('idle');
      return;
    }
    if (videoPlan.length && !masterVideoPreviewRef.current) {
      setMasterPlaybackError('The Master Timeline Video preview is not available.');
      setMasterPlaybackState('idle');
      return;
    }
    setMasterPlaybackError('');
    setMasterPlaybackState('loading');
    const requestId = ++masterPlaybackRequestIdRef.current;
    try {
      const context = masterAudioContextRef.current || new AudioContextConstructor();
      masterAudioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      if (requestId !== masterPlaybackRequestIdRef.current) return;
      let handle: AudioPlaybackHandle | null = null;
      if (audioPlan.length) {
        handle = startMasterTimelineAudioPlayback(audioPlan, {
        context,
        resolveAssetUrl: async (assetId, assetVersionId, signal) => {
          if (signal.aborted) throw new DOMException('Playback cancelled.', 'AbortError');
          const result = await createVyralAudioPlaybackUrl(supabase, { assetId, versionId: assetVersionId });
          if (signal.aborted) throw new DOMException('Playback cancelled.', 'AbortError');
          return result.signedUrl;
        },
        fetchAudio: async (url, signal) => {
          const response = await fetch(url, { cache: 'no-store', signal });
          if (!response.ok) throw new Error('A private Audio Asset could not be downloaded for playback.');
          return response.arrayBuffer();
        },
      });
        masterPlaybackHandleRef.current = handle;
        await handle.ready;
        if (requestId !== masterPlaybackRequestIdRef.current || masterPlaybackHandleRef.current !== handle) {
          handle.stop();
          return;
        }
      }
      let videoHandle: MasterTimelineVideoPlaybackHandle | null = null;
      if (videoPlan.length && masterVideoPreviewRef.current) {
        videoHandle = startMasterTimelineVideoPlayback(videoPlan, {
          video: masterVideoPreviewRef.current,
          resolveAssetUrl: async (assetId, assetVersionId, signal) => {
            if (signal.aborted) throw new DOMException('Playback cancelled.', 'AbortError');
            const result = await createVyralVideoPlaybackUrl(supabase, { assetId, versionId: assetVersionId });
            if (signal.aborted) throw new DOMException('Playback cancelled.', 'AbortError');
            return result.signedUrl;
          },
          onError: (error) => setMasterPlaybackError(error.message),
        });
        masterVideoPlaybackHandleRef.current = videoHandle;
      }
      if (requestId !== masterPlaybackRequestIdRef.current) {
        handle?.stop();
        videoHandle?.stop();
        return;
      }
      const contextStart = handle?.startTime ?? (context.currentTime + 0.05);
      masterPlaybackClockRef.current = { contextStart, timelineStart };
      setMasterPlaybackState('playing');
      const tick = () => {
        if ((!masterPlaybackHandleRef.current && !masterVideoPlaybackHandleRef.current) || context.state !== 'running') return;
        const clock = masterPlaybackClockRef.current;
        if (!clock) return;
        const elapsed = Math.max(0, context.currentTime - clock.contextStart);
        const currentTime = Math.min(totalDuration, clock.timelineStart + elapsed);
        masterVideoPlaybackHandleRef.current?.sync(currentTime);
        const textOverlays = buildMasterTimelineTextOverlay(textTracks, currentTime);
        const textSignature = JSON.stringify(textOverlays);
        if (textSignature !== masterPreviewTextSignatureRef.current) {
          masterPreviewTextSignatureRef.current = textSignature;
          setMasterPreviewTextOverlays(textOverlays);
        }
        const targetScroll = currentTime * pixelsPerSecondRef.current;
        setTimelinePlayheadTime(currentTime);
        const scrollElement = scrollRef.current;
        if (scrollElement && Math.abs(scrollElement.scrollLeft - targetScroll) > 0.5) {
          masterPlaybackProgrammaticScrollRef.current = targetScroll;
          scrollElement.scrollLeft = targetScroll;
        }
        if (currentTime >= totalDuration) {
          stopMasterTimelinePlayback();
          return;
        }
        masterPlaybackFrameRef.current = requestAnimationFrame(tick);
      };
      masterPlaybackTickRef.current = tick;
      masterPlaybackFrameRef.current = requestAnimationFrame(tick);
      // Audio clips may end before the Scene sequence. Keep the transport and
      // Playhead running until totalDuration; the animation tick owns completion.
    } catch (error) {
      if (requestId !== masterPlaybackRequestIdRef.current) return;
      stopMasterTimelinePlayback();
      masterPlaybackHandleRef.current?.stop();
      masterPlaybackHandleRef.current = null;
      masterVideoPlaybackHandleRef.current?.stop();
      masterVideoPlaybackHandleRef.current = null;
      setMasterPlaybackError(error instanceof Error ? error.message : 'Master Timeline media playback failed.');
    }
  };

  const pauseMasterTimelinePlayback = async () => {
    if (masterPlaybackFrameRef.current !== null) {
      cancelAnimationFrame(masterPlaybackFrameRef.current);
      masterPlaybackFrameRef.current = null;
    }
    const context = masterAudioContextRef.current;
    const handle = masterPlaybackHandleRef.current;
    const videoHandle = masterVideoPlaybackHandleRef.current;
    if (!context || (!handle && !videoHandle)) return;
    videoHandle?.pause();
    try {
      await context.suspend();
      if (masterPlaybackHandleRef.current === handle && masterVideoPlaybackHandleRef.current === videoHandle) setMasterPlaybackState('paused');
    } catch (error) {
      setMasterPlaybackError(error instanceof Error ? error.message : 'Could not pause Audio playback.');
    }
  };

  const resumeMasterTimelinePlayback = async () => {
    const context = masterAudioContextRef.current;
    const handle = masterPlaybackHandleRef.current;
    const videoHandle = masterVideoPlaybackHandleRef.current;
    if (!context || (!handle && !videoHandle)) {
      await launchMasterTimelinePlayback();
      return;
    }
    try {
      await context.resume();
      if (masterPlaybackHandleRef.current !== handle || masterVideoPlaybackHandleRef.current !== videoHandle) return;
      videoHandle?.resume();
      setMasterPlaybackState('playing');
      masterPlaybackTickRef.current?.();
    } catch (error) {
      setMasterPlaybackError(error instanceof Error ? error.message : 'Could not resume Audio playback.');
    }
  };

  const startMasterTimelinePlayback = async () => {
    if (masterPlaybackState === 'loading') {
      stopMasterTimelinePlayback();
      return;
    }
    if (masterPlaybackState === 'playing') {
      await pauseMasterTimelinePlayback();
      return;
    }
    if (masterPlaybackState === 'paused') {
      await resumeMasterTimelinePlayback();
      return;
    }
    await launchMasterTimelinePlayback();
  };

  const handleMasterTimelineScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setTimelinePlayheadTime(Math.max(0, element.scrollLeft / pixelsPerSecondRef.current));
    const programmed = masterPlaybackProgrammaticScrollRef.current;
    if (programmed !== null && Math.abs(element.scrollLeft - programmed) < 1) {
      masterPlaybackProgrammaticScrollRef.current = null;
      return;
    }
    masterPlaybackProgrammaticScrollRef.current = null;

    // Magnetic timeline scrolling: when any clip boundary across the visual,
    // audio, or text tracks comes within 12 screen pixels of the fixed playhead,
    // pull the timeline so that boundary aligns exactly with the playhead.
    // The leading half-viewport spacer is already accounted for by this
    // coordinate system, so the matching scroll offset is boundaryTime * scale.
    if (masterPlaybackState !== 'playing' && masterPlaybackState !== 'loading') {
      const scale = pixelsPerSecondRef.current;
      const playheadTime = Math.max(0, element.scrollLeft / scale);
      const clipBoundaries = [
        ...(value?.videoTracks || []).flatMap((track) => track.clips.flatMap((clip) => [clip.start, clip.start + clip.duration])),
        ...(value?.audioTracks || []).flatMap((track) => track.clips.flatMap((clip) => [clip.start, clip.start + clip.duration])),
        ...(value?.textTracks || []).flatMap((track) => track.clips.flatMap((clip) => [clip.start, clip.start + clip.duration])),
      ].filter((time) => Number.isFinite(time) && time >= 0);
      let nearestBoundary: number | null = null;
      let nearestDistance = 12 / scale;
      for (const boundary of clipBoundaries) {
        const distance = Math.abs(boundary - playheadTime);
        if (distance <= nearestDistance) {
          nearestDistance = distance;
          nearestBoundary = boundary;
        }
      }
      if (nearestBoundary !== null) {
        const snappedScrollLeft = Math.max(0, nearestBoundary * scale);
        if (Math.abs(element.scrollLeft - snappedScrollLeft) > 0.5) {
          element.scrollLeft = snappedScrollLeft;
          setTimelinePlayheadTime(nearestBoundary);
        }
      }
    }

    if (masterPlaybackState === 'paused') {
      // A manual seek while paused invalidates the old suspended sources.
      // The next Play starts cleanly from the newly selected Playhead time.
      stopMasterTimelinePlayback();
      return;
    }
    if (masterPlaybackState !== 'playing' && masterPlaybackState !== 'loading' && !masterPlaybackSeekPendingRef.current) return;
    if (masterPlaybackSeekTimerRef.current) clearTimeout(masterPlaybackSeekTimerRef.current);
    if (!masterPlaybackSeekPendingRef.current) {
      stopMasterTimelinePlayback();
      masterPlaybackSeekPendingRef.current = true;
    }
    masterPlaybackSeekTimerRef.current = setTimeout(() => {
      masterPlaybackSeekTimerRef.current = null;
      masterPlaybackSeekPendingRef.current = false;
      const seekTime = Math.max(0, (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecondRef.current);
      void launchMasterTimelinePlayback(seekTime);
    }, 180);
  };
  const leadingSpace = viewportWidth / 2;
  // Adapt ruler spacing to zoom level so labels stay readable.
  const rulerStep = pixelsPerSecond >= 56 ? 1 : pixelsPerSecond >= 28 ? 2 : pixelsPerSecond >= 14 ? 5 : pixelsPerSecond >= 8 ? 10 : 20;
  const rulerTicks = Array.from({ length: Math.floor(timelineDuration / rulerStep) + 1 }, (_, index) => index * rulerStep);
  const formatRulerTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
  };
  // Magnetic trim snapping: the playhead is fixed at the viewport center.
  // Snap within 10 screen pixels so the behavior stays consistent at every zoom level.
  const snapTrimPointToPlayhead = (time: number) => {
    const scale = pixelsPerSecondRef.current;
    const playheadTime = (scrollRef.current?.scrollLeft ?? 0) / scale;
    return Math.abs(time - playheadTime) * scale <= 10 ? playheadTime : time;
  };

  const selectedScenes = orderedScenes.filter((scene) => selectedSceneIds.includes(scene.id));
  const transitionOptions = [
    { label: 'Dissolve', value: 'dissolve' },
    { label: 'Fade', value: 'fade' },
    { label: 'Wipe', value: 'wipe' },
    { label: 'Slide', value: 'slide' },
    { label: 'Zoom', value: 'zoom' },
    { label: 'Blur', value: 'blur' },
  ];
  const selectedTransition = selectedTransitionKey ? value?.transitions?.[selectedTransitionKey] : undefined;
  const selectedAudioClipRecord = selectedAudioClip
    ? (value?.audioTracks || []).find((track) => track.id === selectedAudioClip.trackId)?.clips.find((clip) => clip.id === selectedAudioClip.clipId) ?? null
    : null;
  const selectedAudioClipKey = selectedAudioClip ? selectedAudioClip.trackId + ':' + selectedAudioClip.clipId : null;
  const stopAudioPreview = () => {
    const audio = audioPreviewRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    setAudioPreviewPlaying(false);
    setAudioPreviewLoading(false);
    setAudioPreviewClipKey(null);
  };
  const toggleSelectedAudioPreview = async () => {
    if (masterPlaybackState !== 'idle') stopMasterTimelinePlayback();
    const clip = selectedAudioClipRecord;
    const audio = audioPreviewRef.current;
    if (!clip || !clip.assetId || !clip.assetVersionId || !audio) {
      setAudioPreviewError('This clip has no verified Vyral Audio Asset source.');
      return;
    }
    if (!supabase) { setAudioPreviewError('Private Audio Storage is not configured.'); return; }
    setAudioPreviewError('');
    if (audioPreviewClipKey === selectedAudioClipKey && audio.src) {
      if (audio.paused) {
        try { if (audio.ended) audio.currentTime = 0; await audio.play(); setAudioPreviewPlaying(true); }
        catch { audio.pause(); audio.removeAttribute('src'); audio.load(); setAudioPreviewClipKey(null); setAudioPreviewError('Audio preview could not start. Tap Play to refresh the secure link.'); }
      } else {
        audio.pause(); setAudioPreviewPlaying(false);
      }
      return;
    }
    setAudioPreviewLoading(true);
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      const result = await createVyralAudioPlaybackUrl(supabase, { assetId: clip.assetId, versionId: clip.assetVersionId });
      audio.src = result.signedUrl;
      audio.load();
      setAudioPreviewClipKey(selectedAudioClipKey);
      await audio.play();
      setAudioPreviewPlaying(true);
    } catch (error) {
      audio.pause(); audio.removeAttribute('src'); audio.load();
      setAudioPreviewPlaying(false);
      setAudioPreviewClipKey(null);
      setAudioPreviewError(error instanceof Error ? error.message : 'Audio preview is unavailable.');
    } finally { setAudioPreviewLoading(false); }
  };
  useEffect(() => {
    if (audioPreviewClipKey && audioPreviewClipKey !== selectedAudioClipKey) stopAudioPreview();
  }, [audioPreviewClipKey, selectedAudioClipKey]);
  useEffect(() => () => {
    const audio = audioPreviewRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (masterPlaybackFrameRef.current !== null) cancelAnimationFrame(masterPlaybackFrameRef.current);
    if (masterPlaybackSeekTimerRef.current) clearTimeout(masterPlaybackSeekTimerRef.current);
    masterPlaybackHandleRef.current?.stop();
    masterVideoPlaybackHandleRef.current?.stop();
    void masterAudioContextRef.current?.close();
  }, []);
  const applyTransition = (effect: string) => {
    if (!selectedTransitionKey) return;
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: {
        ...(value?.transitions || {}),
        [selectedTransitionKey]: { effect, duration: selectedTransition?.duration ?? 0.5 },
      },
      audioTracks: value?.audioTracks || [],
      videoTracks: value?.videoTracks || [],
      textTracks: value?.textTracks || [],
    });
  };
  const removeTransition = () => {
    if (!selectedTransitionKey) return;
    const transitions = Object.fromEntries(
      Object.entries(value?.transitions || {}).filter(([key]) => key !== selectedTransitionKey),
    );
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions,
      audioTracks: value?.audioTracks || [],
      videoTracks: value?.videoTracks || [],
      textTracks: value?.textTracks || [],
    });
  };
  const readMediaDuration = (file: File, kind: 'video' | 'audio' | 'image'): Promise<number> => {
    if (kind === 'image') return Promise.resolve(5);
    return new Promise((resolve) => {
      const element = kind === 'video' ? document.createElement('video') : document.createElement('audio');
      const objectUrl = URL.createObjectURL(file);
      element.preload = 'metadata';
      element.onloadedmetadata = () => {
        const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 5;
        URL.revokeObjectURL(objectUrl);
        resolve(duration);
      };
      element.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(5);
      };
      element.src = objectUrl;
    });
  };

  const handleMediaFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (!supabase || !vyralId) {
      setMediaUploadError('Open this Project’s Vyral before uploading media.');
      return;
    }
    setMediaUploadBusy(true);
    setMediaUploadError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sign in again before uploading media.');
      let nextVideoTracks = value?.videoTracks || [];
      let nextAudioTracks = value?.audioTracks || [];
      for (const file of files) {
        const mime = file.type.toLowerCase();
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const kind: 'video' | 'image' | 'audio' | null =
          mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(extension) ? 'video' :
          mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(extension) ? 'image' :
          mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(extension) ? 'audio' : null;
        if (!kind) throw new Error(file.name + ' is not a supported Video, Image or Audio file.');
        if (file.size <= 0 || file.size > 100 * 1024 * 1024) throw new Error(file.name + ' is empty or exceeds the 100 MB upload limit.');
        const mimeByExtension: Record<string, string> = {
          mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
          mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
        };
        const normalizedFile = file.type.toLowerCase().startsWith(kind + '/')
          ? file
          : new File([file], file.name, { type: mimeByExtension[extension] || (kind + '/octet-stream') });
        const duration = await readMediaDuration(normalizedFile, kind);
        const ingestion = await ingestVyralAsset(createSupabaseVyralAssetIngestionPort(supabase), {
          vyralId,
          userId: authData.user.id,
          folderId: null,
          file: normalizedFile,
        });
        const clipDuration = kind === 'audio' ? (ingestion.audioTechnicalMetadata?.durationSeconds ?? duration) : kind === 'video' ? (ingestion.videoTechnicalMetadata?.durationSeconds ?? duration) : duration;
        // Visual uploads always append after the final Scene-row clip; audio keeps playhead placement.
        const existingVisualClips = mergeTimelineVideoRows(directorVideoTrack?.clips || [], nextVideoTracks).flatMap((track) => track.clips);
        const start = kind === 'audio'
          ? Math.max(0, (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecondRef.current)
          : existingVisualClips.reduce((end, existing) => Math.max(end, existing.start + existing.duration), 0);
        const clip: TimelineClip = {
          id: crypto.randomUUID(),
          name: file.name,
          content: file.name,
          start,
          duration: clipDuration,
          sourceIn: 0,
          sourceOut: clipDuration,
          assetId: ingestion.assetId,
          assetVersionId: ingestion.versionId,
          assetMimeType: ingestion.mimeType,
          waveform: ingestion.audioTechnicalMetadata?.waveformPeaks || [],
          mediaKind: kind,
        };
        const currentTracks = kind === 'audio' ? nextAudioTracks : nextVideoTracks;
        const placement = placeTimelineMediaClip(currentTracks, clip, kind, () => crypto.randomUUID());
        if (kind === 'audio') nextAudioTracks = placement.tracks as TimelineTrack[];
        else nextVideoTracks = placement.tracks as TimelineTrack[];
        const nextTransitions = { ...(value?.transitions || {}) };
        commitChange({
          sceneRanges: value?.sceneRanges || {},
          sceneInstances: value?.sceneInstances,
          videoTracks: nextVideoTracks,
          transitions: nextTransitions,
          audioTracks: nextAudioTracks,
          textTracks: value?.textTracks || [],
        });
      }
    } catch (error) {
      setMediaUploadError(error instanceof Error ? error.message : 'Media upload failed.');
    } finally {
      setMediaUploadBusy(false);
    }
  };

  const addAudioClip = () => {
    const start = Math.max(0, (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond);
    const duration = 10;
    const nextTrackId = crypto.randomUUID();
    const nextTrack: TimelineTrack = {
      id: nextTrackId,
      name: 'Audio',
      clips: [{ id: crypto.randomUUID(), name: 'New Audio', content: 'New Audio', start, duration, waveform: [] }],
    };
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, videoTracks: value?.videoTracks || [], transitions: value?.transitions || {}, audioTracks: [...(value?.audioTracks || []), nextTrack], textTracks: value?.textTracks || [] });
    revealNewTimelineRow('audio', nextTrackId);
  };

  const runDeleteSelectedAudio = () => {
    if (!selectedAudioClip) return;
    const audioTracks = (value?.audioTracks || []).map((track) => track.id !== selectedAudioClip.trackId ? track : { ...track, clips: track.clips.filter((clip) => clip.id !== selectedAudioClip.clipId) }).filter((track) => track.clips.length > 0);
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, videoTracks: value?.videoTracks || [], audioTracks, textTracks: value?.textTracks || [] });
    setSelectedAudioClip(null);
  };

  const runCloneSelectedAudio = () => {
    if (!selectedAudioClip) return;
    const tracks = value?.audioTracks || [];
    const sourceTrack = tracks.find((track) => track.id === selectedAudioClip.trackId);
    const source = sourceTrack?.clips.find((clip) => clip.id === selectedAudioClip.clipId);
    if (!source || !sourceTrack) return;
    const cloneStart = sourceTrack.clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);

    const cloneId = crypto.randomUUID();
    const audioTracks = tracks.map((track) => track.id !== sourceTrack.id ? track : { ...track, clips: [...track.clips, { ...source, id: cloneId, start: cloneStart }] });
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, videoTracks: value?.videoTracks || [], audioTracks, textTracks: value?.textTracks || [] });
    setSelectedAudioClip({ trackId: sourceTrack.id, clipId: cloneId });
  };

  const beginAudioLongPress = (event: React.PointerEvent<HTMLDivElement>, trackId: string, clip: TimelineClip) => {
    if (textDragRef.current?.active) return;
    if ((event.target as HTMLElement).closest('[data-audio-trim-handle]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (audioDragRef.current?.timer) clearTimeout(audioDragRef.current.timer);
    const clipElement = event.currentTarget;
    const rect = clipElement.getBoundingClientRect();
    const audioTracksAtStart = value?.audioTracks || [];
    const drag = { timer: null as ReturnType<typeof setTimeout> | null, active: false, moved: false, pointerId: event.pointerId, clipId: clip.id, trackId, createdTrackId: null as string | null, originalTrack: audioTracksAtStart.find((track) => track.id === trackId)!, originalTrackIndex: audioTracksAtStart.findIndex((track) => track.id === trackId), originalStart: clip.start, offsetX: event.clientX - rect.left, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
    audioDragRef.current = drag;
    drag.timer = setTimeout(() => {
      if (audioDragRef.current !== drag) return;
      drag.active = true;
      scrollRef.current?.setPointerCapture(event.pointerId);
      setDraggingTextClipId(clip.id);
      setTextDragYOffset(0);
      setSelectedSceneIds([]);
      setSelectedTransitionKey(null);
      setSelectedTextClip(null);
      setSelectedAudioClip({ trackId, clipId: clip.id });
    }, 350);
  };

  const moveAudioLongPress = (event: React.PointerEvent<HTMLDivElement>, clip: TimelineClip) => {
    const drag = audioDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const distanceFromStart = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distanceFromStart > 8) {
        // This pointer movement is handled as timeline scrolling, not a tap.
        // Lock selection immediately, before the scroll event or click can fire.
        suppressTextClickRef.current = true;
        if (drag.timer) clearTimeout(drag.timer);
        drag.timer = null;
        drag.moved = true;
        if (!pinchRef.current) {
          const scrollElement = scrollRef.current;
          if (scrollElement) {
            event.preventDefault();
            scrollElement.scrollLeft -= event.clientX - drag.lastX;
            scrollElement.scrollTop -= event.clientY - drag.lastY;
          }
        }
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    event.preventDefault(); event.stopPropagation(); drag.moved = true;
    scheduleDragAutoScroll('audio', event, clip);
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const scrollRect = scrollElement.getBoundingClientRect();
    const rows = Array.from(scrollElement.querySelectorAll<HTMLElement>('[data-audio-track-id]'));
    const tolerance = 10;
    const destination = rows.map((element) => { const rect = element.getBoundingClientRect(); return { element, rect, distance: Math.abs(event.clientY - (rect.top + rect.height / 2)) }; })
      .filter(({ rect }) => event.clientY >= rect.top - tolerance && event.clientY <= rect.bottom + tolerance)
      .sort((a, b) => a.distance - b.distance)[0]?.element;
    let destinationTrackId = destination?.dataset.audioTrackId;
    let destinationCenterY = destination ? destination.getBoundingClientRect().top + destination.getBoundingClientRect().height / 2 : 0;
    if (!destination && rows.length) {
      const firstRect = rows[0].getBoundingClientRect();
      const lastRect = rows[rows.length - 1].getBoundingClientRect();
      const aboveFirst = event.clientY >= firstRect.top - firstRect.height - tolerance && event.clientY < firstRect.top - tolerance;
      const belowLast = event.clientY > lastRect.bottom + tolerance && event.clientY <= lastRect.bottom + lastRect.height + tolerance;
      if (aboveFirst || belowLast) {
        const insertAtTop = aboveFirst;
        destinationTrackId = drag.createdTrackId || crypto.randomUUID();
        destinationCenterY = insertAtTop
          ? firstRect.top - firstRect.height / 2
          : lastRect.bottom + lastRect.height / 2;
        if (!drag.createdTrackId) {
          drag.createdTrackId = destinationTrackId;
          const contentX = event.clientX - scrollRect.left + scrollElement.scrollLeft;
          const nextStart = Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond);
          const current = value?.audioTracks || [];
          const remainingTracks = current.filter((track) => track.id !== drag.trackId || track.clips.length > 1)
            .map((track) => track.id !== drag.trackId ? track : { ...track, clips: track.clips.filter((item) => item.id !== clip.id) });
          const newTrack = { id: destinationTrackId, name: 'Audio', clips: [{ ...clip, start: nextStart }] };
          const nextTracks = insertAtTop ? [newTrack, ...remainingTracks] : [...remainingTracks, newTrack];
          commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, videoTracks: value?.videoTracks || [], textTracks: value?.textTracks || [] });
          drag.trackId = destinationTrackId;
          setSelectedAudioClip({ trackId: destinationTrackId, clipId: clip.id });
          revealNewTimelineRow('audio', destinationTrackId);
        }
      }
    }
    if (!destinationTrackId) return;
    setTextDragYOffset(Math.max(-tolerance, Math.min(tolerance, event.clientY - destinationCenterY)));
    const contentX = event.clientX - scrollRect.left + scrollElement.scrollLeft;
    const nextStart = Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond);
    const current = value?.audioTracks || [];
    const destinationTrack = current.find((track) => track.id === destinationTrackId);
    if (!destinationTrack) return;
    const nextTracks = current.map((track) => {
      if (track.id === drag.trackId && track.id === destinationTrackId) return { ...track, clips: track.clips.map((item) => item.id === clip.id ? { ...item, start: nextStart } : item) };
      if (track.id === drag.trackId) return { ...track, clips: track.clips.filter((item) => item.id !== clip.id) };
      if (track.id === destinationTrackId) return { ...track, clips: [...track.clips, { ...clip, start: nextStart }] };
      return track;
    }).filter((track) => track.clips.length > 0 || track.id === drag.originalTrack.id);
    if (destinationTrackId !== drag.trackId) { drag.trackId = destinationTrackId; setSelectedAudioClip({ trackId: destinationTrackId, clipId: clip.id }); }
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, videoTracks: value?.videoTracks || [], textTracks: value?.textTracks || [] });
  };


  // Clips may freely pass over one another while dragging. On release, move
  // the clip immediately before or after a collided clip when that side is free.
  // The right side may extend beyond the current Scene/timeline end; only restore
  // the original position when both adjacent sides are blocked.
  const nearestFreeClipStart = (clips: TimelineClip[], clipId: string, desiredStart: number, duration: number) => {
    const occupied = clips.filter((item) => item.id !== clipId).sort((a, b) => a.start - b.start);
    const desiredEnd = desiredStart + duration;
    const collided = occupied.filter((item) =>
      desiredStart < item.start + item.duration - 0.001 &&
      desiredEnd > item.start + 0.001
    );
    if (collided.length === 0) return desiredStart;
    // If the dropped clip overlaps multiple clips, it was placed into a gap
    // that is too small for its duration. Do not jump it to the end of the row;
    // let settleClipDrop restore its original position instead.
    if (collided.length > 1) return null;

    const candidates = collided
      .flatMap((item) => [item.start - duration, item.start + item.duration])
      .filter((start) => start >= 0)
      .filter((start) => occupied.every((item) =>
        start + duration <= item.start + 0.001 ||
        start >= item.start + item.duration - 0.001
      ))
      .sort((a, b) => Math.abs(a - desiredStart) - Math.abs(b - desiredStart));
    return candidates[0] ?? null;
  };

  const settleClipDrop = (kind: 'text' | 'audio', drag: NonNullable<typeof textDragRef.current>) => {
    const tracks = kind === 'text' ? (value?.textTracks || []) : (value?.audioTracks || []);
    const destination = tracks.find((track) => track.id === drag.trackId);
    const originalClip = drag.originalTrack.clips.find((clip) => clip.id === drag.clipId);
    // Never abandon a dragged clip if an intermediate render temporarily
    // removes it from the destination row.
    const droppedClip = destination?.clips.find((clip) => clip.id === drag.clipId) || originalClip;
    if (!droppedClip) return;
    let resolvedStart = destination
      ? nearestFreeClipStart(destination.clips, drag.clipId, droppedClip.start, droppedClip.duration)
      : null;
    let resolvedTrackId = destination?.id || drag.originalTrack.id;
    let nextTracks = tracks;
    if (resolvedStart === null) {
      // If the destination has no room, restore the clip to its exact source
      // position. Keep it even if another clip has since occupied that interval.
      resolvedStart = drag.originalStart;
      resolvedTrackId = drag.originalTrack.id;
      const original = tracks.find((track) => track.id === drag.originalTrack.id);
      if (!original) {
        nextTracks = [...tracks.slice(0, Math.max(0, Math.min(drag.originalTrackIndex, tracks.length))), {
          ...drag.originalTrack,
          clips: drag.originalTrack.clips.filter((clip) => clip.id !== drag.clipId),
        }];
      }
    }
    nextTracks = nextTracks.map((track) => {
      if (track.id === resolvedTrackId) {
        const without = track.clips.filter((clip) => clip.id !== drag.clipId);
        return { ...track, clips: [...without, { ...droppedClip, start: resolvedStart! }] };
      }
      return { ...track, clips: track.clips.filter((clip) => clip.id !== drag.clipId) };
    }).filter((track) => track.clips.length > 0);
    if (kind === 'text') {
      commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
      setSelectedTextClip({ trackId: resolvedTrackId, clipId: drag.clipId });
    } else {
      commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, videoTracks: value?.videoTracks || [], textTracks: value?.textTracks || [] });
      setSelectedAudioClip({ trackId: resolvedTrackId, clipId: drag.clipId });
    }
  };

  const endAudioLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = audioDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    stopDragAutoScroll();
    // Movement before the long-press threshold is timeline panning, not a
    // clip drag. Only commit/select a clip after the long-press actually armed.
    if (drag.active && drag.moved) { suppressTextClickRef.current = true; settleClipDrop('audio', drag); }
    if (scrollRef.current?.hasPointerCapture(event.pointerId)) scrollRef.current.releasePointerCapture(event.pointerId);
    setDraggingTextClipId(null); setTextDragYOffset(0); audioDragRef.current = null;
  };

  const runSplitSelectedAudio = () => {
    if (!selectedAudioClip) return;
    const tracks = value?.audioTracks || [];
    const track = tracks.find((item) => item.id === selectedAudioClip.trackId);
    const clip = track?.clips.find((item) => item.id === selectedAudioClip.clipId);
    if (!track || !clip) return;
    const splitTime = (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond;
    if (splitTime <= clip.start + 0.2 || splitTime >= clip.start + clip.duration - 0.2) return;
    const right = { ...clip, id: crypto.randomUUID(), start: splitTime, duration: clip.start + clip.duration - splitTime, sourceIn: (clip.sourceIn ?? 0) + (splitTime - clip.start) };
    const nextTracks = tracks.map((item) => item.id !== track.id ? item : { ...item, clips: item.clips.flatMap((entry) => entry.id !== clip.id ? [entry] : [{ ...entry, duration: splitTime - clip.start }, right]) });
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, videoTracks: value?.videoTracks || [], textTracks: value?.textTracks || [] });
    setSelectedAudioClip({ trackId: track.id, clipId: right.id });
  };

  const getSelectedVisualClip = () => visibleVideoTracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedVisualClipId) || null;

  const runCutSelectedVisual = () => {
    const selected = getSelectedVisualClip();
    if (!selected) return;
    const splitTime = (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond;
    if (splitTime <= selected.start + 0.2 || splitTime >= selected.start + selected.duration - 0.2) return;
    const leftDuration = splitTime - selected.start;
    const rightId = crypto.randomUUID();
    const rightClip: TimelineClip = {
      ...selected,
      id: rightId,
      start: selected.start + leftDuration,
      duration: selected.duration - leftDuration,
      sourceIn: (selected.sourceIn ?? 0) + leftDuration,
    };
    const directTracks = value?.videoTracks || [];
    const directTrack = directTracks.find((track) => track.clips.some((clip) => clip.id === selected.id));
    let nextTracks = directTracks;
    let nextInstances = value?.sceneInstances;
    if (directTrack) {
      nextTracks = directTracks.map((track) => track.id !== directTrack.id ? track : {
        ...track,
        clips: track.clips.flatMap((clip) => clip.id !== selected.id ? [clip] : [
          { ...clip, duration: leftDuration, sourceOut: (clip.sourceIn ?? 0) + leftDuration },
          rightClip,
        ]),
      });
    } else {
      nextInstances = (value?.sceneInstances || []).map((instance) => {
        const sourceClip = instance.videoClips?.find((clip) => clip.id === selected.id);
        if (!sourceClip) return instance;
        const localSplit = sourceClip.start + leftDuration;
        return {
          ...instance,
          videoClips: (instance.videoClips || []).flatMap((clip) => clip.id !== selected.id ? [clip] : [
            { ...clip, duration: leftDuration, sourceOut: (clip.sourceIn ?? 0) + leftDuration },
            { ...clip, id: rightId, start: localSplit, duration: selected.duration - leftDuration, sourceIn: (clip.sourceIn ?? 0) + leftDuration },
          ]),
        };
      });
    }
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: nextInstances, transitions: value?.transitions || {}, videoTracks: nextTracks, audioTracks: value?.audioTracks || [], textTracks: value?.textTracks || [] });
    setSelectedVisualClipId(rightId);
  };

  const runCloneSelectedVisual = () => {
    const selected = getSelectedVisualClip();
    if (!selected) return;
    const tracks = value?.videoTracks || [];
    const end = visibleVideoTracks.flatMap((track) => track.clips).reduce((latest, clip) => Math.max(latest, clip.start + clip.duration), 0);
    const cloneId = crypto.randomUUID();
    const clone: TimelineClip = { ...selected, id: cloneId, start: end };
    const nextTracks: TimelineTrack[] = tracks.length
      ? tracks.map((track, index) => index === 0 ? { ...track, name: 'Scenes', clips: [...track.clips, clone] } : track)
      : [{ id: crypto.randomUUID(), name: 'Scenes', clips: [clone] }];
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, videoTracks: nextTracks, audioTracks: value?.audioTracks || [], textTracks: value?.textTracks || [] });
    setSelectedVisualClipId(cloneId);
  };

  const runDeleteSelectedVisual = () => {
    const selected = getSelectedVisualClip();
    if (!selected) return;

    // Ripple-delete the selected visual clip. When it sits between two clips,
    // close the entire gap so its previous and next clips become adjacent.
    const ordered = orderedVisualClips.map((entry) => entry.clip);
    const selectedIndex = ordered.findIndex((clip) => clip.id === selected.id);
    const previousClip = selectedIndex > 0 ? ordered[selectedIndex - 1] : null;
    const nextClip = selectedIndex >= 0 ? ordered[selectedIndex + 1] || null : null;
    const rippleAmount = previousClip && nextClip
      ? Math.max(0, nextClip.start - (previousClip.start + previousClip.duration))
      : nextClip ? Math.max(0, selected.duration) : 0;
    const shiftedStarts = new Map<string, number>();
    if (nextClip && rippleAmount > 0) {
      ordered.slice(selectedIndex + 1).forEach((clip) => {
        shiftedStarts.set(clip.id, clip.start - rippleAmount);
      });
    }

    const nextTracks = (value?.videoTracks || []).map((track) => ({
      ...track,
      clips: track.clips
        .filter((clip) => clip.id !== selected.id)
        .map((clip) => shiftedStarts.has(clip.id)
          ? { ...clip, start: shiftedStarts.get(clip.id)! }
          : clip),
    })).filter((track) => track.clips.length > 0);

    const clipById = new Map(ordered.map((clip) => [clip.id, clip]));
    const nextInstances = (value?.sceneInstances || []).map((instance) => {
      const sceneIndex = orderedScenes.findIndex((scene) => scene.id === instance.sceneId);
      const sceneStart = sceneIndex < 0 ? 0 : orderedScenes.slice(0, sceneIndex)
        .reduce((sum, scene, index) => sum + (sceneSegments[index]?.duration ?? scene.duration), 0);

      if (instance.videoClips?.length) {
        return {
          ...instance,
          videoClips: instance.videoClips
            .filter((clip) => clip.id !== selected.id)
            .map((clip) => shiftedStarts.has(clip.id)
              ? { ...clip, start: shiftedStarts.get(clip.id)! - sceneStart }
              : clip),
        };
      }

      if (instance.id === selected.id) {
        return {
          ...instance,
          assetId: undefined,
          assetVersionId: undefined,
          assetMimeType: undefined,
          videoSourceIn: undefined,
          videoSourceOut: undefined,
        };
      }

      // A legacy Director clip is stored on the scene instance itself rather
      // than in videoClips. Materialize it as a scene-relative clip when ripple
      // deletion moves it, preserving its immutable Asset Version reference.
      const shiftedInstanceStart = shiftedStarts.get(instance.id);
      const legacyClip = clipById.get(instance.id);
      if (shiftedInstanceStart !== undefined && legacyClip && instance.assetId && instance.assetVersionId) {
        return {
          ...instance,
          videoClips: [{
            ...legacyClip,
            start: shiftedInstanceStart - sceneStart,
          }],
        };
      }
      return instance;
    });

    const transitions = { ...(value?.transitions || {}) };
    Object.keys(transitions).forEach((key) => {
      if (key.split(':').includes(selected.id)) delete transitions[key];
    });

    // Legacy Director transitions are keyed by scene IDs, not clip IDs.
    // Remove both boundaries belonging to the deleted scene as well.
    const selectedSceneInstance = (value?.sceneInstances || []).find((instance) =>
      instance.id === selected.id || instance.videoClips?.some((clip) => clip.id === selected.id),
    );
    const selectedSceneIndex = selectedSceneInstance
      ? orderedScenes.findIndex((scene) => scene.id === selectedSceneInstance.sceneId)
      : -1;
    const previousSceneTransition = sceneTransitionMarkers[selectedSceneIndex - 1];
    const nextSceneTransition = sceneTransitionMarkers[selectedSceneIndex];
    if (previousSceneTransition) delete transitions[previousSceneTransition.key];
    if (nextSceneTransition) delete transitions[nextSceneTransition.key];

    // The newly adjacent pair must start with no transition. "None" is
    // represented by the absence of a transition record in this timeline.
    if (previousClip && nextClip) {
      const joinedBoundary = previousClip.start + previousClip.duration;
      const legacyBoundary = sceneTransitionMarkers.find(
        (marker) => Math.abs(marker.boundary - joinedBoundary) <= 0.001,
      );
      const joinedKey = legacyBoundary?.key || (previousClip.id + ':' + nextClip.id);
      delete transitions[joinedKey];
    }

    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: nextInstances,
      transitions,
      videoTracks: nextTracks,
      audioTracks: value?.audioTracks || [],
      textTracks: value?.textTracks || [],
    });
    setSelectedVisualClipId(null);
  };

  const addSampleVisualClip = (mediaKind: 'image' | 'video') => {
    const currentTracks = value?.videoTracks || [];
    const existingClips = visibleVideoTracks.flatMap((track) => track.clips);
    const previousClip = existingClips.reduce<TimelineClip | null>((latest, clip) =>
      !latest || clip.start + clip.duration > latest.start + latest.duration ? clip : latest, null);
    const start = previousClip ? previousClip.start + previousClip.duration : 0;
    const clipId = crypto.randomUUID();
    const sampleClip: TimelineClip = {
      id: clipId,
      name: mediaKind === 'image' ? 'Image Sample' : 'Video Sample',
      start,
      duration: 3,
      mediaKind,
      isPlaceholder: true,
      content: mediaKind === 'image'
        ? 'Sample Image — visual layout preview only'
        : 'Sample Video — visual layout preview only',
    };
    const nextTracks: TimelineTrack[] = currentTracks.length
      ? currentTracks.map((track, index) => index === 0
        ? { ...track, name: 'Scenes', clips: [...track.clips, sampleClip] }
        : track)
      : [{ id: crypto.randomUUID(), name: 'Scenes', clips: [sampleClip] }];
    const nextTransitions = { ...(value?.transitions || {}) };
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: nextTransitions,
      audioTracks: value?.audioTracks || [],
      videoTracks: nextTracks,
      textTracks: value?.textTracks || [],
    });
    setSelectedSceneIds([]);
    setSelectedTransitionKey(null);
    setSelectedTextClip(null);
    setSelectedAudioClip(null);
  };

  const addTextClip = () => {
    const start = Math.max(0, scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond;
    const tracks = value?.textTracks || [];
    const nextTrackId = crypto.randomUUID();
    const nextTrack: TimelineTrack = {
      id: nextTrackId,
      name: 'Text',
      clips: [{ id: crypto.randomUUID(), name: 'Text', content: 'Text', start, duration: 3 }],
    };
    commitChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
      videoTracks: value?.videoTracks || [],
      textTracks: [...tracks, nextTrack],
    });
    revealNewTimelineRow('text', nextTrackId);
  };


  const beginTextLongPress = (event: React.PointerEvent<HTMLDivElement>, trackId: string, clip: TimelineClip) => {
    if (audioDragRef.current?.active) return;
    if ((event.target as HTMLElement).closest('[data-trim-handle]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (textDragRef.current?.timer) clearTimeout(textDragRef.current.timer);
    const targetElement = event.currentTarget;
    const rect = targetElement.getBoundingClientRect();
    const drag = {
      timer: null as ReturnType<typeof setTimeout> | null,
      active: false,
      moved: false,
      pointerId: event.pointerId,
      clipId: clip.id,
      trackId,
      createdTrackId: null,
      originalTrack: textTracks.find((track) => track.id === trackId)!,
      originalTrackIndex: textTracks.findIndex((track) => track.id === trackId),
      originalStart: clip.start,
      offsetX: event.clientX - rect.left,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    textDragRef.current = drag;
    drag.timer = setTimeout(() => {
      if (textDragRef.current !== drag) return;
      drag.active = true;
      scrollRef.current?.setPointerCapture(event.pointerId);
      setDraggingTextClipId(clip.id);
      setTextDragYOffset(0);
      setSelectedSceneIds([]);
      setSelectedTransitionKey(null);
      setSelectedTextClip({ trackId, clipId: clip.id });
    }, 350);
  };

  const moveTextLongPress = (event: React.PointerEvent<HTMLDivElement>, clip: TimelineClip) => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const distanceFromStart = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distanceFromStart > 8) {
        // This pointer movement is handled as timeline scrolling, not a tap.
        // Lock selection immediately, before the scroll event or click can fire.
        suppressTextClickRef.current = true;
        if (drag.timer) clearTimeout(drag.timer);
        drag.timer = null;
        drag.moved = true;
        if (!pinchRef.current) {
          const scrollElement = scrollRef.current;
          if (scrollElement) {
            event.preventDefault();
            scrollElement.scrollLeft -= event.clientX - drag.lastX;
            scrollElement.scrollTop -= event.clientY - drag.lastY;
          }
        }
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    drag.moved = true;
    scheduleDragAutoScroll('text', event, clip);
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const scrollRect = scrollElement.getBoundingClientRect();
    const trackElements = Array.from(scrollElement.querySelectorAll<HTMLElement>('[data-text-track-id]'));
    // During a drag, let the pointer travel slightly beyond a row's edges.
    // Outside a drag, clips remain exactly aligned with their own row.
    const rowTolerance = 10;
    const destination = trackElements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { element, rect, distance: Math.abs(event.clientY - (rect.top + rect.height / 2)) };
      })
      .filter(({ rect }) => event.clientY >= rect.top - rowTolerance && event.clientY <= rect.bottom + rowTolerance)
      .sort((a, b) => a.distance - b.distance)[0]?.element;
    let destinationTrackId = destination?.dataset.textTrackId;
    let destinationCenterY = destination
      ? destination.getBoundingClientRect().top + destination.getBoundingClientRect().height / 2
      : 0;

    // Create a row when the pointer moves one row-height beyond either
    // end of the stack. This lets users grow Text tracks upward or downward.
    if (!destination && trackElements.length > 0) {
      const firstElement = trackElements[0];
      const lastElement = trackElements[trackElements.length - 1];
      const firstRect = firstElement.getBoundingClientRect();
      const lastRect = lastElement.getBoundingClientRect();
      const aboveFirst = event.clientY >= firstRect.top - firstRect.height - rowTolerance && event.clientY < firstRect.top - rowTolerance;
      const belowLast = event.clientY > lastRect.bottom + rowTolerance && event.clientY <= lastRect.bottom + lastRect.height + rowTolerance;
      if (aboveFirst || belowLast) {
        const insertAtTop = aboveFirst;
        destinationCenterY = insertAtTop
          ? firstRect.top - firstRect.height / 2
          : lastRect.bottom + lastRect.height / 2;
        if (drag.createdTrackId) {
          // Reuse the row created earlier in this same drag.
          destinationTrackId = drag.createdTrackId;
        } else {
          const newTrackId = crypto.randomUUID();
          drag.createdTrackId = newTrackId;
          destinationTrackId = newTrackId;
          const contentX = event.clientX - scrollRect.left + scrollElement.scrollLeft;
          const nextStart = Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond);
          const remainingTracks = textTracks
            .filter((item) => item.id !== drag.trackId || item.clips.length > 1)
            .map((item) => item.id !== drag.trackId ? item : {
              ...item,
              clips: item.clips.filter((entry) => entry.id !== clip.id),
            });
          const newTrack = { id: newTrackId, name: 'Text', clips: [{ ...clip, start: nextStart }] };
          const nextTracks = insertAtTop ? [newTrack, ...remainingTracks] : [...remainingTracks, newTrack];
          commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
          drag.trackId = newTrackId;
          setSelectedTextClip({ trackId: newTrackId, clipId: clip.id });
          revealNewTimelineRow('text', newTrackId);
          return;
        }
      }
    }
    if (!destinationTrackId) return;
    // Allow a small visual overlap above/below the row while the clip is held.
    setTextDragYOffset(Math.max(-rowTolerance, Math.min(rowTolerance, event.clientY - destinationCenterY)));
    const contentX = event.clientX - scrollRect.left + scrollElement.scrollLeft;
    const nextStart = Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond);
    const destinationTrack = textTracks.find((item) => item.id === destinationTrackId);
    if (!destinationTrack) return;
    const nextTracks = textTracks.map((item) => {
      if (item.id === drag.trackId && item.id === destinationTrackId) {
        return { ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart } : entry) };
      }
      if (item.id === drag.trackId) return { ...item, clips: item.clips.filter((entry) => entry.id !== clip.id) };
      if (item.id === destinationTrackId) return { ...item, clips: [...item.clips, { ...clip, start: nextStart }] };
      return item;
    }).filter((item) => item.clips.length > 0 || item.id === drag.originalTrack.id);
    if (destinationTrackId !== drag.trackId) {
      drag.trackId = destinationTrackId;
      setSelectedTextClip({ trackId: destinationTrackId, clipId: clip.id });
    }
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
  };

  // A touch gesture that moved or pinched the timeline must never activate
  // whichever selectable item happens to be under the finger at release.
  const consumeSuppressedGestureClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!suppressTextClickRef.current) return false;
    suppressTextClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const revealNewTimelineRow = (kind: 'text' | 'audio', trackId: string) => {
    // Wait for React to render the newly-added row, then scroll only as far
    // as needed to bring that row fully into the visible timeline area.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (!element) return;
        const selector = kind === 'text' ? '[data-text-track-id]' : '[data-audio-track-id]';
        const row = Array.from(element.querySelectorAll<HTMLElement>(selector))
          .find((item) => item.dataset[kind === 'text' ? 'textTrackId' : 'audioTrackId'] === trackId);
        if (!row) return;
        const viewport = element.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const bottomOverflow = rowRect.bottom - viewport.bottom + 12;
        const topOverflow = viewport.top - rowRect.top + 12;
        if (bottomOverflow > 0) element.scrollTop += bottomOverflow;
        else if (topOverflow > 0) element.scrollTop -= topOverflow;
      });
    });
  };

  const stopDragAutoScroll = () => {
    dragAutoScrollPointerRef.current = null;
    if (dragAutoScrollFrameRef.current !== null) {
      cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }
  };

  const scheduleDragAutoScroll = (kind: 'text' | 'audio', event: React.PointerEvent<HTMLDivElement>, clip: TimelineClip) => {
    dragAutoScrollPointerRef.current = { kind, x: event.clientX, y: event.clientY, pointerId: event.pointerId, clip };
    if (processingAutoScrollTickRef.current || dragAutoScrollFrameRef.current !== null) return;

    const tick = () => {
      dragAutoScrollFrameRef.current = null;
      const pointer = dragAutoScrollPointerRef.current;
      const element = scrollRef.current;
      if (!pointer || !element) return;

      const rect = element.getBoundingClientRect();
      const edgeSize = 64;
      // Keep vertical auto-scroll deliberate on touch devices. The previous
      // per-frame speed was too high and could fling the timeline to its top.
      const maxSpeed = 6;
      const horizontalMax = Math.max(0, element.scrollWidth - element.clientWidth);
      const verticalMax = Math.max(0, element.scrollHeight - element.clientHeight);
      let dx = 0;
      let dy = 0;
      if (pointer.x < rect.left + edgeSize && element.scrollLeft > 0) {
        dx = -maxSpeed * Math.min(1, (rect.left + edgeSize - pointer.x) / edgeSize);
      } else if (pointer.x > rect.right - edgeSize && element.scrollLeft < horizontalMax) {
        dx = maxSpeed * Math.min(1, (pointer.x - (rect.right - edgeSize)) / edgeSize);
      }
      if (pointer.y < rect.top + edgeSize && element.scrollTop > 0) {
        dy = -maxSpeed * Math.min(1, (rect.top + edgeSize - pointer.y) / edgeSize);
      } else if (pointer.y > rect.bottom - edgeSize && element.scrollTop < verticalMax) {
        dy = maxSpeed * Math.min(1, (pointer.y - (rect.bottom - edgeSize)) / edgeSize);
      }

      if (dx === 0 && dy === 0) return;
      element.scrollLeft = Math.max(0, Math.min(horizontalMax, element.scrollLeft + dx));
      element.scrollTop = Math.max(0, Math.min(verticalMax, element.scrollTop + dy));

      const syntheticEvent = {
        clientX: pointer.x,
        clientY: pointer.y,
        pointerId: pointer.pointerId,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      } as React.PointerEvent<HTMLDivElement>;
      // The move handler normally schedules the next animation frame.
      // Suppress that scheduling here because this tick owns the single loop.
      processingAutoScrollTickRef.current = true;
      try {
        if (pointer.kind === 'text') moveTextLongPress(syntheticEvent, pointer.clip);
        else moveAudioLongPress(syntheticEvent, pointer.clip);
      } finally {
        processingAutoScrollTickRef.current = false;
      }

      // Keep exactly one animation-frame loop while the pointer remains
      // near an edge, even when the user holds it still.
      if (dragAutoScrollPointerRef.current) {
        dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
      }
    };

    dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
  };

  const endTextLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    stopDragAutoScroll();
    // Movement before the long-press threshold is timeline panning, not a
    // clip drag. Only commit/select a clip after the long-press actually armed.
    if (drag.active && drag.moved) { suppressTextClickRef.current = true; settleClipDrop('text', drag); }
    if (scrollRef.current?.hasPointerCapture(event.pointerId)) scrollRef.current.releasePointerCapture(event.pointerId);
    setDraggingTextClipId(null);
    setTextDragYOffset(0);
    textDragRef.current = null;
  };

  const runSplitSelectedText = () => {
    if (!selectedTextClip) return;
    const tracks = value?.textTracks || [];
    const selectedTrack = tracks.find((track) => track.id === selectedTextClip.trackId);
    const selectedClip = selectedTrack?.clips.find((clip) => clip.id === selectedTextClip.clipId);
    if (!selectedTrack || !selectedClip) return;

    // The fixed center playhead maps directly to scrollLeft / pixelsPerSecond.
    const splitTime = (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond;
    const clipEnd = selectedClip.start + selectedClip.duration;
    const minimumDuration = 0.2;
    if (splitTime <= selectedClip.start + minimumDuration || splitTime >= clipEnd - minimumDuration) return;

    const leftDuration = splitTime - selectedClip.start;
    const rightClip = {
      ...selectedClip,
      id: crypto.randomUUID(),
      start: splitTime,
      duration: clipEnd - splitTime,
    };
    const nextTracks = tracks.map((track) => track.id !== selectedTrack.id ? track : {
      ...track,
      clips: track.clips.flatMap((clip) => clip.id !== selectedClip.id ? [clip] : [
        { ...clip, duration: leftDuration },
        rightClip,
      ]),
    });
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
    setSelectedTextClip({ trackId: selectedTrack.id, clipId: rightClip.id });
  };

  const runCloneSelectedText = () => {
    if (!selectedTextClip) return;
    const tracks = value?.textTracks || [];
    const source = tracks.find((track) => track.id === selectedTextClip.trackId)?.clips.find((clip) => clip.id === selectedTextClip.clipId);
    if (!source) return;
    const cloneId = crypto.randomUUID();
    const sourceTrack = tracks.find((track) => track.id === selectedTextClip.trackId);
    const existingClips = sourceTrack?.clips || [];
    // Place the clone after the last clip in this row so it never overlaps.
    const cloneStart = existingClips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
    const nextTracks = tracks.map((track) => track.id !== selectedTextClip.trackId ? track : {
      ...track,
      clips: [...track.clips, { ...source, id: cloneId, start: cloneStart }],
    });
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
    setSelectedTextClip({ ...selectedTextClip, clipId: cloneId });
  };
  const runDeleteSelectedText = () => {
    if (!selectedTextClip) return;
    const nextTracks = (value?.textTracks || [])
      .map((track) => track.id !== selectedTextClip.trackId ? track : { ...track, clips: track.clips.filter((clip) => clip.id !== selectedTextClip.clipId) })
      .filter((track) => track.clips.length > 0);
    commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
    setSelectedTextClip(null);
  };

  const runCloneSelected = () => {
    selectedScenes.forEach((scene) => {
      const index = orderedScenes.findIndex((item) => item.id === scene.id);
      onSceneDuplicate(scene, index + 1);
    });
    setSelectedSceneIds([]);
  };
  const runDeleteSelected = () => {
    selectedScenes.forEach((scene) => onSceneDelete(scene.id));
    setSelectedSceneIds([]);
  };

  const toolbar = (
    <nav
      className="master-editor-bottom-nav relative z-20 flex w-full shrink-0 items-center justify-center gap-2 px-0 pt-2"
      style={{ paddingBottom: 0 }}
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll mx-auto flex w-max max-w-full min-w-0 items-center justify-start gap-2 overflow-x-auto px-0">
        <button type="button" title={masterPlaybackError || (masterPlaybackState === 'playing' ? 'Pause Master Timeline' : masterPlaybackState === 'paused' ? 'Resume Master Timeline' : masterPlaybackState === 'loading' ? 'Cancel media loading' : 'Play Master Timeline')} aria-label={masterPlaybackState === 'playing' ? 'Pause Master Timeline' : masterPlaybackState === 'paused' ? 'Resume Master Timeline' : masterPlaybackState === 'loading' ? 'Cancel Audio loading' : 'Play Master Timeline'} onClick={() => void startMasterTimelinePlayback()} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
          {masterPlaybackState === 'loading' ? <LoaderCircle size={22} className="animate-spin" /> : masterPlaybackState === 'playing' ? <Pause size={22} strokeWidth={1.8} /> : <Play size={22} strokeWidth={1.8} />}
        </button>
        {selectedTransitionKey ? (
          <>
            <button
              type="button"
              title="Remove transition"
              aria-label="Remove transition"
              aria-pressed={!selectedTransition}
              onClick={removeTransition}
              className={`flex h-14 shrink-0 items-center justify-center rounded-xl border px-4 text-xs font-medium transition-colors ${!selectedTransition ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/15 text-[var(--vyra-text-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] hover:border-[var(--vyra-accent-primary)]'}`}
            >
              None
            </button>
            {transitionOptions.map(({ label, value: effect }) => (
            <button
              key={effect}
              type="button"
              title={`${label} transition`}
              aria-label={`${label} transition`}
              aria-pressed={selectedTransition?.effect === effect}
              onClick={() => applyTransition(effect)}
              className={`flex h-14 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-medium transition-colors ${selectedTransition?.effect === effect ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/15 text-[var(--vyra-text-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] hover:border-[var(--vyra-accent-primary)]'}`}
            >
              {label}
            </button>
            ))}
          </>
        ) : selectedVisualClipId ? (
          <>
            <button type="button" title="Cut selected Scene at playhead" aria-label="Cut selected Scene at playhead" onClick={runCutSelectedVisual} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)]"><Scissors size={22} strokeWidth={1.8} /><span className="sr-only">Cut</span></button>
            <button type="button" title="Clone selected Scene" aria-label="Clone selected Scene" onClick={runCloneSelectedVisual} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)]"><Copy size={22} strokeWidth={1.8} /><span className="sr-only">Clone</span></button>
            <button type="button" title="Delete selected Scene" aria-label="Delete selected Scene" onClick={runDeleteSelectedVisual} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-danger)] transition-colors hover:border-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]"><Trash2 size={22} strokeWidth={1.8} /><span className="sr-only">Delete</span></button>
          </>
        ) : selectedTextClip ? (
          <>
            <button type="button" title="Edit selected text clip" aria-label="Edit selected text clip" onClick={() => setIsTextEditMode(true)} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
              <Pencil size={22} strokeWidth={1.8} />
              <span className="sr-only">Edit</span>
            </button>
            <button type="button" title="Split selected text at playhead" aria-label="Split selected text at playhead" onClick={runSplitSelectedText} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
              <Scissors size={22} strokeWidth={1.8} />
              <span className="sr-only">Split</span>
            </button>
            <button type="button" title="Clone selected text" aria-label="Clone selected text" onClick={runCloneSelectedText} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
              <Copy size={22} strokeWidth={1.8} />
              <span className="sr-only">Clone</span>
            </button>
            <button type="button" title="Delete selected text" aria-label="Delete selected text" onClick={runDeleteSelectedText} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-danger)] transition-colors hover:border-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]">
              <Trash2 size={22} strokeWidth={1.8} />
              <span className="sr-only">Delete</span>
            </button>
          </>
        ) : selectedAudioClip ? (
          <>
            <button type="button" title={audioPreviewError || 'Preview original Audio Asset'} aria-label={audioPreviewPlaying ? 'Pause Audio Asset preview' : 'Play Audio Asset preview'} disabled={audioPreviewLoading || !selectedAudioClipRecord?.assetId || !selectedAudioClipRecord?.assetVersionId} onClick={() => void toggleSelectedAudioPreview()} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              {audioPreviewLoading ? <LoaderCircle size={22} className="animate-spin" /> : audioPreviewPlaying && audioPreviewClipKey === selectedAudioClipKey ? <Pause size={22} strokeWidth={1.8} /> : <Play size={22} strokeWidth={1.8} />}
            </button>
            <button type="button" title="Split selected audio at playhead" aria-label="Split selected audio at playhead" onClick={runSplitSelectedAudio} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)]"><Scissors size={22} strokeWidth={1.8} /></button>
            <button type="button" title="Clone selected audio" aria-label="Clone selected audio" onClick={runCloneSelectedAudio} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)]"><Copy size={22} strokeWidth={1.8} /></button>
            <button type="button" title="Delete selected audio" aria-label="Delete selected audio" onClick={runDeleteSelectedAudio} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-danger)]"><Trash2 size={22} strokeWidth={1.8} /></button>
          </>
        ) : selectedSceneIds.length > 0 ? (
          <>
            <button type="button" title="Clone selected scenes" aria-label="Clone selected scenes" onClick={runCloneSelected} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]">
              <Copy size={22} strokeWidth={1.8} />
              <span className="sr-only">Clone</span>
            </button>
            <button type="button" title="Delete selected scenes" aria-label="Delete selected scenes" onClick={runDeleteSelected} className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-danger)] transition-colors hover:border-[var(--vyra-danger)] hover:bg-[var(--vyra-bg-hover)]">
              <Trash2 size={22} strokeWidth={1.8} />
              <span className="sr-only">Delete</span>
            </button>
          </>
        ) : toolbarItems.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={label === 'Text' ? addTextClip : label === 'Audio' ? addAudioClip : label === 'Image' ? () => addSampleVisualClip('image') : label === 'Video' ? () => addSampleVisualClip('video') : label === 'Undo' ? undoTimeline : label === 'Redo' ? redoTimeline : undefined}
            className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
          >
            <Icon size={22} strokeWidth={1.8} />
          </button>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <input ref={mediaFileInputRef} type="file" accept="video/*,image/*,audio/*" multiple className="hidden" onChange={handleMediaFilesSelected} aria-label="Upload Video, Image or Audio files" />
      <audio ref={audioPreviewRef} preload="none" onPlay={() => setAudioPreviewPlaying(true)} onPause={() => setAudioPreviewPlaying(false)} onEnded={() => setAudioPreviewPlaying(false)} onError={() => { setAudioPreviewPlaying(false); setAudioPreviewClipKey(null); setAudioPreviewError('The private Audio Asset could not be loaded. Tap Play to refresh the secure link.'); }} className="hidden" />
      {(value?.sceneInstances?.some((instance) => Boolean(instance.assetId && instance.assetVersionId && instance.assetMimeType?.toLowerCase().startsWith('video/')) || Boolean(instance.videoClips?.some((clip) => clip.assetId && clip.assetVersionId && clip.assetMimeType?.toLowerCase().startsWith('video/')))) || value?.videoTracks?.some((track) => track.clips.some((clip) => clip.assetMimeType?.toLowerCase().startsWith('video/'))) || Boolean(imagePreviewUrl)) && (
        <div className="w-full shrink-0 px-3 pt-2">
          <div className="relative mx-auto aspect-video max-h-48 w-full max-w-3xl overflow-hidden rounded-xl bg-black">
            <video
              ref={masterVideoPreviewRef}
              playsInline
              preload="none"
              className={`h-full w-full object-contain ${imagePreviewUrl ? 'hidden' : ''}`}
              aria-label="Master Timeline Video preview"
              onError={() => setMasterPlaybackError('The private Scene Video could not be loaded for Master Timeline playback.')}
            />
            {imagePreviewUrl && <img src={imagePreviewUrl} alt={activeImageClip?.name || 'Timeline Image'} className="absolute inset-0 h-full w-full bg-black object-contain" />}
            {masterPreviewTextOverlays.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-1 px-4 pb-4" aria-live="off">
                {masterPreviewTextOverlays.map((overlay) => (
                  <p key={overlay.trackId + ':' + overlay.clipId} className="max-w-full whitespace-pre-wrap rounded bg-black/60 px-3 py-1 text-center text-sm font-semibold text-white shadow-sm">
                    {overlay.content}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {audioPreviewError && <span className="sr-only" role="status">{audioPreviewError}</span>}
      {masterPlaybackError && <span className="sr-only" role="status">{masterPlaybackError}</span>}
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={scrollRef}
          onScroll={handleMasterTimelineScroll}
          className="master-timeline-scroll h-full min-h-0 w-full overflow-auto"
          style={{ touchAction: "pan-x pan-y", scrollbarWidth: "none", msOverflowStyle: "none" }}
           onPointerMove={(event) => {
            const textDrag = textDragRef.current;
            if (textDrag) {
              const currentClip = textTracks.find((track) => track.id === textDrag.trackId)?.clips.find((clip) => clip.id === textDrag.clipId);
              if (currentClip) moveTextLongPress(event, currentClip);
            }
            const audioDrag = audioDragRef.current;
            if (audioDrag) {
              const currentClip = (value?.audioTracks || []).find((track) => track.id === audioDrag.trackId)?.clips.find((clip) => clip.id === audioDrag.clipId);
              if (currentClip) moveAudioLongPress(event, currentClip);
            }
          }}
          onPointerUp={(event) => { endTextLongPress(event); endAudioLongPress(event); }}
          onPointerCancel={(event) => { endTextLongPress(event); endAudioLongPress(event); }}
          onClick={(event) => {
            // Pointer capture can retarget the click to the scroll container
            // after a clip drag. Consume that click instead of clearing or
            // changing selection on another clip underneath the pointer.
            if (suppressTextClickRef.current) {
              suppressTextClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (!(event.target as HTMLElement).closest("button")) {
              setSelectedSceneIds([]);
              setSelectedTransitionKey(null);
              setSelectedTextClip(null);
              setSelectedAudioClip(null);
            }
          }}
        >
          <div className="flex min-h-full w-max items-start">
            <div aria-hidden="true" style={{ width: leadingSpace, flex: '0 0 auto' }} />
            <div className="shrink-0" style={{ width: timelineWidth }}>
              <div className="sticky top-0 z-20 relative h-10 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)]">
                {rulerTicks.map((second) => (
                  <div key={second} className="absolute bottom-0 h-full" style={{ left: second * pixelsPerSecond }}>
                    <span className="absolute bottom-2 left-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-[var(--vyra-text-secondary)]">
                      {formatRulerTime(second)}
                    </span>
                    <span className="absolute bottom-0 h-2 w-px bg-[var(--vyra-text-muted)]/60" />
                  </div>
                ))}
              </div>
              {visibleVideoTracks.map((track, trackIndex) => {
                const sceneStyleClips = [...track.clips].sort((a, b) => a.start - b.start || a.duration - b.duration);
                return (
                  <div key={track.id} data-video-track-id={track.id} className="sticky top-10 z-10 relative h-16 py-2 bg-[var(--vyra-bg-canvas)]">
                    {sceneStyleClips.map((clip) => {
                      const isImage = clip.mediaKind === 'image' || clip.assetMimeType?.toLowerCase().startsWith('image/');
                      const width = Math.max(24, clip.duration * pixelsPerSecond);
                      const isSelected = selectedVisualClipId === clip.id;
                      return (
                        <button key={clip.id} data-timeline-video-track-id={track.id} data-timeline-video-clip-id={clip.id}
                          type="button" title={clip.name + ' · ' + clip.duration.toFixed(1) + 's'}
                          aria-label={(isImage ? 'Image' : 'Video') + ': ' + clip.name}
                          aria-pressed={isSelected}
                          onClick={(event) => {
                            if (consumeSuppressedGestureClick(event)) return;
                            event.stopPropagation();
                            setSelectedSceneIds([]);
                            setSelectedTransitionKey(null);
                            setSelectedTextClip(null);
                            setSelectedAudioClip(null);
                            setSelectedVisualClipId(isSelected ? null : clip.id);
                          }}
                          className={`group relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-md border px-3 transition-colors ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/25 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-accent-primary)]/50 bg-[var(--vyra-accent-primary)]/10'}`}
                          style={{ position: 'absolute', left: clip.start * pixelsPerSecond, top: '50%', width, transform: 'translateY(-50%)' }}>
                          {isImage ? <ImageIcon size={12} className="mr-1 shrink-0 text-[var(--vyra-text-secondary)]" /> : <Video size={12} className="mr-1 shrink-0 text-[var(--vyra-text-secondary)]" />}
                          <span className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-[var(--vyra-text-secondary)]">{clip.name}</span>
                          {isSelected && (['left', 'right'] as const).map((edge) => (
                            <span key={edge} role="presentation" data-trim-handle="true"
                              aria-label={edge === 'left' ? 'Adjust start point' : 'Adjust end point'}
                              title={edge === 'left' ? 'Drag to adjust start point' : 'Drag to adjust end point'}
                              className={`absolute inset-y-0 z-20 w-2 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/45 hover:bg-[var(--vyra-accent-primary)] ${edge === 'left' ? 'left-0 rounded-l-md' : 'right-0 rounded-r-md'}`}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedVisualClipId(clip.id);
                                event.currentTarget.setPointerCapture(event.pointerId);
                                const handle = event.currentTarget;
                                handle.dataset.edge = edge;
                                handle.dataset.startX = String(event.clientX);
                                handle.dataset.initialStart = String(clip.start);
                                handle.dataset.initialDuration = String(clip.duration);
                                handle.dataset.initialSourceIn = String(clip.sourceIn ?? 0);
                                handle.dataset.initialSourceOut = String(clip.sourceOut ?? ((clip.sourceIn ?? 0) + clip.duration));
                                const edgeBoundary = edge === 'left' ? clip.start : clip.start + clip.duration;
                                handle.dataset.rippleClipStarts = JSON.stringify(Object.fromEntries(
                                  visibleVideoTracks.flatMap((item) => item.clips)
                                    .filter((item) => item.id !== clip.id && (edge === 'left'
                                      ? item.start + item.duration <= edgeBoundary + 0.0001
                                      : item.start >= edgeBoundary - 0.0001))
                                    .map((item) => [item.id, item.start]),
                                ));
                              }}
                              onPointerMove={(event) => {
                                const handle = event.currentTarget;
                                if (!handle.hasPointerCapture(event.pointerId)) return;
                                event.preventDefault();
                                event.stopPropagation();
                                const delta = (event.clientX - Number(handle.dataset.startX)) / pixelsPerSecondRef.current;
                                const initialStart = Number(handle.dataset.initialStart);
                                const initialDuration = Number(handle.dataset.initialDuration);
                                const initialSourceIn = Number(handle.dataset.initialSourceIn);
                                const initialSourceOut = Number(handle.dataset.initialSourceOut);
                                const minDuration = 0.2;
                                const rippleClipStarts = JSON.parse(handle.dataset.rippleClipStarts || '{}') as Record<string, number>;
                                let nextClipStart = initialStart;
                                let nextClipDuration = initialDuration;
                                let nextSourceIn = initialSourceIn;
                                let nextSourceOut = initialSourceOut;
                                let rippleDelta = delta;
                                if (edge === 'left') {
                                  const fixedEnd = initialStart + initialDuration;
                                  // Permit a temporary negative timeline start while revealing earlier source media.
                                  // The clip is rebased to 00:00 on pointer-up; sourceIn=0 is the true media boundary.
                                  const sourceStartBoundary = isImage ? Number.NEGATIVE_INFINITY : initialStart - initialSourceIn;
                                  const requestedStart = snapTrimPointToPlayhead(initialStart + delta);
                                  nextClipStart = Math.max(sourceStartBoundary, Math.min(fixedEnd - minDuration, requestedStart));
                                  nextClipDuration = fixedEnd - nextClipStart;
                                  rippleDelta = nextClipStart - initialStart;
                                  if (!isImage) nextSourceIn = initialSourceIn + rippleDelta;
                                } else {
                                  const sourceDuration = isImage ? Number.POSITIVE_INFINITY : Math.max(minDuration, initialSourceOut - initialSourceIn);
                                  const requestedEnd = snapTrimPointToPlayhead(initialStart + initialDuration + delta);
                                  nextClipDuration = Math.max(minDuration, Math.min(sourceDuration, requestedEnd - initialStart));
                                  rippleDelta = nextClipDuration - initialDuration;
                                  if (!isImage) nextSourceOut = initialSourceIn + nextClipDuration;
                                }
                                updateVisualClipTiming(clip, nextClipStart, nextClipDuration, nextSourceIn, nextSourceOut, rippleClipStarts, rippleDelta);
                              }}
                              onPointerUp={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (event.currentTarget.dataset.edge === 'left') normalizeScenesOrigin();
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                              }}
                              onPointerCancel={(event) => {
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                              }}
                            />
                          ))}
                        </button>
                      );
                    })}
                    {videoTransitionMarkers.filter((marker) => marker.rowIndex === trackIndex && marker.clipId !== selectedVisualClipId && marker.nextClipId !== selectedVisualClipId).map(({ key, boundary, transition }) => (
                      <button key={key} type="button" data-timeline-transition-key={key}
                        title={transition ? transition.effect + ' transition · ' + transition.duration.toFixed(1) + 's' : 'Add transition'}
                        aria-label={transition ? 'Edit ' + transition.effect + ' transition' : 'Add transition'}
                        aria-pressed={selectedTransitionKey === key}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSceneIds([]);
                          setSelectedVisualClipId(null);
                          setSelectedTextClip(null);
                          setSelectedAudioClip(null);
                          setSelectedTransitionKey((current) => current === key ? null : key);
                        }}
                        className={`absolute top-1/2 z-10 inline-flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors ${transition ? 'px-2 text-[10px] font-semibold' : 'w-7 p-0'} ${selectedTransitionKey === key ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-white' : transition ? 'border-[var(--vyra-accent-primary)]/60 bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)] hover:border-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-muted)] hover:border-[var(--vyra-accent-primary)] hover:text-[var(--vyra-text-primary)]'}`}
                        style={{ left: boundary * pixelsPerSecond }}>
                        {transition ? transition.effect : <Plus aria-hidden="true" className="block shrink-0" size={18} strokeWidth={1.6} />}
                      </button>
                    ))}
                  </div>
                );
              })}
              {textTracks.map((track) => (
                <div key={track.id} data-text-track-id={track.id} className="relative h-12 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]/40">
                  {track.clips.map((clip) => {
                    const isSelected = selectedTextClip?.trackId === track.id && selectedTextClip.clipId === clip.id;
                    const beginTrim = (event: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      (event.currentTarget as HTMLDivElement).dataset.trimEdge = edge;
                      (event.currentTarget as HTMLDivElement).dataset.startX = String(event.clientX);
                      (event.currentTarget as HTMLDivElement).dataset.initialStart = String(clip.start);
                      (event.currentTarget as HTMLDivElement).dataset.initialDuration = String(clip.duration);
                    };
                    const updateTrim = (event: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const handle = event.currentTarget;
                      const delta = (event.clientX - Number(handle.dataset.startX)) / pixelsPerSecond;
                      const initialStart = Number(handle.dataset.initialStart);
                      const initialDuration = Number(handle.dataset.initialDuration);
                      const minimumDuration = 0.2;
                      let nextStart = initialStart;
                      let nextDuration = initialDuration;
                      const otherClips = track.clips.filter((itemClip) => itemClip.id !== clip.id);
                      const previousEnd = otherClips
                        .filter((itemClip) => itemClip.start + itemClip.duration <= initialStart + 0.0001)
                        .reduce((end, itemClip) => Math.max(end, itemClip.start + itemClip.duration), Number.NEGATIVE_INFINITY);
                      const nextStartBoundary = otherClips
                        .filter((itemClip) => itemClip.start >= initialStart + initialDuration - 0.0001)
                        .reduce((start, itemClip) => Math.min(start, itemClip.start), Number.POSITIVE_INFINITY);
                      if (edge === 'left') {
                        const fixedEnd = initialStart + initialDuration;
                        const requestedStart = snapTrimPointToPlayhead(initialStart + delta);
                        nextStart = Math.max(previousEnd, Math.min(fixedEnd - minimumDuration, requestedStart));
                        nextDuration = fixedEnd - nextStart;
                      } else {
                        const maxEnd = Number.isFinite(nextStartBoundary) ? nextStartBoundary : Number.POSITIVE_INFINITY;
                        const requestedEnd = snapTrimPointToPlayhead(initialStart + initialDuration + delta);
                        nextDuration = Math.max(minimumDuration, Math.min(maxEnd - initialStart, requestedEnd - initialStart));
                      }
                      const nextTracks = (value?.textTracks || []).map((item) => item.id !== track.id ? item : {
                        ...item,
                        clips: item.clips.map((itemClip) => itemClip.id === clip.id ? { ...itemClip, start: nextStart, duration: nextDuration } : itemClip),
                      });
                      commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], videoTracks: value?.videoTracks || [], textTracks: nextTracks });
                    };
                    return (
                      <div key={clip.id} data-timeline-text-track-id={track.id} data-timeline-text-clip-id={clip.id} role="button" tabIndex={0} title={`${clip.content || clip.name} · ${clip.duration.toFixed(1)}s`} aria-pressed={isSelected} onClick={(event) => { if (consumeSuppressedGestureClick(event)) return; event.stopPropagation(); setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedAudioClip(null); setSelectedTextClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedAudioClip(null); setSelectedTextClip({ trackId: track.id, clipId: clip.id }); setIsTextEditMode(true); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedTextClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); } }} className={`absolute inset-y-1 z-0 flex select-none items-center overflow-hidden rounded-md border text-left text-[10px] font-medium text-[var(--vyra-text-primary)] [-webkit-touch-callout:none] transition-[opacity,box-shadow,transform] duration-100 ${draggingTextClipId === clip.id ? 'z-20 opacity-70 shadow-lg' : 'opacity-100'} ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/30 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-accent-primary)]/60 bg-[var(--vyra-accent-primary)]/15'}`} style={{ left: clip.start * pixelsPerSecond, width: Math.max(24, clip.duration * pixelsPerSecond), touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none', transform: draggingTextClipId === clip.id && (textDragRef.current?.active || audioDragRef.current?.active) ? `translateY(${textDragYOffset}px)` : undefined }} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onPointerDown={(event) => beginTextLongPress(event, track.id, clip)}>
                        <div role="presentation" data-trim-handle="true" aria-label="Adjust text start" title="Drag to adjust start" className="z-10 h-full w-2 shrink-0 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/35 hover:bg-[var(--vyra-accent-primary)]" onPointerDown={(event) => beginTrim(event, 'left')} onPointerMove={(event) => updateTrim(event, 'left')} onPointerUp={(event) => { event.stopPropagation(); normalizeTextTrackOrigin(track.id); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
                        <div className="flex min-w-0 flex-1 items-center overflow-hidden px-1.5">
                          <Type size={12} className="mr-1 shrink-0" />
                          <span className="truncate">{clip.content || clip.name}</span>
                        </div>
                        <div role="presentation" data-trim-handle="true" aria-label="Adjust text end" title="Drag to adjust end" className="z-10 h-full w-2 shrink-0 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/35 hover:bg-[var(--vyra-accent-primary)]" onPointerDown={(event) => beginTrim(event, 'right')} onPointerMove={(event) => updateTrim(event, 'right')} onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
                      </div>
                    );
                  })}
                </div>
              ))}
              {(value?.audioTracks || []).map((track) => (
                <div key={track.id} data-audio-track-id={track.id} className="relative h-12 border-b border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]/70">
                  {track.clips.map((clip) => {
                    const isSelected = selectedAudioClip?.trackId === track.id && selectedAudioClip.clipId === clip.id;
                    const beginAudioTrim = (event: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
                      event.preventDefault(); event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const handle = event.currentTarget;
                      handle.dataset.startX = String(event.clientX);
                      handle.dataset.initialStart = String(clip.start);
                      handle.dataset.initialDuration = String(clip.duration);
                      handle.dataset.initialSourceIn = String(clip.sourceIn ?? 0);
                    };
                    const updateAudioTrim = (event: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
                      const handle = event.currentTarget;
                      if (!handle.hasPointerCapture(event.pointerId)) return;
                      event.preventDefault(); event.stopPropagation();
                      const delta = (event.clientX - Number(handle.dataset.startX)) / pixelsPerSecond;
                      const initialStart = Number(handle.dataset.initialStart);
                      const initialDuration = Number(handle.dataset.initialDuration);
                      const minimum = 0.2;
                      const others = track.clips.filter((item) => item.id !== clip.id);
                      const previousEnd = others.filter((item) => item.start + item.duration <= initialStart + 0.0001).reduce((end, item) => Math.max(end, item.start + item.duration), Number.NEGATIVE_INFINITY);
                      const nextBoundary = others.filter((item) => item.start >= initialStart + initialDuration - 0.0001).reduce((start, item) => Math.min(start, item.start), Number.POSITIVE_INFINITY);
                      let nextStart = initialStart;
                      let nextDuration = initialDuration;
                      let nextSourceIn = Number(handle.dataset.initialSourceIn || 0);
                      if (edge === 'left') {
                        const fixedEnd = initialStart + initialDuration;
                        const sourceStartBoundary = initialStart - Number(handle.dataset.initialSourceIn || 0);
                        const requestedStart = snapTrimPointToPlayhead(initialStart + delta);
                        nextStart = Math.max(previousEnd, sourceStartBoundary, Math.min(fixedEnd - minimum, requestedStart));
                        nextDuration = fixedEnd - nextStart;
                        nextSourceIn += nextStart - initialStart;
                      } else {
                        const requestedEnd = snapTrimPointToPlayhead(initialStart + initialDuration + delta);
                        nextDuration = Math.max(minimum, Math.min(nextBoundary - initialStart, requestedEnd - initialStart));
                      }
                      const nextTracks = (value?.audioTracks || []).map((item) => item.id !== track.id ? item : { ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart, duration: nextDuration, sourceIn: nextSourceIn } : entry) });
                      commitChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, videoTracks: value?.videoTracks || [], textTracks: value?.textTracks || [] });
                    };
                    const trimHandle = (edge: 'left' | 'right') => (
                      <div role="presentation" data-audio-trim-handle="true" aria-label={edge === 'left' ? 'Adjust audio start' : 'Adjust audio end'} title={edge === 'left' ? 'Drag to adjust start' : 'Drag to adjust end'} className="z-10 h-full w-2 shrink-0 cursor-ew-resize touch-none bg-sky-500/35 hover:bg-sky-500" onPointerDown={(event) => beginAudioTrim(event, edge)} onPointerMove={(event) => updateAudioTrim(event, edge)} onPointerUp={(event) => { event.stopPropagation(); if (edge === 'left') normalizeAudioTrackOrigin(track.id); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
                    );
                    return (
                      <div key={clip.id} data-timeline-audio-track-id={track.id} data-timeline-audio-clip-id={clip.id} role="button" tabIndex={0} title={`${clip.content || clip.name} · ${clip.duration.toFixed(1)}s`} aria-pressed={isSelected}
                        onClick={(event) => { if (consumeSuppressedGestureClick(event)) return; event.stopPropagation(); setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedTextClip(null); setSelectedAudioClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAudioClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); } }}
                        onPointerDown={(event) => beginAudioLongPress(event, track.id, clip)}
                        onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}
                        className={`absolute inset-y-1 z-0 flex select-none items-center overflow-hidden rounded-md border text-left text-[10px] font-medium [-webkit-touch-callout:none] transition-[opacity,box-shadow,transform] duration-100 ${draggingTextClipId === clip.id ? 'z-20 opacity-70 shadow-lg' : 'opacity-100'} ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/25 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-sky-500/50 bg-sky-500/10'}`}
                        style={{ left: clip.start * pixelsPerSecond, width: Math.max(24, clip.duration * pixelsPerSecond), touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none', transform: draggingTextClipId === clip.id && (textDragRef.current?.active || audioDragRef.current?.active) ? `translateY(${textDragYOffset}px)` : undefined }}>
                        {trimHandle('left')}
                        <div className="flex min-w-0 flex-1 items-center overflow-hidden px-1.5">
                          <AudioLines size={12} className="mr-1 shrink-0 text-sky-500" />
                          <span className="mr-2 shrink-0 truncate">{clip.content || clip.name}</span>
                          <div className="flex h-5 min-w-0 flex-1 items-center gap-px overflow-hidden opacity-70" aria-hidden="true">
                            {(clip.waveform || []).map((height, index) => (
                              <span key={index} className="min-w-px flex-1 rounded-full bg-sky-500/80" style={{ height: `${Math.max(15, Math.min(100, height * 100))}%` }} />
                            ))}
                          </div>
                        </div>
                        {trimHandle('right')}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Two empty track-height rows below the final track provide room for downward clip moves. */}
              <div aria-hidden="true" className="h-24 shrink-0" />
            </div>
            <div aria-hidden="true" style={{ width: leadingSpace, flex: '0 0 auto' }} />
          </div>
        </div>
        {!isTextEditMode && (
          <div className="pointer-events-none absolute right-4 top-[3.25rem] z-40 flex flex-col items-end gap-2">
            {mediaUploadError && <div role="status" className="max-w-56 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 py-2 text-xs text-[var(--vyra-text-primary)] shadow-lg">{mediaUploadError}</div>}
            <button type="button" disabled={mediaUploadBusy || !vyralId} onClick={() => mediaFileInputRef.current?.click()}
              title="Upload Video, Image or Audio" aria-label="Upload Video, Image or Audio"
              className="pointer-events-auto grid size-10 place-items-center rounded-md border border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-white shadow-sm transition-colors hover:brightness-105 disabled:cursor-wait disabled:opacity-60">
              {mediaUploadBusy ? <LoaderCircle size={20} className="animate-spin" /> : <Plus size={22} strokeWidth={2} />}
            </button>
          </div>
        )}
        {isTextEditMode && (
          <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-[var(--vyra-bg-canvas)]" aria-label="Text clip edit mode">
            <style>{`.text-tools-horizontal-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; } .text-tools-horizontal-scroll { scrollbar-width: none; -ms-overflow-style: none; }`}</style>
          <div className="flex h-12 min-w-0 shrink-0 items-center px-2">
              <div className="text-tools-horizontal-scroll flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {[
                  { label: 'Bold', Icon: Bold },
                  { label: 'Italic', Icon: Italic },
                  { label: 'Underline', Icon: Underline },
                  { label: 'Strikethrough', Icon: Strikethrough },
                  { label: 'Align left', Icon: AlignLeft },
                  { label: 'Align center', Icon: AlignCenter },
                  { label: 'Align right', Icon: AlignRight },
                  { label: 'Bulleted list', Icon: List },
                  { label: 'Text color', Icon: Palette },
                ].map(({ label, Icon }) => (
                  <button key={label} type="button" disabled title={label} aria-label={label} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-secondary)] opacity-60">
                    <Icon size={18} strokeWidth={1.8} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setIsTextEditMode(false)} className="ml-2 shrink-0 rounded-lg border border-[var(--vyra-border)] px-3 py-1.5 text-sm text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Close edit mode">Close</button>
            </div>
            <textarea
              aria-label="Text content"
              value={textTracks.find((track) => track.id === selectedTextClip?.trackId)?.clips.find((clip) => clip.id === selectedTextClip?.clipId)?.content
                ?? textTracks.find((track) => track.id === selectedTextClip?.trackId)?.clips.find((clip) => clip.id === selectedTextClip?.clipId)?.name
                ?? ''}
              onChange={(event) => {
                if (!selectedTextClip) return;
                const nextTracks = textTracks.map((track) => track.id !== selectedTextClip.trackId ? track : {
                  ...track,
                  clips: track.clips.map((clip) => clip.id === selectedTextClip.clipId ? { ...clip, content: event.target.value } : clip),
                });
                commitChange({
                  sceneRanges: value?.sceneRanges || {},
                  sceneInstances: value?.sceneInstances,
                  transitions: value?.transitions || {},
                  audioTracks: value?.audioTracks || [],
                  videoTracks: value?.videoTracks || [],
                  textTracks: nextTracks,
                });
              }}
              placeholder="Type your text here…"
              className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-4 py-4 text-base leading-relaxed text-[var(--vyra-text-primary)] outline-none ring-0 placeholder:text-[var(--vyra-text-secondary)] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 active:outline-none" style={{ outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent" }}
              spellCheck
            />
          </div>
        )}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-1/2 z-30 ${isTextEditMode ? 'hidden' : ''} w-px -translate-x-1/2 bg-[var(--vyra-accent-primary)]`}
          style={{ pointerEvents: "none", userSelect: "none", touchAction: "pan-x pan-y" }}
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-b-sm bg-[var(--vyra-accent-primary)]" />
        </div>
      </div>
      {isTextEditMode ? (
        <nav
          className="master-editor-bottom-nav relative z-50 flex w-full shrink-0 items-center justify-center gap-2 px-0 pt-2"
          style={{ paddingBottom: 0 }}
          aria-label="Text editing tools"
        >
          <div className="master-editor-toolbar-scroll mx-auto flex w-max max-w-full min-w-0 items-center justify-center gap-2 overflow-x-auto px-0">
            <button
              type="button"
              title="Fonts"
              aria-label="Fonts"
              className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-4 text-sm font-medium text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"
            >
              <Type size={20} strokeWidth={1.8} />
              <span>Fonts</span>
            </button>
            <button
              type="button"
              title="Style"
              aria-label="Style"
              className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-4 text-sm font-medium text-[var(--vyra-text-secondary)] transition-colors hover:border-[var(--vyra-accent-primary)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"
            >
              <Palette size={20} strokeWidth={1.8} />
              <span>Style</span>
            </button>
          </div>
        </nav>
      ) : toolbar}
    </div>
  );
};
