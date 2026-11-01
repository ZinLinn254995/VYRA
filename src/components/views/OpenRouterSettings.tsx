import React, { useEffect, useState } from 'react';
import { saveGeneratedImage } from '../../services/mediaLibraryStorage';
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

type Capability = 'text' | 'image' | 'video' | 'audio';
type ModelOption = {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
  pricing?: { prompt?: string; completion?: string };
  supportedDurations?: number[];
  supportedResolutions?: string[];
  supportedAspectRatios?: string[];
  supportedSizes?: string[];
  supportedFrameImages?: string[];
  allowedPassthroughParameters?: string[];
  supportedParameters?: string[];
  supportedVoiceIds?: string[];
  generateAudio?: boolean;
  pricingSkus?: Record<string, string>;
};
type SelectionMode = 'hybrid' | 'manual';
type RecommendationStrategy = 'balanced' | 'cost' | 'context';

const KEY_STORAGE = 'vyra_openrouter_key_session';
const MODEL_STORAGE = 'vyra_openrouter_models_v1';
const MODE_STORAGE = 'vyra_model_selection_mode_v1';
const STRATEGY_STORAGE = 'vyra_model_recommendation_strategy_v1';
const CATALOG_STORAGE = 'vyra_openrouter_catalog_v1';

function modelCost(model: ModelOption): number | null {
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) return null;
  return prompt + completion;
}

function recommendModel(list: ModelOption[], strategy: RecommendationStrategy): ModelOption | undefined {
  if (!list.length) return undefined;
  const withCost = list.filter((model) => modelCost(model) !== null);
  if (strategy === 'cost' && withCost.length) return [...withCost].sort((a, b) => (modelCost(a) ?? Infinity) - (modelCost(b) ?? Infinity))[0];
  if (strategy === 'context') return [...list].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0))[0];
  if (withCost.length) {
    const maxCost = Math.max(...withCost.map((model) => modelCost(model) ?? 0), Number.EPSILON);
    const maxContext = Math.max(...list.map((model) => model.contextLength ?? 0), 1);
    return [...list].sort((a, b) => {
      const score = (model: ModelOption) => {
        const costScore = modelCost(model) === null ? 0.5 : 1 - (modelCost(model)! / maxCost);
        const contextScore = (model.contextLength ?? 0) / maxContext;
        return costScore * 0.6 + contextScore * 0.4;
      };
      return score(b) - score(a);
    })[0];
  }
  return [...list].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0))[0];
}

