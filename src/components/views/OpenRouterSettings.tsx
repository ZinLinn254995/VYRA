import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

type Capability = 'text' | 'image' | 'video' | 'audio';
type ModelOption = { id: string; name?: string; description?: string };

const KEY_STORAGE = 'vyra_openrouter_key_session';
const MODEL_STORAGE = 'vyra_openrouter_models_v1';

const capabilities: { id: Capability; label: string; description: string }[] = [
  { id: 'text', label: 'Text & Chat', description: 'Scripts, ideas, titles and planning' },
  { id: 'image', label: 'Image', description: 'Thumbnails, illustrations and image generation' },
  { id: 'video', label: 'Video', description: 'Text-to-video and image-to-video models' },
  { id: 'audio', label: 'Audio', description: 'Audio-capable models where supported' },
];

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF] text-sm';
const buttonClass = 'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const OpenRouterSettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loadingCapability, setLoadingCapability] = useState<Capability | null>(null);
  const [activeCapability, setActiveCapability] = useState<Capability>('text');
  const [models, setModels] = useState<Partial<Record<Capability, ModelOption[]>>>({});
  const [selectedModels, setSelectedModels] = useState<Partial<Record<Capability, string>>>({});
  const [message, setMessage] = useState('Enter an OpenRouter key to discover models.');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setApiKey(sessionStorage.getItem(KEY_STORAGE) || '');
      const savedModels = sessionStorage.getItem(MODEL_STORAGE);
      if (savedModels) setSelectedModels(JSON.parse(savedModels) as Partial<Record<Capability, string>>);
    } catch {
      // Private browsing modes may disable session storage. The key remains usable in component state.
    }
  }, []);

  const saveSelectedModels = (next: Partial<Record<Capability, string>>) => {
    setSelectedModels(next);
    try { sessionStorage.setItem(MODEL_STORAGE, JSON.stringify(next)); } catch { /* optional preference persistence */ }
  };

  const request = async (path: string, key: string) => {
    const response = await fetch(path, { headers: { 'x-openrouter-api-key': key } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'OpenRouter request failed.');
    return data;
  };

  const handleConnect = async () => {
    const key = apiKey.trim();
    if (!key) {
      setError('Enter your OpenRouter API key first.');
      setConnected(false);
      return;
    }
    setChecking(true);
    setError('');
    setMessage('Checking your key with OpenRouter…');
    try {
      const result = await request('/api/providers/openrouter/test', key);
      setConnected(true);
      setMessage(result.message || 'OpenRouter key verified.');
      try { sessionStorage.setItem(KEY_STORAGE, key); } catch { /* session-only in memory if storage is unavailable */ }
    } catch (e) {
      setConnected(false);
      setError(e instanceof Error ? e.message : 'Could not verify the key.');
      setMessage('Connection test failed. Check the key and OpenRouter account.');
    } finally {
      setChecking(false);
    }
  };

  const handleLoadModels = async (capability: Capability) => {
    if (!apiKey.trim()) {
      setError('Enter and test your OpenRouter API key before loading models.');
      return;
    }
    setLoadingCapability(capability);
    setActiveCapability(capability);
    setError('');
    try {
      const result = await request('/api/providers/openrouter/models?capability=' + capability, apiKey.trim());
      const list = Array.isArray(result.models) ? result.models as ModelOption[] : [];
      setModels((current) => ({ ...current, [capability]: list }));
      if (list.length === 0) setMessage('No models were returned for this capability. It may not be supported by the current account or API.');
      else {
        const next = { ...selectedModels };
        if (!next[capability] || !list.some((model) => model.id === next[capability])) next[capability] = list[0].id;
        saveSelectedModels(next);
        setMessage(list.length + ' ' + capability + ' models loaded from OpenRouter.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load models.');
    } finally {
      setLoadingCapability(null);
    }
  };

  const handleForgetKey = () => {
    setApiKey('');
    setConnected(false);
    setMessage('API key removed from this browser session.');
    setError('');
    try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore unavailable storage */ }
  };

  return (
    <section className="p-6 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-[#55F4FF]/10 text-[#55F4FF]"><KeyRound className="w-5 h-5" /></div>
        <div className="flex-1 space-y-1">
          <h2 className="text-base font-bold text-white light:text-slate-900">OpenRouter Provider Hub</h2>
          <p className="text-xs text-slate-400 light:text-slate-500">One provider key, with separate model choices for Text, Image, Video and Audio.</p>
        </div>
        <span className={'text-[10px] font-semibold rounded-full px-2.5 py-1 ' + (connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>
          {connected ? 'Connected' : 'Not verified'}
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="openrouter-key" className="text-xs font-semibold text-slate-300 light:text-slate-700">OpenRouter API Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input id="openrouter-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setConnected(false); }} placeholder="Paste your OpenRouter key" className={inputClass + ' pr-10'} />
            <button type="button" aria-label={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white light:hover:text-slate-900">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button type="button" disabled={checking || !apiKey.trim()} onClick={handleConnect} className={buttonClass + ' bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90'}>
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {checking ? 'Testing…' : 'Test key'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">For this first version, the key is held in session storage and sent to the VYRA server only when needed. It is not saved in VYRA's server environment. Anyone who can run code in this browser session could still access it; use this on a trusted device.</p>
        {apiKey && <button type="button" onClick={handleForgetKey} className="text-[11px] text-slate-400 hover:text-red-400">Forget key for this session</button>}
      </div>

      <div className="rounded-xl bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200 p-3 flex items-start gap-2.5">
        {error ? <CircleAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> : connected ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <Sparkles className="w-4 h-4 text-[#55F4FF] mt-0.5 shrink-0" />}
        <p className={'text-xs ' + (error ? 'text-red-300' : 'text-slate-300 light:text-slate-700')}>{error || message}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {capabilities.map((capability) => {
          const isActive = activeCapability === capability.id;
          const loaded = models[capability.id];
          return (
            <div key={capability.id} className={'p-4 rounded-xl border space-y-3 ' + (isActive ? 'border-[#55F4FF]/60 bg-[#55F4FF]/5' : 'border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50')}>
              <div>
                <h3 className="text-sm font-semibold text-white light:text-slate-900">{capability.label}</h3>
                <p className="text-[11px] text-slate-400 light:text-slate-500 mt-1">{capability.description}</p>
              </div>
              <button type="button" disabled={loadingCapability !== null || !apiKey.trim()} onClick={() => handleLoadModels(capability.id)} className={buttonClass + ' w-full border border-[#2B3058] light:border-slate-300 text-white light:text-slate-800 hover:border-[#55F4FF]'}>
                {loadingCapability === capability.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {loaded ? 'Refresh model list' : 'Discover models'}
              </button>
              {loaded && loaded.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor={'model-' + capability.id} className="text-[11px] text-slate-400 light:text-slate-600">Selected model ({loaded.length} available)</label>
                  <select id={'model-' + capability.id} value={selectedModels[capability.id] || ''} onChange={(e) => saveSelectedModels({ ...selectedModels, [capability.id]: e.target.value })} className={inputClass}>
                    {loaded.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-500 break-all">{selectedModels[capability.id] || 'Choose a model'}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">Model discovery and key verification are real API requests. Generation, pricing estimates, job progress and media saving must be connected in their own work packages; selecting a model here does not mean that generation is already enabled.</p>
    </section>
  );
};
