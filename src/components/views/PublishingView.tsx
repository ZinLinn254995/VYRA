/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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

  // Approved projects waiting in dispatch queue
  const approvedProjects = projects.filter(
    (p) => p.status === 'approved' || p.status === 'ready_to_publish'
  );

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
            Work Package 1: OAuth Mock Boundary
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
          <span className="text-xs font-mono text-slate-400">0 of 5 channels connected</span>
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
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Not Connected
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
                  onClick={() => handleSimulateConnect(channel.name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E2345] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-colors"
                >
                  Connect Account
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
                    onClick={() =>
                      showToast(
                        'Scheduled dispatch is held until OAuth channels are authenticated.',
                        'info'
                      )
                    }
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
                  >
                    Schedule Dispatch
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

      {/* Scope Inspector Modal */}
      {selectedChannelForSetup && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl">
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
