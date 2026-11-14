import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AudioLines, Check, ChevronRight, Download, File,
  FileText, Folder, FolderOpen, FolderPlus, Grid2X2, Image as ImageIcon, List,
  Loader2, RefreshCw, Search, Trash2, Upload, Video, X, Pencil, ArrowRightLeft,
} from 'lucide-react';
import {
  backfillMediaLibraryThumbnails, createMediaLibraryFolder, deleteMediaLibraryFolder, deleteMediaLibraryItems,
  loadMediaLibrary, moveMediaLibraryFolder, moveMediaLibraryItems, renameMediaLibraryFolder,
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
const splitFileName = (name: string) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { base: name, extension: '' };
  return { base: name.slice(0, dot), extension: name.slice(dot) };
};
const GridFileName: React.FC<{ name: string }> = ({ name }) => {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<{ firstLine: string; secondLine: string } | null>(null);

  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      if (!width) return;
      const { base, extension } = splitFileName(name);
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      const style = window.getComputedStyle(element);
      context.font = style.font;
      const fits = (value: string) => context.measureText(value).width <= width;
      if (context.measureText(base + extension).width <= width * 2) {
        setLines(null);
        return;
      }

      // Fill line one with as much of the original name as its real rendered
      // width allows. Continue on line two, reserving room for ... + final
      // two characters + the complete extension.
      let splitAt = 0;
      while (splitAt < base.length && fits(base.slice(0, splitAt + 1))) splitAt += 1;
      const firstLine = base.slice(0, splitAt);
      const ending = '...' + base.slice(-2) + extension;
      let continuation = '';
      while (splitAt + continuation.length < base.length) {
        const next = continuation + base[splitAt + continuation.length];
        if (!fits(next + ending)) break;
        continuation = next;
      }
      setLines({ firstLine, secondLine: continuation + ending });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [name]);

  return (
    <span ref={labelRef} title={name} className="flex h-8 w-full min-w-0 shrink-0 flex-col items-center justify-center overflow-hidden text-center text-xs font-medium leading-4 text-[var(--vyra-text-primary)]">
      {lines
        ? <><span className="block w-full truncate">{lines.firstLine}</span><span className="block w-full truncate">{lines.secondLine}</span></>
        : <span className="line-clamp-2 w-full break-all">{name}</span>}
    </span>
  );
};

