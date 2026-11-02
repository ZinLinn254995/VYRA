/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Plus, Search, Pencil, Trash2, Upload, Image as ImageIcon, X, Check, ShieldCheck, Link2, Loader2 } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import type { ConsistencyAssetKind, ConsistencyReference, ConsistencyRule, Project } from '../../types';
import { getSavedImages, saveGeneratedImage, type SavedMediaImage } from '../../services/mediaLibraryStorage';

const KIND_OPTIONS: { value: ConsistencyAssetKind; label: string }[] = [
  { value: 'character', label: 'Character' },
  { value: 'environment', label: 'Environment' },
  { value: 'object', label: 'Object & Prop' },
  { value: 'brand', label: 'Brand & Product' },
  { value: 'visual_style', label: 'Visual Style' },
  { value: 'voice', label: 'Voice' },
  { value: 'music', label: 'Music' },
  { value: 'audio', label: 'Other Audio' },
  { value: 'story', label: 'Story & Scene' },
  { value: 'other', label: 'Other' },
];
const inputClass = 'w-full rounded-lg border border-[#30365f] light:border-slate-300 bg-[#0d1024] light:bg-white px-3 py-2.5 text-sm text-slate-100 light:text-slate-900 outline-none focus:border-[#55F4FF] light:focus:border-indigo-500';
const panelClass = 'rounded-xl border border-[#252b50] light:border-slate-200 bg-[#11152b] light:bg-white';
const makeId = (prefix: string) => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emptyBible = () => ({ version: 1 as const, references: [] as ConsistencyReference[], rules: [] as ConsistencyRule[] });

