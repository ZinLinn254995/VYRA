import React, { useEffect, useState } from 'react';
import { Globe2, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase, useAuth } from '../../context/AuthContext';

type UniverseRecord = {
  id: string;
  name: string;
  updatedAt: string;
  storyboardId: string;
  thumbnailUrl: string | null;
};

type UniverseRow = {
  id: string;
  name: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MyUniverseHomeProps = {
  onCreateUniverse: () => void;
  onOpenUniverse: (storyboardId: string) => void;
};

const formatEditedTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Edited recently';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Edited just now';
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Edited ${days}d ago`;
  return 'Edited ' + new Date(timestamp).toLocaleDateString();
};

export function MyUniverseHome({ onCreateUniverse, onOpenUniverse }: MyUniverseHomeProps) {
  const { user } = useAuth();
  const [universes, setUniverses] = useState<UniverseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadUniverses = async () => {
      if (!supabase || !user || user.is_anonymous) {
        setUniverses([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const { data, error: queryError } = await supabase
        .from('vyrals')
        .select('id,name,updated_at,created_at,metadata')
        .eq('user_id', user.id)
        .contains('metadata', { universe_scope: 'storyboard' })
        .order('updated_at', { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (queryError) {
        setError(queryError.message || 'Could not load your Universes.');
        setUniverses([]);
      } else {
        const records = ((data || []) as UniverseRow[])
          .map((row) => {
            const metadata = row.metadata || {};
            const storyboardId = typeof metadata.storyboard_id === 'string' ? metadata.storyboard_id : '';
            if (!storyboardId) return null;
            const thumbnail = typeof metadata.thumbnail_url === 'string'
              ? metadata.thumbnail_url
              : typeof metadata.cover_image_url === 'string' ? metadata.cover_image_url : null;
            return {
              id: row.id,
              name: row.name?.trim() || 'Untitled Universe',
              updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
              storyboardId,
              thumbnailUrl: thumbnail,
            } satisfies UniverseRecord;
          })
          .filter((item): item is UniverseRecord => Boolean(item));
        setUniverses(records);
      }
      setLoading(false);
    };
    void loadUniverses();
    return () => { cancelled = true; };
  }, [user?.id, user?.is_anonymous]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vyra-bg-canvas)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">My Universe</h1>
          <Button size="md" className="shrink-0" startIcon={<Plus size={16} strokeWidth={2.4} />} onClick={onCreateUniverse}>New</Button>
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[var(--vyra-text-muted)]"><LoaderCircle size={17} className="animate-spin" /> Loading your Universes…</div>
        ) : error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <p role="alert" className="text-sm text-[var(--vyra-text-secondary)]">{error}</p>
            <Button size="sm" variant="secondary" startIcon={<RefreshCw size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('vyra:reload-universes'))}>Try again</Button>
          </div>
        ) : universes.length ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {universes.map((universe) => (
              <button key={universe.id} type="button" onClick={() => onOpenUniverse(universe.storyboardId)} className="group overflow-hidden rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[var(--vyra-bg-surface)]">
                  {universe.thumbnailUrl ? (
                    <img src={universe.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.24),transparent_52%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))]">
                      <Globe2 size={42} strokeWidth={1.25} className="text-[var(--vyra-accent-primary)]/70 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-1 pt-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{universe.name}</h3>
                  <span className="shrink-0 text-xs text-[var(--vyra-text-muted)]">{formatEditedTime(universe.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <Globe2 size={30} strokeWidth={1.4} className="text-[var(--vyra-text-muted)]" />
            <p className="text-sm font-medium text-[var(--vyra-text-secondary)]">No Universes yet</p>
            <p className="text-xs text-[var(--vyra-text-muted)]">Create your first Universe to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}
