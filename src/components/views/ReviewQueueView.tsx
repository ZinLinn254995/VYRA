/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Clock,
  Film,
  Layers,
  ArrowRight,
  Share2,
  Info,
  Edit3,
} from 'lucide-react';

export const ReviewQueueView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    approveProject,
    requestChanges,
    updateProject,
    navigateToProjectWorkspace,
    showToast,
  } = useStudio();

  // Find projects that are in review or changes requested, or default to all active
  const reviewQueueProjects = projects.filter(
    (p) => p.status === 'in_review' || p.status === 'changes_requested' || p.status === 'approved'
  );

  const [selectedId, setSelectedId] = useState<string>(
    activeProjectId && reviewQueueProjects.some((p) => p.id === activeProjectId)
      ? activeProjectId
      : reviewQueueProjects[0]?.id || projects[0]?.id || ''
  );

  const currentProject = projects.find((p) => p.id === selectedId) || reviewQueueProjects[0];

  // Review states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);

  // Editable publishing details
  const [editableTitle, setEditableTitle] = useState<string>(currentProject?.title || '');
  const [editableCaption, setEditableCaption] = useState<string>(
    currentProject?.publishingCaption || ''
  );

  // Sync when selected project changes
  const handleSelectProject = (id: string) => {
    setSelectedId(id);
    setActiveProjectId(id);
    const p = projects.find((item) => item.id === id);
    if (p) {
      setEditableTitle(p.title);
      setEditableCaption(p.publishingCaption || '');
      setActiveSceneIdx(0);
      setIsPlaying(false);
    }
  };

  const handleApprove = () => {
    if (!currentProject) return;
    // Save title & caption first
    updateProject(currentProject.id, {
      title: editableTitle,
      publishingCaption: editableCaption,
    });
    approveProject(currentProject.id);
  };

  const handleRequestChangesSubmit = () => {
    if (!currentProject) return;
    if (!feedbackNote.trim()) {
      showToast('Please provide constructive feedback notes for the changes', 'warning');
      return;
    }
    requestChanges(currentProject.id, feedbackNote);
    setShowFeedbackModal(false);
    setFeedbackNote('');
  };

  if (!currentProject) {
    return (
      <div className="p-12 text-center rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 max-w-xl mx-auto space-y-3">
        <Film className="w-8 h-8 text-[#55F4FF] mx-auto" />
        <h2 className="text-base font-bold text-white light:text-slate-900">
          Review Queue is Empty
        </h2>
        <p className="text-xs text-slate-400">
          No projects are currently awaiting review. Complete a storyboard in the workspace to submit it.
        </p>
      </div>
    );
  }

  const activeScene = currentProject.scenes[activeSceneIdx] || currentProject.scenes[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header and Context Notice */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
              Review & Quality Queue
            </h1>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Verify script pacing, visual aesthetics, and finalize multi-platform captions before distribution.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400 light:text-slate-600">
            {reviewQueueProjects.length} items in review workflow
          </div>
        </div>

        {/* Mandatory WP1 Architecture Notice (Requirement 7) */}
        <div className="p-3.5 rounded-xl bg-[#171A35] light:bg-indigo-50/50 border border-[#2B3058] light:border-indigo-100 flex items-start gap-3 text-xs text-slate-300 light:text-slate-700">
          <Info className="w-4 h-4 text-[#55F4FF] light:text-[#6366F1] shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-semibold text-white light:text-slate-900">
              Work Package 1 Architectural Boundary:
            </span>
            <p className="text-slate-400 light:text-slate-600">
              Editorial approval in this phase records verification in the review pipeline. Social
              channel APIs remain <strong className="text-slate-200 light:text-slate-800">Not Connected</strong> pending real
              OAuth authorization in the WP2 backend integration.
            </p>
          </div>
        </div>
      </div>

      {/* Main Review Workspace: Left Queue List + Right Video & Metadata Inspection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Col: Projects In Review (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Queue Selection
          </h2>

          <div className="space-y-2">
            {projects.map((proj) => {
              const isSelected = proj.id === currentProject.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => handleSelectProject(proj.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#55F4FF] bg-[#171A35] light:bg-slate-100 shadow-sm'
                      : 'border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-white hover:border-slate-500'
                  }`}
                >
                  <div className="flex gap-3">
                    <img
                      src={proj.coverImage}
                      alt={proj.title}
                      className="w-16 h-12 object-cover rounded bg-slate-950 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-mono capitalize ${
                            proj.status === 'approved'
                              ? 'text-emerald-400'
                              : proj.status === 'in_review'
                              ? 'text-[#55F4FF]'
                              : proj.status === 'changes_requested'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {proj.status.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {proj.targetDuration}s
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-white light:text-slate-900 truncate mt-0.5">
                        {proj.title}
                      </h3>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {proj.targetPlatforms.join(' · ')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Video Preview & Approval Controls (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Video Preview Card */}
          <div className="p-5 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2B3058]/60 light:border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono text-slate-400">
                  Format: {currentProject.aspectRatio} · {currentProject.category}
                </span>
                <h2 className="text-base font-bold text-white light:text-slate-900">
                  {currentProject.title}
                </h2>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                    currentProject.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : currentProject.status === 'changes_requested'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-[#55F4FF]/20 text-[#55F4FF] border border-[#55F4FF]/40'
                  }`}
                >
                  Status: {currentProject.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Video Player Display */}
            <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center border border-[#2B3058]">
              <img
                src={activeScene?.mediaUrl || currentProject.coverImage}
                alt={currentProject.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />

              {/* Dynamic subtitle overlay */}
              <div className="absolute inset-x-6 bottom-8 text-center pointer-events-none">
                <p className="inline-block bg-black/85 text-[#55F4FF] font-bold text-xs sm:text-sm px-4 py-1.5 rounded-lg shadow-xl max-w-xl">
                  {activeScene?.narration}
                </p>
              </div>

              {/* Playback Overlay */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-[#55F4FF] text-[#090B18] flex items-center justify-center shadow-xl">
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </div>
              </button>

              <div className="absolute top-3 left-3 text-[11px] font-mono px-2 py-0.5 rounded bg-black/70 text-white">
                Scene {activeSceneIdx + 1} of {currentProject.scenes.length}
              </div>
            </div>

            {/* Scene Selectors strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {currentProject.scenes.map((sc, idx) => (
                <button
                  key={sc.id}
                  onClick={() => setActiveSceneIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 flex items-center gap-1.5 ${
                    activeSceneIdx === idx
                      ? 'bg-[#55F4FF] text-[#090B18] font-bold'
                      : 'bg-[#090B18] light:bg-slate-100 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Scene 0{sc.order}</span>
                  <span className="text-[10px] opacity-75">{sc.duration}s</span>
                </button>
              ))}
            </div>

            {/* Review Notes Callout if changes were requested */}
            {currentProject.reviewNotes && (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Review Notes & Feedback</span>
                </div>
                <p className="leading-relaxed">{currentProject.reviewNotes}</p>
              </div>
            )}

            {/* Metadata & Social Caption Editor */}
            <div className="space-y-3 pt-2 border-t border-[#2B3058]/60 light:border-slate-100">
              <h3 className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-[#55F4FF]" />
                <span>Publishing Title & Social Caption</span>
              </h3>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Public Release Title</label>
                <input
                  type="text"
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">
                  Social Media Caption & Tags (Shorts / TikTok / Reels)
                </label>
                <textarea
                  rows={3}
                  value={editableCaption}
                  onChange={(e) => setEditableCaption(e.target.value)}
                  className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
                />
              </div>

              {/* Destination Platforms Checklist */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Assigned Channels</label>
                <div className="flex flex-wrap gap-2">
                  {currentProject.targetPlatforms.map((plat, idx) => (
                    <span
                      key={`${currentProject.id}-plat-${idx}-${plat}`}
                      className="text-xs px-2.5 py-1 rounded bg-[#090B18] light:bg-slate-100 text-slate-300 light:text-slate-700 border border-[#2B3058] light:border-slate-300"
                    >
                      {plat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Bar (Approve vs Request Changes) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#2B3058]/60 light:border-slate-100">
              <button
                onClick={() => navigateToProjectWorkspace(currentProject.id)}
                className="text-xs text-slate-400 hover:text-white light:hover:text-slate-900 flex items-center gap-1"
              >
                <span>Edit in Storyboard Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  Request Changes
                </button>

                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-[#090B18] hover:bg-emerald-400 transition-colors shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve for Publishing</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Modal for Request Changes */}
      {showFeedbackModal && (
        <div
          role="presentation"
          onClick={() => setShowFeedbackModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Request Storyboard Revisions</span>
              </h3>
              <p className="text-xs text-slate-400">
                Specify what needs adjustment (e.g. voiceover pacing, visual framing, or legal disclaimers).
              </p>
            </div>

            <textarea
              rows={4}
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              placeholder="e.g. Please shorten Scene 2 narration by 2 seconds and update the prompt to include more blue rim lighting..."
              className="w-full p-3 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] focus:outline-none focus:border-amber-400"
            />

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestChangesSubmit}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
              >
                Submit Changes Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