export const ConsistencyLibraryView: React.FC = () => {
  const { projects, activeProjectId, setActiveProjectId, updateProject, showToast } = useStudio();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ConsistencyAssetKind>('character');
  const [description, setDescription] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voiceSpeed, setVoiceSpeed] = useState('1');
  const [musicGenre, setMusicGenre] = useState('');
  const [musicBpm, setMusicBpm] = useState('');
  const [musicKey, setMusicKey] = useState('');
  const [musicMood, setMusicMood] = useState('');
  const [musicInstruments, setMusicInstruments] = useState('');
  const [musicArrangement, setMusicArrangement] = useState('');
  const [soundCategory, setSoundCategory] = useState('');
  const [soundTexture, setSoundTexture] = useState('');
  const [soundIntensity, setSoundIntensity] = useState('');
  const [soundSpatial, setSoundSpatial] = useState('');
  const [soundNotes, setSoundNotes] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<SavedMediaImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [ruleText, setRuleText] = useState('');
  const [ruleStrength, setRuleStrength] = useState<'locked' | 'preferred' | 'flexible'>('preferred');
  const [ruleKind, setRuleKind] = useState<ConsistencyAssetKind | 'all'>('all');
  const [rulePriority, setRulePriority] = useState('50');
  const [ruleSceneIds, setRuleSceneIds] = useState<string[]>([]);

  const project = projects.find((item) => item.id === activeProjectId) || projects[0];
  const bible = project?.consistencyBible || emptyBible();
  const filteredReferences = useMemo(() => bible.references.filter((reference) => {
    const matchesQuery = !query || [reference.name, reference.description, ...(reference.tags || [])].join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (kindFilter === 'all' || reference.kind === kindFilter);
  }), [bible.references, query, kindFilter]);
  const imageMap = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);

  useEffect(() => {
    if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [activeProjectId, projects, setActiveProjectId]);
  useEffect(() => {
    let alive = true;
    getSavedImages().then((records) => { if (alive) setImages(records); }).catch(() => { if (alive) setImages([]); });
    return () => { alive = false; };
  }, []);

  const persistBible = (next: typeof bible) => {
    if (!project) return;
    updateProject(project.id, { consistencyBible: next });
  };
  const resetEditor = () => { setEditingId(null); setName(''); setKind('character'); setDescription(''); setVoiceId(''); setVoiceSpeed('1'); setMusicGenre(''); setMusicBpm(''); setMusicKey(''); setMusicMood(''); setMusicInstruments(''); setMusicArrangement(''); setSoundCategory(''); setSoundTexture(''); setSoundIntensity(''); setSoundSpatial(''); setSoundNotes(''); setTags(''); };
  const startEdit = (reference: ConsistencyReference) => {
    setEditingId(reference.id); setName(reference.name); setKind(reference.kind); setDescription(reference.description); setVoiceId(reference.voiceProfile?.voiceId || ''); setVoiceSpeed(String(reference.voiceProfile?.speed ?? 1)); setMusicGenre(reference.musicProfile?.genre || ''); setMusicBpm(reference.musicProfile?.bpm ? String(reference.musicProfile.bpm) : ''); setMusicKey(reference.musicProfile?.key || ''); setMusicMood(reference.musicProfile?.mood || ''); setMusicInstruments(reference.musicProfile?.instruments || ''); setMusicArrangement(reference.musicProfile?.arrangement || ''); setSoundCategory(reference.soundProfile?.category || ''); setSoundTexture(reference.soundProfile?.texture || ''); setSoundIntensity(reference.soundProfile?.intensity || ''); setSoundSpatial(reference.soundProfile?.spatial || ''); setSoundNotes(reference.soundProfile?.notes || ''); setTags((reference.tags || []).join(', '));
    document.getElementById('consistency-reference-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const saveReference = () => {
    if (!project || !name.trim()) { showToast('Add a reference name before saving.', 'warning'); return; }
    const now = new Date().toISOString();
    const existing = bible.references.find((item) => item.id === editingId);
    const reference: ConsistencyReference = {
      id: existing?.id || makeId('ref'), kind, name: name.trim(), description: description.trim(),
      mediaIds: existing?.mediaIds || [],
      ...(kind === 'voice' ? { voiceProfile: { ...(voiceId.trim() ? { voiceId: voiceId.trim() } : {}), speed: Math.max(0.5, Math.min(2, Number(voiceSpeed) || 1)) } } : {}),
      ...(kind === 'music' ? { musicProfile: {
        ...(musicGenre.trim() ? { genre: musicGenre.trim() } : {}),
        ...(musicBpm.trim() && Number.isFinite(Number(musicBpm)) ? { bpm: Math.max(30, Math.min(300, Math.round(Number(musicBpm)))) } : {}),
        ...(musicKey.trim() ? { key: musicKey.trim() } : {}),
        ...(musicMood.trim() ? { mood: musicMood.trim() } : {}),
        ...(musicInstruments.trim() ? { instruments: musicInstruments.trim() } : {}),
        ...(musicArrangement.trim() ? { arrangement: musicArrangement.trim() } : {}),
      } } : {}),
      ...(kind === 'audio' ? { soundProfile: {
        ...(soundCategory.trim() ? { category: soundCategory.trim() } : {}),
        ...(soundTexture.trim() ? { texture: soundTexture.trim() } : {}),
        ...(soundIntensity.trim() ? { intensity: soundIntensity.trim() } : {}),
        ...(soundSpatial.trim() ? { spatial: soundSpatial.trim() } : {}),
        ...(soundNotes.trim() ? { notes: soundNotes.trim() } : {}),
      } } : {}),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    persistBible({ ...bible, references: existing ? bible.references.map((item) => item.id === existing.id ? reference : item) : [reference, ...bible.references] });
    resetEditor(); showToast(existing ? 'Consistency reference updated.' : 'Consistency reference created.', 'success');
  };
  const deleteReference = (reference: ConsistencyReference) => {
    if (!project || !window.confirm(`Delete “${reference.name}” from this project’s consistency library? Scene assignments will be removed; uploaded media will remain in Media Library.`)) return;
    persistBible({ ...bible, references: bible.references.filter((item) => item.id !== reference.id) });
    updateProject(project.id, { scenes: project.scenes.map((scene) => ({ ...scene, consistencyReferenceIds: (scene.consistencyReferenceIds || []).filter((id) => id !== reference.id) })) });
    if (editingId === reference.id) resetEditor();
    showToast('Reference deleted. Uploaded media was preserved.', 'info');
  };
  const uploadFiles = async (reference: ConsistencyReference, files: FileList | null) => {
    if (!project || !files?.length) return;
    const selected = Array.from(files);
    const invalid = selected.find((file) => !file.type.startsWith('image/') || file.size > 12 * 1024 * 1024);
    if (invalid) { showToast('Choose image files smaller than 12 MB each.', 'warning'); return; }
    setBusy(true);
    try {
      const saved = await Promise.all(selected.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image file.'));
          reader.onerror = () => reject(new Error('Could not read image file.'));
          reader.readAsDataURL(file);
        });
        return saveGeneratedImage({ title: file.name, dataUrl, model: 'user-upload', costUsd: null, projectId: project.id });
      }));
      const latest = projects.find((item) => item.id === project.id)?.consistencyBible || emptyBible();
      const target = latest.references.find((item) => item.id === reference.id);
      if (!target) throw new Error('Reference no longer exists. Refresh the library and try again.');
      persistBible({ ...latest, references: latest.references.map((item) => item.id === reference.id ? { ...item, mediaIds: [...(item.mediaIds || []), ...saved.map((image) => image.id)], updatedAt: new Date().toISOString() } : item) });
      setImages((current) => [...saved, ...current]); showToast(`Uploaded ${saved.length} reference image(s). Stored on this device.`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Image upload failed.', 'warning'); }
    finally { setBusy(false); }
  };
  const toggleSceneReference = (sceneId: string, referenceId: string, checked: boolean) => {
    if (!project) return;
    updateProject(project.id, { scenes: project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const ids = new Set(scene.consistencyReferenceIds || []);
      if (checked) ids.add(referenceId); else ids.delete(referenceId);
      return { ...scene, consistencyReferenceIds: [...ids] };
    }) });
  };
  const addRule = () => {
    if (!project || !ruleText.trim()) { showToast('Enter a consistency rule first.', 'warning'); return; }
    if (ruleSceneIds.length === 0 && ruleKind === 'all') {
      // Project-wide rules can intentionally cover every consistency category.
    }
    const rule: ConsistencyRule = {
      id: makeId('rule'), scope: ruleSceneIds.length ? 'scene' : 'project', instruction: ruleText.trim(),
      strength: ruleStrength, priority: Math.max(0, Math.min(100, Number(rulePriority) || 0)), active: true,
      ...(ruleSceneIds.length ? { sceneIds: ruleSceneIds } : {}),
      ...(ruleKind === 'all' ? {} : { appliesTo: [ruleKind] }),
    };
    persistBible({ ...bible, rules: [...bible.rules, rule] }); setRuleText(''); setRuleSceneIds([]); showToast('Consistency rule added.', 'success');
  };
  const toggleRule = (rule: ConsistencyRule) => persistBible({ ...bible, rules: bible.rules.map((item) => item.id === rule.id ? { ...item, active: !item.active } : item) });
  const removeRule = (ruleId: string) => persistBible({ ...bible, rules: bible.rules.filter((item) => item.id !== ruleId) });

  if (!project) return <div className={`${panelClass} p-8 text-center`}><Layers3 className="mx-auto mb-3 h-10 w-10 text-[#55F4FF]" /><h2 className="text-lg font-semibold text-white light:text-slate-900">Consistency Library</h2><p className="mt-2 text-sm text-slate-400 light:text-slate-600">Create a project first. Its references and continuity rules will be reusable across all scenes in that project.</p></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#55F4FF]"><Layers3 className="h-4 w-4" /> Universal Consistency</div><h1 className="text-2xl font-bold text-white light:text-slate-900 sm:text-3xl">Consistency Library</h1><p className="mt-2 max-w-2xl text-sm text-slate-400 light:text-slate-600">Create reusable identity, environment, product, style, voice and story references. Assign one reference to as many scenes as needed.</p></div>
      <div className="w-full md:max-w-xs"><label className="mb-1.5 block text-xs font-medium text-slate-400 light:text-slate-600">Project workspace</label><select aria-label="Select project for consistency library" className={inputClass} value={project.id} onChange={(event) => setActiveProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className={`${panelClass} p-4`}><p className="text-xs text-slate-400">References</p><p className="mt-1 text-2xl font-bold text-white light:text-slate-900">{bible.references.length}</p></div><div className={`${panelClass} p-4`}><p className="text-xs text-slate-400">Active rules</p><p className="mt-1 text-2xl font-bold text-white light:text-slate-900">{bible.rules.filter((rule) => rule.active).length}</p></div><div className={`${panelClass} p-4`}><p className="text-xs text-slate-400">Scenes</p><p className="mt-1 text-2xl font-bold text-white light:text-slate-900">{project.scenes.length}</p></div><div className={`${panelClass} p-4`}><p className="text-xs text-slate-400">Assignments</p><p className="mt-1 text-2xl font-bold text-white light:text-slate-900">{project.scenes.reduce((sum, scene) => sum + (scene.consistencyReferenceIds?.length || 0), 0)}</p></div></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input aria-label="Search consistency references" className={`${inputClass} pl-9`} placeholder="Search references…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Filter references by category" className={`${inputClass} sm:max-w-48`} value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">All categories</option>{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        {filteredReferences.length === 0 ? <div className={`${panelClass} p-8 text-center`}><ImageIcon className="mx-auto mb-3 h-8 w-8 text-slate-500" /><p className="font-medium text-white light:text-slate-900">No references yet</p><p className="mt-1 text-sm text-slate-400">Add a reference to define something that must stay consistent.</p></div> : <div className="grid gap-3 md:grid-cols-2">{filteredReferences.map((reference) => {
          const firstImage = reference.mediaIds?.map((id) => imageMap.get(id)).find(Boolean);
          const assignedCount = project.scenes.filter((scene) => scene.consistencyReferenceIds?.includes(reference.id)).length;
          return <article key={reference.id} className={`${panelClass} overflow-hidden`}>
            {firstImage ? <img src={firstImage.dataUrl} alt={reference.name} className="h-36 w-full bg-black/20 object-cover" /> : <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#171A35] to-[#0d1024] text-[#55F4FF]"><ImageIcon className="h-8 w-8 opacity-70" /></div>}
            <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><span className="text-[10px] font-semibold uppercase tracking-wider text-[#55F4FF]">{KIND_OPTIONS.find((item) => item.value === reference.kind)?.label || reference.kind}</span><h3 className="mt-1 font-semibold text-white light:text-slate-900">{reference.name}</h3></div><span className="shrink-0 rounded-full bg-[#20264a] px-2 py-1 text-[10px] text-slate-300 light:bg-slate-100 light:text-slate-600">{assignedCount} scenes</span></div>
              <p className="line-clamp-3 min-h-12 whitespace-pre-wrap text-xs leading-5 text-slate-400 light:text-slate-600">{reference.description || 'No description added.'}</p>
              {!!reference.tags?.length && <div className="flex flex-wrap gap-1">{reference.tags.map((tag) => <span key={tag} className="rounded bg-[#1a2040] px-2 py-1 text-[10px] text-slate-300 light:bg-slate-100 light:text-slate-600">{tag}</span>)}</div>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#252b50] pt-3 light:border-slate-200"><label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#55F4FF] hover:underline"><Upload className="h-3.5 w-3.5" /> Upload image<input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(event) => { void uploadFiles(reference, event.target.files); event.currentTarget.value = ''; }} /></label><div className="flex gap-1"><button onClick={() => startEdit(reference)} aria-label={`Edit ${reference.name}`} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white light:hover:bg-slate-100 light:hover:text-slate-900"><Pencil className="h-4 w-4" /></button><button onClick={() => deleteReference(reference)} aria-label={`Delete ${reference.name}`} className="rounded-md p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>
            </div>
          </article>;
        })}</div>}
      </section>
      <aside className="space-y-5">
        <section id="consistency-reference-editor" className={`${panelClass} scroll-mt-4 p-5`}><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white light:text-slate-900">{editingId ? 'Edit reference' : 'Create reference'}</h2>{editingId && <button onClick={resetEditor} aria-label="Cancel editing" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>}</div><div className="space-y-3"><div><label className="mb-1.5 block text-xs text-slate-400">Reference name</label><input className={inputClass} placeholder="e.g. Milo — Main Character" value={name} onChange={(event) => setName(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Category</label><select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as ConsistencyAssetKind)}>{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div><label className="mb-1.5 block text-xs text-slate-400">Description & continuity details</label><textarea className={`${inputClass} min-h-28 resize-y`} placeholder="Describe appearance, materials, layout, colors, voice traits or story facts that must remain consistent…" value={description} onChange={(event) => setDescription(event.target.value)} /></div>{kind === 'voice' && <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs text-slate-400">Speech model Voice ID (optional)</label><input className={inputClass} placeholder="e.g. alloy" value={voiceId} onChange={(event) => setVoiceId(event.target.value)} /><p className="mt-1 text-[10px] text-slate-500">Must be supported by the selected speech model.</p></div><div><label className="mb-1.5 block text-xs text-slate-400">Speaking speed</label><input className={inputClass} type="number" min="0.5" max="2" step="0.05" value={voiceSpeed} onChange={(event) => setVoiceSpeed(event.target.value)} /><p className="mt-1 text-[10px] text-slate-500">0.5 = slower · 1 = normal · 2 = faster</p></div></div>}{kind === 'music' && <div className="space-y-3 rounded-xl border border-[#30365f] light:border-slate-200 p-3"><p className="text-xs font-semibold text-[#55F4FF] light:text-indigo-600">Music identity profile</p><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs text-slate-400">Genre</label><input className={inputClass} placeholder="e.g. cinematic orchestral" value={musicGenre} onChange={(event) => setMusicGenre(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Tempo (BPM)</label><input className={inputClass} type="number" min="30" max="300" placeholder="e.g. 96" value={musicBpm} onChange={(event) => setMusicBpm(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Musical key</label><input className={inputClass} placeholder="e.g. D minor" value={musicKey} onChange={(event) => setMusicKey(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Mood</label><input className={inputClass} placeholder="e.g. hopeful, tense, playful" value={musicMood} onChange={(event) => setMusicMood(event.target.value)} /></div></div><div><label className="mb-1.5 block text-xs text-slate-400">Instruments & signature sounds</label><textarea className={inputClass} rows={2} placeholder="e.g. piano, warm strings, soft synth pulse" value={musicInstruments} onChange={(event) => setMusicInstruments(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Arrangement & continuity</label><textarea className={inputClass} rows={2} placeholder="e.g. keep the same motif; build gently; no sudden genre change" value={musicArrangement} onChange={(event) => setMusicArrangement(event.target.value)} /></div><p className="text-[10px] text-slate-500">These settings create a reusable soundtrack brief. Actual music-track generation depends on a connected provider that supports it.</p></div>}{kind === 'audio' && <div className="space-y-3 rounded-xl border border-[#30365f] light:border-slate-200 p-3"><p className="text-xs font-semibold text-[#55F4FF] light:text-indigo-600">Sound-effect / ambience profile</p><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs text-slate-400">Sound category</label><input className={inputClass} placeholder="e.g. city ambience, machine hum" value={soundCategory} onChange={(event) => setSoundCategory(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Texture</label><input className={inputClass} placeholder="e.g. airy, metallic, dusty" value={soundTexture} onChange={(event) => setSoundTexture(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Intensity</label><input className={inputClass} placeholder="e.g. subtle, medium, powerful" value={soundIntensity} onChange={(event) => setSoundIntensity(event.target.value)} /></div><div><label className="mb-1.5 block text-xs text-slate-400">Spatial character</label><input className={inputClass} placeholder="e.g. close, wide stereo, distant" value={soundSpatial} onChange={(event) => setSoundSpatial(event.target.value)} /></div></div><div><label className="mb-1.5 block text-xs text-slate-400">Continuity notes</label><textarea className={inputClass} rows={2} placeholder="Describe what must sound the same in every scene." value={soundNotes} onChange={(event) => setSoundNotes(event.target.value)} /></div></div>}<div><label className="mb-1.5 block text-xs text-slate-400">Tags (comma separated)</label><input className={inputClass} placeholder="blue, robot, hero" value={tags} onChange={(event) => setTags(event.target.value)} /></div><button onClick={saveReference} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF] px-4 py-2.5 text-sm font-semibold text-[#090B18] hover:brightness-110"><Check className="h-4 w-4" />{editingId ? 'Save changes' : 'Create reference'}</button></div></section>
        <section className={`${panelClass} p-5`}><div className="mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-[#55F4FF]" /><h2 className="font-semibold text-white light:text-slate-900">Share references across scenes</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Select scenes that should reuse each reference. One reference can be assigned to multiple scenes in this project.</p><div className="max-h-80 space-y-3 overflow-y-auto pr-1">{project.scenes.map((scene) => <div key={scene.id} className="rounded-lg border border-[#252b50] p-3 light:border-slate-200"><p className="mb-2 text-xs font-semibold text-white light:text-slate-900">Scene {scene.order}: {scene.visualPrompt.slice(0, 64) || 'Untitled scene'}</p>{bible.references.length ? <div className="space-y-2">{bible.references.map((reference) => <label key={reference.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 light:text-slate-700"><input type="checkbox" checked={(scene.consistencyReferenceIds || []).includes(reference.id)} onChange={(event) => toggleSceneReference(scene.id, reference.id, event.target.checked)} className="accent-cyan-400" />{reference.name}</label>)}</div> : <p className="text-xs text-slate-500">Create references to assign them here.</p>}</div>)}{project.scenes.length === 0 && <p className="text-xs text-slate-500">Add scenes in Storyboard to assign references.</p>}</div></section>
      </aside>
    </div>
    <section className={`${panelClass} p-5 sm:p-6`}><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#55F4FF]" /><div><h2 className="font-semibold text-white light:text-slate-900">Project Consistency Rules</h2><p className="text-xs text-slate-400">Rules are stored with this project and included in the scene consistency context.</p></div></div><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_100px]"><textarea aria-label="New consistency rule" className={`${inputClass} min-h-20 resize-y`} placeholder="e.g. Keep the character's scarf yellow in every shot." value={ruleText} onChange={(event) => setRuleText(event.target.value)} /><select aria-label="Rule strength" className={inputClass} value={ruleStrength} onChange={(event) => setRuleStrength(event.target.value as typeof ruleStrength)}><option value="locked">Locked</option><option value="preferred">Preferred</option><option value="flexible">Flexible</option></select><select aria-label="Rule category" className={inputClass} value={ruleKind} onChange={(event) => setRuleKind(event.target.value as typeof ruleKind)}><option value="all">All categories</option>{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input aria-label="Rule priority" className={inputClass} type="number" min="0" max="100" value={rulePriority} onChange={(event) => setRulePriority(event.target.value)} /></div><details className="mt-3"><summary className="cursor-pointer text-xs text-[#55F4FF]">Limit rule to selected scenes (optional)</summary><div className="mt-3 flex flex-wrap gap-3">{project.scenes.map((scene) => <label key={scene.id} className="flex items-center gap-2 text-xs text-slate-300 light:text-slate-700"><input type="checkbox" checked={ruleSceneIds.includes(scene.id)} onChange={(event) => setRuleSceneIds((current) => event.target.checked ? [...current, scene.id] : current.filter((id) => id !== scene.id))} className="accent-cyan-400" />Scene {scene.order}</label>)}</div></details><button onClick={addRule} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#55F4FF]/40 bg-[#55F4FF]/10 px-4 py-2 text-xs font-semibold text-[#55F4FF] hover:bg-[#55F4FF]/15"><Plus className="h-4 w-4" />Add rule</button><div className="mt-5 space-y-2">{bible.rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded-lg border border-[#252b50] p-3 sm:flex-row sm:items-center sm:justify-between light:border-slate-200"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${rule.strength === 'locked' ? 'bg-red-500/10 text-red-400' : rule.strength === 'preferred' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>{rule.strength}</span><span className="text-[10px] text-slate-500">{rule.scope} · priority {rule.priority}</span>{!rule.active && <span className="text-[10px] text-slate-500">Disabled</span>}</div><p className="whitespace-pre-wrap text-xs text-slate-300 light:text-slate-700">{rule.instruction}</p></div><div className="flex shrink-0 items-center gap-2"><button onClick={() => toggleRule(rule)} className="rounded-md border border-[#30365f] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 light:border-slate-300 light:text-slate-700">{rule.active ? 'Disable' : 'Enable'}</button><button onClick={() => removeRule(rule.id)} aria-label="Delete consistency rule" className="rounded-md p-2 text-slate-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>)}{bible.rules.length === 0 && <p className="py-3 text-xs text-slate-500">No rules yet. Add rules to define project-wide or scene-specific continuity.</p>}</div></section>
    <p className="text-[11px] leading-5 text-slate-500">Reference descriptions and scene assignments are saved in this project on this device. Uploaded reference images are stored in the existing VYRA Media Library IndexedDB store. Cross-device reference sync is not included in this phase. {busy && <span className="inline-flex items-center gap-1 text-[#55F4FF]"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</span>}</p>
  </div>;
};