const capabilities: { id: Capability; label: string; description: string }[] = [
  { id: 'text', label: 'Text & Chat', description: 'Scripts, ideas, titles and planning' },
  { id: 'image', label: 'Image', description: 'Thumbnails, illustrations and image generation' },
  { id: 'video', label: 'Video', description: 'Text-to-video and image-to-video models' },
  { id: 'audio', label: 'Speech / Voiceover', description: 'Text-to-speech models for scene narration' },
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
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('hybrid');
  const [recommendationStrategy, setRecommendationStrategy] = useState<RecommendationStrategy>('balanced');
  const [message, setMessage] = useState('Enter an OpenRouter key to discover models.');
  const [error, setError] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [imageCost, setImageCost] = useState<number | null>(null);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    try {
      setApiKey(sessionStorage.getItem(KEY_STORAGE) || '');
      const savedModels = sessionStorage.getItem(MODEL_STORAGE);
      if (savedModels) setSelectedModels(JSON.parse(savedModels) as Partial<Record<Capability, string>>);
      const savedCatalog = sessionStorage.getItem(CATALOG_STORAGE);
      if (savedCatalog) setModels(JSON.parse(savedCatalog) as Partial<Record<Capability, ModelOption[]>>);
      const savedMode = sessionStorage.getItem(MODE_STORAGE);
      if (savedMode === 'hybrid' || savedMode === 'manual') setSelectionMode(savedMode);
      const savedStrategy = sessionStorage.getItem(STRATEGY_STORAGE);
      if (savedStrategy === 'balanced' || savedStrategy === 'cost' || savedStrategy === 'context') setRecommendationStrategy(savedStrategy);
    } catch {
      // Private browsing modes may disable session storage. The key remains usable in component state.
    }
  }, []);

  const saveSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    try { sessionStorage.setItem(MODE_STORAGE, mode); } catch { /* optional preference persistence */ }
  };

  const saveRecommendationStrategy = (strategy: RecommendationStrategy) => {
    setRecommendationStrategy(strategy);
    try { sessionStorage.setItem(STRATEGY_STORAGE, strategy); } catch { /* optional preference persistence */ }
  };

  const saveSelectedModels = (next: Partial<Record<Capability, string>>) => {
    setSelectedModels(next);
    try { sessionStorage.setItem(MODEL_STORAGE, JSON.stringify(next)); } catch { /* optional preference persistence */ }
  };

  const request = async (path: string, key: string, method: 'GET' | 'POST' = 'GET') => {
    const response = await fetch(path, { method, headers: { 'x-openrouter-api-key': key } });
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
      const result = await request('/api/providers/openrouter/test', key, 'POST');
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
      setModels((current) => {
        const nextCatalog = { ...current, [capability]: list };
        try { sessionStorage.setItem(CATALOG_STORAGE, JSON.stringify(nextCatalog)); } catch { /* catalog cache is optional */ }
        return nextCatalog;
      });
      if (list.length === 0) setMessage('No models were returned for this capability. It may not be supported by the current account or API.');
      else {
        const next = { ...selectedModels };
        const currentStillAvailable = Boolean(next[capability] && list.some((model) => model.id === next[capability]));
        if (selectionMode === 'hybrid') {
          const recommendation = recommendModel(list, recommendationStrategy);
          if (recommendation) next[capability] = recommendation.id;
        } else if (!currentStillAvailable) {
          next[capability] = list[0].id;
        }
        saveSelectedModels(next);
        const chosen = list.find((model) => model.id === next[capability]);
        setMessage(selectionMode === 'hybrid' && chosen
          ? 'Loaded ' + list.length + ' models. Hybrid recommended ' + (chosen.name || chosen.id) + ' using available pricing/context metadata; you can override it.'
          : list.length + ' ' + capability + ' models loaded from OpenRouter.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load models.');
    } finally {
      setLoadingCapability(null);
    }
  };

  const handleGenerateImage = async () => {
    const key = apiKey.trim();
    const model = selectedModels.image;
    const prompt = imagePrompt.trim();
    if (!key || !connected) {
      setError('Enter and verify your OpenRouter API key before generating an image.');
      return;
    }
    if (!model) {
      setError('Discover and select an Image model first.');
      setActiveCapability('image');
      return;
    }
    if (!prompt) {
      setError('Describe the image you want to generate.');
      return;
    }
    setGeneratingImage(true);
    setError('');
    setGeneratedImage('');
    setImageCost(null);
    setMessage('Generating image… this can take up to two minutes.');
    try {
      const response = await fetch('/api/providers/openrouter/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': key },
        body: JSON.stringify({ model, prompt }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; imageDataUrl?: string; costUsd?: number | null; model?: string };
      if (!response.ok || !data.imageDataUrl) throw new Error(data.error || 'Image generation failed.');
      setGeneratedImage(data.imageDataUrl);
      setImageCost(typeof data.costUsd === 'number' ? data.costUsd : null);
      setMessage('Image generated successfully with ' + (data.model || model) + '.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed.');
      setMessage('Image generation did not complete.');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleSaveImageToLibrary = async () => {
    if (!generatedImage) return;
    setSavingImage(true);
    setError('');
    try {
      await saveGeneratedImage({
        title: imagePrompt.trim().slice(0, 120) || 'Generated image',
        dataUrl: generatedImage,
        model: selectedModels.image || 'Unknown model',
        costUsd: imageCost,
      });
      setMessage('Image saved to your Media Library on this device.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this image.');
    } finally {
      setSavingImage(false);
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
          <p className="text-xs text-slate-400 light:text-slate-500">One provider key, with separate model choices for Text, Image, Video and Speech.</p>
        </div>
        <span className={'text-[10px] font-semibold rounded-full px-2.5 py-1 ' + (connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>
          {connected ? 'Connected' : 'Not verified'}
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="openrouter-key" className="text-xs font-semibold text-slate-300 light:text-slate-700">OpenRouter API Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input id="openrouter-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setConnected(false); try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore unavailable storage */ } }} placeholder="Paste your OpenRouter key" className={inputClass + ' pr-10'} />
            <button type="button" aria-label={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white light:hover:text-slate-900">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button type="button" disabled={checking || !apiKey.trim()} onClick={handleConnect} className={buttonClass + ' bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90'}>
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {checking ? 'Testing…' : 'Test key'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">For this first version, the key is held in session storage and sent to the VYRA server only when needed. It is not saved in VYRA's server environment. Anyone who can run code in this browser session could still access it; use this on a trusted device. Model capability details are cached only for this browser session.</p>
        {apiKey && <button type="button" onClick={handleForgetKey} className="text-[11px] text-slate-400 hover:text-red-400">Forget key for this session</button>}
      </div>

      <div className="rounded-xl bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200 p-3 flex items-start gap-2.5">
        {error ? <CircleAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> : connected ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <Sparkles className="w-4 h-4 text-[#55F4FF] mt-0.5 shrink-0" />}
        <p className={'text-xs ' + (error ? 'text-red-300' : 'text-slate-300 light:text-slate-700')}>{error || message}</p>
      </div>

      <section className="rounded-xl border border-[#2B3058] light:border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#55F4FF]" />
          <h3 className="text-sm font-semibold text-white light:text-slate-900">Hybrid Model Selector</h3>
        </div>
        <p className="text-[11px] text-slate-400 light:text-slate-600">Hybrid mode recommends a model from the available catalog metadata. You can always override the selection. Recommendations are heuristics, not benchmarked quality rankings or guaranteed cost estimates.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="vyra-selection-mode" className="text-xs font-semibold text-slate-300 light:text-slate-700">Selection mode</label>
            <select id="vyra-selection-mode" value={selectionMode} onChange={(e) => saveSelectionMode(e.target.value as SelectionMode)} className={inputClass}>
              <option value="hybrid">Hybrid — recommend automatically</option>
              <option value="manual">Manual — I choose every model</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="vyra-recommendation-strategy" className="text-xs font-semibold text-slate-300 light:text-slate-700">Recommendation priority</label>
            <select id="vyra-recommendation-strategy" value={recommendationStrategy} onChange={(e) => saveRecommendationStrategy(e.target.value as RecommendationStrategy)} className={inputClass} disabled={selectionMode === 'manual'}>
              <option value="balanced">Balanced — cost + context</option>
              <option value="cost">Cost-aware — lowest listed token pricing</option>
              <option value="context">Context — largest listed context window</option>
            </select>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">These preferences are saved for this browser session. Changing priority affects recommendations the next time you discover/refresh a model list.</p>
      </section>

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
                  {capability.id === 'video' && (() => {
                    const selected = loaded.find((model) => model.id === selectedModels.video);
                    if (!selected) return null;
                    const details = [
                      selected.supportedDurations?.length ? 'Durations: ' + selected.supportedDurations.join(', ') + 's' : '',
                      selected.supportedResolutions?.length ? 'Resolutions: ' + selected.supportedResolutions.join(', ') : '',
                      selected.supportedAspectRatios?.length ? 'Aspect ratios: ' + selected.supportedAspectRatios.join(', ') : '',
                      typeof selected.generateAudio === 'boolean' ? 'Audio generation: ' + (selected.generateAudio ? 'supported' : 'not supported') : '',
                    ].filter(Boolean);
                    return <p className="text-[10px] text-slate-400 light:text-slate-600">{details.length ? details.join(' · ') : 'OpenRouter did not publish capability details for this model. Check its model page before generating.'}</p>;
                  })()}
                  {capability.id === 'audio' && (() => { const selected = loaded.find((model) => model.id === selectedModels.audio); return <p className="text-[10px] text-slate-500">{selected?.supportedVoiceIds?.length ? selected.supportedVoiceIds.length + ' model-specific voices available. Choose one in the project workspace.' : 'This model does not publish a voice list. Check its documentation and enter a supported voice ID in the project workspace.'}</p>; })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <section className="p-5 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#55F4FF]" />
          <h3 className="text-sm font-bold text-white light:text-slate-900">Image Generator</h3>
        </div>
        <p className="text-[11px] text-slate-400 light:text-slate-600">Generate a real image with your selected OpenRouter Image API model. Requests may consume credits; check the model pricing before generating.</p>
        <div className="space-y-1.5">
          <label htmlFor="vyra-image-prompt" className="text-xs font-semibold text-slate-300 light:text-slate-700">Image prompt</label>
          <textarea id="vyra-image-prompt" rows={4} maxLength={4000} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Describe the subject, composition, lighting, background and visual style…" className={inputClass + ' resize-y'} />
          <p className="text-[10px] text-slate-500">{imagePrompt.length}/4000 characters · Model: {selectedModels.image || 'Select an Image model above'}</p>
        </div>
        <button type="button" disabled={generatingImage || !connected || !selectedModels.image || !imagePrompt.trim()} onClick={handleGenerateImage} className={buttonClass + ' bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90'}>
          {generatingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generatingImage ? 'Generating…' : 'Generate image'}
        </button>
        {generatedImage && (
          <div className="space-y-3">
            <img src={generatedImage} alt="Generated by VYRA" className="w-full max-h-[560px] object-contain rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#090B18] light:bg-slate-50" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400 light:text-slate-600">{imageCost !== null ? 'Reported generation cost: $' + imageCost.toFixed(4) : 'Generation cost was not returned by the provider.'}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleSaveImageToLibrary} disabled={savingImage} className={buttonClass + ' border border-[#55F4FF]/50 text-[#55F4FF] hover:bg-[#55F4FF]/10'}>
                  {savingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {savingImage ? 'Saving…' : 'Save to Media Library'}
                </button>
                <a href={generatedImage} download="vyra-generated-image.png" className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-white/10 light:bg-slate-100 text-white light:text-slate-800 hover:bg-white/15">Download image</a>
              </div>
            </div>
          </div>
        )}
      </section>
      <p className="text-[11px] text-slate-500">Image generation uses OpenRouter's Image API. You can save generated images to this browser's local Media Library; generated video clips and voiceovers are also stored locally on this device. Media is not cloud-synced, and generation or storage may be limited by provider pricing and browser storage capacity.</p>
    </section>
  );
};
