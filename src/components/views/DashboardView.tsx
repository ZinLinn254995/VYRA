/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  Sparkles,
  ArrowRight,
  Clock,
  Film,
  CheckCircle2,
  AlertCircle,
  Copy,
  Archive,
  Loader2,
  ExternalLink,
  Layers,
  Share2,
  Bot,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    brandName,
    brandTagline,
    projects,
    jobs,
    stats,
    setCurrentSection,
    navigateToProjectWorkspace,
    navigateToReviewQueue,
    duplicateProject,
    archiveProject,
  } = useStudio();

  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const recentProjects = activeProjects.slice(0, 3);
  const reviewPendingProjects = activeProjects.filter((p) => p.status === 'in_review');
  const drafts = activeProjects.filter((p) => p.status === 'draft');

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* 1. Hero / Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 p-6 sm:p-8 transition-colors">
        {/* Subtle decorative mesh gradient */}
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-20 w-96 h-96 bg-gradient-to-br from-[#8D7CFF]/15 via-[#55F4FF]/10 to-transparent rounded-full blur-3xl pointer-events-none"
        />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#55F4FF] light:text-[#6366F1]">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Studio Release 0.1 · Work Package 1 Foundation</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white light:text-slate-900">
              Welcome to {brandName}
            </h1>
            <p className="text-sm text-slate-300 light:text-slate-600 leading-relaxed">
              {brandTagline} Generate multi-scene cinematic scripts, direct holographic avatars, and
              orchestrate cross-platform social distribution from a single intelligent studio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => setCurrentSection('create')}
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-all shadow-[0_0_15px_rgba(85,244,255,0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55F4FF] whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Create New Video</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
            <button
              onClick={() => setCurrentSection('ideas')}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#1E2345] light:bg-slate-100 border border-[#2B3058] light:border-slate-300 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-colors whitespace-nowrap"
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>Brainstorm Ideas</span>
            </button>
            <button
              onClick={() => setCurrentSection('projects')}
              className="px-3.5 sm:px-4 py-2.5 rounded-lg text-xs font-medium border border-[#2B3058] light:border-slate-300 text-slate-300 light:text-slate-700 hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Browse Projects
            </button>
          </div>
        </div>

        {/* Studio Production KPI Bar (Using clean tabular-nums and unboxed text) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[#2B3058]/70 light:border-slate-200">
          <div>
            <div className="text-[11px] font-medium text-slate-400 light:text-slate-500">
              Active Projects
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-white light:text-slate-900 mt-0.5">
              {stats.totalProjects}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400 light:text-slate-500">
              In Review Queue
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#55F4FF] light:text-[#0284C7] mt-0.5">
              {stats.awaitingReview}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400 light:text-slate-500">
              Ready / Approved
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 light:text-emerald-600 mt-0.5">
              {stats.approvedCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400 light:text-slate-500">
              Rendered Scenes
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#8D7CFF] light:text-[#6366F1] mt-0.5">
              {stats.totalScenesRendered}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Generation Job Queue Status */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white light:text-slate-900">
              Generation Job Status
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Real-time pipeline monitoring for synthesis and audio rendering
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 light:text-slate-500">
            {jobs.length} jobs active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="p-4 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 light:text-slate-800 truncate">
                  {job.projectTitle}
                </span>
                {job.status === 'processing' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#55F4FF] light:text-blue-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Rendering
                  </span>
                ) : job.status === 'completed' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 light:text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" />
                    Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                    <Clock className="w-3 h-3" />
                    Queued
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400 light:text-slate-500">
                  <span className="capitalize">{job.jobType.replace('_', ' ')}</span>
                  <span className="font-mono tabular-nums">{job.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#090B18] light:bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      job.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF]'
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>

              <div className="text-[10px] text-slate-500 flex justify-between items-center pt-1 border-t border-[#2B3058]/50 light:border-slate-100">
                <span>Job ID: {job.id}</span>
                {job.status === 'processing' && (
                  <span className="font-mono tabular-nums">~{job.estimatedSecondsLeft}s left</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Recent Projects Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white light:text-slate-900">Recent Projects</h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Jump back into storyboards or check review progress
            </p>
          </div>
          <button
            onClick={() => setCurrentSection('projects')}
            className="text-xs font-semibold text-[#55F4FF] light:text-[#6366F1] hover:underline flex items-center gap-1"
          >
            <span>View All ({activeProjects.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {recentProjects.map((project) => (
            <div
              key={project.id}
              className="group rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden flex flex-col hover:border-[#55F4FF]/50 light:hover:border-indigo-400 transition-all"
            >
              {/* Media Thumbnail */}
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
                <img
                  src={project.coverImage}
                  alt={project.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090B18]/90 via-transparent to-transparent pointer-events-none" />

                {/* Aspect Ratio & Format metadata (unboxed clean text) */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[11px] font-mono text-white">
                  <span>{project.aspectRatio}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{project.format.replace('_', ' ')}</span>
                </div>

                {/* Duration indicator */}
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-[11px] font-mono tabular-nums text-white/90 bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                  <Clock className="w-3 h-3 text-[#55F4FF]" />
                  <span>{project.targetDuration}s</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  {/* Clean unboxed category & status */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 light:text-slate-500">
                    <span>{project.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize text-slate-300 light:text-slate-700">
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white light:text-slate-900 line-clamp-1 group-hover:text-[#55F4FF] light:group-hover:text-indigo-600 transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-xs text-slate-400 light:text-slate-600 line-clamp-2">
                    {project.topic}
                  </p>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-[#2B3058]/60 light:border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    <span>{project.scenes.length} scenes</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => duplicateProject(project.id)}
                      title="Duplicate project"
                      className="p-1.5 text-slate-400 hover:text-white light:hover:text-slate-900 rounded hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => navigateToProjectWorkspace(project.id)}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-[#1E2345] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-colors"
                    >
                      Edit Storyboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Two-Column Review Queue & Usage Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review Queue Spotlight */}
        <div className="p-5 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-2">
                <Film className="w-4 h-4 text-[#8D7CFF]" />
                <span>Awaiting Quality Review</span>
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {reviewPendingProjects.length} pending
              </span>
            </div>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Finished storyboards requiring editorial approval prior to distribution
            </p>
          </div>

          <div className="space-y-2.5">
            {reviewPendingProjects.length > 0 ? (
              reviewPendingProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-3 rounded-lg bg-[#090B18]/70 light:bg-slate-50 border border-[#2B3058]/60 light:border-slate-200 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-white light:text-slate-900 truncate">
                      {proj.title}
                    </h4>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{proj.targetPlatforms.join(', ')}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{proj.targetDuration}s</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigateToReviewQueue(proj.id)}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-[#8D7CFF] text-[#090B18] hover:bg-[#8D7CFF]/90 transition-colors shrink-0"
                  >
                    Open Review
                  </button>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 rounded-lg bg-[#090B18]/40 border border-dashed border-[#2B3058]">
                No videos awaiting review. Complete a storyboard to submit it.
              </div>
            )}
          </div>

          <button
            onClick={() => setCurrentSection('review')}
            className="w-full text-center text-xs font-semibold text-[#8D7CFF] light:text-[#6366F1] hover:underline pt-2"
          >
            Go to Full Review Queue →
          </button>
        </div>

        {/* Usage & Cost Summary (Honest Presentation) */}
        <div className="p-5 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white light:text-slate-900">
                Usage & Compute Cost Summary
              </h2>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Demo Metric
              </span>
            </div>
            <p className="text-xs text-slate-400 light:text-slate-500">
              GPU cluster telemetry placeholder. Real metering connects in WP2 backend integration.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[#090B18]/60 light:bg-slate-50 border border-[#2B3058]/50 light:border-slate-200">
              <span className="text-[11px] text-slate-400">Monthly Video Rendered</span>
              <div className="text-lg font-bold font-mono tabular-nums text-white light:text-slate-900 mt-1">
                {stats.generationSecondsUsed}s / {stats.monthlyQuotaSeconds}s
              </div>
              <span className="text-[10px] text-slate-500">12.5% of Tier Quota</span>
            </div>
            <div className="p-3 rounded-lg bg-[#090B18]/60 light:bg-slate-50 border border-[#2B3058]/50 light:border-slate-200">
              <span className="text-[11px] text-slate-400">Estimated Cost</span>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-400 light:text-emerald-600 mt-1">
                $0.00 <span className="text-xs font-normal text-slate-400">USD</span>
              </div>
              <span className="text-[10px] text-slate-500">Phase 1 Developer Mode</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#1E2345]/50 light:bg-slate-100 text-xs text-slate-300 light:text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 text-[#55F4FF] light:text-[#6366F1] font-semibold text-[11px]">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Production Pipeline Status</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              High-resolution GPU render engines and Cloud Run workers will be bound to billing in
              WP2. Live cloud billing metrics will populate here upon deployment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
