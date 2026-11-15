import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import { supabase, useAuth } from '../../context/AuthContext';
import { MyMediaLibraryPage } from '../profile/MyMediaLibraryPage';

type UniverseRecord = {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'unlisted' | 'public';
  dna_status: string;
  license_policy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  master_dna_status?: string;
  master_dna_revision?: number;
  master_dna_purpose?: string | null;
  master_dna_intended_uses?: string[];
};

type Props = {
  storyboardId: string;
  storyboardTitle: string;
  isActive: boolean;
  renderLibrary?: boolean;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  onUniverseReady?: (universe: { id: string; name: string; description: string } | null) => void;
};

export const StoryboardUniverseTab: React.FC<Props> = ({
  storyboardId, storyboardTitle, isActive, renderLibrary = true, isAuthenticated, onLoginRequired,
  onUniverseReady,
}) => {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [universe, setUniverse] = useState<UniverseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const loadOrCreateUniverse = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!isAuthenticated || !ownerId || !supabase) {
      setUniverse(null);
      setLoading(false);
      onUniverseReady?.(null);
      return;
    }
    setLoading(true);
    setError('');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (requestId !== requestRef.current) return;
    if (authError || auth.user?.id !== ownerId) {
      setError('Your session could not be verified. Please sign in again.');
      setUniverse(null);
      setLoading(false);
      onUniverseReady?.(null);
      return;
    }

    const findExisting = () => supabase!.from('vyrals').select('id,name,description,visibility,dna_status,license_policy,metadata,master_dna_status,master_dna_revision,master_dna_purpose,master_dna_intended_uses')
      .eq('user_id', ownerId)
      .contains('metadata', { universe_scope: 'storyboard', storyboard_id: storyboardId })
      .maybeSingle();

    let result = await findExisting();
    if (requestId !== requestRef.current) return;
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    let record = result.data as UniverseRecord | null;
    if (!record) {
      const safeTitle = storyboardTitle.trim().slice(0, 78) || 'Untitled Storyboard';
      const created = await supabase.from('vyrals').insert({
        user_id: ownerId,
        name: (safeTitle + ' Universe').slice(0, 100),
        description: 'Private creative Universe dedicated to the Storyboard: ' + safeTitle,
        visibility: 'private',
        lifecycle_status: 'active',
        dna_status: 'evolving',
        license_policy: { allow_ai_analysis: true, allow_ai_generation: true, allow_remix: false, allow_redistribution: false, commercial_use: false, require_attribution: false },
        metadata: { universe_scope: 'storyboard', storyboard_id: storyboardId, created_by: 'vyra_storyboard_workspace' },
      }).select('id,name,description,visibility,dna_status,license_policy,metadata,master_dna_status,master_dna_revision,master_dna_purpose,master_dna_intended_uses').single();
      if (requestId !== requestRef.current) return;
      if (created.error || !created.data) {
        // A second tab may have created the same Universe between the read and insert.
        result = await findExisting();
        if (requestId !== requestRef.current) return;
        if (result.error || !result.data) {
          setError(created.error?.message || result.error?.message || 'Could not create this Storyboard Universe.');
          setLoading(false);
          return;
        }
        record = result.data as UniverseRecord;
      } else {
        record = created.data as UniverseRecord;
      }
    }

    if (requestId !== requestRef.current) return;
    setUniverse(record);
    setLoading(false);
    onUniverseReady?.({ id: record.id, name: record.name, description: record.description });
  }, [isAuthenticated, ownerId, storyboardId, storyboardTitle, onUniverseReady]);

  useEffect(() => {
    if (!isActive) return;
    void loadOrCreateUniverse();
    return () => { requestRef.current += 1; };
  }, [isActive, loadOrCreateUniverse]);

  if (!isAuthenticated) {
    return <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center"><p className="text-sm font-semibold text-[var(--vyra-text-primary)]">Sign in to create this Storyboard’s private Universe</p><button type="button" onClick={onLoginRequired} className="rounded-lg bg-[var(--vyra-accent-primary)] px-4 py-2 text-xs font-semibold text-slate-950">Sign in</button></div>;
  }
  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-xs text-[var(--vyra-text-muted)]"><LoaderCircle size={16} className="animate-spin"/> Preparing Storyboard Universe…</div>;
  if (error || !universe) return <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 px-5 text-center"><AlertCircle size={22} className="text-[var(--vyra-danger)]"/><p role="alert" className="text-xs text-[var(--vyra-text-secondary)]">{error || 'This Universe is not available.'}</p><button type="button" onClick={() => void loadOrCreateUniverse()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 py-2 text-xs font-semibold text-[var(--vyra-text-primary)]"><RefreshCw size={13}/> Retry</button></div>;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="text-base font-semibold text-[var(--vyra-text-primary)]">{universe.name}</h2><p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">Private Universe for “{storyboardTitle}”. Organize characters, locations, props, references and every other creative Asset here.</p></div>
          <span className="rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--vyra-text-secondary)]">Private · Storyboard-only</span>
        </div>
        {renderLibrary && <MyMediaLibraryPage
          key={universe.id}
          isActive={isActive}
          universeId={universe.id}
          storyboardId={storyboardId}
        />}
      </div>
    </div>
  );
};
