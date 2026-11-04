/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { MediaAsset } from '../../types';
import { deleteSavedImage, getSavedImages, SavedMediaImage, deleteSavedVideo, getSavedVideos, SavedMediaVideo, getSavedAudios, deleteSavedAudio, SavedMediaAudio } from '../../services/mediaLibraryStorage';
import {
  Image,
  Folder, FolderPlus, FileText, X,
  Upload,
  Plus,
  Trash2,
  Copy,
  Check,
  Film,
  Music,
  Tag,
  ExternalLink,
} from 'lucide-react';

export const MediaLibraryView: React.FC = () => {
  const { mediaAssets, addMediaAsset, deleteMediaAsset, updateScene, updateProject, projects, showToast } = useStudio();

  const [activeTab, setActiveTab] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedImages, setSavedImages] = useState<SavedMediaImage[]>([]);
  const [loadingSavedImages, setLoadingSavedImages] = useState(true);
  const [savedVideos, setSavedVideos] = useState<SavedMediaVideo[]>([]);
  const [savedVideoUrls, setSavedVideoUrls] = useState<Record<string, string>>({});
  const [loadingSavedVideos, setLoadingSavedVideos] = useState(true);
  const [savedAudios, setSavedAudios] = useState<SavedMediaAudio[]>([]);
  const [savedAudioUrls, setSavedAudioUrls] = useState<Record<string, string>>({});
  const [loadingSavedAudios, setLoadingSavedAudios] = useState(true);

  const refreshSavedImages = async () => {
    try {
      setSavedImages(await getSavedImages());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load saved images', 'warning');
    } finally {
      setLoadingSavedImages(false);
    }
  };

  useEffect(() => {
    void refreshSavedImages();
  }, []);

  const refreshSavedVideos = async () => {
    try {
      setSavedVideos(await getSavedVideos());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load saved videos', 'warning');
    } finally {
      setLoadingSavedVideos(false);
    }
  };

  useEffect(() => {
    void refreshSavedVideos();
  }, []);

  useEffect(() => {
    const urls: Record<string, string> = {};
    savedVideos.forEach((video) => {
      urls[video.id] = URL.createObjectURL(video.blob);
    });
    setSavedVideoUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [savedVideos]);

  const refreshSavedAudios = async () => {
    try {
      setSavedAudios(await getSavedAudios());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load saved voiceovers', 'warning');
    } finally {
      setLoadingSavedAudios(false);
    }
  };

  useEffect(() => {
    void refreshSavedAudios();
  }, []);

  useEffect(() => {
    const urls: Record<string, string> = {};
    savedAudios.forEach((audio) => {
      urls[audio.id] = URL.createObjectURL(audio.blob);
    });
    setSavedAudioUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [savedAudios]);

  // New asset form
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<MediaAsset['type']>('image');
  const [newTag, setNewTag] = useState('');
  type LibraryFile = { id:string; title:string; kind:'image'|'video'|'audio'|'brand_asset'; url:string; folder:string; details:string; source:'saved-image'|'saved-video'|'saved-audio'|'studio'; original:any };
  const [activeFolder, setActiveFolder] = useState('All Files');
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [previewFile, setPreviewFile] = useState<LibraryFile|null>(null);
  const pressTimer = React.useRef<ReturnType<typeof setTimeout>|null>(null);
  const longPressed = React.useRef(false);
  const libraryFiles:LibraryFile[] = [
    ...savedImages.map(x=>({id:x.id,title:x.title,kind:'image' as const,url:x.dataUrl,folder:'Images',details:x.model,source:'saved-image' as const,original:x})),
    ...savedVideos.map(x=>({id:x.id,title:x.title,kind:'video' as const,url:savedVideoUrls[x.id]||'',folder:'Videos',details:x.model,source:'saved-video' as const,original:x})),
    ...savedAudios.map(x=>({id:x.id,title:x.title,kind:'audio' as const,url:savedAudioUrls[x.id]||'',folder:'Audio',details:x.sourceType==='uploaded'?'Uploaded audio':x.model,source:'saved-audio' as const,original:x})),
    ...mediaAssets.map(x=>({id:x.id,title:x.title,kind:x.type as LibraryFile['kind'],url:x.url,folder:x.type==='brand_asset'?'Brand Kit':x.type==='image'?'Images':x.type==='video'?'Videos':'Audio',details:(x.tags||[]).join(', '),source:'studio' as const,original:x})),
  ];
  const folderNames = ['Images','Videos','Audio','Brand Kit',...customFolders];
  const visibleFiles = libraryFiles.filter(file => activeFolder==='All Files' || file.folder===activeFolder);
  const beginFilePress = (id:string) => { longPressed.current=false; if(pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current=setTimeout(()=>{longPressed.current=true;setSelectMode(true);setSelectedFiles(current=>current.includes(id)?current:[...current,id]);},480); };
  const endFilePress = () => { if(pressTimer.current) clearTimeout(pressTimer.current); };
  const openFile = (file:LibraryFile) => { if(longPressed.current){longPressed.current=false;return;} if(selectMode){setSelectedFiles(current=>current.includes(file.id)?current.filter(x=>x!==file.id):[...current,file.id]);return;} setPreviewFile(file); };
  const createLibraryFolder = () => { const name=window.prompt('Folder name'); if(!name?.trim()) return; const clean=name.trim(); if(folderNames.some(x=>x.toLowerCase()===clean.toLowerCase())){showToast('A folder with that name already exists','warning');return;} setCustomFolders(current=>[...current,clean]); showToast('Folder created','success'); };
  const createLibraryFile = () => { setShowUploadModal(true); };


  const filteredAssets = mediaAssets.filter((asset) => {
    if (activeTab === 'image') return asset.type === 'image';
    if (activeTab === 'video') return asset.type === 'video';
    if (activeTab === 'audio') return asset.type === 'audio';
    if (activeTab === 'brand_asset') return asset.type === 'brand_asset';
    return true;
  });

  const handleCopyPath = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Asset path copied to clipboard', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteSavedImage = async (image: SavedMediaImage) => {
    if (!window.confirm('Delete "' + image.title + '" from this device’s Media Library?')) return;
    try {
      await deleteSavedImage(image.id);
      setSavedImages((current) => current.filter((item) => item.id !== image.id));
      showToast('Saved image removed from this device', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete image', 'warning');
    }
  };

  const handleDeleteSavedVideo = async (video: SavedMediaVideo) => {
    if (!window.confirm('Delete "' + video.title + '" from this device’s Media Library? This also unlinks the clip from its scene.')) return;
    try {
      await deleteSavedVideo(video.id);
      updateScene(video.projectId, video.sceneId, { generatedVideoId: undefined });
      setSavedVideos((current) => current.filter((item) => item.id !== video.id));
      showToast('Saved video removed from this device', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete video', 'warning');
    }
  };

  const handleDeleteSavedAudio = async (audio: SavedMediaAudio) => {
    const isUploadedTrack = audio.sourceType === 'uploaded';
    const warning = isUploadedTrack
      ? 'Delete "' + audio.title + '" from this device’s Media Library? Any project timeline using this file will be unlinked.'
      : 'Delete "' + audio.title + '" from this device’s Media Library? This also unlinks the voiceover from its scene.';
    if (!window.confirm(warning)) return;
    try {
      await deleteSavedAudio(audio.id);
      if (audio.sceneId !== '__project_audio_track__') {
        updateScene(audio.projectId, audio.sceneId, { generatedAudioId: undefined });
      }
      const owningProject = projects.find((project) => project.id === audio.projectId);
      if (owningProject) {
        updateProject(owningProject.id, {
          audioTracks: (owningProject.audioTracks || []).filter((track) => track.mediaId !== audio.id),
        });
      }
      setSavedAudios((current) => current.filter((item) => item.id !== audio.id));
      showToast(isUploadedTrack ? 'Audio asset removed from this device and project timeline' : 'Saved voiceover removed from this device', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete audio', 'warning');
    }
  };

  const handleCreateAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) {
      showToast('Please provide an asset title and URL', 'warning');
      return;
    }

    addMediaAsset({
      title: newTitle,
      url: newUrl,
      type: newType,
      tags: newTag ? newTag.split(',').map((t) => t.trim()) : ['Custom'],
      dimensions: newType === 'image' ? '1920x1080' : undefined,
    });

    setNewTitle('');
    setNewUrl('');
    setNewTag('');
    setShowUploadModal(false);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-16 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-white light:text-slate-900">Media Library</h1><p className="mt-1 text-xs text-slate-400">A simple place for all your images, videos, audio and creative files.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={createLibraryFolder} className="inline-flex items-center gap-2 rounded-lg border border-[#2B3058] px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-[#171A35]"><FolderPlus className="h-4 w-4"/> New Folder</button>
          <button onClick={createLibraryFile} className="inline-flex items-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2.5 text-xs font-bold text-[#090B18] hover:bg-[#55F4FF]/90"><Upload className="h-4 w-4"/> Add File</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2B3058] bg-[#11142B] light:bg-white p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button onClick={()=>{setActiveFolder('All Files');setSelectedFiles([]);setSelectMode(false);}} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeFolder==='All Files'?'bg-[#55F4FF]/15 text-[#55F4FF]':'text-slate-400 hover:bg-white/5'}`}>All Files</button>
          {folderNames.map(name=><button key={name} onClick={()=>{setActiveFolder(name);setSelectedFiles([]);setSelectMode(false);}} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeFolder===name?'bg-[#55F4FF]/15 text-[#55F4FF]':'text-slate-400 hover:bg-white/5'}`}>{name}</button>)}
        </div>
        <div className="flex items-center gap-2"><span className="text-[11px] text-slate-500">{visibleFiles.length} files</span><button onClick={()=>{setSelectMode(v=>!v);setSelectedFiles([]);}} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectMode?'border-cyan-300 text-cyan-200':'border-[#2B3058] text-slate-300'}`}>{selectMode?'Exit Select':'Select'}</button></div>
      </div>
      {selectMode&&<div className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100"><span>{selectedFiles.length} selected</span><button onClick={()=>setSelectedFiles([])} className="text-cyan-200 hover:underline">Clear selection</button></div>}
      {loadingSavedImages||loadingSavedVideos||loadingSavedAudios?<p className="py-10 text-center text-xs text-slate-500">Loading media files…</p>:(
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {activeFolder==='All Files'&&folderNames.map(name=><button key={name} onClick={()=>setActiveFolder(name)} className="flex min-h-32 flex-col items-start justify-between rounded-xl border border-[#2B3058] bg-[#171A35] light:bg-white p-4 text-left transition hover:border-[#55F4FF]/50"><Folder className="h-8 w-8 text-[#55F4FF]"/><span className="w-full truncate text-xs font-semibold text-white light:text-slate-900">{name}</span><span className="text-[10px] text-slate-500">{libraryFiles.filter(file=>file.folder===name).length} items</span></button>)}
          {visibleFiles.map(file=>{const selected=selectedFiles.includes(file.id);const Icon=file.kind==='video'?Film:file.kind==='audio'?Music:file.kind==='brand_asset'?Tag:Image;return <button key={file.source+file.id} onPointerDown={()=>beginFilePress(file.id)} onPointerUp={endFilePress} onPointerLeave={endFilePress} onPointerCancel={endFilePress} onContextMenu={e=>{e.preventDefault();setSelectMode(true);setSelectedFiles(v=>v.includes(file.id)?v:[...v,file.id]);}} onClick={()=>openFile(file)} className={`overflow-hidden rounded-xl border text-left transition ${selected?'border-cyan-300 bg-cyan-300/10':'border-[#2B3058] bg-[#171A35] light:bg-white hover:border-[#55F4FF]/50'}`}>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#090B18] light:bg-slate-100">{file.kind==='image'&&file.url?<img src={file.url} alt={file.title} className="h-full w-full object-contain"/>:file.kind==='video'&&file.url?<video src={file.url} preload="metadata" muted playsInline className="h-full w-full object-contain"/>:<Icon className="h-9 w-9 text-[#55F4FF]"/>}<span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[9px] uppercase text-white">{file.kind.replace('_',' ')}</span>{selected&&<span className="absolute right-2 top-2 rounded-full bg-cyan-300 p-1 text-slate-950"><Check className="h-3 w-3"/></span>}</div>
            <div className="p-3"><p className="truncate text-xs font-semibold text-white light:text-slate-900">{file.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{file.details||file.folder}</p></div>
          </button>})}
          {visibleFiles.length===0&&<div className="col-span-full rounded-xl border border-dashed border-[#2B3058] p-10 text-center text-xs text-slate-500">This folder is empty.</div>}
        </div>
      )}
      {previewFile&&<div role="presentation" onClick={()=>setPreviewFile(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div onClick={e=>e.stopPropagation()} className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#2B3058] bg-[#11142B] shadow-2xl"><div className="flex items-center justify-between border-b border-[#2B3058] p-4"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-white">{previewFile.title}</h2><p className="mt-1 text-[10px] text-slate-500">{previewFile.kind.toUpperCase()} · {previewFile.folder}</p></div><button onClick={()=>setPreviewFile(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><X className="h-4 w-4"/></button></div><div className="flex max-h-[65vh] min-h-48 items-center justify-center bg-black/30 p-4">{previewFile.kind==='image'&&previewFile.url?<img src={previewFile.url} alt={previewFile.title} className="max-h-[60vh] max-w-full object-contain"/>:previewFile.kind==='video'&&previewFile.url?<video src={previewFile.url} controls playsInline className="max-h-[60vh] max-w-full"/>:previewFile.kind==='audio'&&previewFile.url?<audio src={previewFile.url} controls className="w-full"/>:<div className="text-center text-slate-400"><FileText className="mx-auto h-10 w-10"/><p className="mt-2 text-xs">File preview is not available for this asset.</p></div>}</div><div className="border-t border-[#2B3058] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">File Details</p><p className="mt-2 text-xs text-slate-300">{previewFile.details||'No additional details.'}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-slate-500">Source: {previewFile.source==='studio'?'Studio asset':'Saved on this device'}</p><div className="flex items-center gap-3">{previewFile.url&&<a href={previewFile.url} download={previewFile.title} className="text-[11px] font-semibold text-cyan-300 hover:underline">Download</a>}<button onClick={async()=>{if(previewFile.source==='saved-image') await handleDeleteSavedImage(previewFile.original); else if(previewFile.source==='saved-video') await handleDeleteSavedVideo(previewFile.original); else if(previewFile.source==='saved-audio') await handleDeleteSavedAudio(previewFile.original); else deleteMediaAsset(previewFile.id); setPreviewFile(null);}} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300"><Trash2 className="h-3 w-3"/> Delete</button></div></div></div></div></div>}
      {/* Upload/Add Modal */}
      {showUploadModal && (
        <div
          role="presentation"
          onClick={() => setShowUploadModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <h3 className="text-base font-bold text-white light:text-slate-900">
              Register Studio Media Asset
            </h3>

            <form onSubmit={handleCreateAsset} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 light:text-slate-700">Asset Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Holographic HUD Vector Overlay"
                  className="w-full px-3 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 light:text-slate-700">Media URL / Path</label>
                <input
                  type="text"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="e.g. /src/assets/images/... or public path"
                  className="w-full px-3 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 light:text-slate-700">Asset Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] focus:outline-none"
                >
                  <option value="image">Visual Image</option>
                  <option value="video">Video B-Roll</option>
                  <option value="audio">Voiceover / Audio</option>
                  <option value="brand_asset">Brand Vector Kit</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300 light:text-slate-700">Tags (comma separated)</label>
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="e.g. Neon, Futuristic, Macro"
                  className="w-full px-3 py-2 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90"
                >
                  Add to Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
