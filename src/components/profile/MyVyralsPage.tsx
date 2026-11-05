import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, File, Folder, FolderPlus, Grid2X2, List, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { VyralIdentityIcon } from '../icons/VyralIdentityIcon';
import { ProfileSubpageHeader } from './ProfileSubpageHeader';

type VyralFolder = { id: string; name: string; parentId: string | null; createdAt: string };
type VyralRecord = { id: string; name: string; description: string; visibility: 'private' | 'public'; createdAt: string; updatedAt: string; folders: VyralFolder[] };
type Props = { isAuthenticated: boolean; onLoginRequired: () => void; onBack: () => void; backLabel: string };
type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'vyra:my-vyrals:v1';
const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'vyral-' + Date.now().toString(36);
const readVyrals = (): VyralRecord[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is VyralRecord => Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.folders)) : [];
  } catch { return []; }
};
const fieldClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] placeholder:text-[var(--vyra-text-muted)]';

export const MyVyralsPage: React.FC<Props> = ({ isAuthenticated, onLoginRequired, onBack, backLabel }) => {
  const [vyrals, setVyrals] = useState<VyralRecord[]>(readVyrals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderName, setFolderName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(vyrals)); } catch { /* Keep the current session usable. */ } }, [vyrals]);
  const active = vyrals.find((item) => item.id === activeId) ?? null;
  const visibleVyrals = useMemo(() => vyrals.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [vyrals, query]);

  const createVyral = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!isAuthenticated) { onLoginRequired(); return; }
    const now = new Date().toISOString();
    setVyrals((current) => [{ id: makeId(), name: name.trim(), description: description.trim(), visibility: 'private', createdAt: now, updatedAt: now, folders: [] }, ...current]);
    setName(''); setDescription(''); setCreateOpen(false);
  };
  const createFolder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !folderName.trim()) return;
    const folder: VyralFolder = { id: makeId(), name: folderName.trim(), parentId: null, createdAt: new Date().toISOString() };
    setVyrals((current) => current.map((item) => item.id === active.id ? { ...item, folders: [...item.folders, folder], updatedAt: new Date().toISOString() } : item));
    setFolderName(''); setFolderOpen(false);
  };
  const deleteVyral = (id: string) => {
    if (!window.confirm('Delete this Vyral and its folder structure?')) return;
    setVyrals((current) => current.filter((item) => item.id !== id));
  };

  if (active) return (
    <section className="profile-subpage-card rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
      <ProfileSubpageHeader
        onBack={() => { setActiveId(null); setQuery(''); setCategory('all'); }}
        backLabel="Back to My Vyrals"
        icon={<VyralIdentityIcon size={22} />}
        title={active.name}
        description={active.description || 'Your creative Vyral identity and asset library.'}
      />
      <div className="space-y-3 p-5 sm:p-6">
        <div className="flex justify-end"><Button size="sm" onClick={() => setFolderOpen(true)} startIcon={<FolderPlus size={14} />}>New Folder</Button></div>
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" className={fieldClass + ' !min-h-9 !rounded-md !pl-8 !pr-2 !text-xs'} />
        </div>
        <select aria-label="Filter file type" value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass + ' !min-h-9 !w-[104px] !rounded-md !px-2 !text-xs'}>
          <option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="document">Documents</option><option value="other">Other</option>
        </select>
        <div className="flex shrink-0 rounded-md border border-[var(--vyra-border)] p-0.5">
          <button type="button" aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`rounded p-1.5 ${viewMode === 'grid' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><Grid2X2 size={15} /></button>
          <button type="button" aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><List size={15} /></button>
        </div>
      </div>
      <div className="flex items-center justify-between px-1 text-[10px] text-[var(--vyra-text-muted)]">
        <span>{active.folders.length} folders</span><span>Private · DNA identity initialized</span>
      </div>
      <div className="rounded-xl border border-dashed border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)]/40 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vyra-text-secondary)]"><Folder size={15} /> FOLDER STRUCTURE</div>
        {active.folders.length ? <div className="mt-3 flex flex-wrap gap-2">{active.folders.map((folder) => <div key={folder.id} className="inline-flex items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-2 text-xs text-[var(--vyra-text-primary)]"><Folder size={14} className="text-[var(--vyra-accent-primary)]" />{folder.name}</div>)}</div> : <p className="mt-2 text-xs text-[var(--vyra-text-muted)]">Folders you create will appear here.</p>}
      </div>
      <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--vyra-border)] px-5 py-10 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><File size={22} /></div>
        <h3 className="mt-3 text-sm font-semibold text-[var(--vyra-text-primary)]">Your Vyral is ready for assets</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--vyra-text-secondary)]">The file workspace is being built next. It will support uploads, folders, selection, file actions and grouped media views.</p>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--vyra-text-muted)]"><ShieldCheck size={13} /> Vyral DNA and asset fingerprints are part of the data model roadmap</div>
      </div>
      {folderOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="new-folder-title" className="w-full max-w-sm rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)]"><div className="flex items-center justify-between"><h3 id="new-folder-title" className="text-lg font-bold text-[var(--vyra-text-primary)]">New Folder</h3><button type="button" onClick={() => setFolderOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button></div><form onSubmit={createFolder} className="mt-4 space-y-4"><input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} required maxLength={80} placeholder="Folder name" className={fieldClass} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setFolderOpen(false)}>Cancel</Button><Button type="submit">Create Folder</Button></div></form></section></div>}
      </div>
    </section>
  );

  return (
    <section className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
      <ProfileSubpageHeader
        onBack={onBack}
        backLabel={backLabel}
        icon={<VyralIdentityIcon size={22} />}
        title="My Vyrals"
        description="Your creative libraries, identity and knowledge."
        action={<Button size="sm" onClick={() => setCreateOpen(true)} startIcon={<Plus size={14} />}>Create New Vyral</Button>}
        compactAction={<Button size="sm" onClick={() => setCreateOpen(true)} aria-label="Create New Vyral" startIcon={<Plus size={14} />}>New</Button>}
      />
      <div className="space-y-5 p-5 sm:p-6">
      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Vyrals" className={fieldClass + ' pl-9'} /></div>
      {visibleVyrals.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleVyrals.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]"><button type="button" onClick={() => setActiveId(item.id)} className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 border-b border-[var(--vyra-border-subtle)] bg-[radial-gradient(circle_at_50%_35%,rgba(99,102,241,.18),transparent_48%),linear-gradient(135deg,var(--vyra-bg-surface),var(--vyra-bg-hover))] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={38} /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">VYRAL COLLECTION</span></button><div className="p-4"><div className="flex items-start gap-2"><button type="button" onClick={() => setActiveId(item.id)} className="min-w-0 flex-1 text-left"><h3 className="truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{item.name}</h3><p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-[var(--vyra-text-secondary)]">{item.description || 'A private creative asset library.'}</p></button><button type="button" onClick={() => deleteVyral(item.id)} aria-label={`Delete ${item.name}`} className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-danger)]"><Trash2 size={15} /></button></div><div className="mt-3 flex items-center justify-between text-[10px] text-[var(--vyra-text-muted)]"><span>{item.folders.length} folders</span><span>Private · {new Date(item.updatedAt).toLocaleDateString()}</span></div><button type="button" onClick={() => setActiveId(item.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--vyra-accent-primary)]">Open Vyral <ChevronRight size={14} /></button></div></article>)}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--vyra-border)] px-6 py-10 text-center"><div className="grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><VyralIdentityIcon size={28} /></div><h3 className="mt-4 text-base font-semibold text-[var(--vyra-text-primary)]">{query ? 'No matching Vyrals' : 'Create your first Vyral'}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--vyra-text-secondary)]">{query ? 'Try another search term.' : 'Give your creative assets a home with their own identity, folders and knowledge.'}</p></div>}
      {createOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-vyral-title" className="w-full max-w-md rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)]"><div className="flex items-start justify-between gap-3"><div><h3 id="create-vyral-title" className="text-xl font-bold text-[var(--vyra-text-primary)]">Create New Vyral</h3><p className="mt-1 text-sm text-[var(--vyra-text-secondary)]">Start a new creative asset library.</p></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="rounded-lg p-2 text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button></div><form onSubmit={createVyral} className="mt-5 space-y-4"><div><label htmlFor="new-vyral-name" className="mb-2 block text-xs font-semibold text-[var(--vyra-text-primary)]">Vyral name *</label><input id="new-vyral-name" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Northern Kingdom" className={fieldClass} /></div><div><label htmlFor="new-vyral-description" className="mb-2 block text-xs font-semibold text-[var(--vyra-text-primary)]">Description <span className="font-normal text-[var(--vyra-text-muted)]">(optional)</span></label><textarea id="new-vyral-description" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this Vyral about?" className={fieldClass + ' min-h-24 resize-y py-2.5'} /></div><div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Create Vyral</Button></div></form></section></div>}
      </div>
    </section>
  );
};
