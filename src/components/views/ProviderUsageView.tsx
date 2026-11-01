import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, AudioLines, Clock3, Image as ImageIcon, Loader2, RefreshCw, Search, Video } from 'lucide-react';
import {
  getSavedAudios,
  getSavedImages,
  getSavedVideos,
  getVideoGenerationJobs,
  updateSavedMediaCost,
  updateVideoGenerationJob,
  updateLinkedVideoGenerationCost,
  type SavedMediaAudio,
  type SavedMediaImage,
  type SavedMediaVideo,
  type SavedVideoGenerationJob,
} from '../../services/mediaLibraryStorage';

type UsageKind = 'image' | 'video' | 'audio';
type TimeRange = '7d' | '30d' | 'all';
type OpenRouterKeyUsage = {
  usage: number | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  isFreeTier: boolean | null;
  expiresAt: string | null;
  fetchedAt: string;
};

type UsageEntry = {
  id: string;
  kind: UsageKind;
  title: string;
  model: string;
  createdAt: string;
  costUsd: number | null;
  status: string;
  projectTitle?: string;
  generationId?: string;
  mediaId?: string;
  detail?: string;
};

const money = (value: number) => '$' + value.toFixed(4);
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
};

function buildUsageEntries(
  images: SavedMediaImage[],
  videos: SavedMediaVideo[],
  audios: SavedMediaAudio[],
  jobs: SavedVideoGenerationJob[],
): UsageEntry[] {
  const linkedVideos = new Map<string, SavedVideoGenerationJob>();
  jobs.forEach((job) => {
    if (job.savedVideoId) linkedVideos.set(job.savedVideoId, job);
  });

  const imageEntries: UsageEntry[] = images.map((image) => ({
    id: 'image:' + image.id,
    kind: 'image',
    title: image.title,
    model: image.model,
    createdAt: image.createdAt,
    costUsd: typeof image.costUsd === 'number' && Number.isFinite(image.costUsd) && image.costUsd >= 0 ? image.costUsd : null,
    generationId: image.generationId,
    status: 'Saved',
    detail: 'Saved image',
  }));

  const videoEntries: UsageEntry[] = videos.map((video) => {
    const job = linkedVideos.get(video.id);
    return {
      id: job ? 'job:' + job.jobId : 'video:' + video.id,
      kind: 'video',
      title: video.title,
      model: video.model,
      createdAt: job?.createdAt || video.createdAt,
      costUsd: typeof (job?.costUsd ?? video.costUsd) === 'number' && Number.isFinite(job?.costUsd ?? video.costUsd) && (job?.costUsd ?? video.costUsd)! >= 0
        ? (job?.costUsd ?? video.costUsd) as number
        : null,
      generationId: job?.generationId || video.generationId,
      mediaId: video.id,
      status: 'Saved',
      projectTitle: job?.projectTitle,
      detail: job ? 'Video generation job · ' + job.jobId : 'Saved video clip',
    };
  });

  const savedJobIds = new Set(videoEntries.map((entry) => entry.id));
  const remainingJobEntries: UsageEntry[] = jobs
    .filter((job) => !job.savedVideoId || !savedJobIds.has('job:' + job.jobId))
    .map((job) => ({
      id: 'job:' + job.jobId,
      kind: 'video',
      title: job.projectTitle + ' · Scene ' + job.sceneOrder,
      model: job.model,
      createdAt: job.createdAt,
      costUsd: typeof job.costUsd === 'number' && Number.isFinite(job.costUsd) && job.costUsd >= 0 ? job.costUsd : null,
      generationId: job.generationId,
      status: job.status.replaceAll('_', ' '),
      projectTitle: job.projectTitle,
      detail: 'Video generation job · ' + job.jobId,
    }));

  const audioEntries: UsageEntry[] = audios.map((audio) => ({
    id: 'audio:' + audio.id,
    kind: 'audio',
    title: audio.title,
    model: audio.model,
    createdAt: audio.createdAt,
    costUsd: typeof audio.costUsd === 'number' && Number.isFinite(audio.costUsd) && audio.costUsd >= 0 ? audio.costUsd : null,
    generationId: audio.generationId,
    status: 'Saved',
    detail: 'Voice: ' + audio.voice + (typeof audio.costUsd === 'number' && Number.isFinite(audio.costUsd) && audio.costUsd >= 0 ? '' : ' · Cost not reported by current speech endpoint'),
  }));

  return [...imageEntries, ...videoEntries, ...remainingJobEntries, ...audioEntries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const ProviderUsageView: React.FC = () => {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<TimeRange>('30d');
  const [kind, setKind] = useState<'all' | UsageKind>('all');
  const [query, setQuery] = useState('');
  const [keyUsage, setKeyUsage] = useState<OpenRouterKeyUsage | null>(null);
  const [keyUsageError, setKeyUsageError] = useState('');
  const [keyUsageLoading, setKeyUsageLoading] = useState(false);
  const [costLookupLoading, setCostLookupLoading] = useState(false);
  const [costLookupMessage, setCostLookupMessage] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [images, videos, audios, jobs] = await Promise.all([
        getSavedImages(),
        getSavedVideos(),
        getSavedAudios(),
        getVideoGenerationJobs(),
      ]);
      setEntries(buildUsageEntries(images, videos, audios, jobs));

      // Live key-level usage is optional and never blocks the local history view.
      let openRouterKey = '';
      try { openRouterKey = sessionStorage.getItem('vyra_openrouter_key_session')?.trim() || ''; } catch { /* session storage may be unavailable */ }
      if (openRouterKey) {
        setKeyUsageLoading(true);
        setKeyUsageError('');
        try {
          const response = await fetch('/api/providers/openrouter/usage/key', {
            headers: { 'x-openrouter-api-key': openRouterKey },
          });
          const data = await response.json().catch(() => ({})) as OpenRouterKeyUsage & { error?: string };
          if (!response.ok) throw new Error(data.error || 'Could not refresh OpenRouter key usage.');
          setKeyUsage(data);
        } catch (usageCause) {
          setKeyUsageError(usageCause instanceof Error ? usageCause.message : 'Could not refresh OpenRouter key usage.');
        } finally {
          setKeyUsageLoading(false);
        }
      } else {
        setKeyUsage(null);
        setKeyUsageError('');
        setKeyUsageLoading(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load provider usage history from this browser.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(true); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const lookupMissingCosts = async () => {
    let openRouterKey = '';
    try { openRouterKey = sessionStorage.getItem('vyra_openrouter_key_session')?.trim() || ''; } catch { /* session storage may be unavailable */ }
    if (!openRouterKey) {
      setCostLookupMessage('Reconnect your OpenRouter key in Settings before looking up generation costs.');
      return;
    }
    const candidates = entries.filter((entry) =>
      (entry.kind === 'image' || entry.kind === 'audio' || entry.kind === 'video') && entry.costUsd === null && Boolean(entry.generationId)
    ).slice(0, 20);
    if (candidates.length === 0) {
      setCostLookupMessage('No saved media or video-job records with missing costs and a Generation ID were found.');
      return;
    }
    setCostLookupLoading(true);
    setCostLookupMessage('');
    let updated = 0;
    let unavailable = 0;
    try {
      for (const entry of candidates) {
        // Each generation lookup is independent: a transient network or storage
        // error for one record must not prevent the remaining records from syncing.
        try {
          const response = await fetch('/api/providers/openrouter/generation/' + encodeURIComponent(entry.generationId!), {
            headers: { 'x-openrouter-api-key': openRouterKey },
          });
          const data = await response.json().catch(() => ({})) as { costUsd?: unknown; error?: string };
          if (response.ok && typeof data.costUsd === 'number' && Number.isFinite(data.costUsd) && data.costUsd >= 0) {
            if (entry.kind === 'video' && entry.id.startsWith('job:') && entry.mediaId) {
              // A linked job and its saved video are one logical usage record.
              // Persist both costs in a single IndexedDB transaction.
              await updateLinkedVideoGenerationCost(entry.id.slice(4), entry.mediaId, data.costUsd);
            } else if (entry.kind === 'video' && entry.id.startsWith('job:')) {
              await updateVideoGenerationJob(entry.id.slice(4), { costUsd: data.costUsd });
            } else if (entry.kind === 'video' && entry.mediaId) {
              await updateSavedMediaCost('video', entry.mediaId, data.costUsd);
            } else if (entry.kind !== 'video') {
              await updateSavedMediaCost(entry.kind, entry.id.replace(/^(image|audio):/, ''), data.costUsd);
            }
            updated += 1;
          } else {
            unavailable += 1;
          }
        } catch {
          unavailable += 1;
        }
      }
      await refresh(true);
      setCostLookupMessage(updated + ' provider-reported cost(s) saved.' + (unavailable ? ' ' + unavailable + ' record(s) remain unavailable.' : ''));
    } catch (cause) {
      setCostLookupMessage(cause instanceof Error ? cause.message : 'Could not look up generation costs.');
    } finally {
      setCostLookupLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - (range === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const timestamp = new Date(entry.createdAt).getTime();
      const matchesRange = range === 'all' || (Number.isFinite(timestamp) && timestamp >= cutoff);
      const matchesKind = kind === 'all' || entry.kind === kind;
      const matchesQuery = !needle || [entry.title, entry.model, entry.projectTitle || '', entry.generationId || '', entry.detail || '', entry.status]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesRange && matchesKind && matchesQuery;
    });
  }, [entries, range, kind, query]);

  const totals = useMemo(() => {
    const reported = filtered.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
    return {
      total: filtered.length,
      reported,
      known: filtered.filter((entry) => entry.costUsd !== null).length,
      unknown: filtered.filter((entry) => entry.costUsd === null).length,
      images: filtered.filter((entry) => entry.kind === 'image').length,
      videos: filtered.filter((entry) => entry.kind === 'video').length,
      audios: filtered.filter((entry) => entry.kind === 'audio').length,
    };
  }, [filtered]);

  const filters: { id: 'all' | UsageKind; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'video', label: 'Video' },
    { id: 'image', label: 'Image' },
    { id: 'audio', label: 'Voiceover' },
  ];

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#55F4FF] light:text-indigo-600 text-xs font-semibold mb-1">
            <Activity className="w-4 h-4" /> PROVIDER OPERATIONS
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">Provider Usage History</h1>
          <p className="text-xs sm:text-sm text-slate-400 light:text-slate-500 mt-1 max-w-2xl">
            Review saved OpenRouter image, video and voiceover activity with provider-reported costs where available.
          </p>
        </div>
        <button onClick={() => void lookupMissingCosts()} disabled={costLookupLoading || loading} className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-cyan-500/30 text-xs font-semibold text-cyan-200 light:text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50">
          {costLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Look up missing costs
        </button>
        <button onClick={() => void refresh(true)} disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-[#2B3058] light:border-slate-300 text-xs font-semibold text-slate-200 light:text-slate-700 hover:bg-[#171A35] light:hover:bg-slate-100 disabled:opacity-50">
          <RefreshCw className={'w-3.5 h-3.5 ' + (refreshing ? 'animate-spin' : '')} /> Refresh usage
        </button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4">
          <p className="text-xs text-slate-400 light:text-slate-500">Reported spend</p>
          <p className="text-2xl font-bold tabular-nums text-white light:text-slate-900 mt-2">{loading ? '—' : money(totals.reported)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Known costs only</p>
        </div>
        <div className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4">
          <p className="text-xs text-slate-400 light:text-slate-500">Usage records</p>
          <p className="text-2xl font-bold tabular-nums text-white light:text-slate-900 mt-2">{loading ? '—' : totals.total}</p>
          <p className="text-[10px] text-slate-500 mt-1">{totals.known} with reported cost</p>
        </div>
        <div className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4">
          <p className="text-xs text-slate-400 light:text-slate-500">Cost unavailable</p>
          <p className="text-2xl font-bold tabular-nums text-amber-300 mt-2">{loading ? '—' : totals.unknown}</p>
          <p className="text-[10px] text-slate-500 mt-1">Not estimated or guessed</p>
        </div>
        <div className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4">
          <p className="text-xs text-slate-400 light:text-slate-500">By capability</p>
          <p className="text-sm font-semibold text-white light:text-slate-900 mt-2">{totals.videos} video · {totals.images} image</p>
          <p className="text-[10px] text-slate-500 mt-1">{totals.audios} voiceover records</p>
        </div>
      </section>

      <section className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Live OpenRouter key usage</h2>
            <p className="text-[11px] text-slate-400 light:text-slate-500 mt-1">Provider-reported key totals, refreshed from OpenRouter when this page loads or you refresh</p>
          </div>
          {keyUsage?.fetchedAt && <p className="text-[10px] text-slate-500">Updated {dateLabel(keyUsage.fetchedAt)}</p>}
        </div>
        {keyUsageLoading ? (
          <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Refreshing key usage…</p>
        ) : keyUsage ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-[#090B18]/60 light:bg-slate-50 p-3">
                <p className="text-[10px] text-slate-400 light:text-slate-500">All-time key usage</p>
                <p className="text-lg font-bold tabular-nums text-white light:text-slate-900 mt-1">{keyUsage.usage === null ? 'Not provided' : money(keyUsage.usage)}</p>
              </div>
              <div className="rounded-lg bg-[#090B18]/60 light:bg-slate-50 p-3">
                <p className="text-[10px] text-slate-400 light:text-slate-500">Today</p>
                <p className="text-lg font-bold tabular-nums text-white light:text-slate-900 mt-1">{keyUsage.usageDaily === null ? 'Not provided' : money(keyUsage.usageDaily)}</p>
              </div>
              <div className="rounded-lg bg-[#090B18]/60 light:bg-slate-50 p-3">
                <p className="text-[10px] text-slate-400 light:text-slate-500">This month</p>
                <p className="text-lg font-bold tabular-nums text-white light:text-slate-900 mt-1">{keyUsage.usageMonthly === null ? 'Not provided' : money(keyUsage.usageMonthly)}</p>
              </div>
              <div className="rounded-lg bg-[#090B18]/60 light:bg-slate-50 p-3">
                <p className="text-[10px] text-slate-400 light:text-slate-500">{keyUsage.limit === null ? 'Key spending limit' : 'Remaining key limit'}</p>
                <p className="text-lg font-bold tabular-nums text-white light:text-slate-900 mt-1">{keyUsage.limitRemaining === null ? 'No limit data' : money(keyUsage.limitRemaining)}</p>
                <p className="text-[9px] text-slate-500 mt-1">{keyUsage.limit === null ? 'No per-key limit reported' : 'of ' + money(keyUsage.limit) + (keyUsage.limitReset ? ' · ' + keyUsage.limitReset + ' reset' : '')}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">{keyUsage.isFreeTier === null ? 'Account tier not reported' : keyUsage.isFreeTier ? 'OpenRouter free-tier key' : 'OpenRouter paid-tier key'}{keyUsage.expiresAt ? ' · Expires ' + dateLabel(keyUsage.expiresAt) : ''}. These figures describe this API key, not necessarily the full account balance.</p>
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-slate-300 light:text-slate-700">{keyUsageError || 'Reconnect your OpenRouter key in Settings to view live usage and remaining key limits.'}</p>
            <p className="text-[10px] text-slate-500">The key remains in this browser session and is sent only to VYRA’s same-origin server endpoint for this read-only request.</p>
          </div>
        )}
      </section>

      {costLookupMessage && <p role="status" className="text-xs text-slate-400 light:text-slate-600">{costLookupMessage}</p>}

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-xs font-bold text-cyan-300 light:text-cyan-700">Cost accuracy & storage</h2>
          <p className="text-xs leading-relaxed text-slate-300 light:text-slate-600 mt-1">
            Costs are shown only when OpenRouter reports an amount. Missing image, voiceover and video costs may be recovered through the read-only generation metadata lookup when a Generation ID exists. This history is stored in this browser: image entries appear after saving an image to Media Library, and deleting a saved asset may remove its usage record. It is not a live account-billing statement.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((item) => (
              <button key={item.id} onClick={() => setKind(item.id)}
                className={'px-3 py-2 rounded-lg text-xs font-semibold transition-colors ' + (kind === item.id ? 'bg-[#55F4FF] text-[#090B18]' : 'bg-[#171A35] light:bg-slate-100 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900')}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#171A35] light:bg-slate-100 rounded-lg">
              {(['7d', '30d', 'all'] as const).map((item) => (
                <button key={item} onClick={() => setRange(item)}
                  className={'px-3 py-1.5 text-xs font-mono rounded ' + (range === item ? 'bg-[#090B18] light:bg-white text-[#55F4FF] light:text-slate-900' : 'text-slate-400 hover:text-white')}>
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search model or project"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-xs bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-300 text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#55F4FF]" />
            </label>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div><p className="text-sm font-semibold text-rose-300">Could not load usage history</p><p className="text-xs text-slate-400 mt-1">{error}</p></div>
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-xs text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading provider usage…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2B3058] light:border-slate-300 p-10 text-center">
            <Activity className="w-8 h-8 mx-auto text-slate-500 mb-3" />
            <h2 className="text-sm font-semibold text-white light:text-slate-900">{entries.length === 0 ? 'No saved usage records yet' : 'No records match these filters'}</h2>
            <p className="text-xs text-slate-500 mt-1">{entries.length === 0 ? 'Save a generated image or create a video/voiceover in a project to start seeing local usage history.' : 'Try a wider date range or another filter.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="size-10 rounded-lg bg-[#090B18] light:bg-slate-100 flex items-center justify-center shrink-0 text-[#55F4FF] light:text-indigo-600">
                  {entry.kind === 'video' ? <Video className="w-5 h-5" /> : entry.kind === 'image' ? <ImageIcon className="w-5 h-5" /> : <AudioLines className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-bold text-white light:text-slate-900 break-words">{entry.title}</h3>
                    <span className="text-[10px] rounded-md px-2 py-1 bg-slate-500/10 text-slate-400 capitalize">{entry.kind}</span>
                    <span className="text-[10px] rounded-md px-2 py-1 bg-slate-500/10 text-slate-400 capitalize">{entry.status}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 light:text-slate-500 mt-1 break-all">{entry.model}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{entry.detail} · {dateLabel(entry.createdAt)}</p>
                  {entry.generationId && <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">Generation ID: {entry.generationId}</p>}
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-xs font-mono font-semibold tabular-nums text-white light:text-slate-900">{entry.costUsd === null ? 'Not reported' : money(entry.costUsd)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">OpenRouter · USD</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
