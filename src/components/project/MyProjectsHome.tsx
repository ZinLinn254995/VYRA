import React, { useEffect, useState } from 'react';
import { Film, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase, useAuth } from '../../context/AuthContext';

type ProjectRecord = {
  id: string;
  name: string;
  updatedAt: string;
  storyboardId: string;
  thumbnailUrl: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  updated_at?: string | null;
  created_at?: string | null;
};

type MyProjectsHomeProps = {
  onCreateProject: () => void;
  onOpenProject: (storyboardId: string) => void;
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

export function MyProjectsHome({ onCreateProject, onOpenProject }: MyProjectsHomeProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      if (!supabase || !user || user.is_anonymous) {
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const { data, error: queryError } = await supabase
        .from('vyral_storyboards')
        .select('id,title,updated_at,created_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (queryError) {
        setError(queryError.message || 'Could not load your Projects.');
        setProjects([]);
      } else {
        const records = ((data || []) as ProjectRow[])
          .map((row) => {
            return {
              id: row.id,
              name: row.title?.trim() || 'Untitled Project',
              updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
              storyboardId: row.id,
              thumbnailUrl: null,
            } satisfies ProjectRecord;
          })
          .filter((item): item is ProjectRecord => Boolean(item));
        setProjects(records);
      }
      setLoading(false);
    };
    void loadProjects();
    return () => { cancelled = true; };
  }, [user?.id, user?.is_anonymous, reloadKey]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vyra-bg-canvas)]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-9 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--vyra-text-primary)] sm:text-4xl">My Projects</h1>
          <Button size="md" className="shrink-0" startIcon={<Plus size={16} strokeWidth={2.4} />} onClick={onCreateProject}>New</Button>
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[var(--vyra-text-muted)]"><LoaderCircle size={17} className="animate-spin" /> Loading your Projects…</div>
        ) : error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <p role="alert" className="text-sm text-[var(--vyra-text-secondary)]">{error}</p>
            <Button size="sm" variant="secondary" startIcon={<RefreshCw size={14} />} onClick={() => setReloadKey((current) => current + 1)}>Try again</Button>
          </div>
        ) : projects.length ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button key={project.id} type="button" onClick={() => onOpenProject(project.storyboardId)} className="group overflow-hidden rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]">
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[var(--vyra-bg-surface)]">
                  {project.thumbnailUrl ? (
                    <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.24),transparent_52%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))]">
                      <Film size={42} className="text-[var(--vyra-accent-primary)]/75 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-1 pt-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{project.name}</h3>
                  <span className="shrink-0 text-xs text-[var(--vyra-text-muted)]">{formatEditedTime(project.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <Film size={30} className="text-[var(--vyra-text-muted)]" />
            <p className="text-sm font-medium text-[var(--vyra-text-secondary)]">No Projects yet</p>
            <p className="text-xs text-[var(--vyra-text-muted)]">Create your first Project to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}
