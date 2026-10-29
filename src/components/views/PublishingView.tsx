/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { BRAND_CONFIG } from '../../config/brand';
import {
  Share2,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  Key,
} from 'lucide-react';

export const PublishingView: React.FC = () => {
  const { projects, showToast, navigateToReviewQueue } = useStudio();
  const [selectedChannelForSetup, setSelectedChannelForSetup] = useState<any | null>(null);
  const [tiktokStatus, setTiktokStatus] = useState<any>({ configured: false, connected: false });
  const [tiktokBusy, setTiktokBusy] = useState(false);
  const [publishProject, setPublishProject] = useState<any | null>(null);
  const [publishFile, setPublishFile] = useState<File | null>(null);
  const [publishDuration, setPublishDuration] = useState(0);
  const [caption, setCaption] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');

  const refreshTikTokStatus = async () => {
    try {
      const response = await fetch('/api/tiktok/status', { credentials: 'same-origin', cache: 'no-store' });
      const status = await response.json();
      if (response.ok) setTiktokStatus(status);
    } catch { setTiktokStatus({ configured: false, connected: false }); }
  };
  useEffect(() => { void refreshTikTokStatus(); }, []);

  // Approved projects waiting in dispatch queue
  const approvedProjects = projects.filter(
    (p) => p.status === 'approved' || p.status === 'ready_to_publish'
  );

  const handleConnect = (channel: { id: string; name: string }) => {
    if (channel.id === 'tiktok') {
      if (!tiktokStatus.configured) {
        showToast('TikTok server setup is incomplete. Configure server credentials and durable storage first.', 'info');
        return;
      }
      window.location.assign('/api/tiktok/connect');
      return;
    }
    handleSimulateConnect(channel.name);
  };

  const handleSimulateConnect = (channelName: string) => {
    showToast(
      `Integration requires server-side OAuth flow in WP2. "${channelName}" remains Not Connected.`,
      'info'
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header and Scope Notice */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
              Social Media Publishing & Channels
            </h1>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Multi-platform distribution hubs, scheduled automation, and OAuth API connections
            </p>
          </div>
          <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30">
            TikTok Direct Post: Foundation
          </span>
        </div>

        {/* Clear architecture notice */}
        <div className="p-4 rounded-xl bg-[#171A35] light:bg-slate-100 border border-[#2B3058] light:border-slate-200 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-slate-300 light:text-slate-700 leading-relaxed">
            <span className="font-bold text-white light:text-slate-900">
              Publishing Service Integration Guardrail:
            </span>
            <p className="text-slate-400 light:text-slate-600">
              Per engineering guidelines, all social platform integrations are explicitly displayed as{' '}
              <strong className="text-amber-400">Not Connected</strong>. Video dispatch will be
              enabled once OAuth client IDs and tokens (YouTube Data API, TikTok Posting, Instagram Graph,
              LinkedIn) are configured via server-side endpoints in WP2.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Channel Integration Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white light:text-slate-900">
            Connected Distribution Channels
          </h2>
          <span className="text-xs font-mono text-slate-400">{tiktokStatus.connected ? '1 of 5 channels connected' : '0 of 5 channels connected'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BRAND_CONFIG.socialChannels.map((channel) => (
            <div
              key={channel.id}
              className="p-5 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#090B18] light:bg-slate-100 flex items-center justify-center text-[#55F4FF]">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-white light:text-slate-900">
                      {channel.name}
                    </span>
                  </div>

                  {/* Explicit Not Connected Badge */}
                  <span className={"text-[10px] font-mono font-semibold px-2 py-0.5 rounded border " + (channel.id === 'tiktok' && tiktokStatus.connected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700')}>
                    {channel.id === 'tiktok' ? (tiktokStatus.connected ? (tiktokStatus.creator?.nickname || 'Connected') : 'Not Connected') : 'Not Connected'}
                  </span>
                </div>

                <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">
                  {channel.description}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {channel.formats.map((fmt, idx) => (
                    <span
                      key={`${channel.id}-fmt-${idx}-${fmt}`}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#090B18] light:bg-slate-50 text-slate-400 border border-[#2B3058]/50"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#2B3058]/50 light:border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setSelectedChannelForSetup(channel)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <Key className="w-3.5 h-3.5 text-[#55F4FF]" />
                  <span>View API Scopes</span>
                </button>

                <button
                  onClick={() => handleConnect(channel)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E2345] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-colors"
                >
                  {channel.id === 'tiktok' && tiktokStatus.connected ? 'Reconnect Account' : 'Connect Account'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Approved Videos Awaiting Social Dispatch */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white light:text-slate-900">
              Distribution Dispatch Queue
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Approved videos staged for publication once platforms are authorized
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {approvedProjects.length} staged videos
          </span>
        </div>

        {approvedProjects.length > 0 ? (
          <div className="space-y-3">
            {approvedProjects.map((proj) => (
              <div
                key={proj.id}
                className="p-4 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={proj.coverImage}
                    alt={proj.title}
                    className="w-20 h-14 rounded-lg object-cover bg-slate-900 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approved
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{proj.targetDuration}s</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.aspectRatio}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white light:text-slate-900 truncate mt-0.5">
                      {proj.title}
                    </h3>
                    <p className="text-xs text-slate-400 light:text-slate-500 truncate mt-0.5">
                      {proj.publishingCaption || 'No caption entered'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => navigateToReviewQueue(proj.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#2B3058] text-slate-300 hover:text-white"
                  >
                    Inspect Package
                  </button>
                  <button
                    onClick={() => {
                      if (!tiktokStatus.connected) { showToast('Connect TikTok before publishing.', 'info'); return; }
                      setPublishProject(proj);
                      setPublishFile(null);
                      setPublishDuration(0);
                      setCaption(proj.publishingCaption || proj.title);
                      setPrivacyLevel('');
                      setConfirmed(false);
                      setPublishMessage('');
                    }}
                    disabled={!tiktokStatus.connected}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Publish to TikTok
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl bg-[#171A35]/50 border border-dashed border-[#2B3058] text-xs text-slate-400">
            No approved videos in the publishing queue. Review and approve a video in the Review
            Queue to stage it here.
          </div>
        )}
      </section>


      {publishProject && (
        <div role="presentation" onClick={() => !tiktokBusy && setPublishProject(null)} className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (!publishFile || !privacyLevel || !confirmed || !publishDuration) { setPublishMessage('Select a video, choose privacy, and confirm before publishing.'); return; }
            if (publishFile.size > 64 * 1024 * 1024) { setPublishMessage('This upload flow supports files up to 64 MiB.'); return; }
            setTiktokBusy(true);
            setPublishMessage('Initializing TikTok post…');
            try {
              const initResponse = await fetch('/api/tiktok/publish/init', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption, privacyLevel, durationSeconds: publishDuration, videoSize: publishFile.size, confirmed: true, disableComment: false, disableDuet: false, disableStitch: false, isAigc: true })
              });
              const initData = await initResponse.json();
              if (!initResponse.ok) throw new Error(initData.error || 'Could not initialize TikTok post.');
              setPublishMessage('Uploading video to TikTok…');
              const uploadResponse = await fetch(initData.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': publishFile.type || 'video/mp4', 'Content-Range': 'bytes 0-' + (publishFile.size - 1) + '/' + publishFile.size },
                body: publishFile
              });
              if (!uploadResponse.ok) throw new Error('TikTok upload did not complete. Browser CORS restrictions may require a different upload path.');
              setPublishMessage('Video uploaded. Checking publication status…');
              let terminal = false;
              for (let attempt = 0; attempt < 8; attempt++) {
                await new Promise(resolve => window.setTimeout(resolve, 2500));
                const statusResponse = await fetch('/api/tiktok/publish/' + encodeURIComponent(initData.publishId) + '/status', { method: 'POST', credentials: 'same-origin' });
                const statusData = await statusResponse.json();
                if (!statusResponse.ok) throw new Error(statusData.error || 'Unable to check TikTok status.');
                const status = String(statusData.status || 'PROCESSING').toUpperCase();
                if (['PUBLISH_COMPLETE', 'PUBLISH_FAILED', 'FAILED'].includes(status)) {
                  terminal = true;
                  setPublishMessage(status === 'PUBLISH_COMPLETE' ? 'TikTok confirms the post is published.' : 'TikTok could not publish: ' + (statusData.failReason || status));
                  break;
                }
                setPublishMessage('TikTok status: ' + status + '…');
              }
              if (!terminal) setPublishMessage('TikTok is still processing. Check status later and do not start a duplicate post.');
            } catch (error) {
              setPublishMessage(error instanceof Error ? error.message : 'Publishing failed. Please retry carefully.');
            } finally { setTiktokBusy(false); }
          }} onClick={event => event.stopPropagation()} className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-5 sm:p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-white light:text-slate-900">Publish to TikTok</h3>
              <p className="text-xs text-slate-400 mt-1">Video: {publishProject.title}. This publishes immediately, not on a future schedule.</p>
            </div>
            <label className="block space-y-1.5 text-xs text-slate-300 light:text-slate-700">
              <span>Video file (MP4 recommended, max 64 MiB)</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={tiktokBusy} required className="block w-full text-xs" onChange={event => {
                const file = event.target.files?.[0] || null;
                setPublishFile(file);
                setPublishDuration(0);
                if (!file) return;
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => { setPublishDuration(Number.isFinite(video.duration) ? video.duration : 0); URL.revokeObjectURL(url); };
                video.onerror = () => URL.revokeObjectURL(url);
                video.src = url;
              }} />
              {publishFile && <span className="block text-slate-400">{publishFile.name} · {(publishFile.size / (1024 * 1024)).toFixed(1)} MiB · {publishDuration ? Math.ceil(publishDuration) + ' sec' : 'Reading duration…'}</span>}
              {publishDuration > 0 && tiktokStatus.creator?.maxVideoDurationSeconds && publishDuration > tiktokStatus.creator.maxVideoDurationSeconds && <span className="block text-red-400">Exceeds account limit of {tiktokStatus.creator.maxVideoDurationSeconds} seconds.</span>}
            </label>
            <label className="block space-y-1.5 text-xs text-slate-300 light:text-slate-700">
              <span>Caption</span>
              <textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} rows={3} disabled={tiktokBusy} className="w-full rounded-lg bg-[#090B18] light:bg-slate-50 border border-[#2B3058] p-3 text-sm" />
              <span className="text-slate-500">{caption.length}/2200</span>
            </label>
            <label className="block space-y-1.5 text-xs text-slate-300 light:text-slate-700">
              <span>Who can watch? (Choose manually; no default)</span>
              <select required value={privacyLevel} onChange={event => setPrivacyLevel(event.target.value)} disabled={tiktokBusy} className="w-full rounded-lg bg-[#090B18] light:bg-slate-50 border border-[#2B3058] p-3 text-sm">
                <option value="" disabled>Select privacy</option>
                {(tiktokStatus.creator?.privacyOptions || []).map((option: string) => <option key={option} value={option}>{option.replaceAll('_', ' ').toLowerCase()}</option>)}
              </select>
            </label>
            <label className="flex gap-2 items-start text-xs text-slate-300 light:text-slate-700">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={tiktokBusy} className="mt-0.5" />
              <span>I reviewed this video, caption and privacy setting, and authorize VYRA to send it to TikTok now. Posting may not be reversible.</span>
            </label>
            {publishMessage && <div role="status" className="rounded-lg border border-[#2B3058] p-3 text-xs text-slate-200 light:text-slate-700">{publishMessage}</div>}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" disabled={tiktokBusy} onClick={() => setPublishProject(null)} className="px-4 py-2 rounded-lg text-xs border border-[#2B3058] text-slate-300">Close</button>
              <button type="submit" disabled={tiktokBusy || !publishFile || !privacyLevel || !confirmed || !publishDuration || Boolean(tiktokStatus.creator?.maxVideoDurationSeconds && publishDuration > tiktokStatus.creator.maxVideoDurationSeconds)} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#55F4FF] text-[#090B18] disabled:opacity-40">{tiktokBusy ? 'Publishing…' : 'Confirm & Publish Now'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Scope Inspector Modal */}
      {selectedChannelForSetup && (
        <div
          role="presentation"
          onClick={() => setSelectedChannelForSetup(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white light:text-slate-900">
              {selectedChannelForSetup.name} API Specifications
            </h3>
            <p className="text-xs text-slate-300 light:text-slate-600 leading-relaxed">
              {selectedChannelForSetup.description}
            </p>
            <div className="p-3 rounded-lg bg-[#090B18] text-xs font-mono text-[#55F4FF] space-y-1">
              <div>// WP2 Integration Target</div>
              <div>AUTH_MODE: Client OAuth 2.0 PKCE</div>
              <div>TOKEN_STORAGE: Encrypted Session Proxy</div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedChannelForSetup(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#55F4FF] text-[#090B18]"
              >
                Close Spec
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
