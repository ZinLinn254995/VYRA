import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AudioLines, Check, ChevronRight, Download, File,
  FileText, Folder, FolderOpen, FolderPlus, Grid2X2, Image as ImageIcon, List,
  Loader2, RefreshCw, Search, Trash2, Upload, Video, X,
} from 'lucide-react';
import {
  createMediaLibraryFolder, deleteMediaLibraryFolder, deleteMediaLibraryItems,
  loadMediaLibrary, moveMediaLibraryItems, renameMediaLibraryFolder,
  renameMediaLibraryItem, uploadMediaLibraryFiles,
  type MediaLibraryFolder, type MediaLibraryItem,
} from '../../services/mediaLibraryCloud';

type FilterKind = 'all' | 'image' | 'video' | 'audio' | 'document' | 'other';
type ViewMode = 'list' | 'grid';
type Entry = { id: string; name: string; folder: MediaLibraryFolder | null; item: MediaLibraryItem | null };

const kindOf = (mime: string): FilterKind => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.includes('word') || mime.includes('officedocument') || mime.startsWith('text/')) return 'document';
  return 'other';
};
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
};
const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const MyMediaLibraryPage: React.FC = () => {
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Entry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const pointerTypeRef = useRef<'mouse' | 'touch' | 'pen'>('mouse');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadMediaLibrary();
      setFolders(result.folders);
      setItems(result.items);
      setSelectedIds((previous) => previous.filter((id) => result.items.some((item) => item.id === id) || result.folders.some((folder) => folder.id === id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load My Media Library.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => { if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current); }, []);

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const breadcrumbs = useMemo(() => {
    const chain: MediaLibraryFolder[] = [];
    const seen = new Set<string>();
    let cursor = activeFolderId ? folderById.get(activeFolderId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      chain.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parent_id ? folderById.get(cursor.parent_id) : undefined;
    }
    return chain;
  }, [activeFolderId, folderById]);

  const folderTree = useMemo(() => {
    const result: Array<{ folder: MediaLibraryFolder; depth: number }> = [];
    const visit = (parentId: string | null, depth: number, ancestors: Set<string>) => {
      folders.filter((folder) => folder.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name)).forEach((folder) => {
        if (ancestors.has(folder.id)) return;
        result.push({ folder, depth });
        const next = new Set(ancestors); next.add(folder.id); visit(folder.id, depth + 1, next);
      });
    };
    visit(null, 0, new Set());
    return result;
  }, [folders]);

  const entries = useMemo<Entry[]>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const currentFolders = folders.filter((folder) => folder.parent_id === activeFolderId)
      .filter((folder) => !normalized || folder.name.toLocaleLowerCase().includes(normalized))
      .map((folder) => ({ id: folder.id, name: folder.name, folder, item: null }));
    const currentItems = items.filter((item) => item.folder_id === activeFolderId)
      .filter((item) => filter === 'all' || kindOf(item.mime_type) === filter)
      .filter((item) => !normalized || item.file_name.toLocaleLowerCase().includes(normalized) || item.mime_type.toLocaleLowerCase().includes(normalized))
      .map((item) => ({ id: item.id, name: item.file_name, folder: null, item }));
    const compare = (a: Entry, b: Entry) => {
      if (a.folder && !b.folder) return -1;
      if (!a.folder && b.folder) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    };
    return [...currentFolders, ...currentItems].sort(compare);
  }, [folders, items, activeFolderId, filter, query]);

  const withBusy = async (task: () => Promise<void>, success?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await task(); await refresh(); if (success) setNotice(success); }
    catch (cause) { await refresh(); setError(cause instanceof Error ? cause.message : 'The Media Library action failed.'); }
    finally { setBusy(false); }
  };
  const navigateToFolder = (id: string | null) => { setActiveFolderId(id); setSelectedIds([]); setCreatingFolder(false); setFolderName(''); setQuery(''); };
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = '';
    if (!files.length) return;
    await withBusy(async () => { const count = await uploadMediaLibraryFiles(files, activeFolderId); setSelectedIds([]); setNotice(count + (count === 1 ? ' file uploaded.' : ' files uploaded.')); });
  };
  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault(); if (!folderName.trim()) return;
    await withBusy(async () => { await createMediaLibraryFolder(folderName, activeFolderId); setFolderName(''); setCreatingFolder(false); }, 'Folder created.');
  };

  const toggleSelected = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const clearHoldTimer = () => { if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; };
  const holdProps = (entry: Entry) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pointerTypeRef.current = event.pointerType;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => { setSelectedIds((previous) => previous.includes(entry.id) ? previous : [...previous, entry.id]); suppressClickRef.current = entry.id; holdTimerRef.current = null; }, 480);
    },
    onPointerUp: clearHoldTimer,
    onPointerLeave: clearHoldTimer,
    onPointerCancel: clearHoldTimer,
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => { event.preventDefault(); setSelectedIds((previous) => previous.includes(entry.id) ? previous : [...previous, entry.id]); },
    onDragStart: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
  });
  const activateEntry = (entry: Entry, event: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current === entry.id) { suppressClickRef.current = null; return; }
    const additiveSelection = event.ctrlKey || event.metaKey || event.shiftKey;
    if (additiveSelection || (pointerTypeRef.current === 'touch' && selectedIds.length > 0)) {
      toggleSelected(entry.id);
      return;
    }
    if (selectedIds.length > 0) {
      if (selectedIds.includes(entry.id)) setSelectedIds([]);
      else setSelectedIds([entry.id]);
      return;
    }
    if (pointerTypeRef.current === 'touch') {
      if (entry.folder) navigateToFolder(entry.id);
      else if (entry.item) setPreviewItem(entry.item);
    } else setSelectedIds([entry.id]);
  };
  const openEntry = (entry: Entry) => {
    if (entry.folder) navigateToFolder(entry.id);
    else if (entry.item?.signed_url) setPreviewItem(entry.item);
    else if (entry.item) setError('A secure preview link could not be created. Refresh and try again.');
  };
  const selectedFiles = selectedIds.filter((id) => items.some((item) => item.id === id));
  const selectedFolders = selectedIds.filter((id) => folders.some((folder) => folder.id === id));
  const allVisibleSelected = entries.length > 0 && entries.every((entry) => selectedIds.includes(entry.id));
  const toggleAll = () => setSelectedIds((previous) => allVisibleSelected ? previous.filter((id) => !entries.some((entry) => entry.id === id)) : [...new Set([...previous, ...entries.map((entry) => entry.id)])]);

  const startRename = () => {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    const folder = folders.find((entry) => entry.id === id) ?? null;
    const item = items.find((entry) => entry.id === id) ?? null;
    if (!folder && !item) return;
    const entry: Entry = { id, name: folder?.name ?? item!.file_name, folder, item };
    setRenameTarget(entry); setRenameValue(entry.name);
  };
  const commitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    await withBusy(async () => {
      if (renameTarget.folder) await renameMediaLibraryFolder(renameTarget.id, renameValue);
      else await renameMediaLibraryItem(renameTarget.id, renameValue);
      setRenameTarget(null); setSelectedIds([]);
    }, 'Name updated.');
  };
  const moveSelected = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const destination = event.target.value === '__root__' ? null : event.target.value;
    if (!selectedFiles.length) { event.target.value = ''; return; }
    const count = selectedFiles.length;
    await withBusy(async () => { await moveMediaLibraryItems(selectedFiles, destination); setSelectedIds([]); }, count + (count === 1 ? ' file moved.' : ' files moved.'));
    event.target.value = '';
  };
  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm('Delete the selected files and empty folders? Vyral source assets remain safe.')) return;
    await withBusy(async () => {
      if (selectedFiles.length) await deleteMediaLibraryItems(selectedFiles);
      for (const id of selectedFolders) await deleteMediaLibraryFolder(id);
      setSelectedIds([]);
    }, 'Selected items deleted.');
  };

  const iconFor = (mime: string, size = 20) => {
    const kind = kindOf(mime);
    if (kind === 'image') return <ImageIcon size={size}/>;
    if (kind === 'video') return <Video size={size}/>;
    if (kind === 'audio') return <AudioLines size={size}/>;
    if (kind === 'document') return <FileText size={size}/>;
    return <File size={size}/>;
  };
  const iconPixels = 22;
  const iconBox = 44;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vyra-border-subtle)] pb-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          <button type="button" onClick={() => navigateToFolder(null)} className="shrink-0 rounded-md px-2 py-1.5 font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">My Media</button>
          {breadcrumbs.map((folder, index) => <React.Fragment key={folder.id}><ChevronRight size={14} className="shrink-0 text-[var(--vyra-text-muted)]"/><button type="button" onClick={() => navigateToFolder(folder.id)} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="max-w-36 shrink-0 truncate rounded-md px-1.5 py-1.5 text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">{folder.name}</button></React.Fragment>)}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeFolderId && <button type="button" onClick={() => navigateToFolder(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null)} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Go to parent folder"><ArrowLeft size={16}/></button>}
          <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50" aria-label="Refresh"><RefreshCw size={15}/></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[170px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]"/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" aria-label="Search current folder" className="min-h-10 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] pl-9 pr-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        </label>
        <button type="button" onClick={() => { setCreatingFolder((value) => !value); setFolderName(''); }} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]"><FolderPlus size={15}/> New folder</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 hover:opacity-90"><Upload size={15}/> Upload</button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUpload(event)}/>
      </div>

      {creatingFolder && <form onSubmit={(event) => void createFolder(event)} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3">
        <Folder size={17} className="text-[var(--vyra-accent-primary)]"/>
        <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder="New folder name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        <button type="submit" disabled={busy || !folderName.trim()} className="min-h-10 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => setCreatingFolder(false)} className="grid size-10 place-items-center rounded-lg text-[var(--vyra-text-muted)]" aria-label="Cancel"><X size={16}/></button>
      </form>}

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/5 px-3 py-2.5 text-xs text-[var(--vyra-danger)]"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
      {notice && <div role="status" className="flex items-center justify-between gap-3 text-xs text-[var(--vyra-text-secondary)]"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={13}/></button></div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-[var(--vyra-text-muted)]">{entries.length} items</span>
          {(['all','image','video','audio','document','other'] as FilterKind[]).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition ${filter === value ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]'}`}>{value === 'all' ? 'All' : value === 'image' ? 'Images' : value === 'video' ? 'Videos' : value === 'audio' ? 'Audio' : value === 'document' ? 'Documents' : 'Other'}</button>)}
        </div>
        <div className="ml-auto flex items-center rounded-lg border border-[var(--vyra-border)] p-0.5"><button type="button" onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={`grid size-8 place-items-center rounded-md ${view === 'list' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><List size={15}/></button><button type="button" onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={`grid size-8 place-items-center rounded-md ${view === 'grid' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><Grid2X2 size={15}/></button></div>
      </div>

      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[var(--vyra-text-muted)]"><Loader2 size={17} className="animate-spin"/> Loading files…</div>
      : entries.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-muted)]"><FolderOpen size={27}/></div>
        <h3 className="mt-4 text-sm font-semibold text-[var(--vyra-text-primary)]">{query || filter !== 'all' ? 'No matching files' : activeFolderId ? 'This folder is empty' : 'This folder is empty'}</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--vyra-text-secondary)]">{query || filter !== 'all' ? 'Try another search or file type.' : 'Create a folder or upload files to start organizing your media.'}</p>
        {!query && filter === 'all' && <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950"><Upload size={14}/> Upload files</button>}
      </div>
      : view === 'list' ? <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[36px_minmax(180px,1fr)_110px_100px_120px] items-center gap-2 border-y border-[var(--vyra-border-subtle)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]">
            <button type="button" onClick={toggleAll} className="grid size-7 place-items-center rounded hover:bg-[var(--vyra-bg-hover)]" aria-label="Select all"><Check size={13}/></button><span>Name</span><span>Type</span><span className="text-right">Size</span><span className="text-right">Date modified</span>
          </div>
          {entries.map((entry) => <div key={entry.id} {...holdProps(entry)} onClick={(event) => activateEntry(entry, event)} onDoubleClick={() => openEntry(entry)} onKeyDown={(event) => { if (event.key === 'Enter') openEntry(entry); if (event.key === ' ') { event.preventDefault(); setSelectedIds([entry.id]); } }} role="button" tabIndex={0} className={`grid min-h-12 grid-cols-[36px_minmax(180px,1fr)_110px_100px_120px] items-center gap-2 rounded-lg border border-transparent px-2 text-left outline-none transition-colors hover:bg-[var(--vyra-bg-hover)] focus-visible:bg-[var(--vyra-bg-hover)] ${selectedIds.includes(entry.id) ? 'border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/10' : 'border-b-[var(--vyra-border-subtle)]'}`}>
            <span className={`grid size-8 place-items-center ${entry.folder ? 'text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}>{entry.folder ? <Folder size={18}/> : iconFor(entry.item!.mime_type,17)}</span>
            <span className="min-w-0 truncate text-xs font-medium text-[var(--vyra-text-primary)]">{entry.name}</span>
            <span className="truncate text-[11px] text-[var(--vyra-text-muted)]">{entry.folder ? 'Folder' : entry.item!.mime_type.split('/').pop()?.toUpperCase() || 'FILE'}</span>
            <span className="text-right text-[11px] tabular-nums text-[var(--vyra-text-muted)]">{entry.item ? formatBytes(entry.item.size_bytes) : '—'}</span>
            <span className="text-right text-[11px] text-[var(--vyra-text-muted)]">{formatDate(entry.folder?.updated_at ?? entry.item!.updated_at)}</span>
          </div>)}
        </div>
      </div> : <div className="flex flex-wrap content-start gap-2">
        {entries.map((entry) => <article key={entry.id} {...holdProps(entry)} onClick={() => activateEntry(entry)} onDoubleClick={() => openEntry(entry)} onKeyDown={(event) => { if (event.key === 'Enter') openEntry(entry); }} role="button" tabIndex={0} className={`relative flex h-28 w-28 shrink-0 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-lg p-2 text-center outline-none transition-colors hover:bg-[var(--vyra-bg-hover)] focus-visible:bg-[var(--vyra-bg-hover)] [-webkit-touch-callout:none] ${selectedIds.includes(entry.id) ? 'bg-[var(--vyra-accent-primary)]/10' : ''}`}>
          <span style={{ width: iconBox, height: iconBox }} className={`grid shrink-0 place-items-center rounded-lg ${entry.folder ? 'text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}>{entry.folder ? <Folder size={iconPixels}/> : iconFor(entry.item!.mime_type,iconPixels)}</span>
          <span title={entry.name} className="line-clamp-2 h-8 w-full shrink-0 overflow-hidden break-words text-xs font-medium leading-4 text-[var(--vyra-text-primary)]">{entry.name}</span>
          {selectedIds.includes(entry.id) && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[var(--vyra-accent-primary)] text-slate-950"><Check size={11}/></span>}
        </article>)}
      </div>}

      {renameTarget && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Rename item">
        <form onSubmit={(event) => void commitRename(event)} className="w-full max-w-sm rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-4 shadow-xl">
          <h3 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Rename {renameTarget.folder ? 'folder' : 'file'}</h3>
          <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="mt-3 min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setRenameTarget(null)} className="min-h-9 rounded-lg px-3 text-xs text-[var(--vyra-text-secondary)]">Cancel</button><button type="submit" disabled={busy || !renameValue.trim()} className="min-h-9 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 disabled:opacity-50">Save</button></div>
        </form>
      </div>}

      {previewItem && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={'Preview '+previewItem.file_name} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewItem(null); }}>
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
          <div className="flex min-h-12 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-4"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{previewItem.file_name}</span><button type="button" onClick={() => previewItem.signed_url && window.open(previewItem.signed_url, '_blank', 'noopener,noreferrer')} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Open original file"><Download size={16}/></button><button type="button" onClick={() => setPreviewItem(null)} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Close preview"><X size={17}/></button></div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/5 p-4">
            {kindOf(previewItem.mime_type) === 'image' ? <img src={previewItem.signed_url ?? ''} alt={previewItem.file_name} className="max-h-[72vh] max-w-full object-contain"/> : kindOf(previewItem.mime_type) === 'video' ? <video src={previewItem.signed_url ?? ''} controls playsInline className="max-h-[72vh] max-w-full"/> : kindOf(previewItem.mime_type) === 'audio' ? <audio src={previewItem.signed_url ?? ''} controls className="w-full max-w-xl"/> : <div className="py-12 text-center text-[var(--vyra-text-secondary)]"><div className="mb-3 flex justify-center">{iconFor(previewItem.mime_type,34)}</div><p className="text-sm">{previewItem.file_name}</p><p className="mt-1 text-xs">Preview is not available for this file type.</p></div>}
          </div>
        </div>
      </div>}
    </div>
  );
};
