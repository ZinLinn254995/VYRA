import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, ArrowLeft, Check, ChevronRight, Download, File, FileText, Folder, FolderOpen,
  FolderPlus, Grid2X2, Image as ImageIcon, List, Loader2, Minus, Plus, RefreshCw,
  Trash2, Upload, Video, X,
} from 'lucide-react';
import {
  createMediaLibraryFolder, deleteMediaLibraryFolder, deleteMediaLibraryItems,
  loadMediaLibrary, moveMediaLibraryItems, uploadMediaLibraryFiles,
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
  return 'other';
};

export const MyMediaLibraryPage: React.FC<Props> = ({ searchQuery = '' }) => {
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [zoomLevel, setZoomLevel] = useState(2);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef<string | null>(null);
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
      setSelectedIds((previous) => previous.filter((id) => result.items.some((item) => item.id === id) || result.folders.some((folder) => folder.id === id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load My Media Library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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

  // File-manager behavior: only show the current directory's immediate children.
  // Folders and files share the same content area; opening a folder navigates into it.
  const visibleFolders = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return folders
      .filter((folder) => folder.parent_id === activeFolderId)
      .filter((folder) => !query || folder.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, activeFolderId, searchQuery]);

  const folderItems = useMemo(
    () => activeFolderId === null ? items.filter((item) => item.folder_id === null) : items.filter((item) => item.folder_id === activeFolderId),
    [items, activeFolderId],
  );
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
    catch (cause) { await refresh(); setError(cause instanceof Error ? cause.message : 'The Media Library action failed.'); }
    finally { setBusy(false); }
  };

  const navigateToFolder = (folderId: string | null) => {
    setActiveFolderId(folderId);
    setSelectedIds([]);
    setCreatingFolder(false);
    setFolderName('');
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
    });
  };

  const toggleSelected = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const visibleEntryIds = [...visibleFolders.map((folder) => folder.id), ...filteredItems.map((item) => item.id)];
  const allVisibleSelected = visibleEntryIds.length > 0 && visibleEntryIds.every((id) => selectedIds.includes(id));
  const toggleAllVisible = () => setSelectedIds((previous) => allVisibleSelected
    ? previous.filter((id) => !visibleEntryIds.includes(id))
    : [...new Set([...previous, ...visibleEntryIds])]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };
  const beginLongPress = (id: string) => {
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      toggleSelected(id);
      suppressClickRef.current = id;
      holdTimerRef.current = null;
    }, 450);
  };
  const finishLongPress = () => {
    clearHoldTimer();
  };
  const handleEntryClick = (id: string, action: () => void) => {
    if (suppressClickRef.current === id) {
      suppressClickRef.current = null;
      return;
    }
    if (selectedIds.length > 0) toggleSelected(id);
    else action();
  };
  const holdProps = (id: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      beginLongPress(id);
    },
    onPointerUp: finishLongPress,
    onPointerLeave: finishLongPress,
    onPointerCancel: finishLongPress,
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
    onDragStart: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
  });

  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm('Remove ' + selectedIds.length + ' selected item(s) from My Media Library? Uploaded files will be deleted; Vyral Assets remain in their Vyral.')) return;
    const selectedFileIds = selectedIds.filter((id) => items.some((item) => item.id === id));
    const count = selectedFileIds.length;
    if (!count) { setError('Folder deletion is available from the folder actions.'); return; }
    await withBusy(async () => { await deleteMediaLibraryItems(selectedFileIds); setSelectedIds((current) => current.filter((id) => !selectedFileIds.includes(id))); }, 'Removed ' + count + (count === 1 ? ' file from My Media Library.' : ' files from My Media Library.'));
  };

  const moveSelected = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const destination = event.target.value === '__root__' ? null : event.target.value;
    const selectedFileIds = selectedIds.filter((id) => items.some((item) => item.id === id));
    if (!selectedFileIds.length) { event.target.value = ''; return; }
    const count = selectedFileIds.length;
    await withBusy(async () => { await moveMediaLibraryItems(selectedFileIds, destination); setSelectedIds((current) => current.filter((id) => !selectedFileIds.includes(id))); }, count + (count === 1 ? ' file moved.' : ' files moved.'));
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
          <button type="button" onClick={() => { setCreatingFolder((value) => !value); setFolderName(''); }} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]"><FolderPlus size={15}/> New folder</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 hover:opacity-90"><Upload size={15}/> Upload</button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUpload(event)} />
        </div>
      </div>

      {creatingFolder && <form onSubmit={(event) => void createFolder(event)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3">
        <Folder size={17} className="text-[var(--vyra-accent-primary)]"/>
        <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder={activeFolderId ? 'New folder inside ' + (folderById.get(activeFolderId)?.name ?? 'this folder') : 'Folder name'} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        <button type="submit" disabled={busy || !folderName.trim()} className="min-h-10 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => { setCreatingFolder(false); setFolderName(''); }} className="grid size-10 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Cancel folder creation"><X size={16}/></button>
      </form>}

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/5 px-3 py-2.5 text-xs text-[var(--vyra-danger)]"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
      {notice && <div role="status" className="rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] px-3 py-2.5 text-xs text-[var(--vyra-text-secondary)]">{notice}</div>}

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            {activeFolderId !== null && <button type="button" onClick={() => navigateToFolder(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null)} aria-label="Go to parent folder" className="mr-1 grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]"><ArrowLeft size={15}/></button>}
            <button type="button" onClick={() => navigateToFolder(null)} className={`rounded-md px-2 py-1.5 font-semibold ${activeFolderId === null ? 'text-[var(--vyra-text-primary)]' : 'text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}>My Media Library</button>
            {breadcrumbs.map((folder, index) => <React.Fragment key={folder.id}>
              <ChevronRight size={14} className="shrink-0 text-[var(--vyra-text-muted)]"/>
              <button type="button" onClick={() => navigateToFolder(folder.id)} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className={`max-w-40 truncate rounded-md px-2 py-1.5 ${index === breadcrumbs.length - 1 ? 'font-semibold text-[var(--vyra-text-primary)]' : 'text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}>{folder.name}</button>
            </React.Fragment>)}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {view === 'grid' && <div className="flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] p-1">
              <button type="button" onClick={() => setZoomLevel((level) => Math.max(0, level - 1))} disabled={zoomLevel === 0} aria-label="Zoom out" className="grid size-8 place-items-center rounded-md text-[var(--vyra-text-muted)] disabled:opacity-30"><Minus size={15}/></button>
              <button type="button" onClick={() => setZoomLevel((level) => Math.min(4, level + 1))} disabled={zoomLevel === 4} aria-label="Zoom in" className="grid size-8 place-items-center rounded-md text-[var(--vyra-text-muted)] disabled:opacity-30"><Plus size={15}/></button>
            </div>}
            <div className="flex items-center gap-1 rounded-lg border border-[var(--vyra-border)] p-1">
              <button type="button" onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={`grid size-8 place-items-center rounded-md ${view === 'grid' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><Grid2X2 size={15}/></button>
              <button type="button" onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={`grid size-8 place-items-center rounded-md ${view === 'list' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}><List size={15}/></button>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading || busy} aria-label="Refresh library" className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><RefreshCw size={14}/></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--vyra-text-muted)]">{visibleFolders.length} folders · {filteredItems.length} files</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['all','All'],['image','Images'],['video','Videos'],['audio','Audio'],['document','Documents'],['other','Other'],
            ] as [FilterKind,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-8 rounded-full border px-3 text-[11px] font-medium transition ${filter === value ? 'border-[var(--vyra-accent-primary)] bg-[var(--vyra-accent-primary)]/10 text-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]'}`}>{label}</button>)}
          </div>
        </div>

        {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-2">
          <button type="button" onClick={toggleAllVisible} className="inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-semibold text-[var(--vyra-text-primary)]"><Check size={14}/>{selectedIds.length} selected</button>
          <select aria-label="Move selected files to folder" defaultValue="" onChange={(event) => void moveSelected(event)} className="min-h-8 max-w-48 rounded-md border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-2 text-xs text-[var(--vyra-text-primary)]">
            <option value="" disabled>Move to folder…</option><option value="__root__">My Media Library</option>
            {folderTree.map(({folder,depth}) => <option key={folder.id} value={folder.id}>{'— '.repeat(depth)}{folder.name}</option>)}
          </select>
          <button type="button" onClick={() => void deleteSelected()} disabled={busy} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--vyra-danger)] hover:bg-[var(--vyra-danger)]/5"><Trash2 size={13}/> Delete</button>
          <button type="button" onClick={() => setSelectedIds([])} className="ml-auto grid size-8 place-items-center rounded-md text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Clear selection"><X size={14}/></button>
        </div>}

        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--vyra-text-muted)]"><Loader2 size={17} className="animate-spin"/> Loading Media Library…</div>
        : (visibleFolders.length > 0 || filteredItems.length > 0) ? view === 'grid' ? <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(' + [280, 220, 180, 145, 115][zoomLevel] + 'px, 100%), 1fr))' }}>
          {visibleFolders.map((folder) => <article key={folder.id} {...holdProps(folder.id)} onClick={() => handleEntryClick(folder.id, () => navigateToFolder(folder.id))} className={`relative flex min-h-32 min-w-0 cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border bg-[var(--vyra-bg-surface)] p-4 text-center [-webkit-touch-callout:none] hover:border-[var(--vyra-accent-primary)]/60 ${selectedIds.includes(folder.id) ? 'border-[var(--vyra-accent-primary)] ring-1 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)]'}`}><span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Folder size={25}/></span><span className="w-full truncate text-xs font-semibold text-[var(--vyra-text-primary)]">{folder.name}</span>{selectedIds.includes(folder.id) && <Check size={14} className="absolute right-2 top-2 text-[var(--vyra-accent-primary)]"/>}</article>)}
          {filteredItems.map((item) => <article key={item.id} {...holdProps(item.id)} onClick={() => handleEntryClick(item.id, () => openItem(item))} className={`relative flex min-h-32 min-w-0 cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border bg-[var(--vyra-bg-surface)] p-4 text-center [-webkit-touch-callout:none] ${selectedIds.includes(item.id) ? 'border-[var(--vyra-accent-primary)] ring-1 ring-[var(--vyra-accent-primary)]' : 'border-[var(--vyra-border)]'}`}>
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-text-muted)]">{iconFor(item.mime_type,25)}</span>
            <span className="w-full truncate text-xs font-semibold text-[var(--vyra-text-primary)]" title={item.file_name}>{item.file_name}</span>
            {selectedIds.includes(item.id) && <Check size={14} className="absolute right-2 top-2 text-[var(--vyra-accent-primary)]"/>}
          </article>)}
        </div> : <div className="overflow-x-auto rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]">
          <div className="min-w-0">
            <div className="flex min-h-9 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--vyra-text-muted)]"><button type="button" onClick={toggleAllVisible} aria-label="Select all visible items" className="grid size-7 place-items-center rounded hover:bg-[var(--vyra-bg-hover)]"><Check size={13}/></button><span className="min-w-0 flex-1">Name</span></div>
            {visibleFolders.map((folder) => <div key={folder.id} {...holdProps(folder.id)} onClick={() => handleEntryClick(folder.id, () => navigateToFolder(folder.id))} className={`flex min-h-12 cursor-pointer select-none items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 last:border-b-0 [-webkit-touch-callout:none] ${selectedIds.includes(folder.id) ? 'bg-[var(--vyra-accent-primary)]/5' : ''}`}>
              <span className="grid size-7 shrink-0 place-items-center text-[var(--vyra-accent-primary)]"><Folder size={16}/></span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--vyra-text-primary)]">{folder.name}</span>{selectedIds.includes(folder.id) && <Check size={14} className="text-[var(--vyra-accent-primary)]"/>}
            </div>)}
            {filteredItems.map((item) => <div key={item.id} {...holdProps(item.id)} onClick={() => handleEntryClick(item.id, () => openItem(item))} className={`flex min-h-12 cursor-pointer select-none items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-3 last:border-b-0 [-webkit-touch-callout:none] ${selectedIds.includes(item.id) ? 'bg-[var(--vyra-accent-primary)]/5' : ''}`}>
              <span className="grid size-7 shrink-0 place-items-center text-[var(--vyra-text-muted)]">{iconFor(item.mime_type,16)}</span><span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--vyra-text-primary)]">{item.file_name}</span>{selectedIds.includes(item.id) && <Check size={14} className="text-[var(--vyra-accent-primary)]"/>}
            </div>)}
          </div>
        </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--vyra-border)] px-5 py-10 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><FolderOpen size={23}/></div>
          <h3 className="mt-3 text-sm font-semibold text-[var(--vyra-text-primary)]">{searchQuery || filter !== 'all' ? 'No matching items' : activeFolderId ? 'This folder is empty' : 'Your Media Library is empty'}</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--vyra-text-secondary)]">{searchQuery || filter !== 'all' ? 'Try a different search or file filter.' : 'Upload files here or create a folder. Open folders to organize your media.'}</p>
          {!searchQuery && filter === 'all' && <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950"><Plus size={14}/> Upload files</button>}
        </div>}
      </section>

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
