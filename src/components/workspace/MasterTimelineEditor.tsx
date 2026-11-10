import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Crop,
  Copy,
  Gauge,
  Layers,
  MousePointer2,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';

export type TimelineClip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  waveform?: number[];
  content?: string;
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
};

export type MasterTimelineData = {
  sceneRanges: Record<string, { sourceIn: number; sourceOut: number }>;
  sceneInstances?: SceneTimelineInstance[];
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
  value?: MasterTimelineData;
  onChange: (next: MasterTimelineData) => void;
  onSceneOrderChange: (sceneIds: string[]) => void;
  onSceneDuplicate: (scene: Scene, index: number) => Scene;
  onSceneDelete: (sceneId: string) => void;
};

const toolbarItems = [
  { label: 'Select', Icon: MousePointer2 },
  { label: 'Delete', Icon: Trash2 },
  { label: 'Duplicate', Icon: Copy },
  { label: 'Crop', Icon: Crop },
  { label: 'Speed', Icon: Gauge },
  { label: 'Rotate', Icon: RotateCw },
  { label: 'Transition', Icon: Layers },
  { label: 'Effects', Icon: Sparkles },
  { label: 'Text', Icon: Type },
  { label: 'Audio', Icon: AudioLines },
  { label: 'Undo', Icon: Undo2 },
  { label: 'Redo', Icon: Redo2 },
  { label: 'Layers', Icon: Layers },
];

/**
 * Master timeline foundation:
 * - ruler and scene blocks share one horizontal scroll surface
 * - zoom changes horizontal pixels-per-second only
 * - playhead is an overlay fixed at the center of the timeline viewport
 */
