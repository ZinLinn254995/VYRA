import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ChevronRight, LockKeyhole, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { ProfileSubpageHeader } from './ProfileSubpageHeader';
import { VyralDetailsContent } from './VyralDetailsContent';
import { supabase } from '../../context/AuthContext';
import type { VyralChatAssetContext } from '../../types/vyralChat';

type VyralFolder = { id: string; name: string; parentId: string | null; createdAt: string };
type LegacyVyral = { id: string; name: string; description: string; visibility: 'private' | 'public'; createdAt: string; updatedAt: string; folders: VyralFolder[] };
type VyralRecord = {
  id: string; name: string; description: string; visibility: 'private' | 'unlisted' | 'public';
  dna_status: string; license_policy: Record<string, unknown>; created_at: string; updated_at: string;
  assetCount: number; folderCount: number; metadata?: Record<string, unknown>;
};
type Props = { isAuthenticated: boolean; onLoginRequired: () => void; onBack: () => void; backLabel: string; onSendAssetsToChat?: (assets: VyralChatAssetContext[]) => void };
const STORAGE_KEY = 'vyra:my-vyrals:v1';
const MIGRATION_KEY = 'vyra:my-vyrals:cloud-migrated:v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTECTED_VYRAL_ID = 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d';
const isProtectedVyral = (item: VyralRecord) => item.id === PROTECTED_VYRAL_ID || item.metadata?.protected === true;
const readLegacyVyrals = (): LegacyVyral[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is LegacyVyral =>
      Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.folders)
    ) : [];
  } catch { return []; }
};

