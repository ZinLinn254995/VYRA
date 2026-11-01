import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock3, Copy, ExternalLink, Loader2, RefreshCw, Search, ShieldAlert, Video, XCircle } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { getVideoGenerationJobs, SavedVideoGenerationJob, VideoGenerationJobStatus } from '../../services/mediaLibraryStorage';

type JobFilter = 'all' | 'active' | 'attention' | 'failed' | 'completed';

const ACTIVE_STATUSES: VideoGenerationJobStatus[] = ['pending', 'in_progress'];
const ATTENTION_STATUSES: VideoGenerationJobStatus[] = ['needs_attention', 'expired', 'cancelled'];
const FAILED_STATUSES: VideoGenerationJobStatus[] = ['failed'];

const statusLabel: Record<VideoGenerationJobStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  needs_attention: 'Needs attention',
};

const statusStyle: Record<VideoGenerationJobStatus, string> = {
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  in_progress: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  failed: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  cancelled: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  expired: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  needs_attention: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
};

const formatCost = (value?: number | null) => value == null ? 'Not reported' : '$' + value.toFixed(4);

export const VideoJobRecoveryView: React.FC = () => {
  const { navigateToProjectWorkspace, projects, showToast } = useStudio();
  const [jobs, setJobs] = useState<SavedVideoGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<JobFilter>('all');
  const [query, setQuery] = useState('');

  const refreshJobs = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      setJobs(await getVideoGenerationJobs());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not read saved video jobs on this device.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshJobs();
    const onFocus = () => { void refreshJobs(true); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshJobs]);

  const counts = useMemo(() => ({
    active: jobs.filter((job) => ACTIVE_STATUSES.includes(job.status)).length,
    attention: jobs.filter((job) => ATTENTION_STATUSES.includes(job.status)).length,
    failed: jobs.filter((job) => FAILED_STATUSES.includes(job.status)).length,
    completed: jobs.filter((job) => job.status === 'completed').length,
  }), [jobs]);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && ACTIVE_STATUSES.includes(job.status)) ||
      (filter === 'attention' && ATTENTION_STATUSES.includes(job.status)) ||
      (filter === 'failed' && FAILED_STATUSES.includes(job.status)) ||
      (filter === 'completed' && job.status === 'completed');
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [job.projectTitle, job.model, job.jobId, job.prompt, job.lastError || ''].some((value) => value.toLowerCase().includes(needle));
    return matchesFilter && matchesQuery;
  }), [jobs, filter, query]);

  const copyJobId = async (jobId: string) => {
    try {
      await navigator.clipboard.writeText(jobId);
      showToast('Video Job ID copied', 'success');
    } catch {
      showToast('Clipboard access is unavailable in this browser.', 'warning');
    }
  };

  const projectExists = (job: SavedVideoGenerationJob) => projects.some((project) => project.id === job.projectId);
  const openProject = (job: SavedVideoGenerationJob) => {
    if (!projectExists(job)) {
      showToast('The original project is not available in this browser. The saved Job ID has been kept.', 'warning');
      return;
    }
    navigateToProjectWorkspace(job.projectId);
  };

  const filters: { id: JobFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All jobs', count: jobs.length },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'attention', label: 'Needs attention', count: counts.attention },
    { id: 'failed', label: 'Failed', count: counts.failed },
    { id: 'completed', label: 'Completed', count: counts.completed },
  ];

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#55F4FF] light:text-indigo-600 text-xs font-semibold mb-1">
            <Activity className="w-4 h-4" /> VIDEO OPERATIONS
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">Video Job Recovery</h1>
          <p className="text-xs sm:text-sm text-slate-400 light:text-slate-500 mt-1 max-w-2xl">
            Track saved OpenRouter video jobs on this device and return to the original project without submitting a duplicate generation.
          </p>
        </div>
        <button onClick={() => void refreshJobs(true)} disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-[#2B3058] light:border-slate-300 text-xs font-semibold text-slate-200 light:text-slate-700 hover:bg-[#171A35] light:hover:bg-slate-100 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh jobs
        </button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active jobs', value: counts.active, icon: <Loader2 className="w-4 h-4 text-cyan-400" /> },
          { label: 'Needs attention', value: counts.attention, icon: <ShieldAlert className="w-4 h-4 text-amber-400" /> },
          { label: 'Failed', value: counts.failed, icon: <XCircle className="w-4 h-4 text-rose-400" /> },
          { label: 'Completed records', value: counts.completed, icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400 light:text-slate-500">{item.icon}{item.label}</div>
            <div className="text-2xl font-bold tabular-nums text-white light:text-slate-900 mt-2">{loading ? '—' : item.value}</div>
          </div>
        ))}
      </section>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-xs font-bold text-cyan-300 light:text-cyan-700">Recovery safety</h2>
          <p className="text-xs leading-relaxed text-slate-300 light:text-slate-600 mt-1">
            Job IDs and recovery details are stored in this browser's IndexedDB. Your OpenRouter API key is not stored here. If your browser session has ended, reconnect your key in Settings before continuing. Failed, expired, or cancelled jobs are never automatically submitted again.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${filter === item.id ? 'bg-[#55F4FF] text-[#090B18]' : 'bg-[#171A35] light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900'}`}>
                {item.label} <span className="ml-1 opacity-70 tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>
          <label className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, model or Job ID"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-xs bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-300 text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#55F4FF]" />
          </label>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div><p className="text-sm font-semibold text-rose-300">Could not load saved jobs</p><p className="text-xs text-slate-400 mt-1">{loadError}</p></div>
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-xs text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading saved video jobs…</div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2B3058] light:border-slate-300 p-10 text-center">
            <Video className="w-8 h-8 mx-auto text-slate-500 mb-3" />
            <h2 className="text-sm font-semibold text-white light:text-slate-900">{jobs.length === 0 ? 'No saved video jobs yet' : 'No jobs match this filter'}</h2>
            <p className="text-xs text-slate-500 mt-1">{jobs.length === 0 ? 'When you start an OpenRouter video generation, its Job ID and recovery details will appear here.' : 'Try another status filter or search term.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const canContinue = ACTIVE_STATUSES.includes(job.status) || job.status === 'needs_attention' || (job.status === 'completed' && Boolean(job.savedVideoId));
              return (
                <article key={job.jobId} className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-white light:text-slate-900 break-words">{job.projectTitle}</h3>
                        <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold ${statusStyle[job.status]}`}>{statusLabel[job.status]}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Scene {job.sceneOrder} · {job.duration}s · {job.aspectRatio}{job.resolution ? ' · ' + job.resolution : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canContinue && projectExists(job) && <button onClick={() => openProject(job)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#55F4FF] text-[#090B18] text-xs font-bold hover:bg-[#55F4FF]/90"><ExternalLink className="w-3.5 h-3.5" />Open project</button>}
                      {!projectExists(job) && <span className="text-[10px] text-amber-400">Project not found here</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Provider model</p><p className="text-slate-200 light:text-slate-700 mt-1 break-all">{job.model}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Reported cost</p><p className="text-slate-200 light:text-slate-700 mt-1 font-mono tabular-nums">{formatCost(job.costUsd)}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Last updated</p><p className="text-slate-200 light:text-slate-700 mt-1">{formatDate(job.updatedAt)}</p></div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#2B3058]/70 light:border-slate-100">
                    <button onClick={() => void copyJobId(job.jobId)} className="inline-flex items-center gap-2 text-[10px] text-slate-400 hover:text-[#55F4FF] light:hover:text-indigo-600 min-w-0">
                      <Copy className="w-3 h-3 shrink-0" /><span className="font-mono truncate">Job ID: {job.jobId}</span>
                    </button>
                    <span className="text-[10px] text-slate-500">Created {formatDate(job.createdAt)}</span>
                  </div>
                  {job.lastError && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200 light:text-amber-800 break-words">{job.lastError}</div>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