export const MasterTimelineEditor: React.FC<Props> = ({ scenes, value, onChange, onSceneDuplicate, onSceneDelete }) => {
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null);
  const [selectedTextClip, setSelectedTextClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const [selectedAudioClip, setSelectedAudioClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const seededAudioRef = useRef(false);
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
    offsetX: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const audioDragRef = useRef<typeof textDragRef.current>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollPointerRef = useRef<{ kind: 'text' | 'audio'; x: number; y: number; pointerId: number; clip: TimelineClip } | null>(null);
  const suppressTextClickRef = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        // Pinch takes priority over a pending clip long-press.
        for (const drag of [textDragRef.current, audioDragRef.current]) {
          if (drag?.timer) clearTimeout(drag.timer);
          if (drag) { drag.timer = null; drag.moved = true; }
        }
      }
      if (event.touches.length !== 2) return;
      const scale = pixelsPerSecondRef.current;
      pinchRef.current = {
        startDistance: Math.max(1, distance(event.touches)),
        startScale: scale,
        // Time currently aligned with the fixed center playhead.
        anchorTime: element.scrollLeft / scale,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const nextScale = Math.min(176, Math.max(8, pinch.startScale * distance(event.touches) / pinch.startDistance));
      setPixelsPerSecond(nextScale);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
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

  useEffect(() => {
    if (seededAudioRef.current) return;
    const existing = value?.audioTracks || [];
    if (existing.length > 0) {
      seededAudioRef.current = true;
      return;
    }
    seededAudioRef.current = true;
    const samples = [
      { name: 'Ambient Flow', duration: 24 },
      { name: 'Cinematic Rise', duration: 32 },
      { name: 'Lo-fi Moments', duration: 28 },
      { name: 'Bright Journey', duration: 30 },
      { name: 'Calm Piano', duration: 26 },
    ];
    const existingTextEnd = (value?.textTracks || []).flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
    const existingTimelineLength = Math.max(1, scenes.reduce((sum, scene) => sum + Math.max(0.1, scene.duration), 0), existingTextEnd);
    const audioTracks = samples.map((sample, index) => ({
      id: crypto.randomUUID(),
      name: 'Audio',
      clips: [{
        id: crypto.randomUUID(),
        name: sample.name,
        content: sample.name,
        start: 0,
        duration: Math.min(sample.duration, existingTimelineLength),
        waveform: Array.from({ length: 48 }, (_, point) => 0.2 + (((point * 17 + index * 13) % 29) / 40)),
      }],
    }));
    onChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: value?.transitions || {},
      audioTracks,
      textTracks: value?.textTracks || [],
    });
  }, [value?.audioTracks, value?.textTracks, value?.sceneRanges, value?.sceneInstances, value?.transitions, scenes, onChange]);

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
  // Audio is constrained to the existing project timeline; it never extends it.
  const totalDuration = Math.max(1, sceneTotalDuration, textContentEnd);
  const timelineWidth = totalDuration * pixelsPerSecond;
  const leadingSpace = viewportWidth / 2;
  // Adapt ruler spacing to zoom level so labels stay readable.
  const rulerStep = pixelsPerSecond >= 56 ? 1 : pixelsPerSecond >= 28 ? 2 : pixelsPerSecond >= 14 ? 5 : pixelsPerSecond >= 8 ? 10 : 20;
  const rulerTicks = Array.from({ length: Math.floor(totalDuration / rulerStep) + 1 }, (_, index) => index * rulerStep);
  const formatRulerTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
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
  const applyTransition = (effect: string) => {
    if (!selectedTransitionKey) return;
    onChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: {
        ...(value?.transitions || {}),
        [selectedTransitionKey]: { effect, duration: selectedTransition?.duration ?? 0.5 },
      },
      audioTracks: value?.audioTracks || [],
      textTracks: value?.textTracks || [],
    });
  };
  const removeTransition = () => {
    if (!selectedTransitionKey) return;
    const transitions = Object.fromEntries(
      Object.entries(value?.transitions || {}).filter(([key]) => key !== selectedTransitionKey),
    );
    onChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions,
      audioTracks: value?.audioTracks || [],
      textTracks: value?.textTracks || [],
    });
  };
  const addAudioClip = () => {
    const start = Math.min(totalDuration - 0.2, Math.max(0, (scrollRef.current?.scrollLeft ?? 0) / pixelsPerSecond));
    const duration = Math.min(10, totalDuration - start);
    if (duration < 0.2) return;
    const nextTrackId = crypto.randomUUID();
    const nextTrack: TimelineTrack = {
      id: nextTrackId,
      name: 'Audio',
      clips: [{ id: crypto.randomUUID(), name: 'New Audio', content: 'New Audio', start, duration, waveform: Array.from({ length: 32 }, (_, point) => 0.25 + ((point * 11) % 19) / 30) }],
    };
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: [...(value?.audioTracks || []), nextTrack], textTracks: value?.textTracks || [] });
    revealNewTimelineRow('audio', nextTrackId);
  };

  const runDeleteSelectedAudio = () => {
    if (!selectedAudioClip) return;
    const audioTracks = (value?.audioTracks || []).map((track) => track.id !== selectedAudioClip.trackId ? track : { ...track, clips: track.clips.filter((clip) => clip.id !== selectedAudioClip.clipId) }).filter((track) => track.clips.length > 0);
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks, textTracks: value?.textTracks || [] });
    setSelectedAudioClip(null);
  };

  const runCloneSelectedAudio = () => {
    if (!selectedAudioClip) return;
    const tracks = value?.audioTracks || [];
    const sourceTrack = tracks.find((track) => track.id === selectedAudioClip.trackId);
    const source = sourceTrack?.clips.find((clip) => clip.id === selectedAudioClip.clipId);
    if (!source || !sourceTrack) return;
    const cloneStart = sourceTrack.clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
    if (cloneStart + source.duration > totalDuration + 0.001) return;
    const cloneId = crypto.randomUUID();
    const audioTracks = tracks.map((track) => track.id !== sourceTrack.id ? track : { ...track, clips: [...track.clips, { ...source, id: cloneId, start: cloneStart }] });
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks, textTracks: value?.textTracks || [] });
    setSelectedAudioClip({ trackId: sourceTrack.id, clipId: cloneId });
  };

  const beginAudioLongPress = (event: React.PointerEvent<HTMLDivElement>, trackId: string, clip: TimelineClip) => {
    if (textDragRef.current?.active) return;
    if ((event.target as HTMLElement).closest('[data-audio-trim-handle]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (audioDragRef.current?.timer) clearTimeout(audioDragRef.current.timer);
    const clipElement = event.currentTarget;
    const rect = clipElement.getBoundingClientRect();
    const drag = { timer: null as ReturnType<typeof setTimeout> | null, active: false, moved: false, pointerId: event.pointerId, clipId: clip.id, trackId, createdTrackId: null as string | null, offsetX: event.clientX - rect.left, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
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
          const nextStart = Math.min(totalDuration - clip.duration, Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond));
          const current = value?.audioTracks || [];
          const remainingTracks = current.filter((track) => track.id !== drag.trackId || track.clips.length > 1)
            .map((track) => track.id !== drag.trackId ? track : { ...track, clips: track.clips.filter((item) => item.id !== clip.id) });
          const newTrack = { id: destinationTrackId, name: 'Audio', clips: [{ ...clip, start: nextStart }] };
          const nextTracks = insertAtTop ? [newTrack, ...remainingTracks] : [...remainingTracks, newTrack];
          onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, textTracks: value?.textTracks || [] });
          drag.trackId = destinationTrackId;
          setSelectedAudioClip({ trackId: destinationTrackId, clipId: clip.id });
          revealNewTimelineRow('audio', destinationTrackId);
        }
      }
    }
    if (!destinationTrackId) return;
    setTextDragYOffset(Math.max(-tolerance, Math.min(tolerance, event.clientY - destinationCenterY)));
    const contentX = event.clientX - scrollRect.left + scrollElement.scrollLeft;
    const nextStart = Math.min(totalDuration - clip.duration, Math.max(0, (contentX - leadingSpace - drag.offsetX) / pixelsPerSecond));
    const current = value?.audioTracks || [];
    const destinationTrack = current.find((track) => track.id === destinationTrackId);
    if (!destinationTrack) return;
    if (destinationTrack.clips.some((item) => item.id !== clip.id && nextStart < item.start + item.duration - 0.001 && nextStart + clip.duration > item.start + 0.001)) return;
    const nextTracks = current.map((track) => {
      if (track.id === drag.trackId && track.id === destinationTrackId) return { ...track, clips: track.clips.map((item) => item.id === clip.id ? { ...item, start: nextStart } : item) };
      if (track.id === drag.trackId) return { ...track, clips: track.clips.filter((item) => item.id !== clip.id) };
      if (track.id === destinationTrackId) return { ...track, clips: [...track.clips, { ...clip, start: nextStart }] };
      return track;
    }).filter((track) => track.clips.length > 0);
    if (destinationTrackId !== drag.trackId) { drag.trackId = destinationTrackId; setSelectedAudioClip({ trackId: destinationTrackId, clipId: clip.id }); }
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, textTracks: value?.textTracks || [] });
  };

  const endAudioLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = audioDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    stopDragAutoScroll();
    if (drag.moved) suppressTextClickRef.current = true;
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
    const right = { ...clip, id: crypto.randomUUID(), start: splitTime, duration: clip.start + clip.duration - splitTime };
    const nextTracks = tracks.map((item) => item.id !== track.id ? item : { ...item, clips: item.clips.flatMap((entry) => entry.id !== clip.id ? [entry] : [{ ...entry, duration: splitTime - clip.start }, right]) });
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, textTracks: value?.textTracks || [] });
    setSelectedAudioClip({ trackId: track.id, clipId: right.id });
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
    onChange({
      sceneRanges: value?.sceneRanges || {},
      sceneInstances: value?.sceneInstances,
      transitions: value?.transitions || {},
      audioTracks: value?.audioTracks || [],
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
          onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
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
    const collides = destinationTrack.clips.some((item) =>
      item.id !== clip.id && nextStart < item.start + item.duration - 0.001 && nextStart + clip.duration > item.start + 0.001
    );
    if (collides) return;
    const nextTracks = textTracks.map((item) => {
      if (item.id === drag.trackId && item.id === destinationTrackId) {
        return { ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart } : entry) };
      }
      if (item.id === drag.trackId) return { ...item, clips: item.clips.filter((entry) => entry.id !== clip.id) };
      if (item.id === destinationTrackId) return { ...item, clips: [...item.clips, { ...clip, start: nextStart }] };
      return item;
    }).filter((item) => item.clips.length > 0);
    if (destinationTrackId !== drag.trackId) {
      drag.trackId = destinationTrackId;
      setSelectedTextClip({ trackId: destinationTrackId, clipId: clip.id });
    }
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
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
    if (dragAutoScrollFrameRef.current !== null) return;

    const tick = () => {
      dragAutoScrollFrameRef.current = null;
      const pointer = dragAutoScrollPointerRef.current;
      const element = scrollRef.current;
      if (!pointer || !element) return;

      const rect = element.getBoundingClientRect();
      const edgeSize = 56;
      const maxSpeed = 18;
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
      if (pointer.kind === 'text') moveTextLongPress(syntheticEvent, pointer.clip);
      else moveAudioLongPress(syntheticEvent, pointer.clip);

      // Keep scrolling while the pointer remains near an edge, even when
      // the user holds it still and no new pointermove event is emitted.
      dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
    };

    dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
  };

  const endTextLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    stopDragAutoScroll();
    if (drag.moved) suppressTextClickRef.current = true;
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
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
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
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
    setSelectedTextClip({ ...selectedTextClip, clipId: cloneId });
  };
  const runDeleteSelectedText = () => {
    if (!selectedTextClip) return;
    const nextTracks = (value?.textTracks || [])
      .map((track) => track.id !== selectedTextClip.trackId ? track : { ...track, clips: track.clips.filter((clip) => clip.id !== selectedTextClip.clipId) })
      .filter((track) => track.clips.length > 0);
    onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
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
      className="master-editor-bottom-nav relative z-20 flex w-full shrink-0 items-center justify-center gap-2 px-3 pt-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Master Editor tools"
    >
      <div className="master-editor-toolbar-scroll mx-auto flex w-max max-w-full min-w-0 items-center justify-start gap-2 overflow-x-auto px-0">
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
        ) : selectedTextClip ? (
          <>
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
            onClick={label === 'Text' ? addTextClip : label === 'Audio' ? addAudioClip : undefined}
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
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={scrollRef}
          className="master-timeline-scroll h-full min-h-0 w-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ touchAction: "pan-x pan-y" }}
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
              <div className="relative flex h-16 items-center gap-0 py-2">
                {orderedScenes.map((scene, index) => {
                  const segment = sceneSegments[index];
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      title={scene.title}
                      aria-pressed={selectedSceneIds.includes(scene.id)}
                      onClick={() => {
                        setSelectedTransitionKey(null);
                        setSelectedTextClip(null);
                        setSelectedAudioClip(null);
                        setSelectedSceneIds((current) => current[0] === scene.id ? [] : [scene.id]);
                      }}
                      className={`group relative flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-md border px-3 transition-colors ${selectedSceneIds.includes(scene.id) ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/25 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-accent-primary)]/50 bg-[var(--vyra-accent-primary)]/10'}`}
                      style={{ width: Math.max(24, segment.duration * pixelsPerSecond) }}
                    >
                      <span className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-[var(--vyra-text-secondary)]">{scene.title}</span>
                    </button>
                  );
                })}
                {orderedScenes.slice(0, -1).map((scene, index) => {
                  const nextScene = orderedScenes[index + 1];
                  const transitionKey = `${scene.id}:${nextScene.id}`;
                  const boundary = sceneSegments.slice(0, index + 1).reduce((sum, segment) => sum + segment.duration, 0) * pixelsPerSecond;
                  const hiddenBySceneSelection = selectedSceneIds.includes(scene.id) || selectedSceneIds.includes(nextScene.id);
                  if (hiddenBySceneSelection) return null;
                  const transition = value?.transitions?.[transitionKey];
                  const effectLabel = transitionOptions.find((option) => option.value === transition?.effect)?.label || transition?.effect;
                  const isSelected = selectedTransitionKey === transitionKey;
                  return (
                    <button
                      key={transitionKey}
                      type="button"
                      title={transition ? `Edit ${effectLabel} transition` : 'Add transition'}
                      aria-label={`${transition ? `Edit ${effectLabel} transition` : 'Add transition'} between ${scene.title} and ${nextScene.title}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedSceneIds([]);
                        setSelectedTextClip(null);
                        setSelectedTransitionKey(transitionKey);
                      }}
                      className={`absolute top-1/2 z-10 inline-flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors ${transition ? 'px-2 text-[10px] font-semibold' : 'w-7 p-0'} ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-white' : transition ? 'border-[var(--vyra-accent-primary)]/60 bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)] hover:border-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-muted)] hover:border-[var(--vyra-accent-primary)] hover:text-[var(--vyra-text-primary)]'}`}
                      style={{ left: boundary }}
                    >
                      {transition ? effectLabel : <Plus aria-hidden="true" className="block shrink-0" size={18} strokeWidth={1.6} />}
                    </button>
                  );
                })}
              </div>
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
                        .reduce((end, itemClip) => Math.max(end, itemClip.start + itemClip.duration), 0);
                      const nextStartBoundary = otherClips
                        .filter((itemClip) => itemClip.start >= initialStart + initialDuration - 0.0001)
                        .reduce((start, itemClip) => Math.min(start, itemClip.start), Number.POSITIVE_INFINITY);
                      if (edge === 'left') {
                        const fixedEnd = initialStart + initialDuration;
                        nextStart = Math.max(previousEnd, Math.min(fixedEnd - minimumDuration, initialStart + delta));
                        nextDuration = fixedEnd - nextStart;
                      } else {
                        const maxEnd = Number.isFinite(nextStartBoundary) ? nextStartBoundary : Number.POSITIVE_INFINITY;
                        nextDuration = Math.max(minimumDuration, Math.min(maxEnd - initialStart, initialDuration + delta));
                      }
                      const nextTracks = (value?.textTracks || []).map((item) => item.id !== track.id ? item : {
                        ...item,
                        clips: item.clips.map((itemClip) => itemClip.id === clip.id ? { ...itemClip, start: nextStart, duration: nextDuration } : itemClip),
                      });
                      onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: value?.audioTracks || [], textTracks: nextTracks });
                    };
                    return (
                      <div key={clip.id} role="button" tabIndex={0} title={`${clip.content || clip.name} · ${clip.duration.toFixed(1)}s`} aria-pressed={isSelected} onClick={(event) => { event.stopPropagation(); if (suppressTextClickRef.current) { suppressTextClickRef.current = false; return; } setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedAudioClip(null); setSelectedTextClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedTextClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); } }} className={`absolute inset-y-1 z-0 flex select-none items-center overflow-hidden rounded-md border text-left text-[10px] font-medium text-[var(--vyra-text-primary)] [-webkit-touch-callout:none] transition-[opacity,box-shadow,transform] duration-100 ${draggingTextClipId === clip.id ? 'z-20 opacity-70 shadow-lg' : 'opacity-100'} ${isSelected ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/30 ring-2 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-accent-primary)]/60 bg-[var(--vyra-accent-primary)]/15'}`} style={{ left: clip.start * pixelsPerSecond, width: Math.max(24, clip.duration * pixelsPerSecond), touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none', transform: draggingTextClipId === clip.id && (textDragRef.current?.active || audioDragRef.current?.active) ? `translateY(${textDragYOffset}px)` : undefined }} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onPointerDown={(event) => beginTextLongPress(event, track.id, clip)}>
                        <div role="presentation" data-trim-handle="true" aria-label="Adjust text start" title="Drag to adjust start" className="z-10 h-full w-2 shrink-0 cursor-ew-resize touch-none bg-[var(--vyra-accent-primary)]/35 hover:bg-[var(--vyra-accent-primary)]" onPointerDown={(event) => beginTrim(event, 'left')} onPointerMove={(event) => updateTrim(event, 'left')} onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
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
                      const previousEnd = others.filter((item) => item.start + item.duration <= initialStart + 0.0001).reduce((end, item) => Math.max(end, item.start + item.duration), 0);
                      const nextBoundary = others.filter((item) => item.start >= initialStart + initialDuration - 0.0001).reduce((start, item) => Math.min(start, item.start), totalDuration);
                      let nextStart = initialStart;
                      let nextDuration = initialDuration;
                      if (edge === 'left') {
                        const fixedEnd = initialStart + initialDuration;
                        nextStart = Math.max(previousEnd, Math.min(fixedEnd - minimum, initialStart + delta));
                        nextDuration = fixedEnd - nextStart;
                      } else {
                        nextDuration = Math.max(minimum, Math.min(nextBoundary - initialStart, totalDuration - initialStart, initialDuration + delta));
                      }
                      const nextTracks = (value?.audioTracks || []).map((item) => item.id !== track.id ? item : { ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart, duration: nextDuration } : entry) });
                      onChange({ sceneRanges: value?.sceneRanges || {}, sceneInstances: value?.sceneInstances, transitions: value?.transitions || {}, audioTracks: nextTracks, textTracks: value?.textTracks || [] });
                    };
                    const trimHandle = (edge: 'left' | 'right') => (
                      <div role="presentation" data-audio-trim-handle="true" aria-label={edge === 'left' ? 'Adjust audio start' : 'Adjust audio end'} title={edge === 'left' ? 'Drag to adjust start' : 'Drag to adjust end'} className="z-10 h-full w-2 shrink-0 cursor-ew-resize touch-none bg-sky-500/35 hover:bg-sky-500" onPointerDown={(event) => beginAudioTrim(event, edge)} onPointerMove={(event) => updateAudioTrim(event, edge)} onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
                    );
                    return (
                      <div key={clip.id} role="button" tabIndex={0} title={`${clip.content || clip.name} · ${clip.duration.toFixed(1)}s`} aria-pressed={isSelected}
                        onClick={(event) => { event.stopPropagation(); if (suppressTextClickRef.current) { suppressTextClickRef.current = false; return; } setSelectedSceneIds([]); setSelectedTransitionKey(null); setSelectedTextClip(null); setSelectedAudioClip(isSelected ? null : { trackId: track.id, clipId: clip.id }); }}
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
                            {(clip.waveform || Array.from({ length: 32 }, (_, i) => 0.25 + ((i * 7) % 15) / 24)).map((height, index) => (
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-[var(--vyra-accent-primary)]"
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-b-sm bg-[var(--vyra-accent-primary)]" />
        </div>
      </div>
      {toolbar}
    </div>
  );
};