const updateProfileCardBottomRadius = (content: HTMLElement) => {
  const card = content.closest<HTMLElement>('.profile-subpage-card');
  if (!card) return;
  const remaining = Math.max(0, content.scrollHeight - content.clientHeight - content.scrollTop);
  const bottomProgress = Math.max(0, Math.min(1, 1 - remaining / 120));
  const headerProgress = Math.max(0, Math.min(1, content.scrollTop / 88));
  card.style.setProperty('--profile-card-bottom-radius', (16 * bottomProgress).toFixed(2) + 'px');
  const header = card.querySelector<HTMLElement>('.profile-collapse-header');
  if (header) {
    const expandedHeight = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-expanded')) || 204;
    header.style.setProperty('--profile-header-progress', headerProgress.toFixed(3));
    const collapseDistance = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-collapse-distance')) || 44;
    header.style.setProperty('--profile-header-height', (expandedHeight - collapseDistance * headerProgress) + 'px');
    header.style.setProperty('--profile-header-shift-y', (44 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-shift-x', (48 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-icon-rotation', (360 * headerProgress) + 'deg');
    header.style.setProperty('--profile-header-title-shift-y', (40 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-title-shift-x', (48 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-icon-size', (44 - 8 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-title-size', ((window.innerWidth < 640 ? 21 : 24) - 4 * headerProgress) + 'px');
    header.style.setProperty('--profile-header-action-shift', (42 * headerProgress) + 'px');
    header.style.setProperty('--profile-create-button-width', (148 - 64 * headerProgress) + 'px');
    header.style.setProperty('--profile-create-extra-width', (100 * (1 - headerProgress)) + 'px');
    header.style.setProperty('--profile-create-extra-opacity', (1 - headerProgress).toFixed(3));
    header.style.setProperty('--profile-create-extra-shift', (12 * headerProgress) + 'px');
    header.style.setProperty('--profile-back-label-opacity', (1 - Math.min(1, headerProgress / 0.15)).toFixed(3));
    header.style.setProperty('--profile-description-shift', (-8 * headerProgress) + 'px');
  }
};

const fieldClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] placeholder:text-[var(--vyra-text-muted)]';

export const MyVyralsPage: React.FC<Props> = ({ isAuthenticated, onLoginRequired, onBack, backLabel, onSendAssetsToChat }) => {
  const [vyrals, setVyrals] = useState<VyralRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadVyrals = useCallback(async () => {
    if (!supabase || !isAuthenticated) { setVyrals([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setError('Your session could not be verified. Please sign in again.'); setLoading(false); return; }

    let { data, error: queryError } = await supabase.from('vyrals').select('*').order('updated_at', { ascending: false });
    if (queryError) { setError(queryError.message); setLoading(false); return; }

    // One-time migration from the earlier device-local Vyral list. Keep the old
    // local copy as a recovery backup after cloud migration succeeds.
    if (localStorage.getItem(MIGRATION_KEY) !== 'done') {
      const legacy = readLegacyVyrals();
      const cloudIds = new Set((data ?? []).map((item) => item.id));
      let migrationSucceeded = true;
      for (const item of legacy) {
        if (cloudIds.has(item.id)) continue;
        const candidateId = UUID_PATTERN.test(item.id) ? item.id : undefined;
        const { data: created, error: createError } = await supabase.from('vyrals').insert({
          ...(candidateId ? { id: candidateId } : {}),
          user_id: auth.user.id, name: item.name.slice(0, 100), description: (item.description ?? '').slice(0, 1000),
          visibility: item.visibility === 'public' ? 'public' : 'private', lifecycle_status: 'draft',
          dna_status: 'evolving', license_policy: {},
          metadata: { migrated_from_device_v1: true, legacy_created_at: item.createdAt },
        }).select('id').single();
        if (createError || !created) { migrationSucceeded = false; continue; }
        const folderIdMap = new Map<string, string>();
        const pending = [...(item.folders ?? [])];
        for (let pass = 0; pending.length && pass < 10; pass += 1) {
          for (let index = pending.length - 1; index >= 0; index -= 1) {
            const folder = pending[index];
            if (folder.parentId && !folderIdMap.has(folder.parentId)) continue;
            const { data: newFolder, error: folderError } = await supabase.from('vyral_folders').insert({
              vyral_id: created.id, user_id: auth.user.id, parent_id: folder.parentId ? folderIdMap.get(folder.parentId) : null,
              name: folder.name.slice(0, 100),
            }).select('id').single();
            if (folderError || !newFolder) migrationSucceeded = false;
            else folderIdMap.set(folder.id, newFolder.id);
            pending.splice(index, 1);
          }
        }
        if (pending.length) migrationSucceeded = false;
        const { error: dnaError } = await supabase.from('vyral_dna_records').insert({
          vyral_id: created.id, user_id: auth.user.id, scope: 'vyral', schema_version: 1,
          dna_status: 'evolving', source_kind: 'creator', verification_status: 'creator_confirmed',
          payload: { identity: { name: item.name, description: item.description ?? '' }, migration: 'device_local_v1' },
          reconstruction_data: { dna_only_test: 'not_tested' },
        });
        if (dnaError) migrationSucceeded = false;
      }
      if (migrationSucceeded) localStorage.setItem(MIGRATION_KEY, 'done');
      const refreshed = await supabase.from('vyrals').select('*').order('updated_at', { ascending: false });
      if (!refreshed.error) data = refreshed.data;
    }

    const ids = (data ?? []).map((item) => item.id);
    const [assetRows, folderRows] = ids.length ? await Promise.all([
      supabase.from('vyral_assets').select('vyral_id').in('vyral_id', ids).neq('processing_status', 'archived'),
      supabase.from('vyral_folders').select('vyral_id').in('vyral_id', ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    const assetCounts = new Map<string, number>();
    const folderCounts = new Map<string, number>();
    for (const row of assetRows.data ?? []) assetCounts.set(row.vyral_id, (assetCounts.get(row.vyral_id) ?? 0) + 1);
    for (const row of folderRows.data ?? []) folderCounts.set(row.vyral_id, (folderCounts.get(row.vyral_id) ?? 0) + 1);
    setVyrals((data ?? []).map((item) => ({
      ...item, assetCount: assetCounts.get(item.id) ?? 0, folderCount: folderCounts.get(item.id) ?? 0,
      license_policy: (item.license_policy ?? {}) as Record<string, unknown>,
    })) as VyralRecord[]);
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { void loadVyrals(); }, [loadVyrals]);

  const active = vyrals.find((item) => item.id === activeId) ?? null;
  const visibleVyrals = useMemo(() => vyrals
    .filter((item) => (item.name + ' ' + item.description).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(isProtectedVyral(b)) - Number(isProtectedVyral(a)) || Date.parse(b.updated_at) - Date.parse(a.updated_at)), [vyrals, query]);

  useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>('.profile-subpage-content');
    if (content) updateProfileCardBottomRadius(content);
  }, [activeId, vyrals, query]);

  const createVyral = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) { onLoginRequired(); return; }
    if (!supabase) { setError('Cloud storage is not configured for this environment.'); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { onLoginRequired(); return; }
    setBusy(true); setError('');
    const initialLicense = {
      allow_ai_analysis: true, allow_ai_generation: true, allow_remix: false,
      allow_redistribution: false, commercial_use: false, require_attribution: true,
    };
    const creatorNamedVyral = Boolean(name.trim());
    const initialName = name.trim().slice(0, 100) || 'New Vyral';
    const { data: created, error: createError } = await supabase.from('vyrals').insert({
      user_id: auth.user.id, name: initialName, description: description.trim().slice(0, 1000),
      visibility: 'private', lifecycle_status: 'draft', dna_status: 'evolving',
      dna_schema_version: 1, license_policy: initialLicense,
      metadata: {
        identity_initialized: true, package_format: '.vyral',
        identity_name_origin: creatorNamedVyral ? 'creator_edited' : 'system_default',
        identity_description_origin: description.trim() ? 'creator_edited' : 'system_default',
        ai_details_status: 'pending',
      },
    }).select('*').single();
    if (createError || !created) {
      setError(createError?.message ?? 'Could not create this Vyral.');
      setBusy(false); return;
    }
    const { error: dnaError } = await supabase.from('vyral_dna_records').insert({
      vyral_id: created.id, user_id: auth.user.id, scope: 'vyral', schema_version: 1,
      dna_status: 'evolving', source_kind: 'creator', verification_status: 'creator_confirmed',
      payload: {
        identity: { name: initialName, description: description.trim() },
        authority: { creator_is_source_of_truth: true },
        knowledge: { creator_defined: [], vision_observations: [], relationships: [] },
        reconstruction: { dna_only_test: 'not_tested', exact_reconstruction_verified: false },
      },
      reconstruction_data: { original_media_policy: 'preserve_original_binary', reconstruction_runner: 'not_connected' },
    });
    setName(''); setDescription(''); setCreateOpen(false); setActiveId(created.id);
    await loadVyrals();
    if (dnaError) setError('Vyral created, but its initial DNA record could not be written: ' + dnaError.message);
    setBusy(false);
  };

  const deleteVyral = async (item: VyralRecord) => {
    if (isProtectedVyral(item)) { setError('ORIGIN-01 is protected and cannot be deleted from the app.'); return; }
    if (!supabase || !window.confirm('Delete "' + item.name + '" and all of its assets, folders and identity records?')) return;
    setBusy(true); setError('');
    const [assetResult, versionResult] = await Promise.all([
      supabase.from('vyral_assets').select('storage_path').eq('vyral_id', item.id),
      supabase.from('vyral_asset_versions').select('storage_path').eq('vyral_id', item.id),
    ]);
    if (assetResult.error || versionResult.error) {
      setError(assetResult.error?.message ?? versionResult.error?.message ?? 'Could not inspect stored asset paths.');
      setBusy(false); return;
    }
    const paths = [...new Set([...(assetResult.data ?? []).map((row) => row.storage_path), ...(versionResult.data ?? []).map((row) => row.storage_path)])];
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('vyral-assets').remove(paths);
      if (storageError) { setError('Could not remove stored media: ' + storageError.message); setBusy(false); return; }
    }
    const { error: deleteError } = await supabase.from('vyrals').delete().eq('id', item.id);
    if (deleteError) setError(deleteError.message);
    else { if (activeId === item.id) setActiveId(null); await loadVyrals(); }
    setBusy(false);
  };

  const updateActive = (patch: Partial<VyralRecord>) => {
    setVyrals((current) => current.map((item) => item.id === activeId ? { ...item, ...patch } : item));
  };

  if (active) return (
    <div className="profile-subpage-scroll profile-subpage-viewport"><section className="profile-subpage-card rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
      <ProfileSubpageHeader
        onBack={() => { setActiveId(null); setQuery(''); }}
        backLabel="Back to My Vyrals"
        icon={<VyralIdentityIcon size={22} />}
        title={active.name}
        description={active.description || 'Your creative Vyral identity and asset library.'}
        search={<div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files" className={fieldClass + ' pl-9'} /></div>}
      />
      <div className="profile-subpage-content space-y-3 p-5 sm:p-6" onScroll={(event) => updateProfileCardBottomRadius(event.currentTarget)}>
        <VyralDetailsContent vyral={active} searchQuery={query} onVyralUpdated={updateActive} onSendAssetsToChat={onSendAssetsToChat} />
      </div>
    </section></div>
  );

  return (
    <div className="profile-subpage-scroll profile-subpage-viewport">
      <section className="profile-subpage-card rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
        <ProfileSubpageHeader
          onBack={onBack}
          backLabel={backLabel}
          icon={<VyralIdentityIcon size={22} />}
          title="My Vyrals"
          description="Your creative libraries, identity and knowledge."
          action={<Button size="sm" onClick={() => setCreateOpen(true)} startIcon={<Plus size={14} />} className="profile-create-button" aria-label="Create New Vyral"><span className="profile-create-copy"><span className="profile-create-label">Create</span><span className="profile-create-extra">New Vyral</span></span></Button>}
          search={<div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Vyrals" className={fieldClass + ' pl-9'} /></div>}
        />
        <div className="profile-subpage-content space-y-5 p-5 sm:p-6" onScroll={(event) => updateProfileCardBottomRadius(event.currentTarget)}>
          {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">{error}</div>}
          {loading ? <div className="py-16 text-center text-xs text-[var(--vyra-text-muted)]">Loading your Vyrals…</div> :
            visibleVyrals.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleVyrals.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
                <button type="button" onClick={() => setActiveId(item.id)} className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 border-b border-[var(--vyra-border-subtle)] bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.18),transparent_48%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={38}/><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">VYRAL COLLECTION</span></button>
                <div className="p-4"><div className="flex items-start gap-2"><button type="button" onClick={() => setActiveId(item.id)} className="min-w-0 flex-1 text-left"><h3 className="truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{item.name}</h3><p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-[var(--vyra-text-secondary)]">{item.description || 'A private creative asset library.'}</p>
                    {(() => {
                      const fields = (item.metadata?.ai_details as { fields?: Record<string, { value?: unknown }> } | undefined)?.fields ?? {};
                      const category = typeof fields.category?.value === 'string' ? fields.category.value : '';
                      const style = typeof fields.style?.value === 'string' ? fields.style.value : '';
                      const tagValue = fields.tags?.value;
                      const tags = Array.isArray(tagValue) ? tagValue.filter((tag): tag is string => typeof tag === 'string').slice(0, 2) : [];
                      const values = [category, style, ...tags].filter(Boolean).slice(0, 4);
                      return values.length ? <div className="mt-2 flex flex-wrap gap-1">{values.map((value, index) => <span key={value + index} className="max-w-full truncate rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-0.5 text-[9px] text-[var(--vyra-text-secondary)]">{value}</span>)}</div> : null;
                    })()}
                  </button>{isProtectedVyral(item) ? <span title="Protected sample — deletion disabled" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--vyra-accent-primary)]"><LockKeyhole size={12}/> Protected</span> : <button type="button" onClick={() => void deleteVyral(item)} aria-label={'Delete '+item.name} disabled={busy} className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-danger)]"><Trash2 size={15}/></button>}</div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--vyra-text-muted)]"><span>{item.assetCount} assets · {item.folderCount} folders</span><span className="capitalize">{item.dna_status.replaceAll('_',' ')}</span></div>
                  <button type="button" onClick={() => setActiveId(item.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--vyra-accent-primary)]">Open Vyral <ChevronRight size={14}/></button>
                </div>
              </article>
            ))}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--vyra-border)] px-6 py-10 text-center"><div className="grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={28}/></div><h3 className="mt-4 text-base font-semibold text-[var(--vyra-text-primary)]">{query?'No matching Vyrals':'Create your first Vyral'}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--vyra-text-secondary)]">{query?'Try another search term.':'Give your creative assets a home with their own identity, folders and knowledge.'}</p><button type="button" onClick={()=>setCreateOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-4 py-2 text-xs font-semibold text-slate-950"><Plus size={14}/> Create Vyral</button></div>}
          {createOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCreateOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="create-vyral-title" className="w-full max-w-md rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)]"><div className="flex items-start justify-between gap-3"><div><h3 id="create-vyral-title" className="text-xl font-bold text-[var(--vyra-text-primary)]">Create New Vyral</h3><p className="mt-1 text-sm text-[var(--vyra-text-secondary)]">Create a new identity-aware asset collection.</p></div><button type="button" onClick={()=>setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Plus size={17} className="rotate-45"/></button></div><form onSubmit={(event)=>void createVyral(event)} className="mt-5 space-y-4"><div><label htmlFor="new-vyral-name" className="mb-2 block text-xs font-semibold text-[var(--vyra-text-primary)]">Vyral name <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></label><input id="new-vyral-name" autoFocus maxLength={100} value={name} onChange={(event)=>setName(event.target.value)} placeholder="Leave blank and VYRA will suggest a name" className={fieldClass}/></div><div><label htmlFor="new-vyral-description" className="mb-2 block text-xs font-semibold text-[var(--vyra-text-primary)]">Description <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></label><textarea id="new-vyral-description" rows={3} maxLength={1000} value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="What is this Vyral about?" className={fieldClass+' min-h-24 resize-y py-2.5'}/></div><div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Creating…':'Create Vyral'}</Button></div></form></section></div>}
        </div>
      </section>
    </div>
  );
};
