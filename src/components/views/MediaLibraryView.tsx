/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { MediaAsset } from '../../types';
import { deleteSavedImage, getSavedImages, SavedMediaImage } from '../../services/mediaLibraryStorage';
import {
  Image,
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
  const { mediaAssets, addMediaAsset, deleteMediaAsset, showToast } = useStudio();

  const [activeTab, setActiveTab] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedImages, setSavedImages] = useState<SavedMediaImage[]>([]);
  const [loadingSavedImages, setLoadingSavedImages] = useState(true);

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

  // New asset form
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<MediaAsset['type']>('image');
  const [newTag, setNewTag] = useState('');

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
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header and Upload action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
            Media Asset Library
          </h1>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-0.5">
            Organize generated scene backdrops, holographic avatars, audio tracks, and brand vector kits
          </p>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors shadow-sm shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span>Upload / Register Asset</span>
        </button>
      </div>

      {/* Filter Tabs (Zero-pill discipline: segmented control buttons) */}
      <div className="flex items-center gap-1 p-1 bg-[#171A35] light:bg-slate-100 rounded-lg max-w-md">
        {[
          { id: 'all', label: 'All Assets' },
          { id: 'image', label: 'Visual Scenes' },
          { id: 'video', label: 'B-Roll Video' },
          { id: 'audio', label: 'Audio & Music' },
          { id: 'brand_asset', label: 'Brand Kit' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === tab.id
                ? 'bg-[#090B18] light:bg-white text-[#55F4FF] light:text-slate-900 shadow-xs font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Generated images saved in browser IndexedDB */}
      {(activeTab === 'all' || activeTab === 'image') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-white light:text-slate-900">Generated Images</h2>
            <span className="text-[11px] text-slate-500">{savedImages.length} saved on this device</span>
          </div>
          {loadingSavedImages ? (
            <p className="text-xs text-slate-500">Loading saved images…</p>
          ) : savedImages.length === 0 ? (
            <p className="text-xs text-slate-500 rounded-xl border border-dashed border-[#2B3058] light:border-slate-300 p-4">Images saved from Settings → OpenRouter Image Generator will appear here.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {savedImages.map((image) => (
                <article key={image.id} className="rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden">
                  <div className="aspect-video bg-[#090B18]">
                    <img src={image.dataUrl} alt={image.title} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                  <div className="p-3 space-y-2">
                    <h3 className="text-xs font-bold text-white light:text-slate-900 break-words">{image.title}</h3>
                    <p className="text-[10px] text-slate-500 break-all">{image.model}</p>
                    <p className="text-[10px] text-slate-500">{new Date(image.createdAt).toLocaleString()} · {image.costUsd === null ? 'Cost not reported' : '
        {filteredAssets.map((asset) => (
          <div
            key={asset.id}
            className="group rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden flex flex-col justify-between hover:border-[#55F4FF]/50 transition-all"
          >
            {/* Asset Visual Preview */}
            <div className="relative aspect-video bg-[#090B18] overflow-hidden">
              {asset.type === 'image' || asset.type === 'video' ? (
                <img
                  src={asset.url}
                  alt={asset.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E2345] to-[#090B18] text-[#55F4FF]">
                  <Music className="w-8 h-8" />
                </div>
              )}

              <div className="absolute top-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs uppercase">
                {asset.type}
              </div>

              {asset.dimensions && (
                <div className="absolute bottom-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  {asset.dimensions}
                </div>
              )}
            </div>

            {/* Asset Metadata */}
            <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-white light:text-slate-900 line-clamp-1 group-hover:text-[#55F4FF] transition-colors">
                  {asset.title}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {asset.tags.map((tag, tagIndex) => (
                    <span
                      key={`${asset.id}-tag-${tagIndex}-${tag}`}
                      className="text-[10px] text-slate-400 light:text-slate-600 flex items-center gap-1"
                    >
                      <Tag className="w-2.5 h-2.5 text-[#8D7CFF]" />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#2B3058]/50 light:border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleCopyPath(asset.url, asset.id)}
                  title="Copy local asset URL"
                  className="text-[11px] text-[#55F4FF] light:text-[#6366F1] hover:underline flex items-center gap-1"
                >
                  {copiedId === asset.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedId === asset.id ? 'Copied' : 'Copy Path'}</span>
                </button>

                <button
                  onClick={() => deleteMediaAsset(asset.id)}
                  aria-label="Remove asset"
                  className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload/Add Modal */}
      {showUploadModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
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
 + image.costUsd.toFixed(4)}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <a href={image.dataUrl} download={'vyra-' + image.id + '.png'} className="text-[11px] font-semibold text-[#55F4FF] light:text-indigo-600 hover:underline">Download</a>
                      <button type="button" onClick={() => void handleDeleteSavedImage(image)} aria-label={'Delete ' + image.title} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Assets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredAssets.map((asset) => (
          <div
            key={asset.id}
            className="group rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden flex flex-col justify-between hover:border-[#55F4FF]/50 transition-all"
          >
            {/* Asset Visual Preview */}
            <div className="relative aspect-video bg-[#090B18] overflow-hidden">
              {asset.type === 'image' || asset.type === 'video' ? (
                <img
                  src={asset.url}
                  alt={asset.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1E2345] to-[#090B18] text-[#55F4FF]">
                  <Music className="w-8 h-8" />
                </div>
              )}

              <div className="absolute top-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs uppercase">
                {asset.type}
              </div>

              {asset.dimensions && (
                <div className="absolute bottom-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  {asset.dimensions}
                </div>
              )}
            </div>

            {/* Asset Metadata */}
            <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-white light:text-slate-900 line-clamp-1 group-hover:text-[#55F4FF] transition-colors">
                  {asset.title}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {asset.tags.map((tag, tagIndex) => (
                    <span
                      key={`${asset.id}-tag-${tagIndex}-${tag}`}
                      className="text-[10px] text-slate-400 light:text-slate-600 flex items-center gap-1"
                    >
                      <Tag className="w-2.5 h-2.5 text-[#8D7CFF]" />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#2B3058]/50 light:border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleCopyPath(asset.url, asset.id)}
                  title="Copy local asset URL"
                  className="text-[11px] text-[#55F4FF] light:text-[#6366F1] hover:underline flex items-center gap-1"
                >
                  {copiedId === asset.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedId === asset.id ? 'Copied' : 'Copy Path'}</span>
                </button>

                <button
                  onClick={() => deleteMediaAsset(asset.id)}
                  aria-label="Remove asset"
                  className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload/Add Modal */}
      {showUploadModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
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
