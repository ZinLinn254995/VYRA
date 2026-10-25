/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useStudio } from '../../context/StudioContext';
import { Project, ContentCategory } from '../../types';
import {
  Plus,
  Search,
  Filter,
  Copy,
  Archive,
  RotateCcw,
  Trash2,
  Clock,
  Layers,
  ArrowRight,
  Film,
  Sparkles,
} from 'lucide-react';

export const ProjectsView: React.FC = () => {
  const {
    projects,
    setCurrentSection,
    navigateToProjectWorkspace,
    navigateToReviewQueue,
    duplicateProject,
    archiveProject,
    unarchiveProject,
    deleteProject,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
  } = useStudio();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');

  const categories: ContentCategory[] = [
    'Tech & AI',
    'Science & Future',
    'Product Showcase',
    'Business & Finance',
    'Documentary',
    'Lifestyle & Culture',
  ];

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Status filter
      if (statusFilter === 'active' && project.status === 'archived') return false;
      if (statusFilter === 'draft' && project.status !== 'draft') return false;
      if (statusFilter === 'in_review' && project.status !== 'in_review') return false;
      if (statusFilter === 'approved' && project.status !== 'approved' && project.status !== 'ready_to_publish') return false;
      if (statusFilter === 'archived' && project.status !== 'archived') return false;

      // Category filter
      if (selectedCategory !== 'all' && project.category !== selectedCategory) return false;

      // Format filter
      if (selectedFormat !== 'all' && project.aspectRatio !== selectedFormat) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = project.title.toLowerCase().includes(query);
        const matchesTopic = project.topic.toLowerCase().includes(query);
        const matchesCategory = project.category.toLowerCase().includes(query);
        const matchesScenes = project.scenes.some(
          (sc) =>
            sc.narration.toLowerCase().includes(query) ||
            sc.visualPrompt.toLowerCase().includes(query)
        );
        return matchesTitle || matchesTopic || matchesCategory || matchesScenes;
      }

      return true;
    });
  }, [projects, statusFilter, selectedCategory, selectedFormat, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header and Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
            Project Catalog
          </h1>
          <p className="text-xs text-slate-400 light:text-slate-600 mt-0.5">
            Manage your AI video storyboards, review pipelines, and published creative assets
          </p>
        </div>

        <button
          onClick={() => setCurrentSection('create')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Filter and Search Bar Controls (Functional segmented controls adhering to zero-pill rules) */}
      <div className="p-4 rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-3.5">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Status Tabs Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-[#090B18] light:bg-slate-100 rounded-lg overflow-x-auto">
            {[
              { id: 'all', label: 'All Projects' },
              { id: 'active', label: 'Active' },
              { id: 'draft', label: 'Drafts' },
              { id: 'in_review', label: 'In Review' },
              { id: 'approved', label: 'Approved' },
              { id: 'archived', label: 'Archived' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
                  statusFilter === tab.id
                    ? 'bg-[#1E2345] light:bg-white text-white light:text-slate-900 shadow-xs'
                    : 'text-slate-400 light:text-slate-600 hover:text-slate-200 light:hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, prompt, narration..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-slate-100 light:text-slate-900 placeholder:text-slate-500 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] transition-all"
            />
          </div>
        </div>

        {/* Secondary Filters (Category & Aspect Ratio) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#2B3058]/60 light:border-slate-100 text-xs text-slate-400 light:text-slate-600">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 light:text-slate-700">
            <Filter className="w-3.5 h-3.5" />
            <span>Category:</span>
          </span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1 text-xs rounded bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-300 text-slate-200 light:text-slate-800 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 light:text-slate-700 ml-2">
            <span>Aspect Ratio:</span>
          </span>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-2.5 py-1 text-xs rounded bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-300 text-slate-200 light:text-slate-800 focus:outline-none"
          >
            <option value="all">All Ratios</option>
            <option value="9:16">9:16 Vertical (Shorts / Reels)</option>
            <option value="16:9">16:9 Widescreen (Landscape)</option>
            <option value="1:1">1:1 Square (Feed)</option>
          </select>

          {(selectedCategory !== 'all' || selectedFormat !== 'all' || searchQuery || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedFormat('all');
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="text-[11px] text-[#55F4FF] light:text-[#6366F1] hover:underline ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group rounded-xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 overflow-hidden flex flex-col justify-between hover:border-[#55F4FF]/50 light:hover:border-indigo-400 transition-all"
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

                {/* Aspect ratio */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[11px] font-mono text-white">
                  {project.aspectRatio}
                </div>

                {/* Duration */}
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-[11px] font-mono tabular-nums text-white bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                  <Clock className="w-3 h-3 text-[#55F4FF]" />
                  <span>{project.targetDuration}s</span>
                </div>
              </div>

              {/* Card Details */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  {/* Clean unboxed metadata with bullet separators */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 light:text-slate-500">
                    <span>{project.category}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`capitalize font-medium ${
                        project.status === 'approved'
                          ? 'text-emerald-400 light:text-emerald-600'
                          : project.status === 'in_review'
                          ? 'text-[#55F4FF] light:text-blue-600'
                          : project.status === 'archived'
                          ? 'text-slate-500'
                          : 'text-amber-400 light:text-amber-600'
                      }`}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>

                  <h2 className="text-sm font-bold text-white light:text-slate-900 line-clamp-1 group-hover:text-[#55F4FF] light:group-hover:text-indigo-600 transition-colors">
                    {project.title}
                  </h2>
                  <p className="text-xs text-slate-400 light:text-slate-600 line-clamp-2">
                    {project.topic}
                  </p>
                </div>

                {/* Platforms target list */}
                <div className="text-[11px] text-slate-500 truncate">
                  Platforms: {project.targetPlatforms.join(', ')}
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-[#2B3058]/60 light:border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#8D7CFF]" />
                    <span className="font-mono tabular-nums">{project.scenes.length} scenes</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {project.status === 'in_review' ? (
                      <button
                        onClick={() => navigateToReviewQueue(project.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-[#8D7CFF] text-[#090B18] hover:bg-[#8D7CFF]/90 transition-colors"
                      >
                        Review
                      </button>
                    ) : (
                      <button
                        onClick={() => navigateToProjectWorkspace(project.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-[#1E2345] light:bg-slate-100 text-[#55F4FF] light:text-[#6366F1] hover:bg-[#55F4FF] hover:text-[#090B18] transition-colors"
                      >
                        Storyboard
                      </button>
                    )}

                    <button
                      onClick={() => duplicateProject(project.id)}
                      title="Duplicate project"
                      aria-label="Duplicate project"
                      className="p-1.5 text-slate-400 hover:text-white light:hover:text-slate-900 rounded hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {project.status === 'archived' ? (
                      <button
                        onClick={() => unarchiveProject(project.id)}
                        title="Restore project from archive"
                        aria-label="Restore project from archive"
                        className="p-1.5 text-slate-400 hover:text-emerald-400 rounded hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => archiveProject(project.id)}
                        title="Archive project"
                        aria-label="Archive project"
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => deleteProject(project.id)}
                      title="Delete project permanently"
                      aria-label="Delete project permanently"
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 text-center rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#1E2345] light:bg-slate-100 flex items-center justify-center text-[#55F4FF] light:text-[#6366F1]">
            <Film className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white light:text-slate-900">
              No matching projects found
            </h3>
            <p className="text-xs text-slate-400 light:text-slate-600 max-w-md mx-auto">
              We couldn't find any projects matching your current filters or search term. Try
              clearing your filters or create a brand new video.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setStatusFilter('all');
                setSelectedCategory('all');
                setSelectedFormat('all');
                setSearchQuery('');
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[#2B3058] light:border-slate-300 text-slate-300 light:text-slate-700 hover:bg-[#1E2345] light:hover:bg-slate-100 transition-colors"
            >
              Clear All Filters
            </button>
            <button
              onClick={() => setCurrentSection('create')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
            >
              Create New Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
