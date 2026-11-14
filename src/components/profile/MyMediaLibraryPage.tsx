import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, Check, ChevronRight, Download, File, FileText, Folder, FolderPlus,
  Grid2X2, Image as ImageIcon, List, Loader2, MoreHorizontal, Pencil, Plus,
  RefreshCw, Search, Trash2, Upload, Video, X,
} from 'lucide-react';
import { supabase } from '../../context/AuthContext';
import {
  createMediaLibraryFolder, deleteMediaLibraryFolder, deleteMediaLibraryItems,
  loadMediaLibrary, moveMediaLibraryItems, renameMediaLibraryFolder,
  renameMediaLibraryItem, uploadMediaLibraryFiles,
  type MediaLibraryFolder, type MediaLibraryItem,
} from '../../services/mediaLibraryCloud';

type Props = { searchQuery?: string };
type FilterKind = 'all' | 'image' | 'video' | 'audio' | 'document' | 'other';
type ViewMode = 'grid' | 'list';

const kindOf = (mime: string): FilterKind => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.includes('word') || mime.includes('officedocument') || mime.startsWith('text/')) return 'document';
  if (mime === 'application/octet-stream') return 'other';
  return 'other';
};
const formatBytes = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes < 1024 * 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const MyMediaLibraryPage: React.FC<Props> = ({ searchQuery = '' }) => {
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadMediaLibrary();
      setFolders(result.folders);
      setItems(result.items);
      setSelectedIds((previous) => previous.filter((id) => result.items.some((item) => item.id === id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load My Media Library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const folderItems = useMemo(() => items.filter((item) => item.folder_id === activeFolderId), [items, activeFolderId]);
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return folderItems.filter((item) => {
      const kindMatches = filter === 'all' || kindOf(item.mime_type) === filter;
      const searchMatches = !query || item.file_name.toLocaleLowerCase().includes(query) || item.mime_type.toLocaleLowerCase().includes(query);
      return kindMatches && searchMatches;
    });
  }, [folderItems, filter, searchQuery]);

  const folderTree = useMemo(() => {
    const output: Array<{ folder: MediaLibraryFolder; depth: number }> = [];
    const visit = (parentId: string | null, depth: number, ancestors: Set<string>) => {
      for (const folder of folders.filter((item) => item.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
        if (ancestors.has(folder.id)) continue;
        output.push({ folder, depth });
        const next = new Set(ancestors); next.add(folder.id);
        visit(folder.id, depth + 1, next);
      }
    };
    visit(null, 0, new Set());
    return output;
  }, [folders]);

  const withBusy = async (task: () => Promise<void>, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await task(); if (success) setNotice(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The Media Library action failed.'); }
    finally { setBusy(false); }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    await withBusy(async () => {
      const count = await uploadMediaLibraryFiles(files, activeFolderId);
      setSelectedIds([]);
      setNotice(count + (count === 1 ? ' file uploaded.' : ' files uploaded.'));
    });
  };

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    await withBusy(async () => {
      await createMediaLibraryFolder(folderName, activeFolderId);
      setFolderName(''); setCreatingFolder(false);
    }, 'Folder created.');
  };

  const toggleSelected = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id));
  const toggleAllVisible = () => setSelectedIds((previous) => allVisibleSelected
    ? previous.filter((id) => !filteredItems.some((item) => item.id === id))
    : [...new Set([...previous, ...filteredItems.map((item) => item.id)])]);

  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm('Delete ' + selectedIds.length + ' selected file(s)? This permanently removes the stored files.')) return;
    const count = selectedIds.length;
    await withBusy(async () => { await deleteMediaLibraryItems(selectedIds); setSelectedIds([]); }, count + (count === 1 ? ' file deleted.' : ' files deleted.'));
  };

  const renameItem = async (item: MediaLibraryItem) => {
    const next = window.prompt('Rename file', item.file_name);
    if (next === null || !next.trim() || next.trim() === item.file_name) return;
    await withBusy(() => renameMediaLibraryItem(item.id, next), 'File renamed.');
  };

  const renameFolder = async (folder: MediaLibraryFolder) => {
    const next = window.prompt('Rename folder', folder.name);
    if (next === null || !next.trim() || next.trim() === folder.name) return;
    await withBusy(() => renameMediaLibraryFolder(folder.id, next), 'Folder renamed.');
  };

  const removeFolder = async (folder: MediaLibraryFolder) => {
    if (!window.confirm('Delete the empty folder "' + folder.name + '"?')) return;
    await withBusy(() => deleteMediaLibraryFolder(folder.id), 'Folder deleted.');
  };

  const moveSelected = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const destination = event.target.value || null;
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    await withBusy(async () => { await moveMediaLibraryItems(selectedIds, destination); setSelectedIds([]); }, count + (count === 1 ? ' file moved.' : ' files moved.'));
    event.target.value = '';
  };

  const iconFor = (mime: string, size = 20) => {
    const kind = kindOf(mime);
    if (kind === 'image') return <ImageIcon size={size}/>;
    if (kind === 'video') return <Video size={size}/>;
    if (kind === 'audio') return <AudioLines size={size}/>;
    if (kind === 'document') return <FileText size={size}/>;
    return <File size={size}/>;
  };

  const openItem = (item: MediaLibraryItem) => {
    if (item.signed_url) setPreviewItem(item);
    else setError('A secure preview link could not be created. Refresh and try again.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--vyra-text-secondary)]">Keep your uploads and VYRA-created media together, organized in private folders.</p>
          <p className="mt-1 text-xs text-[var(--vyra-text-muted)]">{items.length} files · {folders.length} folders</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setCreatingFolder((value) => !value)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]"><FolderPlus size={15}/> New folder</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 hover:opacity-90"><Upload size={15}/> Upload</button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUpload(event)} />
        </div>
      </div>

      {creatingFolder && <form onSubmit={(event) => void createFolder(event)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3">
        <Folder size={17} className="text-[var(--vyra-accent-primary)]"/>
        <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder="Folder name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        <button type="submit" disabled={busy || !folderName.trim()} className="min-h-10 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => { setCreatingFolder(false); setFolderName(''); }} className="grid size-10 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Cancel folder creation"><X size={16}/></button>
      </form>}

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/5 px-3 py-2.5 text-xs text-[var(--vyra-danger)]"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
      {notice && <div role="status" className="rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-3 py-2.5 text-xs text-[var(--vyra-text-secondary)]">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2">
          <button type="button" onClick={() => { setActiveFolderId(null); setSelectedIds([]); }} className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold ${activeFolderId === null ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}><Folder size={15}/> All files</button>
          <div className="mt-1 space-y-0.5">
            {folderTree.map(({ folder, depth }) => <div key={folder.id} className="group flex items-center gap-1">
              <button type="button" onClick={() => { setActiveFolderId(folder.id); setSelectedIds([]); }} className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg pr-1 text-left text-xs ${activeFolderId === folder.id ? 'bg-[var(--vyra-bg-hover)] font-semibold text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`} style={{ paddingLeft: 12 + depth * 12 }}><Folder size={14} className="shrink-0"/><span className="truncate">{folder.name}</span></button>
              <div className="hidden shrink-0 items-center group-hover:flex">
                <button type="button" onClick={() => void renameFolder(folder)} title="Rename folder" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Pencil size={12}/></button>
                <button type="button" onClick={() => void removeFolder(folder)} title="Delete empty folder" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:text-[var(--vyra-danger)]"><Trash2 size={12}/></button>
              </div>
            </div>)}
          </div>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--vyra-text-primary)]"><Folder size={16} className="text-[var(--vyra-accent-primary)]"/>{activeFolderId ? folderById.get(activeFolderId)?.name ?? 'Folder' : 'All files'}</div>
              <p className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">{filteredItems.length} shown · {folderItems.length} in this folder</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] p-1">
                <button type="button" onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={`grid size-8 place-items-center rounded-md ${view === 'grid' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><Grid2X2 size={15}/></button>
                <button type="button" onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={`grid size-8 place-items-center rounded-md ${view === 'list' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><List size={15}/></button>
              </div>
              <button type="button" onClick={() => void refresh()} disabled={loading || busy} aria-label="Refresh library" className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><RefreshCw size={14}/></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['all','All'],['image','Images'],['video','Videos'],['audio','Audio'],['document','Documents'],['other','Other'],
            ] as [FilterKind,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-8 rounded-full border px-3 text-[11px] font-medium transition ${filter === value ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/10 text-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}>{label}</button>)}
          </div>

          {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-2">
            <button type="button" onClick={toggleAllVisible} className="inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-semibold text-[var(--vyra-text-primary)]"><Check size={14}/>{selectedIds.length} selected</button>
            <select aria-label="Move selected files to folder" defaultValue="" onChange={(event) => void moveSelected(event)} className="min-h-8 max-w-48 rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]">
              <option value="" disabled>Move to folder…</option><option value="">Root</option>
              {folderTree.map(({folder,depth}) => <option key={folder.id} value={folder.id}>{'— '.repeat(depth)}{folder.name}</option>)}
            </select>
            <button type="button" onClick={() => void deleteSelected()} disabled={busy} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--vyra-danger)] hover:bg-[var(--vyra-danger)]/5"><Trash2 size={13}/> Delete</button>
            <button type="button" onClick={() => setSelectedIds([])} className="ml-auto grid size-8 place-items-center rounded-md text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Clear selection"><X size={14}/></button>
          </div>}

          {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--vyra-text-muted)]"><Loader2 size={17} className="animate-spin"/> Loading Media Library…</div>
          : filteredItems.length ? view === 'grid' ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => <article key={item.id} className={`group min-w-0 overflow-hidden rounded-xl border bg-[var(--vyra-bg-surface)] ${selectedIds.includes(item.id) ? 'border-[var(--vyra-accent-primary)] ring-1 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)]'}`}>
              <div className="relative">
                <button type="button" onClick={() => openItem(item)} className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-muted)]">
                  {kindOf(item.mime_type) === 'image' && item.signed_url ? <img src={item.signed_url} alt={item.file_name} loading="lazy" className="h-full w-full object-cover"/> : <span className="grid size-12 place-items-center rounded-xl bg-[var(--vyra-bg-surface)]">{iconFor(item.mime_type,25)}</span>}
                </button>
                <button type="button" onClick={() => toggleSelected(item.id)} aria-label={selectedIds.includes(item.id) ? 'Deselect '+item.file_name : 'Select '+item.file_name} aria-pressed={selectedIds.includes(item.id)} className={`absolute left-2 top-2 grid size-7 place-items-center rounded-md border shadow-sm ${selectedIds.includes(item.id) ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-slate-950' : 'border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-transparent opacity-80 group-hover:text-[var(--vyra-text-muted)]'}`}><Check size={14}/></button>
              </div>
              <div className="min-w-0 p-3">
                <p className="truncate text-xs font-semibold text-[var(--vyra-text-primary)]" title={item.file_name}>{item.file_name}</p>
                <p className="mt-1 text-[10px] text-[var(--vyra-text-muted)]">{formatBytes(Number(item.size_bytes))} · {dateLabel(item.created_at)}</p>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] capitalize text-[var(--vyra-text-muted)]">{item.source_kind === 'vyral_asset' ? 'AI Chat / Vyral' : item.source_kind === 'generated' ? 'AI generated' : 'Upload'}</span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => void renameItem(item)} title="Rename" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Pencil size={12}/></button>
                    <button type="button" onClick={() => item.signed_url && window.open(item.signed_url, '_blank', 'noopener,noreferrer')} title="Download / open" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Download size={12}/></button>
                  </div>
                </div>
              </div>
            </article>)}
          </div> : <div className="overflow-hidden rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
            <div className="flex min-h-9 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]"><button type="button" onClick={toggleAllVisible} aria-label="Select all visible files" className="grid size-7 place-items-center rounded hover:bg-[var(--vyra-bg-hover)]"><Check size={13}/></button><span className="min-w-0 flex-1">Name</span><span className="w-20">Type</span><span className="w-20 text-right">Size</span><span className="w-24 text-right">Date</span><span className="w-16 text-right">Actions</span></div>
            {filteredItems.map((item) => <div key={item.id} className={`flex min-h-12 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 last:border-b-0 ${selectedIds.includes(item.id) ? 'bg-[var(--vyra-accent-primary)]/5' : ''}`}>
              <button type="button" onClick={() => toggleSelected(item.id)} aria-label={'Select '+item.file_name} className={`grid size-7 shrink-0 place-items-center rounded border ${selectedIds.includes(item.id) ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)] text-slate-950' : 'border-[var(--vyra-border)] text-transparent'}`}><Check size={13}/></button>
              <button type="button" onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className="text-[var(--vyra-text-muted)]">{iconFor(item.mime_type,16)}</span><span className="truncate text-xs font-medium text-[var(--vyra-text-primary)]">{item.file_name}</span></button>
              <span className="w-20 truncate text-[10px] capitalize text-[var(--vyra-text-muted)]">{kindOf(item.mime_type)}</span><span className="w-20 text-right text-[10px] tabular-nums text-[var(--vyra-text-muted)]">{formatBytes(Number(item.size_bytes))}</span><span className="w-24 text-right text-[10px] text-[var(--vyra-text-muted)]">{dateLabel(item.created_at)}</span>
              <span className="flex w-16 justify-end"><button type="button" onClick={() => void renameItem(item)} title="Rename" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Pencil size={12}/></button><button type="button" onClick={() => item.signed_url && window.open(item.signed_url, '_blank', 'noopener,noreferrer')} title="Download" className="grid size-7 place-items-center rounded text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><Download size={12}/></button></span>
            </div>)}
          </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--vyra-border)] px-5 py-10 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Folder size={23}/></div>
            <h3 className="mt-3 text-sm font-semibold text-[var(--vyra-text-primary)]">{searchQuery || filter !== 'all' ? 'No matching files' : activeFolderId ? 'This folder is empty' : 'Your Media Library is empty'}</h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--vyra-text-secondary)]">{searchQuery || filter !== 'all' ? 'Try a different search or file filter.' : 'Upload images, videos, audio and documents. AI Chat and Vyral Assets will also appear here.'}</p>
            {!searchQuery && filter === 'all' && <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950"><Plus size={14}/> Upload your first file</button>}
          </div>}
        </section>
      </div>

      {previewItem && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={'Preview '+previewItem.file_name} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewItem(null); }}>
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
          <div className="flex min-h-12 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-4"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{previewItem.file_name}</span><button type="button" onClick={() => previewItem.signed_url && window.open(previewItem.signed_url, '_blank', 'noopener,noreferrer')} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Open original file"><Download size={16}/></button><button type="button" onClick={() => setPreviewItem(null)} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Close preview"><X size={17}/></button></div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/5 p-4">
            {kindOf(previewItem.mime_type) === 'image' ? <img src={previewItem.signed_url ?? ''} alt={previewItem.file_name} className="max-h-[72vh] max-w-full object-contain"/>
              : kindOf(previewItem.mime_type) === 'video' ? <video src={previewItem.signed_url ?? ''} controls playsInline className="max-h-[72vh] max-w-full"/>
              : kindOf(previewItem.mime_type) === 'audio' ? <audio src={previewItem.signed_url ?? ''} controls className="w-full max-w-xl"/>
              : <div className="py-12 text-center text-[var(--vyra-text-secondary)]"><div className="mb-3 flex justify-center">{iconFor(previewItem.mime_type,34)}</div><p className="text-sm">{previewItem.file_name}</p><p className="mt-1 text-xs">Preview is not available for this file type.</p></div>}
          </div>
        </div>
      </div>}
    </div>
  );
};
