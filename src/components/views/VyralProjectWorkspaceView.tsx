import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AudioLines, Check, ChevronDown, Clapperboard, FileText, Folder, FolderPlus,
  Grid2X2, Image as ImageIcon, List, MoreHorizontal, Plus, Search, Send, Sparkles,
  Upload, Video, X, WandSparkles, Paperclip, SlidersHorizontal, CheckCircle2,
} from 'lucide-react';

type AssetKind = 'Image' | 'Video' | 'Audio' | 'Document';
type Asset = { id: string; name: string; kind: AssetKind; image: string; folder: string; updated: string; source?: string };

const initialAssets: Asset[] = [
  { id: 'a1', name: 'Milo — Front View', kind: 'Image', image: 'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=900&q=85', folder: 'Characters', updated: 'Today' },
  { id: 'a2', name: 'Milo — Side View', kind: 'Image', image: 'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=900&q=85', folder: 'Characters', updated: 'Today' },
  { id: 'a3', name: 'Luma Forest', kind: 'Image', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&q=85', folder: 'Worlds & Locations', updated: 'Yesterday' },
  { id: 'a4', name: 'Forest Morning Scene', kind: 'Image', image: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=900&q=85', folder: 'Scenes & Videos', updated: 'Yesterday' },
  { id: 'a5', name: 'Orbit Mini Bot', kind: 'Image', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=900&q=85', folder: 'Characters', updated: '2 days ago' },
  { id: 'a6', name: 'Adventure Theme', kind: 'Audio', image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=900&q=85', folder: 'Audio', updated: '3 days ago' },
  { id: 'a7', name: 'Milo Running Test', kind: 'Video', image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85', folder: 'Scenes & Videos', updated: '3 days ago' },
  { id: 'a8', name: 'Visual Style Guide', kind: 'Document', image: 'https://images.unsplash.com/photo-1455390582262-044c하?auto=format&w=900&q=85', folder: 'Styles & References', updated: 'Last week' },
];

const folders = [
  { name: 'All Assets', count: 8, icon: Grid2X2 },
  { name: 'Characters', count: 3, icon: Sparkles },
  { name: 'Worlds & Locations', count: 1, icon: Folder },
  { name: 'Objects & Props', count: 0, icon: Folder },
  { name: 'Scenes & Videos', count: 2, icon: Clapperboard },
  { name: 'Audio', count: 1, icon: AudioLines },
  { name: 'Styles & References', count: 1, icon: FileText },
  { name: 'Rules & Instructions', count: 0, icon: FileText },
];

const kindIcon = (kind: AssetKind) => kind === 'Video' ? Video : kind === 'Audio' ? AudioLines : kind === 'Document' ? FileText : ImageIcon;

export const VyralProjectWorkspaceView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeFolder, setActiveFolder] = useState('All Assets');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string[]>(['a1', 'a2']);
  const [query, setQuery] = useState('');
  const [chatText, setChatText] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: 'Hi! I understand this Vyral Project and its assets. Select one or more assets in the Gallery, then tell me what you want to create or change.' },
  ]);
  const [addMenu, setAddMenu] = useState(false);
  const [mediaPicker, setMediaPicker] = useState(false);
  const [mediaSelected, setMediaSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const visibleAssets = useMemo(() => assets.filter(a => (activeFolder === 'All Assets' || a.folder === activeFolder) && (!query.trim() || a.name.toLowerCase().includes(query.toLowerCase()))), [assets, activeFolder, query]);
  const selectedAssets = assets.filter(a => selected.includes(a.id));
  const toggleAsset = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

  const sendMessage = () => {
    const prompt = chatText.trim();
    if (!prompt) return;
    setMessages(current => [...current, { role: 'user', text: prompt }, { role: 'assistant', text: selectedAssets.length ? `I’ll use ${selectedAssets.map(a => a.name).join(', ')} as the selected references. This demo shows where the generated result will appear in the Gallery.` : 'I’ll use the whole Project as context. This demo shows where a generated result will appear in the Gallery.' }]);
    if (/generate|create|make|ဖန်တီး|ထုတ်ပေး/i.test(prompt)) {
      const next: Asset = { id: 'new-' + Date.now(), name: 'AI Generated Result', kind: 'Image', image: 'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=900&q=85', folder: activeFolder === 'All Assets' ? 'Scenes & Videos' : activeFolder, updated: 'Just now', source: 'AI Generated' };
      setAssets(current => [next, ...current]);
      setSelected([next.id]);
      setNotice('Demo result added to the Gallery. AI generation is not connected yet.');
    }
    setChatText('');
  };

  const uploadFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const additions: Asset[] = Array.from(files).map((file, index) => {
      const kind: AssetKind = file.type.startsWith('video/') ? 'Video' : file.type.startsWith('audio/') ? 'Audio' : file.type.startsWith('image/') ? 'Image' : 'Document';
      return { id: 'upload-' + Date.now() + '-' + index, name: file.name, kind, image: kind === 'Image' ? URL.createObjectURL(file) : 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&q=85', folder: activeFolder === 'All Assets' ? 'Characters' : activeFolder, updated: 'Just now', source: 'Device upload' };
    });
    setAssets(current => [...additions, ...current]);
    setSelected(additions.map(a => a.id));
    setNotice(`${additions.length} file(s) added to this demo Gallery. They are not uploaded to cloud storage.`);
  };

  const addMedia = () => {
    if (!mediaSelected.length) return;
    const additions = initialAssets.filter(a => mediaSelected.includes(a.id)).map(a => ({ ...a, id: 'media-' + Date.now() + '-' + a.id, folder: activeFolder === 'All Assets' ? a.folder : activeFolder, source: 'Media Library' }));
    setAssets(current => [...additions, ...current]);
    setSelected(additions.map(a => a.id));
    setMediaPicker(false);
    setMediaSelected([]);
    setNotice(`${additions.length} sample media item(s) added to this Project.`);
  };

  return <div className="mx-auto w-full max-w-[1600px] px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onBack} aria-label="Back to Vyrals" className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400/50"><ArrowLeft className="h-4 w-4"/></button>
        <div className="min-w-0"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-cyan-300"><span>Vyral Library</span><span className="text-slate-600">/</span><span>Project</span></div><h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">Milo Adventure Universe</h1><p className="mt-1 text-xs text-slate-400">Creative Project · 8 assets · Version 1.0</p></div>
      </div>
      <div className="flex items-center gap-2"><span className="hidden rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200 sm:inline-flex"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Demo workspace</span><button className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="More project options"><MoreHorizontal className="h-4 w-4"/></button></div>
    </div>

    {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X className="h-4 w-4"/></button></div>}

    <div className="grid min-w-0 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_360px]">
      <aside className="rounded-2xl border border-slate-800 bg-[#0d1426] p-3">
        <div className="mb-3 flex items-center justify-between px-2"><span className="text-xs font-semibold text-slate-200">Project Folders</span><button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800" title="Add folder"><FolderPlus className="h-4 w-4"/></button></div>
        <div className="space-y-1">{folders.map(({name,count,icon:Icon}) => <button key={name} onClick={() => {setActiveFolder(name);setSelected([]);}} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-xs transition ${activeFolder===name?'bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/20':'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`}><Icon className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{name}</span><span className="text-[10px] text-slate-500">{name==='All Assets'?assets.length:assets.filter(a=>a.folder===name).length}</span></button>)}</div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project rules</p><p className="mt-2 text-xs leading-5 text-slate-400">Keep Milo’s face, outfit palette and proportions consistent across new assets.</p><button className="mt-2 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">View instructions</button></div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-[#0d1426] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div><h2 className="text-base font-semibold text-white">{activeFolder}</h2><p className="mt-1 text-[11px] text-slate-500">{visibleAssets.length} items · Select assets to give AI more context</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:w-44 sm:flex-none"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search assets..." className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-400/60"/></label>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1"><button onClick={()=>setView('grid')} aria-label="Grid view" className={`rounded-md p-1.5 ${view==='grid'?'bg-slate-700 text-cyan-200':'text-slate-500'}`}><Grid2X2 className="h-4 w-4"/></button><button onClick={()=>setView('list')} aria-label="List view" className={`rounded-md p-1.5 ${view==='list'?'bg-slate-700 text-cyan-200':'text-slate-500'}`}><List className="h-4 w-4"/></button></div>
            <div className="relative"><button onClick={()=>setAddMenu(v=>!v)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-200"><Plus className="h-3.5 w-3.5"/> Add Assets <ChevronDown className="h-3 w-3"/></button>{addMenu&&<div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-700 bg-[#111a2e] p-1.5 shadow-2xl"><button onClick={()=>{setAddMenu(false);setChatText('Generate a new image for this Project.');}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800"><WandSparkles className="h-4 w-4 text-cyan-300"/> Create with AI Chat</button><button onClick={()=>{setAddMenu(false);setMediaPicker(true);}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800"><ImageIcon className="h-4 w-4 text-violet-300"/> Choose from Media Library</button><button onClick={()=>{setAddMenu(false);fileInput.current?.click();}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800"><Upload className="h-4 w-4 text-emerald-300"/> Upload from Device</button></div>}<input ref={fileInput} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt" className="hidden" onChange={e=>{uploadFiles(e.target.files);e.currentTarget.value='';}}/></div>
          </div>
        </div>

        {selected.length>0&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5"><div className="flex items-center gap-2 text-xs text-cyan-100"><CheckCircle2 className="h-4 w-4"/><strong>{selected.length} selected</strong><span className="text-cyan-100/60">· AI will use these as references</span></div><button onClick={()=>setSelected([])} className="text-[11px] font-semibold text-cyan-200 hover:text-white">Clear selection</button></div>}

        {view==='grid'?<div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{visibleAssets.map(asset=>{const active=selected.includes(asset.id);const Icon=kindIcon(asset.kind);return <button key={asset.id} onClick={()=>toggleAsset(asset.id)} aria-pressed={active} className={`group overflow-hidden rounded-2xl border text-left transition ${active?'border-cyan-300 ring-2 ring-cyan-300/30 bg-cyan-300/5':'border-slate-800 bg-[#0d1426] hover:border-slate-600'}`}><div className="relative aspect-square overflow-hidden bg-slate-900">{asset.kind==='Image'?<img src={asset.image} alt={asset.name} className="h-full w-full object-cover transition group-hover:scale-105"/>:<div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950"><Icon className="h-10 w-10 text-cyan-200"/><span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[9px] text-white">{asset.kind}</span></div>}<div className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/50 p-1.5 text-white">{active?<Check className="h-3.5 w-3.5 text-cyan-300"/>:<span className="block h-3.5 w-3.5"/>}</div>{asset.source&&<span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-cyan-100">{asset.source}</span>}</div><div className="p-3"><p className="truncate text-xs font-semibold text-slate-100">{asset.name}</p><p className="mt-1 text-[10px] text-slate-500">{asset.kind} · {asset.updated}</p></div></button>})}</div>:<div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1426]">{visibleAssets.map(asset=>{const active=selected.includes(asset.id);const Icon=kindIcon(asset.kind);return <button key={asset.id} onClick={()=>toggleAsset(asset.id)} aria-pressed={active} className={`flex w-full items-center gap-3 border-b border-slate-800/80 p-3 text-left last:border-0 ${active?'bg-cyan-300/10':'hover:bg-slate-800/40'}`}><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800">{asset.kind==='Image'?<img src={asset.image} alt="" className="h-full w-full object-cover"/>:<Icon className="m-3 h-6 w-6 text-cyan-200"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{asset.name}</p><p className="mt-1 text-[10px] text-slate-500">{asset.kind} · {asset.folder} · {asset.updated}</p></div>{active?<CheckCircle2 className="h-4 w-4 text-cyan-300"/>:<span className="h-4 w-4 rounded-full border border-slate-600"/>}</button>})}</div>}
        {visibleAssets.length===0&&<div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center"><Folder className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 text-xs text-slate-400">No assets in this folder yet.</p></div>}
      </section>

      <aside className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1426] xl:sticky xl:top-24 xl:h-[calc(100dvh-7.5rem)]">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Sparkles className="h-4 w-4"/></div><div><p className="text-xs font-semibold text-white">Vyral AI Assistant</p><p className="text-[10px] text-emerald-300">Project context active</p></div></div><button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><SlidersHorizontal className="h-4 w-4"/></button></div>
        <div className="border-b border-slate-800 px-4 py-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reference context</span><span className="text-[10px] text-cyan-300">{selectedAssets.length?selectedAssets.length+' selected':'Whole Project'}</span></div>{selectedAssets.length?<div className="flex gap-2 overflow-x-auto pb-1">{selectedAssets.map(a=><div key={a.id} className="w-16 shrink-0"><div className="h-12 overflow-hidden rounded-lg bg-slate-800">{a.kind==='Image'?<img src={a.image} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><kindIconFallback kind={a.kind}/></div>}</div><p className="mt-1 truncate text-[9px] text-slate-400">{a.name}</p></div>)}</div>:<p className="text-[11px] leading-5 text-slate-400">No specific assets selected. I’ll understand the Project folders, assets and rules as context.</p>}</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((m,i)=><div key={i} className={`max-w-[95%] rounded-2xl px-3 py-2.5 text-xs leading-5 ${m.role==='user'?'ml-auto bg-cyan-300 text-slate-950':'border border-slate-700 bg-slate-900 text-slate-200'}`}>{m.text}</div>)}</div>
        <div className="border-t border-slate-800 p-3"><div className="rounded-xl border border-slate-700 bg-slate-950 p-2 focus-within:border-cyan-400/60"><textarea value={chatText} onChange={e=>setChatText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}} rows={3} placeholder={selectedAssets.length?'Tell me what to change in the selected assets...':'Ask AI to create or manage this Project...'} className="w-full resize-none bg-transparent px-1 py-1 text-xs leading-5 text-white outline-none placeholder:text-slate-600"/><div className="flex items-center justify-between"><button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800" title="Attach reference"><Paperclip className="h-4 w-4"/></button><button onClick={sendMessage} disabled={!chatText.trim()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-bold text-slate-950 disabled:opacity-40"><Send className="h-3.5 w-3.5"/> Send</button></div></div><p className="mt-2 text-center text-[9px] text-slate-600">Demo interaction · AI generation is not connected</p></div>
      </aside>
    </div>

    {mediaPicker&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)setMediaPicker(false);}}><div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#10182b] p-4 shadow-2xl sm:p-6"><div className="flex items-center justify-between"><div><h3 className="text-base font-semibold text-white">Choose from Media Library</h3><p className="mt-1 text-xs text-slate-400">Select multiple existing media items to add to this Project.</p></div><button onClick={()=>setMediaPicker(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4"/></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{initialAssets.map(a=>{const active=mediaSelected.includes(a.id);return <button key={a.id} onClick={()=>setMediaSelected(v=>active?v.filter(x=>x!==a.id):[...v,a.id])} className={`overflow-hidden rounded-xl border text-left ${active?'border-cyan-300 ring-2 ring-cyan-300/20':'border-slate-700'}`}><img src={a.image} alt="" className="aspect-square w-full object-cover"/><div className="flex items-center justify-between gap-1 p-2"><span className="truncate text-[10px] text-slate-200">{a.name}</span>{active&&<Check className="h-3.5 w-3.5 shrink-0 text-cyan-300"/>}</div></button>})}</div><div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4"><span className="text-xs text-slate-400">{mediaSelected.length} selected</span><button onClick={addMedia} disabled={!mediaSelected.length} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40">Add to Project</button></div></div></div>}
  </div>;
};

const kindIconFallback: React.FC<{kind: AssetKind}> = ({kind}) => { const Icon=kindIcon(kind); return <Icon className="h-5 w-5 text-cyan-200"/>; };
