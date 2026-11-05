import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AudioLines, Check, CheckCircle2, ChevronDown, Clapperboard, FileText, Folder,
  FolderPlus, Grid2X2, Image as ImageIcon, List, MoreHorizontal, Plus, Search, Upload,
  Video, X, Info, File, Music,
} from 'lucide-react';

type AssetKind = 'Image' | 'Video' | 'Audio' | 'Document';
type Asset = {
  id: string; name: string; kind: AssetKind; image: string; folder: string; updated: string;
  source?: string; fileSize?: number; mimeType?: string; description?: string;
  purpose?: string; model?: string; prompt?: string; relatedFiles?: string;
};
const initialAssets: Asset[] = [
  { id:'a1', name:'Milo — Front View', kind:'Image', image:'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=900&q=85', folder:'Characters', updated:'Today', fileSize:1843200, mimeType:'image/jpeg', purpose:'Main character reference image.', description:'Front-facing reference for Milo. Use this as the primary face and outfit reference.', model:'Example: Gemini Image', prompt:'A friendly small fantasy creature, front view, full body, consistent character design.' },
  { id:'a2', name:'Milo — Side View', kind:'Image', image:'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=900&q=85', folder:'Characters', updated:'Today', fileSize:1624000, mimeType:'image/jpeg', purpose:'Side-view character reference.', description:'Side profile reference used to maintain Milo’s proportions.', model:'Example: Gemini Image', prompt:'Milo character, clean side view, same face, colors and proportions as front reference.', relatedFiles:'Milo — Front View' },
  { id:'a3', name:'Luma Forest', kind:'Image', image:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&q=85', folder:'Worlds & Locations', updated:'Yesterday', fileSize:2457600, mimeType:'image/jpeg', purpose:'World and location reference.', description:'Forest environment reference for the Milo Adventure universe.' },
  { id:'a4', name:'Forest Morning Scene', kind:'Image', image:'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=900&q=85', folder:'Scenes & Videos', updated:'Yesterday', fileSize:2180000, mimeType:'image/jpeg', purpose:'Scene background / lighting reference.' },
  { id:'a5', name:'Orbit Mini Bot', kind:'Image', image:'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=900&q=85', folder:'Characters', updated:'2 days ago', fileSize:1320000, mimeType:'image/jpeg', purpose:'Secondary character reference.' },
  { id:'a6', name:'Adventure Theme', kind:'Audio', image:'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=900&q=85', folder:'Audio', updated:'3 days ago', fileSize:5242880, mimeType:'audio/mpeg', purpose:'Main background music for adventure scenes.' },
  { id:'a7', name:'Milo Running Test', kind:'Video', image:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85', folder:'Scenes & Videos', updated:'3 days ago', fileSize:18400000, mimeType:'video/mp4', purpose:'Motion test for Milo running animation.' },
  { id:'a8', name:'Visual Style Guide', kind:'Document', image:'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&q=85', folder:'Styles & References', updated:'Last week', fileSize:348160, mimeType:'application/pdf', purpose:'Project visual direction and style reference.' },
];
const folders = [
  { name:'All Assets', icon:Grid2X2 }, { name:'Characters', icon:ImageIcon },
  { name:'Worlds & Locations', icon:Folder }, { name:'Objects & Props', icon:Folder },
  { name:'Scenes & Videos', icon:Clapperboard }, { name:'Audio', icon:AudioLines },
  { name:'Styles & References', icon:FileText }, { name:'Rules & Instructions', icon:FileText },
];
const kindIcon = (kind: AssetKind) => kind === 'Video' ? Video : kind === 'Audio' ? AudioLines : kind === 'Document' ? FileText : ImageIcon;
const formatSize = (size?: number) => size == null ? 'Not available' : size < 1024*1024 ? `${(size/1024).toFixed(1)} KB` : `${(size/1024/1024).toFixed(2)} MB`;

export const VyralProjectWorkspaceView: React.FC<{ onBack: () => void; vyralName?: string }> = ({ onBack, vyralName = 'Vyral Workspace' }) => {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeFolder, setActiveFolder] = useState('All Assets');
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [view, setView] = useState<'grid'|'list'>('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [activeAsset, setActiveAsset] = useState<Asset|null>(null);
  const [query, setQuery] = useState('');
  const [addMenu, setAddMenu] = useState(false);
  const [mediaPicker, setMediaPicker] = useState(false);
  const [mediaSelected, setMediaSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const longPressed = useRef(false);
  const visibleAssets = useMemo(() => assets.filter(a => (activeFolder==='All Assets' || a.folder===activeFolder) && (!query.trim() || a.name.toLowerCase().includes(query.toLowerCase()))), [assets,activeFolder,query]);
  const selectedAssets = assets.filter(a => selected.includes(a.id));
  const folderNames = [...folders.slice(1).map(folder => folder.name), ...customFolders];
  const createFolder = () => { const name = window.prompt('Folder name'); if (!name?.trim()) return; const clean = name.trim(); if (folderNames.some(x => x.toLowerCase() === clean.toLowerCase())) { setNotice('A folder with that name already exists.'); return; } setCustomFolders(current => [...current, clean]); setNotice(`Folder “${clean}” created.`); };
  const createFile = () => { const name = window.prompt('File name'); if (!name?.trim()) return; const clean = name.trim(); const file:Asset = { id:'new-'+Date.now(), name:clean.includes('.')?clean:`${clean}.txt`, kind:'Document', image:'', folder:activeFolder==='All Assets'?'':activeFolder, updated:'Just now', fileSize:0, mimeType:'text/plain', description:'' }; setAssets(current => [file,...current]); setActiveAsset({...file}); setNotice('New text file created.'); };
  const toggleAsset = (id:string) => setSelected(current => current.includes(id) ? current.filter(x=>x!==id) : [...current,id]);
  const beginPress = (id:string) => {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setSelectMode(true);
      setSelected(current => current.includes(id) ? current : [...current,id]);
    }, 480);
  };
  const endPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = null; };
  const activateAsset = (asset:Asset) => {
    if (longPressed.current) { longPressed.current = false; return; }
    if (selectMode) toggleAsset(asset.id);
    else setActiveAsset({...asset});
  };
  const updateActiveAsset = (patch:Partial<Asset>) => setActiveAsset(current => current ? {...current,...patch} : current);
  const saveDetails = () => {
    if (!activeAsset) return;
    setAssets(current => current.map(a => a.id===activeAsset.id ? activeAsset : a));
    setNotice('File details saved in this demo workspace.');
    setActiveAsset(null);
  };
  const uploadFiles = (files:FileList|null) => {
    if (!files?.length) return;
    const additions:Asset[] = Array.from(files).map((file,index) => {
      const kind:AssetKind = file.type.startsWith('video/') ? 'Video' : file.type.startsWith('audio/') ? 'Audio' : file.type.startsWith('image/') ? 'Image' : 'Document';
      return { id:'upload-'+Date.now()+'-'+index, name:file.name, kind, image:kind==='Image' ? URL.createObjectURL(file) : '', folder:activeFolder==='All Assets' ? (kind==='Audio'?'Audio':kind==='Video'?'Scenes & Videos':'Characters') : activeFolder, updated:'Just now', source:'Device upload', fileSize:file.size, mimeType:file.type || 'Unknown' };
    });
    setAssets(current => [...additions,...current]);
    setNotice(`${additions.length} file(s) added to this demo Gallery. Cloud upload is not connected yet.`);
  };
  const addMedia = () => {
    if (!mediaSelected.length) return;
    const additions = initialAssets.filter(a=>mediaSelected.includes(a.id)).map(a=>({...a,id:'media-'+Date.now()+'-'+a.id,folder:activeFolder==='All Assets'?a.folder:activeFolder,source:'Media Library'}));
    setAssets(current=>[...additions,...current]);
    setMediaPicker(false); setMediaSelected([]);
    setNotice(`${additions.length} sample media item(s) added to this Project.`);
  };
  const openAddFileMenu = () => setAddMenu(v=>!v);

  return <div className="mx-auto w-full max-w-[1600px] px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onBack} aria-label="Back to Vyrals" className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400/50"><ArrowLeft className="h-4 w-4"/></button>
        <div className="min-w-0"><h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{vyralName}</h1><p className="mt-1 text-xs text-slate-400">Creative Project · {assets.length} files · Version 1.0</p></div>
      </div>
      <div className="flex items-center gap-2"><span className="hidden rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200 sm:inline-flex"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> File Manager</span><button className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="More project options"><MoreHorizontal className="h-4 w-4"/></button></div>
    </div>
    {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X className="h-4 w-4"/></button></div>}

    <div className="min-w-0">


      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-[#0d1426] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>{activeFolder!=='All Assets'&&<button onClick={()=>setActiveFolder('All Assets')} className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"><ArrowLeft className="h-3 w-3"/> All Files</button>}<h2 className="text-base font-semibold text-white">{activeFolder}</h2><p className="mt-1 text-[11px] text-slate-500">{visibleAssets.length} files · Single tap to open · Long press to select</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:w-44 sm:flex-none"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search files..." className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-400/60"/></label>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1"><button onClick={()=>setView('grid')} aria-label="Gallery view" className={`rounded-md p-1.5 ${view==='grid'?'bg-slate-700 text-cyan-200':'text-slate-500'}`}><Grid2X2 className="h-4 w-4"/></button><button onClick={()=>setView('list')} aria-label="List view" className={`rounded-md p-1.5 ${view==='list'?'bg-slate-700 text-cyan-200':'text-slate-500'}`}><List className="h-4 w-4"/></button></div>
            <button onClick={()=>{setSelectMode(v=>!v);setSelected([]);}} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectMode?'border-cyan-300 bg-cyan-300/10 text-cyan-200':'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{selectMode?'Exit Select':'Select'}</button>
            <div className="relative"><button onClick={createFolder} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><FolderPlus className="h-3.5 w-3.5"/> New Folder</button><button onClick={createFile} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><File className="h-3.5 w-3.5"/> New File</button><button onClick={openAddFileMenu} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-3.5 w-3.5"/> Add Files <ChevronDown className="h-3 w-3"/></button>{addMenu&&<div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-700 bg-[#111a2e] p-1.5 shadow-2xl"><button onClick={()=>{setAddMenu(false);setMediaPicker(true);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800"><ImageIcon className="h-4 w-4 text-violet-300"/> Choose from Media Library</button><button onClick={()=>{setAddMenu(false);fileInput.current?.click();}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800"><Upload className="h-4 w-4 text-emerald-300"/> Upload from Device</button></div>}<input ref={fileInput} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt" className="hidden" onChange={e=>{uploadFiles(e.target.files);e.currentTarget.value='';}}/></div>
          </div>
        </div>

        {selectMode&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5"><div className="flex items-center gap-2 text-xs text-cyan-100"><CheckCircle2 className="h-4 w-4"/><strong>{selected.length} selected</strong><span className="text-cyan-100/60">· Select files to use as context in Global AI Chat</span></div><button onClick={()=>setSelected([])} className="text-[11px] font-semibold text-cyan-200 hover:text-white">Clear selection</button></div>}

        {view==='grid' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{activeFolder==='All Assets'&&folderNames.map(name=><button key={name} onClick={()=>{setActiveFolder(name);setSelected([]);setSelectMode(false);}} className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-slate-800 bg-[#0d1426] p-4 text-left transition hover:border-cyan-300/40 hover:bg-slate-800/50"><Folder className="h-8 w-8 text-cyan-300"/><span className="w-full truncate text-xs font-semibold text-slate-100">{name}</span><span className="text-[10px] text-slate-500">{assets.filter(a=>a.folder===name).length} items</span></button>)}{visibleAssets.map(asset=>{const active=selected.includes(asset.id);const Icon=kindIcon(asset.kind);return <button key={asset.id} onPointerDown={()=>beginPress(asset.id)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={e=>{e.preventDefault();setSelectMode(true);setSelected(v=>v.includes(asset.id)?v:[...v,asset.id]);}} onClick={()=>activateAsset(asset)} aria-pressed={active} className={`group overflow-hidden rounded-2xl border text-left transition ${active?'border-cyan-300 ring-2 ring-cyan-300/30 bg-cyan-300/5':'border-slate-800 bg-[#0d1426] hover:border-slate-600'}`}><div className="relative aspect-square overflow-hidden bg-slate-900">{asset.kind==='Image'&&asset.image?<img src={asset.image} alt={asset.name} draggable={false} className="h-full w-full object-cover transition group-hover:scale-105"/>:<div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950"><Icon className="h-10 w-10 text-cyan-200"/><span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[9px] text-white">{asset.kind}</span></div>}{selectMode&&<div className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/60 p-1.5 text-white">{active?<Check className="h-3.5 w-3.5 text-cyan-300"/>:<span className="block h-3.5 w-3.5"/>}</div>}{asset.source&&<span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-cyan-100">{asset.source}</span>}</div><div className="p-3"><p className="truncate text-xs font-semibold text-slate-100">{asset.name}</p><p className="mt-1 text-[10px] text-slate-500">{asset.kind} · {asset.updated}</p></div></button>})}</div> : <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1426]">{visibleAssets.map(asset=>{const active=selected.includes(asset.id);const Icon=kindIcon(asset.kind);return <button key={asset.id} onPointerDown={()=>beginPress(asset.id)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={e=>{e.preventDefault();setSelectMode(true);setSelected(v=>v.includes(asset.id)?v:[...v,asset.id]);}} onClick={()=>activateAsset(asset)} aria-pressed={active} className={`flex w-full items-center gap-3 border-b border-slate-800/80 p-3 text-left last:border-0 ${active?'bg-cyan-300/10':'hover:bg-slate-800/40'}`}><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800">{asset.kind==='Image'&&asset.image?<img src={asset.image} alt="" draggable={false} className="h-full w-full object-cover"/>:<Icon className="m-3 h-6 w-6 text-cyan-200"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{asset.name}</p><p className="mt-1 text-[10px] text-slate-500">{asset.kind} · {asset.folder} · {formatSize(asset.fileSize)}</p></div>{selectMode&& (active?<CheckCircle2 className="h-4 w-4 text-cyan-300"/>:<span className="h-4 w-4 rounded-full border border-slate-600"/>)}</button>})}</div>}
        {visibleAssets.length===0&&<div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center"><Folder className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 text-xs text-slate-400">No files in this folder yet.</p></div>}
      </section>
    </div>

    {activeAsset&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)setActiveAsset(null);}}><div role="dialog" aria-modal="true" aria-label="File preview and details" className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#10182b] shadow-2xl"><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{activeAsset.name}</p><p className="mt-1 text-[10px] text-slate-400">Preview & File Details</p></div><button onClick={()=>setActiveAsset(null)} aria-label="Close preview" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4"/></button></div><div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.1fr_0.9fr]"><div className="flex min-h-[240px] items-center justify-center bg-black/30 p-4 sm:min-h-[360px]">{activeAsset.kind==='Image'&&activeAsset.image?<img src={activeAsset.image} alt={activeAsset.name} className="max-h-[55vh] max-w-full rounded-lg object-contain"/>:activeAsset.kind==='Video'&&activeAsset.image?<video src={activeAsset.image} controls className="max-h-[55vh] max-w-full"/>:activeAsset.kind==='Audio'?<div className="w-full max-w-sm text-center"><Music className="mx-auto h-16 w-16 text-cyan-300"/><p className="mt-4 text-sm text-slate-200">{activeAsset.name}</p><p className="mt-2 text-xs text-slate-500">Audio preview is available when a playable file is attached.</p></div>:<div className="text-center"><File className="mx-auto h-16 w-16 text-cyan-300"/><p className="mt-4 text-sm text-slate-200">{activeAsset.name}</p><p className="mt-2 text-xs text-slate-500">Document preview depends on the file format.</p></div>}</div><div className="space-y-4 border-t border-slate-800 p-4 lg:border-l lg:border-t-0"><div className="flex items-center gap-2"><Info className="h-4 w-4 text-cyan-300"/><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">File information</h3></div><div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div><p className="text-[10px] text-slate-500">File type</p><p className="mt-1 break-all text-xs text-slate-200">{activeAsset.mimeType||activeAsset.kind}</p></div><div><p className="text-[10px] text-slate-500">File size</p><p className="mt-1 text-xs text-slate-200">{formatSize(activeAsset.fileSize)}</p></div><div><p className="text-[10px] text-slate-500">Folder</p><p className="mt-1 text-xs text-slate-200">{activeAsset.folder}</p></div><div><p className="text-[10px] text-slate-500">Added / Updated</p><p className="mt-1 text-xs text-slate-200">{activeAsset.updated}</p></div></div><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-300">Description & Notes</span><textarea value={activeAsset.description||""} onChange={e=>updateActiveAsset({description:e.target.value})} rows={12} placeholder="Write anything about this file: purpose, related files, AI model, prompt, workflow, or other notes..." className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-xs leading-6 text-white outline-none focus:border-cyan-400"/></label><div className="flex justify-end gap-2 border-t border-slate-800 pt-3"><button onClick={()=>setActiveAsset(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300">Cancel</button><button onClick={saveDetails} className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950">Save Details</button></div></div></div></div></div>}

    {mediaPicker&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)setMediaPicker(false);}}><div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#10182b] p-4 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><h3 className="text-base font-semibold text-white">Choose from Media Library</h3><p className="mt-1 text-xs text-slate-400">Select multiple existing media items to add to this Project.</p></div><button onClick={()=>setMediaPicker(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4"/></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{initialAssets.map(a=>{const active=mediaSelected.includes(a.id);return <button key={a.id} onClick={()=>setMediaSelected(v=>active?v.filter(x=>x!==a.id):[...v,a.id])} className={`overflow-hidden rounded-xl border text-left ${active?'border-cyan-300 ring-2 ring-cyan-300/20':'border-slate-700'}`}><img src={a.image} alt="" className="aspect-square w-full object-cover"/><div className="flex items-center justify-between gap-1 p-2"><span className="truncate text-[10px] text-slate-200">{a.name}</span>{active&&<Check className="h-3.5 w-3.5 shrink-0 text-cyan-300"/>}</div></button>})}</div><div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4"><span className="text-xs text-slate-400">{mediaSelected.length} selected</span><button onClick={addMedia} disabled={!mediaSelected.length} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">Add to Project</button></div></div></div>}
  </div>;
};