export const MyMediaLibraryPage: React.FC = () => {
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; fileName: string } | null>(null);
  const [failedUploads, setFailedUploads] = useState<Array<{ file: File; message: string }>>([]);
  const [stopRequested, setStopRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Entry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaLibraryItem | null>(null);
  useEffect(() => {
    if (!previewItem && !renameTarget) return;
    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (previewItem) setPreviewItem(null);
        else setRenameTarget(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleModalKeyDown);
    return () => document.removeEventListener('keydown', handleModalKeyDown);
  }, [previewItem, renameTarget]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const pointerTypeRef = useRef<'mouse' | 'touch' | 'pen'>('mouse');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await loadMediaLibrary();
      setFolders(result.folders);
      setItems(result.items);
      setSelectedIds((previous) => previous.filter((id) => result.items.some((item) => item.id === id) || result.folders.some((folder) => folder.id === id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load My Media Library.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    const initializeLibrary = async () => {
      await refresh();
      if (!mounted) return;
      try {
        // Backfill only four legacy image/video files per visit; never block first paint.
        const generated = await backfillMediaLibraryThumbnails(4);
        if (mounted && generated > 0) await refresh(true);
      } catch {
        // The Library remains usable even if background thumbnail repair is unavailable.
      }
    };
    void initializeLibrary();
    return () => { mounted = false; };
  }, [refresh]);
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
  useEffect(() => {
    const breadcrumb = breadcrumbScrollRef.current;
    if (breadcrumb) breadcrumb.scrollLeft = breadcrumb.scrollWidth;
  }, [activeFolderId, breadcrumbs]);

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

  const folderPath = (folderId: string): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cursor = folderById.get(folderId);
    while (cursor && !seen.has(cursor.id)) {
      parts.unshift(cursor.name);
      seen.add(cursor.id);
      cursor = cursor.parent_id ? folderById.get(cursor.parent_id) : undefined;
    }
    return parts.join(' / ');
  };

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
  const runUploadBatch = async (files: File[]) => {
    if (!files.length || busy) return;
    const failures: Array<{ file: File; message: string }> = [];
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    setStopRequested(false);
    setUploadingCount(files.length);
    setUploadProgress({ completed: 0, total: files.length, fileName: files[0]?.name ?? '' });
    try {
      await withBusy(async () => {
        const count = await uploadMediaLibraryFiles(
          files,
          activeFolderId,
          (completed, total, fileName) => {
            setUploadProgress({ completed, total, fileName });
            setUploadingCount(total - completed);
          },
          (file, cause) => failures.push({ file, message: cause.message }),
          controller.signal,
        );
        setFailedUploads(failures);
        if (count > 0) setSelectedIds([]);
        const stopped = controller.signal.aborted;
        setNotice(
          stopped
            ? 'Upload stopped after the current file. ' + count + (count === 1 ? ' file uploaded' : ' files uploaded') + '.'
            : count + (count === 1 ? ' file uploaded' : ' files uploaded') + (failures.length ? ' · ' + failures.length + ' failed' : '') + '.',
        );
      });
      if (failures.length) {
        setError(failures.map(({ file, message }) => file.name + ': ' + message).join(' · '));
      }
    } finally {
      uploadAbortControllerRef.current = null;
      setStopRequested(false);
      setUploadingCount(0);
      setUploadProgress(null);
    }
  };
  const requestUploadStop = () => {
    if (!uploadAbortControllerRef.current || stopRequested) return;
    setStopRequested(true);
    uploadAbortControllerRef.current.abort();
  };
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setFailedUploads([]);
    await runUploadBatch(files);
  };
  const retryFailedUploads = async () => {
    const retryFiles = failedUploads.map(({ file }) => file);
    if (!retryFiles.length) return;
    setFailedUploads([]);
    setError(null);
    await runUploadBatch(retryFiles);
  };
  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault(); if (!folderName.trim()) return;
    await withBusy(async () => { await createMediaLibraryFolder(folderName, activeFolderId); setFolderName(''); setCreatingFolder(false); });
  };

  const toggleSelected = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const clearHoldTimer = () => { if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; };
  const holdProps = (entry: Entry) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      pointerTypeRef.current = event.pointerType;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearHoldTimer();
      // A new pointer gesture means any prior long-press click suppression is stale.
      suppressClickRef.current = null;
      // Once selection mode is active, taps/clicks must toggle immediately;
      // do not start another long-press timer that could swallow the unselect click.
      if (selectedIds.length > 0) return;
      holdTimerRef.current = window.setTimeout(() => {
        setSelectedIds((previous) => previous.includes(entry.id) ? previous : [...previous, entry.id]);
        suppressClickRef.current = entry.id;
        holdTimerRef.current = null;
      }, 480);
    },
    onPointerUp: clearHoldTimer,
    onPointerLeave: clearHoldTimer,
    onPointerCancel: clearHoldTimer,
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => { event.preventDefault(); setSelectedIds((previous) => previous.includes(entry.id) ? previous : [...previous, entry.id]); },
    onDragStart: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
  });
  const handleEntryKeyDown = (entry: Entry, event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openEntry(entry);
    } else if (event.key === ' ') {
      event.preventDefault();
      toggleSelected(entry.id);
    }
  };

  const activateEntry = (entry: Entry, event?: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current === entry.id) { suppressClickRef.current = null; return; }
    const additiveSelection = Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey);
    if (additiveSelection || selectedIds.length > 0) {
      toggleSelected(entry.id);
      return;
    }
    if (pointerTypeRef.current === 'touch') {
      if (entry.folder) navigateToFolder(entry.id);
      else if (entry.item) setPreviewItem(entry.item);
    } else if (event?.detail === 2) {
      openEntry(entry);
    }
  };
  const openEntry = (entry: Entry) => {
    if (entry.folder) navigateToFolder(entry.id);
    else if (entry.item?.signed_url) setPreviewItem(entry.item);
    else if (entry.item) setError('A secure preview link could not be created. Refresh and try again.');
  };
  const selectedFiles = selectedIds.filter((id) => items.some((item) => item.id === id));
  const selectedFolders = selectedIds.filter((id) => folders.some((folder) => folder.id === id));
  const blockedFolderIds = useMemo(() => {
    const blocked = new Set<string>();
    const addDescendants = (parentId: string): void => {
      folders.filter((folder) => folder.parent_id === parentId).forEach((folder) => {
        if (blocked.has(folder.id)) return;
        blocked.add(folder.id);
        addDescendants(folder.id);
      });
    };
    selectedIds.filter((id) => folders.some((folder) => folder.id === id))
      .forEach((id) => { blocked.add(id); addDescendants(id); });
    return blocked;
  }, [folders, selectedIds]);

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
  const moveSelectedFolder = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const destination = event.target.value === '__root__' ? null : event.target.value;
    const folderId = selectedFolders[0];
    if (!folderId || selectedFolders.length !== 1 || (destination && blockedFolderIds.has(destination))) {
      event.target.value = '';
      return;
    }
    await withBusy(async () => {
      await moveMediaLibraryFolder(folderId, destination);
      setSelectedIds([]);
    }, 'Folder moved.');
    event.target.value = '';
  };
  const downloadPreviewOriginal = () => {
    if (!previewItem?.signed_url) return;
    const downloadUrl = new URL(previewItem.signed_url);
    downloadUrl.searchParams.set('download', previewItem.file_name);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl.toString();
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm('Delete the selected files and empty folders? Vyral source assets remain safe.')) return;
    await withBusy(async () => {
      let cleanupPending = false;
      if (selectedFiles.length) {
        const result = await deleteMediaLibraryItems(selectedFiles);
        cleanupPending = result.cleanupPending;
      }
      for (const id of selectedFolders) await deleteMediaLibraryFolder(id);
      setSelectedIds([]);
      if (cleanupPending) setNotice('Selected items deleted. Private storage cleanup is queued and will retry automatically when you next open My Media Library.');
      else setNotice('Selected items deleted.');
    });
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
      <style>{`.vyra-media-breadcrumb-scroll::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vyra-border-subtle)] pb-3">
        <div ref={breadcrumbScrollRef} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="vyra-media-breadcrumb-scroll flex min-w-0 items-center gap-1 overflow-x-auto text-sm" aria-label="Folder path">
          <button type="button" onClick={() => navigateToFolder(null)} className="shrink-0 rounded-md px-2 py-1.5 font-semibold text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">My Media</button>
          {breadcrumbs.map((folder, index) => <React.Fragment key={folder.id}><ChevronRight size={14} className="shrink-0 text-[var(--vyra-text-muted)]"/><button type="button" onClick={() => navigateToFolder(folder.id)} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="max-w-36 shrink-0 truncate rounded-md px-1.5 py-1.5 text-[var(--vyra-text-primary)] hover:bg-[var(--vyra-bg-hover)]">{folder.name}</button></React.Fragment>)}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setShowSearch((value) => !value)} className={`grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] ${showSearch ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : ''}`} aria-label={showSearch ? "Hide search" : "Show search"} title="Search"><Search size={16}/></button>
          <button type="button" onClick={() => { setCreatingFolder((value) => !value); setFolderName(''); }} disabled={busy} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50" aria-label="New folder" title="New folder"><FolderPlus size={16}/></button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50" aria-label={uploadingCount ? 'Uploading files' : 'Upload files'} title={uploadingCount ? 'Uploading files…' : 'Upload files'}>{uploadingCount ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}</button>
          {activeFolderId && <button type="button" onClick={() => navigateToFolder(breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null)} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Go to parent folder"><ArrowLeft size={16}/></button>}
          <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="grid size-9 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50" aria-label="Refresh"><RefreshCw size={15}/></button>
        </div>
      </div>

      {showSearch && <div className="w-full">
        <label className="relative block w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]"/>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" aria-label="Search current folder" className="min-h-10 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] pl-9 pr-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        </label>
      </div>}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void handleUpload(event)}/>

      {creatingFolder && <form onSubmit={(event) => void createFolder(event)} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3">
        <Folder size={17} className="text-[var(--vyra-accent-primary)]"/>
        <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder="New folder name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)]"/>
        <button type="submit" disabled={busy || !folderName.trim()} className="min-h-10 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => setCreatingFolder(false)} className="grid size-10 place-items-center rounded-lg text-[var(--vyra-text-muted)]" aria-label="Cancel"><X size={16}/></button>
      </form>}

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/5 px-3 py-2.5 text-xs text-[var(--vyra-danger)]"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
      {uploadProgress && <div role="status" aria-live="polite" className="space-y-2 rounded-lg border border-[var(--vyra-accent-primary)]/25 bg-[var(--vyra-accent-primary)]/5 px-3 py-2.5 text-xs text-[var(--vyra-text-primary)]"><div className="flex items-center gap-2"><Loader2 size={15} className="shrink-0 animate-spin text-[var(--vyra-accent-primary)]"/><span>Uploaded {uploadProgress.completed} of {uploadProgress.total} files · {uploadingCount} remaining</span><button type="button" onClick={requestUploadStop} disabled={stopRequested} className="ml-auto shrink-0 rounded-md border border-[var(--vyra-border)] px-2.5 py-1 text-[11px] font-medium disabled:opacity-60">{stopRequested ? 'Stopping…' : 'Stop after current file'}</button></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--vyra-border)]"><div className="h-full rounded-full bg-[var(--vyra-accent-primary)] transition-[width]" style={{ width: (uploadProgress.completed / Math.max(1, uploadProgress.total) * 100) + '%' }}/></div><p className="truncate text-[var(--vyra-text-muted)]">{stopRequested ? 'Will stop after this file finishes.' : uploadProgress.completed === uploadProgress.total ? 'Finishing upload…' : 'Current file: ' + uploadProgress.fileName}</p></div>}
      {failedUploads.length > 0 && <div className="space-y-2 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/5 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--vyra-danger)]">{failedUploads.length} file{failedUploads.length === 1 ? '' : 's'} could not be uploaded</p>
          <button type="button" onClick={() => void retryFailedUploads()} disabled={busy || uploadingCount > 0} className="min-h-8 rounded-md border border-[var(--vyra-danger)]/30 px-3 text-xs font-semibold text-[var(--vyra-danger)] disabled:opacity-50">Retry failed files</button>
        </div>
        <ul className="space-y-1 text-[11px] text-[var(--vyra-text-secondary)]">
          {failedUploads.map(({ file, message }, index) => <li key={file.name + ':' + file.size + ':' + index} className="break-words">{file.name} — {message}</li>)}
        </ul>
      </div>}
      {notice && <div role="status" className="flex items-center justify-between gap-3 text-xs text-[var(--vyra-text-secondary)]"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={13}/></button></div>}

      {selectedIds.length > 0 && <div role="toolbar" aria-label="Selected item actions" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--vyra-accent-primary)]/25 bg-[var(--vyra-accent-primary)]/5 px-3 py-2">
        <span className="mr-auto text-xs font-semibold text-[var(--vyra-text-primary)]" aria-live="polite">{selectedIds.length} selected</span>
        <button type="button" onClick={startRename} disabled={busy || selectedIds.length !== 1} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-border)] px-2.5 text-xs font-medium text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40" aria-label="Rename selected item"><Pencil size={14}/> Rename</button>
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-border)] px-2.5 text-xs text-[var(--vyra-text-secondary)] has-[:disabled]:opacity-40">
          <ArrowRightLeft size={14}/>
          <span>Move files</span>
          <select aria-label="Move selected files to folder" value="" onChange={(event) => void moveSelected(event)} disabled={busy || selectedFiles.length === 0 || selectedFolders.length > 0} className="max-w-32 bg-transparent text-xs text-[var(--vyra-text-primary)] outline-none disabled:cursor-not-allowed">
            <option value="" disabled>Choose folder</option>
            <option value="__root__">My Media</option>
            {folderTree.filter(({ folder }) => folder.id !== activeFolderId).map(({ folder }) => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-border)] px-2.5 text-xs text-[var(--vyra-text-secondary)] has-[:disabled]:opacity-40">
          <ArrowRightLeft size={14}/>
          <span>Move folder</span>
          <select aria-label="Move selected folder to folder" value="" onChange={(event) => void moveSelectedFolder(event)} disabled={busy || selectedFolders.length !== 1 || selectedFiles.length > 0} className="max-w-40 bg-transparent text-xs text-[var(--vyra-text-primary)] outline-none disabled:cursor-not-allowed">
            <option value="" disabled>Choose destination</option>
            <option value="__root__">My Media</option>
            {folderTree.filter(({ folder }) => !blockedFolderIds.has(folder.id)).map(({ folder, depth }) => <option key={folder.id} value={folder.id}>{'　'.repeat(depth)}{folderPath(folder.id)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void deleteSelected()} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vyra-danger)]/30 px-2.5 text-xs font-medium text-[var(--vyra-danger)] hover:bg-[var(--vyra-danger)]/5 disabled:opacity-40" aria-label="Delete selected items"><Trash2 size={14}/> Delete</button>
        <button type="button" onClick={() => setSelectedIds([])} disabled={busy} className="grid size-9 place-items-center rounded-md text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40" aria-label="Clear selection" title="Clear selection"><X size={15}/></button>
      </div>}

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
          {entries.map((entry) => <div key={entry.id} {...holdProps(entry)} onClick={(event) => activateEntry(entry, event)} onDoubleClick={() => openEntry(entry)} onKeyDown={(event) => handleEntryKeyDown(entry, event)} role="button" tabIndex={0} className={`grid min-h-12 grid-cols-[36px_minmax(180px,1fr)_110px_100px_120px] items-center gap-2 rounded-lg border border-transparent px-2 text-left outline-none transition-colors hover:bg-[var(--vyra-bg-hover)] focus-visible:bg-[var(--vyra-bg-hover)] ${selectedIds.includes(entry.id) ? 'border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/10' : 'border-b-[var(--vyra-border-subtle)]'}`}>
            <span className={`grid size-8 place-items-center ${selectedIds.includes(entry.id) ? 'text-[var(--vyra-accent-primary)]' : entry.folder ? 'text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}>{selectedIds.includes(entry.id) ? <Check size={17}/> : entry.folder ? <Folder size={18}/> : iconFor(entry.item!.mime_type,17)}</span>
            <span className="flex min-w-0 items-center overflow-hidden text-xs font-medium text-[var(--vyra-text-primary)]" title={entry.name}>{entry.folder ? <span className="truncate">{entry.name}</span> : <><span className="min-w-0 truncate">{splitFileName(entry.name).base}</span><span className="shrink-0">{splitFileName(entry.name).extension}</span></>}</span>
            <span className="truncate text-[11px] text-[var(--vyra-text-muted)]">{entry.folder ? 'Folder' : entry.item!.mime_type.split('/').pop()?.toUpperCase() || 'FILE'}</span>
            <span className="text-right text-[11px] tabular-nums text-[var(--vyra-text-muted)]">{entry.item ? formatBytes(entry.item.size_bytes) : '—'}</span>
            <span className="text-right text-[11px] text-[var(--vyra-text-muted)]">{formatDate(entry.folder?.updated_at ?? entry.item!.updated_at)}</span>
          </div>)}
        </div>
      </div> : <div className="flex flex-wrap content-start gap-2">
        {entries.map((entry) => <article key={entry.id} {...holdProps(entry)} onClick={(event) => activateEntry(entry, event)} onDoubleClick={() => openEntry(entry)} onKeyDown={(event) => handleEntryKeyDown(entry, event)} role="button" tabIndex={0} className={`relative flex h-28 w-28 shrink-0 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-lg p-2 text-center outline-none transition-colors hover:bg-[var(--vyra-bg-hover)] focus-visible:bg-[var(--vyra-bg-hover)] [-webkit-touch-callout:none] ${selectedIds.includes(entry.id) ? 'bg-[var(--vyra-accent-primary)]/10' : ''}`}>
          <span style={{ width: iconBox, height: iconBox }} className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg ${entry.folder ? 'text-[var(--vyra-accent-primary)]' : 'text-[var(--vyra-text-muted)]'}`}>
            {entry.folder ? <Folder size={iconPixels}/> : entry.item!.thumbnail_url
              ? <><img src={entry.item!.thumbnail_url} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-md object-cover"/>{kindOf(entry.item!.mime_type) === 'video' && <span className="absolute inset-0 grid place-items-center bg-black/15 text-white"><Video size={16}/></span>}</>
              : iconFor(entry.item!.mime_type,iconPixels)}
          </span>
          <span title={entry.name} className="flex h-8 w-full min-w-0 shrink-0 items-center justify-center overflow-hidden text-center text-xs font-medium leading-4 text-[var(--vyra-text-primary)]">{entry.folder ? <span className="line-clamp-2 w-full break-words">{entry.name}</span> : <GridFileName name={entry.name}/>}</span>
          {selectedIds.includes(entry.id) && <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-[var(--vyra-accent-primary)] text-slate-950"><Check size={12}/></span>}
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
          <div className="flex min-h-12 items-center gap-3 border-b border-[var(--vyra-border-subtle)] px-4"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">{previewItem.file_name}</span><button type="button" onClick={downloadPreviewOriginal} disabled={!previewItem.signed_url} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40" aria-label="Download original file"><Download size={16}/></button><button type="button" autoFocus onClick={() => setPreviewItem(null)} className="grid size-9 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]" aria-label="Close preview"><X size={17}/></button></div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/5 p-4">
            {kindOf(previewItem.mime_type) === 'image' ? <img src={previewItem.signed_url ?? ''} alt={previewItem.file_name} className="max-h-[72vh] max-w-full object-contain"/> : kindOf(previewItem.mime_type) === 'video' ? <video src={previewItem.signed_url ?? ''} controls playsInline className="max-h-[72vh] max-w-full"/> : kindOf(previewItem.mime_type) === 'audio' ? <audio src={previewItem.signed_url ?? ''} controls className="w-full max-w-xl"/> : previewItem.mime_type === 'application/pdf' ? <iframe src={previewItem.signed_url ?? ''} title={'PDF preview: ' + previewItem.file_name} className="h-[72vh] w-full rounded-lg bg-white"/> : <div className="py-12 text-center text-[var(--vyra-text-secondary)]"><div className="mb-3 flex justify-center">{iconFor(previewItem.mime_type,34)}</div><p className="text-sm">{previewItem.file_name}</p><p className="mt-1 text-xs">Preview is not available for this file type.</p></div>}
          </div>
        </div>
      </div>}
    </div>
  );
};
